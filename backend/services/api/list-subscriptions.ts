// services/api/list-subscriptions.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE!;

/**
 * REST API (API Gateway v1) with Cognito User Pools Authorizer:
 * user claims live at event.requestContext.authorizer.claims
 */
export const handler = async (evt: any) => {
  try {
    const email = getAuthEmail(evt);
    if (!email) {
      return json(401, { error: "unauthorized" });
    }

    // Your current data model stores SUB items under PK=USER#<email>
    const pk = `USER#${email}`;

    const res = await ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ConsistentRead: false,
      })
    );

    // Only return SUB# items (skip DEDUP/WATCH/etc.)
    const subs = (res.Items ?? [])
      .filter((it: any) => String(it.SK || "").startsWith("SUB#"))
      .map((it: any) => ({
        subId: it.subId,
        termCode: it.termCode,
        subjectCode: it.subjectCode,
        courseId: it.courseId,
        classNumber: it.classNumber,
        notifyOn: it.notifyOn,
        active: it.active !== false,
        createdAt: it.createdAt,
      }));

    return json(200, { subscriptions: subs });
  } catch (e: any) {
    console.error("list-subscriptions-error", e?.message, e?.stack);
    return json(500, { error: "internal_error" });
  }
};

function getAuthEmail(evt: any): string | null {
  // REST API + Cognito User Pools Authorizer
  const claims = evt?.requestContext?.authorizer?.claims;
  const email =
    claims?.email ||
    claims?.["custom:email"] || // if you later map to a custom claim
    null;
  return email ? String(email).toLowerCase().trim() : null;
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
    body: JSON.stringify(body),
  };
}
