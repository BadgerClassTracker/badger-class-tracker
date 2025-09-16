import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE!;

export const handler = async (event: any) => {
  const d = event?.detail || {};
  const type = (d.eventType || d.eventTypeLabel || "").toUpperCase();
  const dests: string[] = d.mail?.destination || [];
  if (!["BOUNCE", "COMPLAINT"].includes(type)) return { ok: true };

  const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days
  for (const email of dests) {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          PK: `SUPPRESS#${email.toLowerCase()}`,
          SK: "SES",
          reason: type,
          createdAt: new Date().toISOString(),
          ttl,
        },
      })
    );
  }
  return { ok: true, suppressed: dests.length, type };
};
