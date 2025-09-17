// services/api/create-subscription.ts
import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  EventBridgeClient,
  PutEventsCommand,
} from "@aws-sdk/client-eventbridge";

// ==== clients & env ==========================================================
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const eb = new EventBridgeClient({});
const TABLE = process.env.TABLE!;
const BUS = process.env.EVENT_BUS_NAME || "SeatEvents";
const MAX_SUBS = Number(process.env.MAX_SUBS_PER_USER || 10);

// Cache for subjects map
let subjectsMap: Map<string, string> | null = null;

// ==== types ==================================================================
type Body = {
  termCode: string;
  subjectCode: string;
  courseId: string;
  catalogNumber?: string;
  classNumber: number | string;
  notifyOn?: "OPEN" | "WAITLISTED" | "ANY";
  sectionName?: string;
};

// ==== helpers ================================================================
const nowSec = () => Math.floor(Date.now() / 1000);

// Simple in-memory deduplication cache (resets on cold start)
const recentRequests = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10000; // 10 seconds

function getDedupeKey(email: string, body: any): string {
  return `${email}|${body.termCode}|${body.subjectCode}|${body.courseId}|${body.classNumber}`;
}

// ==== handler ================================================================
export const handler = async (evt: any) => {
  try {
    // ---------- Auth ----------
    const { email, sub } = getAuth(evt);
    if (!email) return json(401, { error: "unauthorized" });
    const userPk = `USER#${email}`;

    // ---------- Body ----------
    let b: Body;
    try {
      b = JSON.parse(evt.body || "{}");
    } catch {
      return json(400, { error: "invalid_json" });
    }

    const missing: string[] = [];
    if (!b.termCode) missing.push("termCode");
    if (!b.subjectCode) missing.push("subjectCode");
    if (!b.courseId) missing.push("courseId");
    if (b.classNumber === undefined || b.classNumber === null)
      missing.push("classNumber");
    if (missing.length)
      return json(400, { error: "missing_fields", fields: missing });

    const term = String(b.termCode).trim();
    const subj = String(b.subjectCode).trim();
    const course = String(b.courseId).trim();
    const catalogNumber = b.catalogNumber ? String(b.catalogNumber).trim() : "";
    const classNbr = String(b.classNumber).trim();
    const notifyOn = (b.notifyOn || "ANY") as Body["notifyOn"];
    const sectionName = b.sectionName ? String(b.sectionName).trim() : "";
    const nowIso = new Date().toISOString();

    // ---------- Simple deduplication (in-memory) ----------
    const dedupeKey = getDedupeKey(email, b);
    const now = Date.now();
    const lastRequest = recentRequests.get(dedupeKey);
    
    if (lastRequest && (now - lastRequest) < DEDUPE_WINDOW_MS) {
      return json(409, { error: "duplicate_request", retryAfter: Math.ceil((DEDUPE_WINDOW_MS - (now - lastRequest)) / 1000) });
    }
    
    recentRequests.set(dedupeKey, now);
    
    // Clean up old entries periodically
    if (Math.random() < 0.1) { // 10% chance
      const cutoff = now - DEDUPE_WINDOW_MS;
      for (const [key, timestamp] of recentRequests.entries()) {
        if (timestamp < cutoff) {
          recentRequests.delete(key);
        }
      }
    }

    // ---------- Keys ----------
    const subId = randomUUID();
    const subSk = `SUB#${subId}`;
    const guardSk = `DEDUP#SEC#${term}#${classNbr}`; // dedupe per user+section
    const watchPk = `COURSE#${term}#${subj}#${course}`;
    const watchSk = "WATCH";
    const userCapSk = "SUBCOUNT";

    // ---------- Transaction: DEDUP + SUB + WATCH + USER CAP ----------
    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            // 0) DEDUP guard (fails if already subscribed to this section)
            {
              Put: {
                TableName: TABLE,
                Item: {
                  PK: userPk,
                  SK: guardSk,
                  subId,
                  termCode: term,
                  subjectCode: subj,
                  courseId: course,
                  catalogNumber: catalogNumber,
                  classNumber: classNbr,
                  sectionName: sectionName,
                  active: true,
                  createdAt: nowIso,
                },
                ConditionExpression:
                  "attribute_not_exists(PK) AND attribute_not_exists(SK)",
              },
            },
            // 1) Create SUB row
            {
              Put: {
                TableName: TABLE,
                Item: {
                  PK: userPk,
                  SK: subSk,
                  userId: email,
                  userSub: sub || "",
                  subId,
                  termCode: term,
                  subjectCode: subj,
                  courseId: course,
                  catalogNumber: catalogNumber,
                  classNumber: classNbr,
                  sectionName: sectionName,
                  notifyOn,
                  active: true,
                  createdAt: nowIso,
                  GSI1PK: `SEC#${term}#${classNbr}`,
                  GSI1SK: `SUB#${subId}`,
                },
              },
            },
            // 2) Increment subCount on the course WATCH row (simplified)
            {
              Update: {
                TableName: TABLE,
                Key: { PK: watchPk, SK: watchSk },
                UpdateExpression: "ADD subCount :inc",
                ExpressionAttributeValues: {
                  ":inc": 1,
                },
              },
            },
            // 3) Increment per-user SUBCOUNT with cap check
            {
              Update: {
                TableName: TABLE,
                Key: { PK: userPk, SK: userCapSk },
                // Initialize missing counter to 0, then ADD 1
                UpdateExpression: "SET updatedAt = :now ADD subCount :one",
                // Allow creation OR enforce cap if exists
                ConditionExpression:
                  "attribute_not_exists(PK) OR subCount < :max",
                ExpressionAttributeValues: {
                  ":one": 1,
                  ":max": MAX_SUBS,
                  ":now": nowIso,
                },
              },
            },
          ],
        })
      );
    } catch (e: any) {
      if (
        e?.name === "TransactionCanceledException" ||
        e?.name === "ConditionalCheckFailedException"
      ) {
        // Read back to decide error type
        const [guard, cap] = await Promise.all([
          ddb.send(
            new GetCommand({
              TableName: TABLE,
              Key: { PK: userPk, SK: guardSk },
              ConsistentRead: true,
            })
          ),
          ddb.send(
            new GetCommand({
              TableName: TABLE,
              Key: { PK: userPk, SK: userCapSk },
              ConsistentRead: true,
            })
          ),
        ]);
        if (guard.Item) {
          return json(409, {
            error: "duplicate",
            message: "Already subscribed to this section.",
          });
        }
        const count = Number(cap.Item?.subCount ?? 0);
        if (count >= MAX_SUBS) {
          return json(403, {
            error: "user_cap_exceeded",
            max: MAX_SUBS,
            message: `You can have at most ${MAX_SUBS} subscriptions.`,
          });
        }
      }
      console.error("txn-error", e);
      return json(500, { error: "internal_error" });
    }

    // ---------- Best-effort instant notify ----------
    try {
      const url = `https://public.enroll.wisc.edu/api/search/v1/enrollmentPackages/${term}/${subj}/${course}`;
      console.log("instant-check:start", { term, subj, course, classNbr });
      const data = (await fetchWithTimeout(url, 1500)) as any[]; // 1.5s cap
      const pkg = data.find(
        (p) => String(p.enrollmentClassNumber) === classNbr
      );
      const now = normalizeStatus(
        String(pkg?.packageEnrollmentStatus?.status || "")
      );
      console.log("instant-check:status", { classNbr, now });

      if (now === "OPEN" || now === "WAITLISTED") {
        // Get human-readable term description
        let termDescription = term; // fallback
        try {
          const termResponse = await fetchWithTimeout("https://public.enroll.wisc.edu/api/search/v1/aggregate", 1000);
          const termInfo = termResponse.terms?.find((t: any) => t.termCode === term);
          if (termInfo?.shortDescription) {
            termDescription = termInfo.shortDescription; // e.g., "2025 Fall"
          }
        } catch (e) {
          console.warn("Failed to fetch term description", { term, error: e });
        }

        await eb.send(
          new PutEventsCommand({
            Entries: [
              {
                Source: "uw.enroll.poller",
                DetailType: "SeatStatusChanged",
                EventBusName: BUS,
                Detail: JSON.stringify({
                  term,
                  termDescription,
                  subjectCode: subj,
                  courseId: course,
                  classNbr,
                  from: "UNKNOWN",
                  to: now,
                  title: await buildHierarchicalTitle(pkg, data),
                  firstObservedAt: new Date().toISOString(),
                }),
              },
            ],
          })
        );
        console.log("instant-check:emitted");
      } else {
        console.log("instant-check:no-op");
      }
    } catch (e) {
      console.warn("instant-check:skip", (e as Error).message);
    }

    // ---------- Success response ----------
    return json(201, { subId: subId });
  } catch (e: any) {
    console.error("create-subscription-error", e?.message, e?.stack);
    return json(500, { error: "internal_error" });
  }
};

