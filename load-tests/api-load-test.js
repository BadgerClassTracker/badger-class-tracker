import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { config, testData } from './config.js';

// Custom metrics
const errorRate = new Rate('errors');

// Test configuration - use 'light' scenario by default
export const options = {
  scenarios: {
    api_load_test: config.scenarios.light,
  },
  thresholds: config.thresholds,
};

// Setup function - runs once before test
export function setup() {
  console.log('Starting API load test...');
  console.log(`Target API: ${config.apiUrl}`);
  return {
    apiUrl: config.apiUrl,
    authToken: config.authToken,
  };
}

// Main test function - runs for each virtual user
export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
  };

  // Add auth header only if we have a valid token
  const hasValidToken = data.authToken && data.authToken !== 'YOUR_JWT_TOKEN_HERE';
  if (hasValidToken) {
    headers['Authorization'] = `Bearer ${data.authToken}`;
  }

  // Test 1: Get available terms (public endpoint)
  testGetTerms(data.apiUrl, headers);
  sleep(1);

  // Test 2: Search for courses (public endpoint)
  testSearchCourses(data.apiUrl, headers);
  sleep(2);

  // Test 3: List user subscriptions (requires auth - skip if no valid token)
  if (hasValidToken) {
    testListSubscriptions(data.apiUrl, headers);
    sleep(1);
  }

  // Simulate user think time
  sleep(Math.random() * 3 + 2); // 2-5 seconds
}

function testGetTerms(apiUrl, headers) {
  const response = http.get(`${apiUrl}/terms`, {
    headers,
    tags: { endpoint: 'terms' },
  });

  const success = check(response, {
    'terms: status is 200': (r) => r.status === 200,
    'terms: response has data': (r) => r.json('terms') !== undefined,
  });

  errorRate.add(!success);
}

function testSearchCourses(apiUrl, headers) {
  const searchQuery = testData.searchQueries[
    Math.floor(Math.random() * testData.searchQueries.length)
  ];

  const term = testData.terms[
    Math.floor(Math.random() * testData.terms.length)
  ];

  // Use GET with query parameters (not POST with body)
  const url = `${apiUrl}/courses?term=${term}&search=${encodeURIComponent(searchQuery)}`;

  const response = http.get(url, {
    headers,
    tags: { endpoint: 'search' },
  });

  const success = check(response, {
    'search: status is 200': (r) => r.status === 200,
    'search: response has hits': (r) => {
      const body = r.json();
      return Array.isArray(body.hits);
    },
    'search: response time < 3s': (r) => r.timings.duration < 3000,
  });

  errorRate.add(!success);

  // Return hits for potential subscription testing
  return response.json('hits') || [];
}

function testListSubscriptions(apiUrl, headers) {
  const response = http.get(`${apiUrl}/subscriptions`, {
    headers,
    tags: { endpoint: 'list_subscriptions' },
  });

  const success = check(response, {
    'list subs: status is 200': (r) => r.status === 200,
    'list subs: response is array': (r) => Array.isArray(r.json()),
    'list subs: response time < 2s': (r) => r.timings.duration < 2000,
  });

  errorRate.add(!success);
}

// Teardown function - runs once after test
export function teardown(data) {
  console.log('API load test completed');
}
