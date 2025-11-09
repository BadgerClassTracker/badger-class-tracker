// Load Testing Configuration
// Update these values based on your environment

export const config = {
  // API endpoint - replace with your actual API Gateway URL
  apiUrl: 'https://YOUR-API-ID.execute-api.us-east-2.amazonaws.com/prod',

  // For testing with authentication, you'll need a valid JWT token
  // Get this by signing in and extracting the token from browser dev tools
  // To get your token:
  //   1. Open your frontend and sign in
  //   2. Open DevTools (F12) → Network tab
  //   3. Make any API request
  //   4. Click the request → Headers → Copy Authorization header value
  authToken: 'YOUR_JWT_TOKEN_HERE',

  // Test user email (for creating subscriptions)
  testUserEmail: 'loadtest@example.com',

  // Load test scenarios
  scenarios: {
    // Light load - initial adoption (500 users)
    light: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },   // Ramp up to 50 users
        { duration: '5m', target: 50 },   // Stay at 50 users
        { duration: '2m', target: 100 },  // Ramp to 100
        { duration: '5m', target: 100 },  // Stay at 100
        { duration: '2m', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '30s',
    },

    // Medium load - moderate adoption (2,500 users, ~250 concurrent)
    medium: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3m', target: 100 },  // Ramp up
        { duration: '5m', target: 250 },  // Peak usage
        { duration: '10m', target: 250 }, // Sustained load
        { duration: '3m', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '30s',
    },

    // Heavy load - high adoption (10,000 users, ~500 concurrent)
    heavy: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 200 },  // Gradual ramp
        { duration: '5m', target: 500 },  // Peak enrollment period
        { duration: '15m', target: 500 }, // Sustained peak
        { duration: '5m', target: 0 },    // Ramp down
      ],
      gracefulRampDown: '30s',
    },

    // Spike test - sudden traffic surge
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },   // Normal load
        { duration: '30s', target: 500 }, // Sudden spike
        { duration: '2m', target: 500 },  // Maintain spike
        { duration: '1m', target: 50 },   // Return to normal
        { duration: '1m', target: 0 },    // Ramp down
      ],
    },

    // Stress test - find breaking point
    stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 100 },
        { duration: '5m', target: 300 },
        { duration: '5m', target: 600 },
        { duration: '5m', target: 1000 }, // Push to limits
        { duration: '5m', target: 0 },
      ],
      gracefulRampDown: '1m',
    },
  },

  // Thresholds for performance
  thresholds: {
    // 95% of requests should complete within 2 seconds
    http_req_duration: ['p(95)<2000'],

    // 99% of requests should complete within 5 seconds
    'http_req_duration{endpoint:search}': ['p(99)<5000'],
    'http_req_duration{endpoint:subscriptions}': ['p(99)<3000'],

    // Error rate should be below 1%
    http_req_failed: ['rate<0.01'],

    // Specific endpoint error rates
    'http_req_failed{endpoint:search}': ['rate<0.01'],
    'http_req_failed{endpoint:create_subscription}': ['rate<0.01'],
  },
};

// Sample test data
export const testData = {
  // Sample search queries
  searchQueries: [
    'COMP SCI 300',
    'MATH 340',
    'BIOCHEM 501',
    'PHYSICS 201',
    'CHEM 109',
    'ECON 101',
    'PSYCH 202',
    'HISTORY 120',
  ],

  // Sample terms (updated to current terms)
  terms: ['1262', '1264'],

  // Sample class numbers for testing
  sampleClassNumbers: [
    '12345',
    '23456',
    '34567',
    '45678',
    '56789',
  ],

  // Realistic subscription test data (real UW courses for database tests)
  // Example data from UW Public Enrollment API - Fall 2025 COMP SCI 300
  // You should fetch current data from: https://public.enroll.wisc.edu/api/search/v1/enrollmentPackages/{term}/{subjectCode}/{courseId}
  sampleSubscriptions: [
    {
      termCode: '1262',
      subjectCode: '266',  // COMP SCI subject code
      courseId: '024795',  // COMP SCI 300 course ID
      catalogNumber: '300',
      classNumber: '41882', // Real class number
    },
    {
      termCode: '1262',
      subjectCode: '266',
      courseId: '024795',
      catalogNumber: '300',
      classNumber: '41881',
    },
    {
      termCode: '1262',
      subjectCode: '266',
      courseId: '024795',
      catalogNumber: '300',
      classNumber: '29499',
    },
    {
      termCode: '1262',
      subjectCode: '266',
      courseId: '024795',
      catalogNumber: '300',
      classNumber: '29497',
    },
  ],
};
