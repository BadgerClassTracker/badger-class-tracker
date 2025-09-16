// services/poller/index.ts
// -----------------------------------------------------------------------------
// Poller
// - Enumerates watched courses from GSI3 (COURSE#<TERM>)
// - Fetches section statuses from UW endpoint
// - Compares with STATE items (one per section)
// - Emits SeatStatusChanged events when status moves upward (CLOSED→WAITLISTED/OPEN)
// - Records SLO metrics:
//     * PollerScanAgeSeconds (age since last scan per section)
//     * WatchedCoursesEnumerated
//     * WatchedSectionsScanned
//     * SectionsWithChange
// -----------------------------------------------------------------------------

import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

const TABLE = process.env.TABLE!; // single table name
const BUS_NAME = process.env.BUS_NAME!; // EventBridge bus name
const STAGE = process.env.STAGE;

const eb = new EventBridgeClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Cache for subjects map
let subjectsMap: Map<string, string> | null = null;

type Status = "CLOSED" | "WAITLISTED" | "OPEN";

export const handler = async (event: any = {}) => {
  const t0 = Date.now();
  
  // If specific term provided, poll only that term. Otherwise, discover all active terms.
  const specificTerm = event.term;
  
  // 1) Discover all active terms and their courses from WATCH items
  const termCourseMap = new Map<string, Map<string, string[]>>(); // term -> courseKey -> sections
  let ExclusiveStartKey: any = undefined;
  
  do {
    const filterExpression = specificTerm 
      ? "begins_with(PK, :pkPrefix) AND SK = :sk AND subCount > :zero"
      : "begins_with(PK, :coursePrefix) AND SK = :sk AND subCount > :zero";
    
    const expressionAttributeValues = specificTerm
      ? { ":pkPrefix": `COURSE#${specificTerm}#`, ":sk": "WATCH", ":zero": 0 }
      : { ":coursePrefix": "COURSE#", ":sk": "WATCH", ":zero": 0 };

    const out = await ddb.send(
      new ScanCommand({
        TableName: TABLE,
        FilterExpression: filterExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExclusiveStartKey,
      })
    );
    
    for (const it of out.Items ?? []) {
      // PK format: COURSE#term#subject#courseId
      const parts = String(it.PK).split("#");
      if (parts.length >= 4) {
        const term = parts[1];
        const subject = parts[2];
        const courseId = parts[3];
        const courseKey = `${subject}#${courseId}`;
        
        if (!termCourseMap.has(term)) {
          termCourseMap.set(term, new Map());
        }
        termCourseMap.get(term)!.set(courseKey, []);
      }
    }
    ExclusiveStartKey = out.LastEvaluatedKey;
  } while (ExclusiveStartKey);

  if (termCourseMap.size === 0) {
    console.log(JSON.stringify({ msg: "no-active-watches", specificTerm }));
    return { examined: 0, changed: 0 };
  }

  let totalExamined = 0;
  let totalChanged = 0;

  // Process each term
  for (const [TERM, courseToSections] of termCourseMap.entries()) {
    console.log(JSON.stringify({ msg: "polling-term", term: TERM, courses: courseToSections.size }));
    
    // Get term description for human-readable emails
    let termDescription = TERM; // fallback
    try {
      const response = await fetch("https://public.enroll.wisc.edu/api/search/v1/aggregate", {
        headers: {
          "accept": "application/json",
          "user-agent": "badger-class-tracker/1.0 (educational use)",
        },
      });
      if (response.ok) {
        const data = await response.json();
        const termInfo = data.terms?.find((t: any) => t.termCode === TERM);
        if (termInfo?.shortDescription) {
          termDescription = termInfo.shortDescription; // e.g., "2025 Fall"
        }
      }
    } catch (e) {
      console.warn("Failed to fetch term description", { term: TERM, error: e });
    }

    let examined = 0;
    let changed = 0;
    const sectionInfoMap = new Map<string, { subject: string; courseId: string; status: Status; title?: string }>();

    // 2) For each course, find the actual sections that have subscriptions
    // We need to scan the main table to find all subscriptions for this term
    let subscriptionStartKey: any = undefined;
    do {
      const subscriptionsResult = await ddb.send(
        new ScanCommand({
          TableName: TABLE,
          FilterExpression: "begins_with(SK, :skPrefix) AND termCode = :term",
          ExpressionAttributeValues: {
            ":skPrefix": "SUB#",
            ":term": TERM
          },
          ExclusiveStartKey: subscriptionStartKey,
        })
      );

      for (const item of subscriptionsResult.Items ?? []) {
        const subSubject = String(item.subjectCode || "");
        const subCourseId = String(item.courseId || "");
        const classNbr = String(item.classNumber || "");
        
        if (subSubject && subCourseId && classNbr) {
          const courseKey = `${subSubject}#${subCourseId}`;
          if (courseToSections.has(courseKey)) {
            const sections = courseToSections.get(courseKey) || [];
            if (!sections.includes(classNbr)) {
              sections.push(classNbr);
            }
            courseToSections.set(courseKey, sections);
          }
        }
      }
      
      subscriptionStartKey = subscriptionsResult.LastEvaluatedKey;
    } while (subscriptionStartKey);

    // 3) Fetch course data and check each watched section
    for (const [courseKey, classNumbers] of courseToSections.entries()) {
      const [subject, courseId] = courseKey.split("#");
      const map = await fetchCourseSections(TERM, subject, courseId);

      for (const classNbr of classNumbers) {
        examined++;

        const info = map.get(classNbr);
        const newStatus = info ? normalizeStatus(info.status) : "CLOSED";
        
        // Debug logging for missing sections
        if (!info) {
          console.warn(JSON.stringify({
            msg: "section-not-found-in-api",
            term: TERM,
            subject,
            courseId,
            classNbr,
            availableClassNumbers: Array.from(map.keys())
          }));
        } else {
          console.log(JSON.stringify({
            msg: "section-found",
            term: TERM,
            subject,
            courseId,
            classNbr,
            rawStatus: info.status,
            normalizedStatus: newStatus
          }));
        }

        // Read last STATE snapshot for this section
        const snap = await getSnapshot(TERM, classNbr);
        const oldStatus: Status | "UNKNOWN" =
          (snap?.status as Status) ?? "UNKNOWN";

        // SLO metric: age since last scan (if we have scannedAt)
        const prevScanMs = Number((snap as any)?.scannedAt ?? 0);
        if (prevScanMs > 0) {
          const ageSec = Math.max(0, (Date.now() - prevScanMs) / 1000);
          putMetric("PollerScanAgeSeconds", ageSec, "Seconds");
        }

        if (!snap) {
          // First time we see this section: write STATE
          await saveSnapshot(TERM, classNbr, newStatus, info?.title);
        } else if (isUpward(oldStatus, newStatus)) {
          // Upward transitions trigger notification
          await saveSnapshot(TERM, classNbr, newStatus, info?.title);
          await emitSeatChange({
            term: TERM,
            termDescription,
            subjectCode: subject,
            courseId,
            classNbr,
            from: oldStatus,
            to: newStatus,
            title: info?.title,
            detectedAt: new Date().toISOString(),
            firstObservedAt: new Date().toISOString(),
          });
          changed++;
        } else if (oldStatus !== newStatus) {
          // Non-upward change: just record it for completeness
          await saveSnapshot(TERM, classNbr, newStatus, info?.title);
        }

        // Always stamp 'scannedAt' so freshness metric has a baseline next run
        await touchScanned(TERM, classNbr);
      }
    }

    // Log a summary for this term
    console.log(
      JSON.stringify({
        msg: "term-poll-finished",
        term: TERM,
        courses: courseToSections.size,
        examined,
        changed,
      })
    );
    
    totalExamined += examined;
    totalChanged += changed;
  }

  // Log overall summary & emit metrics
  console.log(
    JSON.stringify({
      msg: "poll-finished",
      terms: termCourseMap.size,
      totalExamined,
      totalChanged,
      ms: Date.now() - t0,
    })
  );
  
  putMetric("WatchedCoursesEnumerated", Array.from(termCourseMap.values()).reduce((sum, courses) => sum + courses.size, 0), "Count");
  putMetric("WatchedSectionsScanned", totalExamined, "Count");
  putMetric("SectionsWithChange", totalChanged, "Count");

  return { examined: totalExamined, changed: totalChanged };
};

