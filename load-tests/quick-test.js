import http from 'k6/http';
import { check, sleep } from 'k6';
import { config, testData } from './config.js';

// Quick validation test - 1 minute
export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.1'],
  },
};

export function setup() {
  console.log('Quick validation test');
  console.log(`API URL: ${config.apiUrl}`);
  return { apiUrl: config.apiUrl };
}

export default function (data) {
  // Test /terms endpoint
  const termsResponse = http.get(`${data.apiUrl}/terms`);

  check(termsResponse, {
    '/terms status 200': (r) => r.status === 200,
  });

  sleep(1);

  // Test /courses endpoint (GET with query params)
  const coursesResponse = http.get(`${data.apiUrl}/courses?search=COMP SCI 300&term=1252`);

  check(coursesResponse, {
    '/courses status 200': (r) => r.status === 200,
  });

  sleep(1);
}
