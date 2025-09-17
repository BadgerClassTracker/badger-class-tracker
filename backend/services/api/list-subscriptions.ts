// services/api/list-subscriptions.ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE!;

// Cache for subjects map
let subjectsMap: Map<string, string> | null = null;

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
    const subItems = (res.Items ?? [])
      .filter((it: any) => String(it.SK || "").startsWith("SUB#"));

    // Enhance each subscription with subject description
    const subs = await Promise.all(
      subItems.map(async (it: any) => {
        const subjectDescription = await getSubjectName(it.subjectCode || "");
        return {
          subId: it.subId,
          termCode: it.termCode,
          subjectCode: it.subjectCode,
          courseId: it.courseId,
          catalogNumber: it.catalogNumber,
          classNumber: it.classNumber,
          sectionName: it.sectionName,
          notifyOn: it.notifyOn,
          active: it.active !== false,
          createdAt: it.createdAt,
          subjectDescription,
        };
      })
    );

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

  // Fallback to subject code if not found
  return subjectCode;
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
