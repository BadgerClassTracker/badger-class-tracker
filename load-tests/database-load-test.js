import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { config, testData } from './config.js';

// Custom metrics for database operations
const subscriptionsCreated = new Counter('db_subscriptions_created');
const subscriptionsListed = new Counter('db_list_operations');
const listResponseTime = new Trend('db_list_response_time');

// Database load test - create many subscriptions to test poller performance
export const options = {
  scenarios: {
    // Phase 1: Seed database with subscriptions
    seed_subscriptions: {
      executor: 'per-vu-iterations',
      vus: 20, // 20 users creating subscriptions
      iterations: 50, // Each creates 50 subscriptions = 1000 total
      maxDuration: '10m',
      exec: 'seedSubscriptions',
    },
    // Phase 2: Continuous list operations while database is loaded
    query_subscriptions: {
      executor: 'constant-vus',
      vus: 10,
      duration: '5m',
      startTime: '5m', // Start after seeding begins
      exec: 'querySubscriptions',
    },
  },
  thresholds: {
    'http_req_duration{operation:list}': ['p(95)<3000'],
    'http_req_duration{operation:create}': ['p(95)<2000'],
  },
};

export function setup() {
  console.log('='.repeat(60));
  console.log('DATABASE LOAD TEST');
  console.log('='.repeat(60));
  console.log('This test simulates a database with many subscriptions');
  console.log('Goals:');
  console.log('  1. Create 1,000+ subscriptions to simulate 1,000 active users');
  console.log('  2. Test list/query performance with loaded database');
  console.log('  3. Simulate poller load scenarios');
  console.log('='.repeat(60));

  // Check if we have a valid auth token
  const hasValidToken = config.authToken && config.authToken !== 'YOUR_JWT_TOKEN_HERE';
  if (!hasValidToken) {
    console.log('\n⚠️  WARNING: No valid auth token configured!');
    console.log('This test requires authentication to create subscriptions.');
    console.log('The test will run but all requests will fail with 401 errors.');
    console.log('To fix: Update config.authToken with a valid JWT token.\n');
  }

  return {
    apiUrl: config.apiUrl,
    authToken: config.authToken,
  };
}

// Seed function - creates many subscriptions
export function seedSubscriptions(data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.authToken}`,
  };

  // Use realistic subscription data with all required fields
  const subData = testData.sampleSubscriptions[
    Math.floor(Math.random() * testData.sampleSubscriptions.length)
  ];

  const payload = JSON.stringify({
    termCode: subData.termCode,
    subjectCode: subData.subjectCode,
    courseId: subData.courseId,
    catalogNumber: subData.catalogNumber,
    classNumber: subData.classNumber,
    notifyOn: 'ANY', // Optional: OPEN, WAITLISTED, or ANY
  });

  const response = http.post(`${data.apiUrl}/subscriptions`, payload, {
    headers,
    tags: { operation: 'create', phase: 'seed' },
  });

  const created = check(response, {
    'subscription created': (r) => r.status === 200 || r.status === 201 || r.status === 409,
    'no server error': (r) => r.status < 500,
  });

  if (created && (response.status === 200 || response.status === 201)) {
    subscriptionsCreated.add(1);
  }

  sleep(0.5); // Small delay between creates
}

// Query function - tests list performance with many records
export function querySubscriptions(data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.authToken}`,
  };

  const start = Date.now();
  const response = http.get(`${data.apiUrl}/subscriptions`, {
    headers,
    tags: { operation: 'list', phase: 'query' },
  });
  const duration = Date.now() - start;

  listResponseTime.add(duration);

  check(response, {
    'list successful': (r) => r.status === 200,
    'response time acceptable': () => duration < 5000,
    'has data': (r) => {
      try {
        const body = r.json();
        // API returns { subscriptions: [...] }
        return body && Array.isArray(body.subscriptions);
      } catch (e) {
        return false;
      }
    },
  });

  subscriptionsListed.add(1);

  sleep(2);
}

export function teardown(data) {
  console.log('='.repeat(60));
  console.log('DATABASE LOAD TEST COMPLETED');
  console.log(`Subscriptions created: ${subscriptionsCreated.value}`);
  console.log(`List operations performed: ${subscriptionsListed.value}`);
  console.log('='.repeat(60));
  console.log('Next steps:');
  console.log('1. Check DynamoDB item counts in AppTable2');
  console.log('2. Run poller manually to test performance with loaded DB');
  console.log('3. Check GSI query performance');
  console.log('4. Review consumed read/write capacity units');
  console.log('5. Clean up test subscriptions if needed:');
  console.log('   - Query for test subscriptions in DynamoDB');
  console.log('   - Delete using batch operations');
  console.log('='.repeat(60));
}