// ---------- helpers ----------------------------------------------------------

async function getSubjectName(subjectCode: string, pkg?: any): Promise<string> {
  // Early return if no subject code
  if (!subjectCode) {
    // Try package data as fallback
    const subjectFromPkg = pkg?.sections?.[0]?.subject?.shortDescription ?? 
                          pkg?.sections?.[0]?.subject?.description ?? 
                          pkg?.sections?.[0]?.subject?.formalDescription ?? "";
    return subjectFromPkg;
  }
  
  // Load subjects map if not cached
  if (!subjectsMap) {
    try {
      const response = await fetch("https://public.enroll.wisc.edu/api/search/v1/subjectsMap/0000", {
        headers: {
          "accept": "application/json",
          "user-agent": "badger-class-tracker/1.0 (educational use)",
        },
      });
      if (response.ok) {
        const data = await response.json();
        subjectsMap = new Map(Object.entries(data));
        console.log(`Loaded subjects map with ${subjectsMap.size} subjects`);
      } else {
        console.warn("Failed to fetch subjects map", response.status);
        subjectsMap = new Map();
      }
    } catch (e) {
      console.warn("Error fetching subjects map", e);
      subjectsMap = new Map();
    }
  }
  
  // Try subjects map first
  const mapName = subjectsMap.get(subjectCode);
  if (mapName) {
    return mapName;
  }
  
  // Fallback to package data
  const subjectFromPkg = pkg?.sections?.[0]?.subject?.shortDescription ?? 
                        pkg?.sections?.[0]?.subject?.description ?? 
                        pkg?.sections?.[0]?.subject?.formalDescription ?? "";
  return subjectFromPkg;
}

