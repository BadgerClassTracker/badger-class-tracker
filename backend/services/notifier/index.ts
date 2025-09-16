// services/notifier/index.ts
// -----------------------------------------------------------------------------
// Notifier
// - Triggered by EventBridge SeatStatusChanged
// - Looks up subscribers for SEC#<term>#<classNbr> (GSI1)
// - Per-user/section/status minute-level dedupe via single-table item
// - Sends SES emails (with optional ConfigurationSet for feedback)
// - Issues unsubscribe tokens (stored for 7d)
// - Records SLO metrics:
//     * NotifyLatencyMs (now - poller.detectedAt), per email sent
//     * EmailSentCount / EmailSuppressedCount
// -----------------------------------------------------------------------------

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
  GetCommand,
} from "@aws-sdk/lib-dynamodb";
import { createHash, randomUUID } from "crypto";

const TABLE = process.env.TABLE!;
const FROM = process.env.FROM!;
const STAGE = process.env.STAGE;

const ses = new SESv2Client({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Cache for subjects map
let subjectsMap: Map<string, string> | null = null;

type Status = "OPEN" | "WAITLISTED" | "CLOSED";

export const handler = async (event: any) => {
  const d = event?.detail || {};
  const term = String(d.term || "");
  const termDescription = String(d.termDescription || d.term || "");
  const classNbr = String(d.classNbr || "");
  const toStatus = (d.to as Status) || "CLOSED";
  let title = (d.title as string) || classNbr;
  
  // If title starts with a number, it's missing the subject name - fix it
  if (/^\d/.test(title.trim())) {
    console.log("Detected title missing subject, attempting to fix", { title, classNbr, subjectCode: d.subjectCode });
    const subjectCode = String(d.subjectCode || "");
    if (subjectCode) {
      const subjectName = await getSubjectName(subjectCode);
      if (subjectName) {
        // Replace the broken title with proper subject name
        title = title.replace(/^\d+/, `${subjectName} $&`);
        console.log("Fixed title", { oldTitle: d.title, newTitle: title });
      }
    }
  }
  const detectedAt =
    typeof d.detectedAt === "string" ? d.detectedAt : undefined;

  const CONFIG_SET = process.env.SES_CONFIG_SET; // optional
  const API_BASE = process.env.API_BASE || ""; // for unsubscribe link

  if (!term || !classNbr) {
    console.log("skip: missing term/classNbr", d);
    return { ok: true };
  }

  // 1) Find subscribers for this section (GSI1: SEC#term#classNumber)
  const q = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `SEC#${term}#${classNbr}` },
    })
  );
  const subs = (q.Items ?? []).filter((s: any) => s.active !== false);
  console.log("subs found", { term, classNbr, count: subs.length });

  let sentCount = 0;
  let suppressedCount = 0;

  // 2) Email subscribers with minute-level dedupe
  for (const s of subs) {
    const email = String(s.userId || s.email || "");
    const notifyOn = String(s.notifyOn || "ANY");

    if (!email) {
      console.log("skip: no email on sub", s);
      continue;
    }
    if (notifyOn !== "ANY" && notifyOn !== toStatus) {
      console.log("skip: notifyOn mismatch", { email, notifyOn, toStatus });
      continue;
    }

    // Minute-level dedupe per (user, section, status)
    const key = sha(
      `${term}|${classNbr}|${toStatus}|${email}|${nowMinuteIso()}`
    );
    const ttl = Math.floor(Date.now() / 1000) + 60 * 60; // 1h

    try {
      await ddb.send(
        new PutCommand({
          TableName: TABLE,
          Item: {
            PK: `NOTIF#${key}`,
            SK: `USER#${email}`,
            createdAt: new Date().toISOString(),
            ttl, // requires table TTL attribute named 'ttl'
          },
          ConditionExpression: "attribute_not_exists(PK)",
        })
      );
    } catch (e: any) {
      // 👈 explicit catch for older TS targets
      console.log("dedupe: already sent", { email });
      continue;
    }

    // Suppression check (from SES feedback processor)
    const sup = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `SUPPRESS#${email.toLowerCase()}`, SK: "SES" },
      })
    );
    if (sup.Item) {
      console.log("skip: suppressed", email);
      suppressedCount++;
      putMetric("EmailSuppressedCount", 1, "Count");
      continue;
    }

    // Unsubscribe token (per email/sub)
    const token = randomUUID();
    const ttlUnsub = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `UNSUB#${token}`,
          SK: "TOKEN",
          userId: email, // who can unsubscribe
          subId: s.subId, // the subscription id to disable
          createdAt: new Date().toISOString(),
          ttl: ttlUnsub,
        },
      })
    );
    const confirmUrl = `${API_BASE}unsubscribe?token=${encodeURIComponent(
      token
    )}`;

    // Compose email
    const titleWithTerm = `${title} (${termDescription})`;
    const subject = `Seat update: ${titleWithTerm} is now ${toStatus}`;
    const text = [
      `Update for ${titleWithTerm}:`,
      ``,
      `Status changed to ${toStatus}.`,
      ``,
      `Unsubscribe: ${confirmUrl}`,
    ].join("\n");

    // Send
    try {
      await ses.send(
        new SendEmailCommand({
          FromEmailAddress: FROM,
          Destination: { ToAddresses: [email] },
          Content: {
            Simple: {
              Subject: { Data: subject },
              Body: { Text: { Data: text } },
            },
          },
          ConfigurationSetName: CONFIG_SET, // optional
        })
      );
      console.log("sent", { to: email });
      sentCount++;

      // SLO metrics per email
      const latencyMs = detectedAt
        ? Math.max(0, Date.now() - Date.parse(detectedAt))
        : 0;
      putMetric("NotifyLatencyMs", latencyMs, "Milliseconds");
      putMetric("EmailSentCount", 1, "Count");
    } catch (e: any) {
      console.error("ses-error", { to: email, err: (e as Error).message });
      // optionally: putMetric("EmailSendErrorCount", 1, "Count");
    }
  }

  console.log("notify-finished", {
    term,
    classNbr,
    subs: subs.length,
    sentCount,
    suppressedCount,
  });

  // Per-run totals (optional)
  putMetric("NotifyRunSubscribers", subs.length, "Count");
  putMetric("NotifyRunSent", sentCount, "Count");
  putMetric("NotifyRunSuppressed", suppressedCount, "Count");

  return {
    ok: true,
    count: subs.length,
    sent: sentCount,
    suppressed: suppressedCount,
  };
};

// ---------- helpers ----------------------------------------------------------

async function getSubjectName(subjectCode: string): Promise<string> {
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
  
  // Try subjects map
  const mapName = subjectsMap.get(subjectCode);
  if (mapName) {
    return mapName;
  }
  
  return "";
}

function sha(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
function nowMinuteIso() {
  return new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
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
      Service: "Notifier",
      Stage: STAGE,
      [name]: value,
    })
  );
}
