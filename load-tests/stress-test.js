import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';
import { config, testData } from './config.js';

// Custom metrics
const errorRate = new Rate('errors');
const requestCount = new Counter('total_requests');
const failedRequests = new Counter('failed_requests');

// Stress test configuration - push to breaking point
export const options = {
  scenarios: {
    stress: config.scenarios.stress,
  },
  thresholds: {
    // Relaxed thresholds for stress testing
    http_req_duration: ['p(95)<5000'], // Allow up to 5s for 95th percentile
    http_req_failed: ['rate<0.05'], // Allow 5% failure rate
  },
};

export function setup() {
  console.log('='.repeat(60));
  console.log('STRESS TEST - Finding System Breaking Point');
  console.log('='.repeat(60));
  console.log('This test will gradually increase load to find limits');
  console.log('Watch for:');
  console.log('  - Lambda throttling errors (429)');
  console.log('  - DynamoDB throttling');
  console.log('  - API Gateway timeouts (504)');
  console.log('  - Response time degradation');
  console.log('='.repeat(60));

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

  requestCount.add(1);

  // Mix of different endpoint calls
  const testType = Math.random();

  if (hasValidToken) {
    // Full mix with auth-required endpoints
    if (testType < 0.5) {
      // 50% - Search requests (most expensive)
      stressSearch(data.apiUrl, headers);
    } else if (testType < 0.75) {
      // 25% - List subscriptions (moderate, requires auth)
      stressList(data.apiUrl, headers);
    } else if (testType < 0.9) {
      // 15% - Create subscriptions (write heavy, requires auth)
      stressCreate(data.apiUrl, headers);
    } else {
      // 10% - Get terms (lightweight)
      stressTerms(data.apiUrl, headers);
    }
  } else {
    // Only public endpoints
    if (testType < 0.83) {
      // 83% - Search requests
      stressSearch(data.apiUrl, headers);
    } else {
      // 17% - Get terms
      stressTerms(data.apiUrl, headers);
    }
  }

  // Minimal sleep to maximize load
  sleep(0.5);
}

function stressSearch(apiUrl, headers) {
  const searchQuery = testData.searchQueries[
    Math.floor(Math.random() * testData.searchQueries.length)
  ];

  const term = testData.terms[Math.floor(Math.random() * testData.terms.length)];

  // Use GET /courses with query parameters
  const url = `${apiUrl}/courses?term=${term}&search=${encodeURIComponent(searchQuery)}`;

  const response = http.get(url, {
    headers,
    tags: { endpoint: 'search', test: 'stress' },
    timeout: '30s', // Increased timeout for stress test
  });

  const success = check(response, {
    'search: not throttled': (r) => r.status !== 429,
    'search: not timeout': (r) => r.status !== 504,
    'search: successful or expected error': (r) =>
      r.status === 200 || r.status === 429 || r.status === 503,
  });

  if (!success) {
    failedRequests.add(1);
    console.log(`Search failed: ${response.status} - ${response.body.substring(0, 100)}`);
  }

  errorRate.add(!success);
}

function stressList(apiUrl, headers) {
  const response = http.get(`${apiUrl}/subscriptions`, {
    headers,
    tags: { endpoint: 'list', test: 'stress' },
    timeout: '20s',
  });

  const success = check(response, {
    'list: status ok': (r) => r.status === 200 || r.status === 429,
  });

  if (!success) {
    failedRequests.add(1);
  }

  errorRate.add(!success);
}

function stressCreate(apiUrl, headers) {
  const classNumber = testData.sampleClassNumbers[
    Math.floor(Math.random() * testData.sampleClassNumbers.length)
  ];

  const payload = JSON.stringify({
    term: testData.terms[0],
    classNumber: classNumber,
  });

  const response = http.post(`${apiUrl}/subscriptions`, payload, {
    headers,
    tags: { endpoint: 'create', test: 'stress' },
    timeout: '20s',
  });

  const success = check(response, {
    'create: status ok': (r) =>
      r.status === 200 || r.status === 201 || r.status === 429 || r.status === 409,
  });

  if (!success) {
    failedRequests.add(1);
  }

  errorRate.add(!success);
}

function stressTerms(apiUrl, headers) {
  const response = http.get(`${apiUrl}/terms`, {
    headers,
    tags: { endpoint: 'terms', test: 'stress' },
    timeout: '10s',
  });

  check(response, {
    'terms: status ok': (r) => r.status === 200 || r.status === 429,
  });
}

export function teardown(data) {
  console.log('='.repeat(60));
  console.log('STRESS TEST COMPLETED');
  console.log(`Total requests: ${requestCount.value}`);
  console.log(`Failed requests: ${failedRequests.value}`);
  console.log(`Error rate: ${(errorRate.rate * 100).toFixed(2)}%`);
  console.log('='.repeat(60));
  console.log('Next steps:');
  console.log('1. Review CloudWatch metrics for Lambda concurrency');
  console.log('2. Check DynamoDB consumed capacity');
  console.log('3. Review API Gateway 4xx/5xx errors');
  console.log('4. Check if auto-scaling triggered');
  console.log('='.repeat(60));
}
