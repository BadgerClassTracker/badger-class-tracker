import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
// import { pkUser, skSub, skCount, skDedupForSec, pkWatch, skWatch } from "../_shared/ddb/keys";

const TABLE = process.env.TABLE!;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export const handler = async (evt: any) => {
  const id = evt.pathParameters?.id;
  const email = String(evt.queryStringParameters?.email || "")
    .toLowerCase()
    .trim();
  if (!id || !email) {
    return json(400, { error: "id path param and email query param required" });
  }

  // 1) Load sub to compute keys
  const subKey = { PK: `USER#${email}`, SK: `SUB#${id}` };
  const { Item } = await ddb.send(
    new GetCommand({
      TableName: TABLE,
      Key: subKey,
      ConsistentRead: true,
    })
  );
  if (!Item) return json(404, { error: "not_found" });

  const term: string = Item.termCode;
  const subj: string = Item.subjectCode;
  const course: string = Item.courseId;
  const classNbr: string = String(Item.classNumber);

  const userPk = `USER#${email}`;
  const guardSk = `DEDUP#SEC#${term}#${classNbr}`;
  const watchPk = `COURSE#${term}#${subj}#${course}`;
  const watchSk = "WATCH";

  // 2) Atomic: delete SUB + delete DEDUP + dec USER.SUBCOUNT + dec WATCH.subCount
  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          // (a) delete SUB (strict: must exist)
          {
            Delete: {
              TableName: TABLE,
              Key: subKey,
              ConditionExpression:
                "attribute_exists(PK) AND attribute_exists(SK)",
            },
          },
          // (b) delete DEDUP (soft: idempotent if missing)
          {
            Delete: {
              TableName: TABLE,
              Key: { PK: userPk, SK: guardSk },
            },
          },
          // (c) decrement USER SUBCOUNT (min 0 via condition)
          {
            Update: {
              TableName: TABLE,
              Key: { PK: userPk, SK: "SUBCOUNT" },
              UpdateExpression: "ADD subCount :dec",
              ConditionExpression:
                "attribute_exists(subCount) AND subCount >= :one",
              ExpressionAttributeValues: {
                ":dec": -1,
                ":one": 1,
              },
            },
          },
          // (d) decrement WATCH.subCount (min 0 via condition)
          {
            Update: {
              TableName: TABLE,
              Key: { PK: watchPk, SK: watchSk }, // e.g., PK=COURSE#<term>#<subj>#<course>, SK=WATCH
              UpdateExpression: "ADD subCount :dec",
              ConditionExpression:
                "attribute_exists(subCount) AND subCount >= :one",
              ExpressionAttributeValues: {
                ":dec": -1,
                ":one": 1,
              },
            },
          },
        ],
      })
    );
  } catch (e: any) {
    const name = e?.name || "";
    if (
      name === "TransactionCanceledException" ||
      name === "ConditionalCheckFailedException"
    ) {
      // Covers double-delete races, missing count rows, already-zero counters, etc.
      // Your current behavior treats these as idempotent:
      return json(204, "");
    }
    console.error("delete-subscription-txn-error", e);
    return json(500, { error: "internal_error" });
  }

  // 3) Best-effort WATCH decrement is no longer needed; already done in the transaction.
  //    Remove this whole block:
  // try { await ddb.send(new UpdateCommand(...)); } catch (e) { ... }

  // 4) Optional: keep eager cleanup or let Janitor handle it later
  await cleanupWatchIfZero(watchPk, watchSk);

  return json(204, "");
};

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