function normalizeStatus(s?: string): Status {
  if (!s) return "CLOSED";
  const u = s.toUpperCase();
  if (u.includes("OPEN") && u.includes("WAITLIST")) return "WAITLISTED";
  if (u.includes("OPEN")) return "OPEN";
  if (u.includes("WAITLIST")) return "WAITLISTED";
  return "CLOSED";
}
function rank(s: Status | "UNKNOWN") {
  return s === "OPEN" ? 3 : s === "WAITLISTED" ? 2 : 1;
}
function isUpward(from: Status | "UNKNOWN", to: Status) {
  return rank(to) > rank(from) && rank(to) >= 2; // upward & at least WAITLISTED
}

async function getSnapshot(term: string, classNbr: string) {
  const { Item } = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: { PK: `SEC#${term}#${classNbr}`, SK: "STATE" },
    })
  );
  return Item as
    | { status?: Status; title?: string; scannedAt?: number }
    | undefined;
}

async function getTermEndDate(term: string): Promise<Date> {
  try {
    const response = await fetch("https://public.enroll.wisc.edu/api/search/v1/aggregate", {
      headers: {
        "accept": "application/json",
        "user-agent": "badger-class-tracker/1.0 (educational use)",
      },
    });
    
    if (response.ok) {
      const data = await response.json();
      const termData = data.terms?.find((t: any) => t.termCode === term);
      if (termData?.endDate) {
        return new Date(termData.endDate);
      }
    }
  } catch (e) {
    console.warn("Failed to fetch term end date from UW API", e);
  }
  
  // Fallback: calculate from term code
  const termYear = Math.floor(parseInt(term) / 10);
  const termSeason = parseInt(term) % 10;
  
  if (termSeason === 2) { // Spring
    return new Date(2000 + termYear, 4, 15); // May 15
  } else if (termSeason === 6) { // Summer  
    return new Date(2000 + termYear, 7, 15); // August 15
  } else if (termSeason === 8) { // Fall
    return new Date(2000 + termYear, 11, 15); // December 15
  } else {
    // Default fallback: 6 months from now
    return new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000);
  }
}

async function saveSnapshot(
  term: string,
  classNbr: string,
  status: Status,
  title?: string
) {
  // Get accurate term end date from UW API
  const termEndDate = await getTermEndDate(term);
  
  // TTL = term end + 45 days
  const ttlDate = new Date(termEndDate.getTime() + 45 * 24 * 60 * 60 * 1000);
  const ttl = Math.floor(ttlDate.getTime() / 1000);

  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `SEC#${term}#${classNbr}`,
        SK: "STATE",
        term,
        classNbr,
        status,
        title,
        lastSeenAt: new Date().toISOString(),
        scannedAt: Date.now(), // initialize freshness timestamp on write
        ttl, // Auto-expire 45 days after term ends
      },
    })
  );
}