// ==== helpers ================================================================

function getAuth(evt: any): { email: string | null; sub: string | null } {
  const claims =
    evt?.requestContext?.authorizer?.jwt?.claims ||
    evt?.requestContext?.authorizer?.claims ||
    {};
  const email =
    (claims.email || claims["custom:email"] || "")
      .toString()
      .toLowerCase()
      .trim() || null;
  const sub = (claims.sub ? String(claims.sub) : "") || null;
  return { email, sub };
}


function normalizeStatus(status: string): "OPEN" | "WAITLISTED" | "CLOSED" {
  const s = (status || "").toUpperCase();
  if (s.includes("OPEN") && !s.includes("WAITLIST")) return "OPEN";
  if (s.includes("WAITLIST")) return "WAITLISTED";
  return "CLOSED";
}

async function fetchWithTimeout(url: string, ms: number): Promise<any> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getSubjectName(subjectCode: string, pkg?: any): Promise<string> {
  // First try the subjects map cache
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
        subjectsMap = new Map(); // empty map to avoid repeated failed requests
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
  if (pkg?.subject?.shortDescription) {
    return pkg.subject.shortDescription;
  }
  if (pkg?.subject?.description) {
    return pkg.subject.description;
  }
  if (pkg?.subject?.formalDescription) {
    return pkg.subject.formalDescription;
  }
  
  return "";
}

