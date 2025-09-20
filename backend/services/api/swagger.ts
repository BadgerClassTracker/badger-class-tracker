import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const swaggerSpec = {
  openapi: "3.0.0",
  info: {
    title: "Badger Class Tracker API",
    description: "API for tracking UW-Madison class seat availability",
    version: "1.0.0",
    contact: {
      name: "Badger Class Tracker",
      email: "jkim927@wisc.edu"
    }
  },
  servers: [
    {
      url: "https://yjk4d7s8y9.execute-api.us-east-2.amazonaws.com/prod",
      description: "Production API Gateway"
    }
  ],
  components: {
    securitySchemes: {
      CognitoAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token from AWS Cognito"
      }
    },
    schemas: {
      Subscription: {
        type: "object",
        properties: {
          subId: { type: "string", description: "Unique subscription ID" },
          userId: { type: "string", description: "User's email address" },
          term: { type: "string", description: "Academic term (e.g., '1252')" },
          subjectCode: { type: "string", description: "Subject code (e.g., 'COMP SCI')" },
          subjectDescription: { type: "string", description: "Subject description" },
          courseId: { type: "string", description: "Course ID (e.g., '300')" },
          catalogNumber: { type: "string", description: "Catalog number" },
          classNbr: { type: "string", description: "Class number for specific section" },
          sectionName: { type: "string", description: "Section name (e.g., 'LEC 001')" },
          createdAt: { type: "string", format: "date-time", description: "Subscription creation timestamp" },
          lastChecked: { type: "string", description: "Last time this section was checked" },
          lastStatus: { type: "string", enum: ["OPEN", "CLOSED", "WAITLISTED"], description: "Last known seat status" },
          active: { type: "boolean", description: "Whether the subscription is active" }
        },
        required: ["subId", "userId", "term", "subjectCode", "courseId", "classNbr", "createdAt", "active"]
      },
      CreateSubscriptionRequest: {
        type: "object",
        properties: {
          term: { type: "string", description: "Academic term" },
          subjectCode: { type: "string", description: "Subject code" },
          subjectDescription: { type: "string", description: "Subject description" },
          courseId: { type: "string", description: "Course ID" },
          catalogNumber: { type: "string", description: "Catalog number" },
          classNbr: { type: "string", description: "Class number for specific section" },
          sectionName: { type: "string", description: "Section name" }
        },
        required: ["term", "subjectCode", "courseId", "classNbr"]
      },
      CourseSearchRequest: {
        type: "object",
        properties: {
          term: { type: "string", description: "Academic term to search" },
          subject: { type: "string", description: "Subject code filter" },
          keyword: { type: "string", description: "Keyword search" },
          catalogNbr: { type: "string", description: "Catalog number filter" }
        }
      },
      Course: {
        type: "object",
        properties: {
          term: { type: "string" },
          subject: { type: "string" },
          subjectDescription: { type: "string" },
          catalogNumber: { type: "string" },
          courseId: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          sections: {
            type: "array",
            items: {
              type: "object",
              properties: {
                classNbr: { type: "string" },
                sectionName: { type: "string" },
                enrolledTotal: { type: "number" },
                enrollmentCapacity: { type: "number" },
                waitlistTotal: { type: "number" },
                waitlistCapacity: { type: "number" },
                status: { type: "string", enum: ["OPEN", "CLOSED", "WAITLISTED"] }
              }
            }
          }
        }
      },
      Term: {
        type: "object",
        properties: {
          termCode: { type: "string", description: "Term code (e.g., '1252')" },
          termDescription: { type: "string", description: "Term description (e.g., 'Spring 2025')" },
          startDate: { type: "string", format: "date" },
          endDate: { type: "string", format: "date" }
        }
      },
      Error: {
        type: "object",
        properties: {
          error: { type: "string", description: "Error message" },
          details: { type: "string", description: "Additional error details" }
        }
      }
    }
  },
  paths: {
    "/subscriptions": {
      get: {
        summary: "List user subscriptions",
        description: "Get all subscriptions for the authenticated user",
        security: [{ CognitoAuth: [] }],
        responses: {
          "200": {
            description: "List of user subscriptions",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Subscription" }
                }
              }
            }
          },
          "401": {
            description: "Unauthorized - Invalid or missing JWT token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "500": {
            description: "Internal server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      },
      post: {
        summary: "Create a new subscription",
        description: "Subscribe to notifications for a specific course section",
        security: [{ CognitoAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateSubscriptionRequest" }
            }
          }
        },
        responses: {
          "201": {
            description: "Subscription created successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Subscription" }
              }
            }
          },
          "400": {
            description: "Bad request - Invalid input",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "401": {
            description: "Unauthorized - Invalid or missing JWT token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "409": {
            description: "Conflict - Subscription already exists",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "429": {
            description: "Too many requests - Rate limit exceeded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/subscriptions/{id}": {
      delete: {
        summary: "Delete a subscription",
        description: "Remove a subscription by ID",
        security: [{ CognitoAuth: [] }],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Subscription ID to delete"
          }
        ],
        responses: {
          "200": {
            description: "Subscription deleted successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    message: { type: "string", example: "Subscription deleted successfully" }
                  }
                }
              }
            }
          },
          "401": {
            description: "Unauthorized - Invalid or missing JWT token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          },
          "404": {
            description: "Subscription not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/unsubscribe": {
      get: {
        summary: "Unsubscribe via email link",
        description: "Unsubscribe using a token from email notification",
        parameters: [
          {
            name: "token",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Unsubscribe token from email"
          }
        ],
        responses: {
          "200": {
            description: "Successfully unsubscribed",
            content: {
              "text/html": {
                schema: { type: "string" }
              }
            }
          },
          "400": {
            description: "Invalid or expired token",
            content: {
              "text/html": {
                schema: { type: "string" }
              }
            }
          }
        }
      },
      post: {
        summary: "Unsubscribe via POST",
        description: "Alternative POST method for unsubscribe",
        requestBody: {
          required: true,
          content: {
            "application/x-www-form-urlencoded": {
              schema: {
                type: "object",
                properties: {
                  token: { type: "string", description: "Unsubscribe token" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Successfully unsubscribed",
            content: {
              "text/html": {
                schema: { type: "string" }
              }
            }
          },
          "400": {
            description: "Invalid or expired token",
            content: {
              "text/html": {
                schema: { type: "string" }
              }
            }
          }
        }
      }
    },
    "/courses": {
      get: {
        summary: "Search courses",
        description: "Search for UW-Madison courses (proxies to UW enrollment API). Either use 'search' parameter for general search, OR use both 'subject' and 'courseId' for specific course lookup.",
        parameters: [
          {
            name: "term",
            in: "query",
            schema: { type: "string" },
            description: "Academic term to search (defaults to '0000' for all terms)",
            example: "1252"
          },
          {
            name: "search",
            in: "query",
            schema: { type: "string" },
            description: "Search query string for general course search",
            example: "computer science programming"
          },
          {
            name: "subject",
            in: "query",
            schema: { type: "string" },
            description: "Subject code (must be used with courseId for specific course lookup)",
            example: "COMP SCI"
          },
          {
            name: "courseId",
            in: "query",
            schema: { type: "string" },
            description: "Course ID (must be used with subject for specific course lookup)",
            example: "300"
          },
          {
            name: "openOnly",
            in: "query",
            schema: { type: "string", enum: ["true", "false"] },
            description: "Filter to only show open/waitlisted courses",
            example: "true"
          },
          {
            name: "page",
            in: "query",
            schema: { type: "string" },
            description: "Page number for pagination (default: 1)",
            example: "1"
          },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "string" },
            description: "Number of results per page (default: 50)",
            example: "50"
          },
          {
            name: "sortOrder",
            in: "query",
            schema: { type: "string", enum: ["SCORE", "RELEVANCE"] },
            description: "Sort order for results (default: SCORE)",
            example: "SCORE"
          }
        ],
        responses: {
          "200": {
            description: "Course search results",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Course" }
                }
              }
            }
          },
          "400": {
            description: "Bad request - Must provide either 'search' parameter or both 'subject' and 'courseId'",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    error: {
                      type: "string",
                      example: "Must provide either 'search' parameter or both 'subject' and 'courseId'"
                    }
                  }
                }
              }
            }
          },
          "500": {
            description: "External API error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    },
    "/terms": {
      get: {
        summary: "Get available terms",
        description: "Get list of available academic terms",
        responses: {
          "200": {
            description: "List of available terms",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: { $ref: "#/components/schemas/Term" }
                }
              }
            }
          },
          "500": {
            description: "External API error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Error" }
              }
            }
          }
        }
      }
    }
  }
};

const swaggerUI = `
<!DOCTYPE html>
<html>
<head>
  <title>Badger Class Tracker API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui.css" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        spec: ${JSON.stringify(swaggerSpec)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>
`;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const path = event.path;

  // Handle different endpoints
  if (path.endsWith('/swagger.json') || path.endsWith('/openapi.json')) {
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With,x-api-key',
        'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,DELETE,PUT,PATCH'
      },
      body: JSON.stringify(swaggerSpec, null, 2)
    };
  }

  // Default to Swagger UI
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Requested-With,x-api-key',
      'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,DELETE,PUT,PATCH'
    },
    body: swaggerUI
  };
};