async function touchScanned(term: string, classNbr: string) {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { PK: `SEC#${term}#${classNbr}`, SK: "STATE" },
      UpdateExpression: "SET scannedAt = :t",
      ExpressionAttributeValues: { ":t": Date.now() },
    })
  );
}

async function emitSeatChange(detail: any) {
  await eb.send(
    new PutEventsCommand({
      Entries: [
        {
          Source: "uw.enroll.poller",
          DetailType: "SeatStatusChanged",
          EventBusName: BUS_NAME,
          Detail: JSON.stringify(detail), // includes detectedAt
        },
      ],
    })
  );
}

// GET https://public.enroll.wisc.edu/api/search/v1/enrollmentPackages/{term}/{subject}/{courseId}
async function fetchCourseSections(
  term: string,
  subject: string,
  courseId: string
) {
  const url = `https://public.enroll.wisc.edu/api/search/v1/enrollmentPackages/${term}/${subject}/${courseId}`;
  const res = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "badger-class-tracker/1.0 (educational use)",
    },
  });
  if (!res.ok) throw new Error(`UW ${res.status}`);
  const arr: any[] = await res.json();

  const map = new Map<
    string,
    { status: Status; title?: string; openSeats?: number }
  >();
  for (const pkg of arr) {
    const classNumber = String(
      pkg.enrollmentClassNumber ??
        pkg.sections?.[0]?.classUniqueId?.classNumber ??
        ""
    );
    if (!classNumber) continue;

    const raw = pkg.packageEnrollmentStatus?.status as string | undefined;
    const subj = await getSubjectName(subject, pkg);
    const cat = pkg.catalogNumber ?? "";
    
    // Build hierarchical title: COMP SCI 200 - LEC 002 - LAB 327
    let title = `${subj} ${cat}`.trim();
    
    if (pkg.sections && pkg.sections.length >= 2) {
      const parentSection = pkg.sections[0];
      const childSection = pkg.sections[1];
      
      const parentType = parentSection.type || "SEC";
      const parentNumber = parentSection.sectionNumber || "";
      const childType = childSection.type || "SEC";
      const childNumber = childSection.sectionNumber || "";
      
      // Check if this is a true parent-child relationship (LEC + LAB/DIS) or just multiple independent sections
      if ((parentType === "LEC" && (childType === "LAB" || childType === "DIS")) ||
          (parentType === "LEC" && childType === "LEC")) {
        // Parent-child relationship: COMP SCI 200 - LEC 002 - LAB 327
        title += ` - ${parentType} ${parentNumber}`;
        if (childNumber) {
          title += ` - ${childType} ${childNumber}`;
        }
      } else {
        // Independent sections of same type: just show the specific section we're looking at
        // Find which section matches our classNumber
        const targetSection = pkg.sections.find((s: any) => 
          String(s.classUniqueId?.classNumber) === String(classNumber)
        ) || pkg.sections[0];
        
        const sectionType = targetSection.type || "SEC";
        const sectionNumber = targetSection.sectionNumber || "";
        
        if (sectionNumber) {
          title += ` - ${sectionType} ${sectionNumber}`;
        }
      }
    } else if (pkg.sections && pkg.sections.length === 1) {
      // Single section structure
      const sec = pkg.sections[0];
      const sectionType = sec.type || "SEC";
      const sectionNumber = sec.sectionNumber || "";
      
      if (sectionNumber) {
        title += ` - ${sectionType} ${sectionNumber}`;
      }
    }

    map.set(classNumber, {
      status: normalizeStatus(raw),
      title,
      openSeats: pkg.enrollmentStatus?.openSeats,
    });
  }
  return map;
}

// CloudWatch EMF: single metric per log line with Service/Stage dimensions
function putMetric(
  name: string,
  value: number,
  unit: "Milliseconds" | "Seconds" | "Count"
) {
  console.log(
    JSON.stringify({
      _aws: {
        Timestamp: Date.now(),
        CloudWatchMetrics: [
          {
            Namespace: "BCT",
            Dimensions: [["Service", "Stage"]],
            Metrics: [{ Name: name, Unit: unit }],
          },
        ],
      },
      Service: "Poller",
      Stage: STAGE,
      [name]: value,
    })
  );
}
