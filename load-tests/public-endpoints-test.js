import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { config, testData } from './config.js';

// Custom metrics
const errorRate = new Rate('errors');
const searchDuration = new Trend('search_duration_ms');
const termsDuration = new Trend('terms_duration_ms');
const requestCount = new Counter('total_requests');

// Quick public endpoints test
export const options = {
  stages: [
    { duration: '30s', target: 20 },   // Warm up
    { duration: '2m', target: 50 },    // Moderate load
    { duration: '1m', target: 100 },   // Peak load
    { duration: '1m', target: 50 },    // Scale down
    { duration: '30s', target: 0 },    // Cool down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    http_req_failed: ['rate<0.05'],
    errors: ['rate<0.05'],
  },
};

export function setup() {
  console.log('='.repeat(70));
  console.log('  PUBLIC ENDPOINTS LOAD TEST');
  console.log('='.repeat(70));
  console.log(`API URL: ${config.apiUrl}`);
  console.log('Testing: /terms and /search endpoints (no auth required)');
  console.log('Duration: ~5 minutes');
  console.log('='.repeat(70));

  return { apiUrl: config.apiUrl };
}

export default function (data) {
  requestCount.add(1);

  // 40% - Test /terms endpoint
  if (Math.random() < 0.4) {
    testTermsEndpoint(data.apiUrl);
  } else {
    // 60% - Test /search endpoint
    testSearchEndpoint(data.apiUrl);
  }

  sleep(Math.random() * 2 + 1); // 1-3 seconds think time
}

function testTermsEndpoint(apiUrl) {
  const start = Date.now();
  const response = http.get(`${apiUrl}/terms`, {
    tags: { endpoint: 'terms' },
  });
  const duration = Date.now() - start;

  termsDuration.add(duration);

  const success = check(response, {
    'terms: status 200': (r) => r.status === 200,
    'terms: has data': (r) => {
      try {
        const body = r.json();
        return body.terms && Array.isArray(body.terms);
      } catch (e) {
        return false;
      }
    },
    'terms: fast response': () => duration < 2000,
  });

  if (!success) {
    errorRate.add(1);
    console.log(`Terms failed: ${response.status} - ${response.body.substring(0, 100)}`);
  }
}

function testSearchEndpoint(apiUrl) {
  const searchQuery = testData.searchQueries[
    Math.floor(Math.random() * testData.searchQueries.length)
  ];

  const term = testData.terms[0]; // Use first term

  const start = Date.now();
  const response = http.get(`${apiUrl}/courses?search=${encodeURIComponent(searchQuery)}&term=${term}`, {
    tags: { endpoint: 'courses' },
  });
  const duration = Date.now() - start;

  searchDuration.add(duration);

  const success = check(response, {
    'courses: status 200': (r) => r.status === 200,
    'courses: returns data': (r) => {
      try {
        const body = r.json();
        return body && body.success !== undefined;
      } catch (e) {
        return false;
      }
    },
    'courses: fast response': () => duration < 3000,
  });

  if (!success) {
    errorRate.add(1);
    if (response.status !== 200) {
      console.log(`Courses failed: ${response.status} - ${response.body.substring(0, 100)}`);
    }
  }
}

export function teardown(data) {
  console.log('='.repeat(70));
  console.log('  PUBLIC ENDPOINTS TEST COMPLETED');
  console.log('='.repeat(70));
  console.log(`Total requests: ${requestCount.value}`);
  console.log('='.repeat(70));
}
