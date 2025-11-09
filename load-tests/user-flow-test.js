import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { config, testData } from './config.js';

// Custom metrics
const errorRate = new Rate('errors');
const subscriptionCreated = new Counter('subscriptions_created');
const subscriptionDeleted = new Counter('subscriptions_deleted');
const searchDuration = new Trend('search_duration');

// Test configuration - use 'medium' scenario
export const options = {
  scenarios: {
    user_journey: config.scenarios.medium,
  },
  thresholds: {
    ...config.thresholds,
    // User flow specific thresholds
    'http_req_duration{scenario:user_journey}': ['p(95)<3000'],
    'errors': ['rate<0.02'], // Allow 2% error rate for realistic scenarios
  },
};

export function setup() {
  console.log('Starting realistic user flow test...');
  console.log('Simulating enrollment period traffic patterns');
  return {
    apiUrl: config.apiUrl,
    authToken: config.authToken,
  };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
  };

  // Check if we have a valid auth token
  const hasValidToken = data.authToken && data.authToken !== 'YOUR_JWT_TOKEN_HERE';
  if (hasValidToken) {
    headers['Authorization'] = `Bearer ${data.authToken}`;
  }

  // Simulate realistic user journey
  group('User Journey: Browse and Subscribe', function () {
    // Step 1: User arrives and views available terms
    group('1. Check available terms', function () {
      const termsResponse = http.get(`${data.apiUrl}/terms`, { headers });
      check(termsResponse, {
        'got terms': (r) => r.status === 200,
      });
      sleep(1); // User reads the terms
    });

    // Step 2: User searches for a course
    group('2. Search for courses', function () {
      const searchQuery = testData.searchQueries[
        Math.floor(Math.random() * testData.searchQueries.length)
      ];

      const term = testData.terms[Math.floor(Math.random() * testData.terms.length)];

      const searchStart = Date.now();
      // Use GET /courses with query parameters (not POST /search)
      const searchUrl = `${data.apiUrl}/courses?term=${term}&search=${encodeURIComponent(searchQuery)}`;
      const searchResponse = http.get(searchUrl, {
        headers,
        tags: { endpoint: 'search' },
      });
      const searchTime = Date.now() - searchStart;
      searchDuration.add(searchTime);

      const searchSuccess = check(searchResponse, {
        'search successful': (r) => r.status === 200,
        'has results': (r) => {
          const body = r.json();
          return body.hits && body.hits.length > 0;
        },
      });

      if (!searchSuccess) {
        errorRate.add(1);
        return; // Exit if search failed
      }

      sleep(2); // User reviews search results
    });

    // Step 3: User views their existing subscriptions (80% of users, requires auth)
    if (hasValidToken && Math.random() < 0.8) {
      group('3. Check existing subscriptions', function () {
        const subsResponse = http.get(`${data.apiUrl}/subscriptions`, {
          headers,
          tags: { endpoint: 'list_subscriptions' },
        });

        check(subsResponse, {
          'got subscriptions': (r) => r.status === 200,
        });

        sleep(1.5); // User reviews their subscriptions
      });
    }

    // Step 4: User creates a subscription (60% of users, requires auth)
    if (hasValidToken && Math.random() < 0.6) {
      group('4. Create subscription', function () {
        // Use a sample class number from test data
        const classNumber = testData.sampleClassNumbers[
          Math.floor(Math.random() * testData.sampleClassNumbers.length)
        ];

        const subscriptionPayload = JSON.stringify({
          term: testData.terms[0],
          classNumber: classNumber,
          // Add other required fields based on your API
        });

        const createResponse = http.post(
          `${data.apiUrl}/subscriptions`,
          subscriptionPayload,
          {
            headers,
            tags: { endpoint: 'create_subscription' },
          }
        );

        const created = check(createResponse, {
          'subscription created': (r) => r.status === 200 || r.status === 201,
        });

        if (created) {
          subscriptionCreated.add(1);
        } else {
          errorRate.add(1);
        }

        sleep(1);
      });
    }

    // Step 5: User deletes a subscription (20% of users, requires auth)
    if (hasValidToken && Math.random() < 0.2) {
      group('5. Delete subscription', function () {
        // First get subscriptions to find one to delete
        const subsResponse = http.get(`${data.apiUrl}/subscriptions`, {
          headers,
        });

        if (subsResponse.status === 200) {
          const subscriptions = subsResponse.json();
          if (subscriptions && subscriptions.length > 0) {
            // Delete the first subscription
            const subId = subscriptions[0].id;
            const deleteResponse = http.del(
              `${data.apiUrl}/subscriptions/${subId}`,
              null,
              {
                headers,
                tags: { endpoint: 'delete_subscription' },
              }
            );

            const deleted = check(deleteResponse, {
              'subscription deleted': (r) => r.status === 200 || r.status === 204,
            });

            if (deleted) {
              subscriptionDeleted.add(1);
            }
          }
        }

        sleep(1);
      });
    }
  });

  // User think time between journeys
  sleep(Math.random() * 5 + 3); // 3-8 seconds
}

export function teardown(data) {
  console.log('User flow test completed');
  console.log(`Subscriptions created: ${subscriptionCreated.value}`);
  console.log(`Subscriptions deleted: ${subscriptionDeleted.value}`);
}
