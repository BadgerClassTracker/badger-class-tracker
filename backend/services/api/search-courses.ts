// services/api/search-courses.ts
// Proxy endpoint for UW course search API to handle CORS restrictions

export const handler = async (evt: any) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Content-Type": "application/json",
  };

  // Handle preflight OPTIONS request
  if (evt.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  try {
    const query = evt.queryStringParameters || {};
    const term = query.term || '0000'; // Fallback to search all terms
    const subject = query.subject;
    const courseId = query.courseId;

    let url: string;
    if (subject && courseId) {
      // Get specific course sections
      url = `https://public.enroll.wisc.edu/api/search/v1/enrollmentPackages/${term}/${subject}/${courseId}`;
    } else if (query.search) {
      // Search for courses
      const searchBody = {
        selectedTerm: term,
        queryString: query.search || "*",
        filters: query.openOnly === "true" ? [{
          has_child: {
            type: "enrollmentPackage",
            query: {
              bool: {
                must: [
                  { match: { "packageEnrollmentStatus.status": "OPEN WAITLISTED" } },
                  { match: { published: true } }
                ]
              }
            }
          }
        }] : [],
        page: parseInt(query.page || "1"),
        pageSize: parseInt(query.pageSize || "50"),
        sortOrder: query.sortOrder || "SCORE"
      };

      const response = await fetch("https://public.enroll.wisc.edu/api/search/v1", {
        method: "POST",
        headers: {
          "accept": "application/json",
          "content-type": "application/json",
          "user-agent": "badger-class-tracker/1.0 (educational use)",
        },
        body: JSON.stringify(searchBody),
      });

      if (!response.ok) {
        throw new Error(`UW API error: ${response.status}`);
      }

      const data = await response.json();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data),
      };
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: "Must provide either 'search' parameter or both 'subject' and 'courseId'" 
        }),
      };
    }

    // For direct course lookup
    const response = await fetch(url, {
      headers: {
        "accept": "application/json",
        "user-agent": "badger-class-tracker/1.0 (educational use)",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: "Course not found" }),
        };
      }
      throw new Error(`UW API error: ${response.status}`);
    }

    const data = await response.json();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error("Course search error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: "Internal server error",
        message: (error as Error).message 
      }),
    };
  }
};