async function buildHierarchicalTitle(pkg: any, allPackages: any[]): Promise<string> {
  const subjectCode = pkg?.subject?.subjectCode ?? "";
  const subj = await getSubjectName(subjectCode, pkg);
  const cat = pkg?.catalogNumber ?? "";

  // Build hierarchical title: COMP SCI 200 - LEC 002 - LAB 327
  let title = `${subj} ${cat}`.trim();

  const autoEnrollClasses = pkg.autoEnrollClasses || [];
  const sections = pkg.sections || [];

  if (autoEnrollClasses.length > 0) {
    // This package has a parent (LEC + LAB/DIS pattern)
    const parentId = autoEnrollClasses[0];

    // Find the parent section
    const parentSection = sections.find((s: any) =>
      String(s.classUniqueId?.classNumber) === String(parentId)
    );

    // Find the enrollment section (what students register for)
    const enrollmentSection = sections.find((s: any) =>
      String(s.classUniqueId?.classNumber) === String(pkg.enrollmentClassNumber)
    );

    if (parentSection && enrollmentSection) {
      // Parent-child relationship: COMP SCI 200 - LEC 002 - LAB 327
      const parentType = parentSection.type || "SEC";
      const parentNumber = parentSection.sectionNumber || "";
      const childType = enrollmentSection.type || "SEC";
      const childNumber = enrollmentSection.sectionNumber || "";

      title += ` - ${parentType} ${parentNumber}`;
      if (childNumber) {
        title += ` - ${childType} ${childNumber}`;
      }
    } else if (enrollmentSection) {
      // Fallback to just the enrollment section if parent not found
      const sectionType = enrollmentSection.type || "SEC";
      const sectionNumber = enrollmentSection.sectionNumber || "";

      if (sectionNumber) {
        title += ` - ${sectionType} ${sectionNumber}`;
      }
    }
  } else {
    // This is a standalone course (SEM, standalone LEC, etc.)
    // Find the enrollment section (what students register for)
    const enrollmentSection = sections.find((s: any) =>
      String(s.classUniqueId?.classNumber) === String(pkg.enrollmentClassNumber)
    ) || sections[0];

    if (enrollmentSection) {
      const sectionType = enrollmentSection.type || "SEC";
      const sectionNumber = enrollmentSection.sectionNumber || "";

      if (sectionNumber) {
        title += ` - ${sectionType} ${sectionNumber}`;
      }
    }
  }

  return title;
}

function json(statusCode: number, body: any) {
  return {
    statusCode,
    headers: { 
      "content-type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Requested-With,x-api-key",
      "Access-Control-Allow-Methods": "OPTIONS,GET,POST,DELETE,PUT,PATCH"
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}
