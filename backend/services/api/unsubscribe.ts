// services/api/unsubscribe.ts - Combined GET and POST handler
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  DeleteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import * as qs from "querystring";

const TABLE = process.env.TABLE!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

async function cleanupWatchIfZero(watchPk: string, watchSk: string) {
  try {
    const got = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: watchPk, SK: watchSk },
        ConsistentRead: true,
      })
    );
    const cnt = Number(got.Item?.subCount ?? 0);
    if (cnt <= 0) {
      await ddb.send(
        new DeleteCommand({
          TableName: TABLE,
          Key: { PK: watchPk, SK: watchSk },
          ConditionExpression:
            "attribute_exists(PK) AND attribute_exists(SK) AND (attribute_not_exists(subCount) OR subCount <= :z)",
          ExpressionAttributeValues: { ":z": 0 },
        })
      );
    }
  } catch (e: any) {
    console.warn("watch-cleanup-skip", e?.name || e);
  }
}

const json = (code: number, o: any) => ({
  statusCode: code,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(o),
});

const html = (code: number, msg: string) => ({
  statusCode: code,
  headers: { "Content-Type": "text/html; charset=utf-8" },
  body: `<!doctype html><html><body><p>${escapeHtml(msg)}</p></body></html>`,
});

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        c
      ] as string)
  );

export const handler = async (evt: any) => {
  const method = evt.httpMethod || evt.requestContext?.http?.method || "GET";

  if (method === "GET") {
    // Show confirmation form
    const token = String(evt.queryStringParameters?.token || "");
    if (!token) return html(400, "Invalid request.");

    const res = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `UNSUB#${token}`, SK: "TOKEN" },
      })
    );
    if (!res.Item)
      return html(410, "This unsubscribe link is expired or already used.");

    // Build absolute POST action that preserves the stage (e.g., /prod/unsubscribe)
    const host = evt.headers?.["x-forwarded-host"] || evt.headers?.["Host"];
    const proto = (evt.headers?.["x-forwarded-proto"] || "https").toLowerCase();
    const stage = evt.requestContext?.stage ? `/${evt.requestContext.stage}` : "";
    const action = `${proto}://${host}${stage}/unsubscribe`;

    const body = `
<!doctype html><html><head><meta charset="utf-8"><title>Confirm unsubscribe</title></head>
<body>
  <h2>Unsubscribe?</h2>
  <p>Click confirm to unsubscribe from this class notification.</p>
  <form method="POST" action="${action}" enctype="application/x-www-form-urlencoded">
    <input type="hidden" name="token" value="${escapeHtml(token)}" />
    <button type="submit">Confirm unsubscribe</button>
  </form>
</body></html>`;
    return {
      statusCode: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
      body,
    };
  }

  if (method === "POST") {
    // Process unsubscribe
    const ct = (
      evt.headers?.["content-type"] ||
      evt.headers?.["Content-Type"] ||
      ""
    ).toLowerCase();
    let token = "";
    if (ct.startsWith("application/json")) {
      token = String(JSON.parse(evt.body || "{}")?.token || "");
    } else if (ct.startsWith("application/x-www-form-urlencoded")) {
      token = String(qs.parse(evt.body || "").token || "");
    } else {
      token = String(evt.queryStringParameters?.token || "");
    }
    if (!token) return json(400, { message: "Missing token" });

    // Resolve token -> userId, subId
    const tok = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `UNSUB#${token}`, SK: "TOKEN" },
      })
    );
    if (!tok.Item) return json(410, { message: "Token expired or already used" });

    const userId = String(tok.Item.userId);
    const subId = String(tok.Item.subId);

    // Load SUB (authoritative key/value source)
    const subRes = await ddb.send(
      new GetCommand({
        TableName: TABLE,
        Key: { PK: `USER#${userId}`, SK: `SUB#${subId}` },
        ConsistentRead: true,
      })
    );
    if (!subRes.Item) {
      // Already gone: burn token idempotently and exit OK
      await ddb.send(
        new DeleteCommand({
          TableName: TABLE,
          Key: { PK: `UNSUB#${token}`, SK: "TOKEN" },
        })
      );
      return json(200, { message: "Already unsubscribed." });
    }

    const sub: any = subRes.Item;

    // USE EXACT FIELD NAMES FROM SUB
    const termCode = String(sub.termCode ?? sub.term);
    const subjectCode = String(sub.subjectCode ?? sub.subject);
    const courseId = String(sub.courseId);
    const classNumber = String(sub.classNumber ?? sub.classNbr);

    const subPK = `USER#${userId}`;
    const subSK = `SUB#${subId}`;
    const dedupSK = `DEDUP#SEC#${termCode}#${classNumber}`;
    const watchPK = `COURSE#${termCode}#${subjectCode}#${courseId}`;
    const watchSK = "WATCH";

    // Transact: delete SUB + DEDUP + token + decrement USER SUBCOUNT
    try {
      await ddb.send(
        new TransactWriteCommand({
          TransactItems: [
            { Delete: { TableName: TABLE, Key: { PK: subPK, SK: subSK } } },
            { Delete: { TableName: TABLE, Key: { PK: subPK, SK: dedupSK } } },
            {
              Delete: {
                TableName: TABLE,
                Key: { PK: `UNSUB#${token}`, SK: "TOKEN" },
              },
            },
            // Decrement user's subscription count
            {
              Update: {
                TableName: TABLE,
                Key: { PK: subPK, SK: "SUBCOUNT" },
                UpdateExpression: "ADD subCount :dec",
                ConditionExpression: "attribute_exists(PK) AND subCount >= :one",
                ExpressionAttributeValues: { ":dec": -1, ":one": 1 },
              },
            },
          ],
        })
      );
    } catch (e) {
      console.error("TransactWrite (SUB/DEDUP/token/SUBCOUNT) failed", e);
      return json(500, { message: "Unable to unsubscribe right now" });
    }

    // Decrement WATCH if it exists
    try {
      await ddb.send(
        new UpdateCommand({
          TableName: TABLE,
          Key: { PK: watchPK, SK: watchSK },
          UpdateExpression: "SET subCount = subCount - :one",
          ConditionExpression:
            "attribute_exists(PK) AND attribute_exists(SK) AND attribute_exists(subCount)",
          ExpressionAttributeValues: { ":one": 1 },
        })
      );
      await cleanupWatchIfZero(watchPK, watchSK);
    } catch (e: any) {
      console.warn("WATCH decrement skipped", { watchPK, reason: e?.name || e });
    }

    return json(200, { message: "You have been unsubscribed." });
  }

  return json(405, { message: "Method not allowed" });
};