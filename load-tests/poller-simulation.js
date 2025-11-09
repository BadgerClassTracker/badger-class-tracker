/**
 * Poller Performance Simulation
 *
 * This test doesn't directly call the poller (which runs on EventBridge schedule),
 * but creates the database conditions the poller will encounter and helps estimate
 * poller performance based on API response times.
 *
 * To actually test the poller:
 * 1. Run this test to create subscriptions in DynamoDB
 * 2. Manually invoke the poller Lambda function
 * 3. Monitor CloudWatch metrics for execution time
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { config, testData } from './config.js';

// Poller simulation metrics
const watchItemsCreated = new Counter('watch_items_created');
const subscriptionsPerCourse = new Trend('subscriptions_per_course');

export const options = {
  scenarios: {
    // Create diverse subscription pattern
    create_watch_pattern: {
      executor: 'shared-iterations',
      vus: 10,
      iterations: 100, // Create 100 different course subscriptions
      maxDuration: '15m',
    },
  },
};

export function setup() {
  console.log('='.repeat(60));
  console.log('POLLER PERFORMANCE SIMULATION');
  console.log('='.repeat(60));
  console.log('This test creates subscription patterns the poller will process');
  console.log('');
  console.log('Simulation scenarios:');
  console.log('  - Few courses with many subscribers (popular classes)');
  console.log('  - Many courses with few subscribers (diverse interests)');
  console.log('  - Multiple terms with varying activity');
  console.log('');
  console.log('After this test:');
  console.log('  1. Manually invoke the poller Lambda');
  console.log('  2. Monitor execution time in CloudWatch');
  console.log('  3. Check number of API calls to UW enrollment API');
  console.log('  4. Review DynamoDB consumed capacity during poller run');
  console.log('='.repeat(60));

  return {
    apiUrl: config.apiUrl,
    authToken: config.authToken,
  };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${data.authToken}`,
  };

  // Determine subscription pattern
  const pattern = Math.random();

  if (pattern < 0.3) {
    // 30% - Popular course (many subscribers will target same course)
    createPopularCourseSubscription(data.apiUrl, headers);
  } else if (pattern < 0.6) {
    // 30% - Moderate popularity
    createModerateCourseSubscription(data.apiUrl, headers);
  } else {
    // 40% - Unique courses (each user different course)
    createUniqueCourseSubscription(data.apiUrl, headers);
  }

  sleep(1);
}

function createPopularCourseSubscription(apiUrl, headers) {
  // Simulate popular courses like COMP SCI 300
  const popularCourses = [
    '12345', // Simulate COMP SCI 300
    '23456', // Simulate MATH 340
    '34567', // Simulate ECON 101
  ];

  const classNumber = popularCourses[
    Math.floor(Math.random() * popularCourses.length)
  ];

  createSubscription(apiUrl, headers, classNumber, 'popular');
}

function createModerateCourseSubscription(apiUrl, headers) {
  // Use first half of sample class numbers for moderate popularity
  const classNumber = testData.sampleClassNumbers[
    Math.floor(Math.random() * (testData.sampleClassNumbers.length / 2))
  ];

  createSubscription(apiUrl, headers, classNumber, 'moderate');
}

function createUniqueCourseSubscription(apiUrl, headers) {
  // Generate semi-random class number for unique subscriptions
  const classNumber = `${Math.floor(Math.random() * 90000) + 10000}`;

  createSubscription(apiUrl, headers, classNumber, 'unique');
}

function createSubscription(apiUrl, headers, classNumber, popularity) {
  const term = testData.terms[
    Math.floor(Math.random() * testData.terms.length)
  ];

  const payload = JSON.stringify({
    term: term,
    classNumber: classNumber,
  });

  const response = http.post(`${apiUrl}/subscriptions`, payload, {
    headers,
    tags: {
      operation: 'create',
      popularity: popularity,
      term: term,
    },
  });

  const created = check(response, {
    'subscription created': (r) => r.status === 200 || r.status === 201 || r.status === 409,
  });

  if (created) {
    watchItemsCreated.add(1);
    console.log(`Created ${popularity} course subscription: ${classNumber} (term: ${term})`);
  }
}

export function teardown(data) {
  console.log('='.repeat(60));
  console.log('POLLER SIMULATION SETUP COMPLETED');
  console.log(`Watch items created: ${watchItemsCreated.value}`);
  console.log('='.repeat(60));
  console.log('');
  console.log('NEXT STEPS - Manual Poller Testing:');
  console.log('');
  console.log('1. Invoke the poller Lambda function manually:');
  console.log('   aws lambda invoke \\');
  console.log('     --function-name BadgerClassTrackerStack-Poller \\');
  console.log('     --payload \'{}\' \\');
  console.log('     response.json');
  console.log('');
  console.log('2. Monitor CloudWatch metrics:');
  console.log('   - Function duration');
  console.log('   - DynamoDB consumed read capacity');
  console.log('   - Number of UW API calls made');
  console.log('   - EventBridge events published');
  console.log('');
  console.log('3. Expected poller behavior:');
  console.log('   - Scans for WATCH items with subCount > 0');
  console.log('   - Groups by term');
  console.log('   - Queries UW enrollment API for each unique course');
  console.log('   - Compares with stored STATE items');
  console.log('   - Emits SeatStatusChanged events for changes');
  console.log('');
  console.log('4. Performance targets:');
  console.log('   - Poll frequency: Every 1 minute');
  console.log('   - P95 processing time: < 7 minutes');
  console.log('   - Should handle 100+ unique courses per term');
  console.log('   - DynamoDB should not throttle');
  console.log('');
  console.log('5. Check DynamoDB tables:');
  console.log('   - Count SUB items (subscriptions)');
  console.log('   - Count WATCH items (courses being watched)');
  console.log('   - Verify GSI1 is populated correctly');
  console.log('');
  console.log('6. Cleanup (when done testing):');
  console.log('   aws dynamodb scan \\');
  console.log('     --table-name AppTable2 \\');
  console.log('     --filter-expression "begins_with(PK, :pk)" \\');
  console.log('     --expression-attribute-values \'{":pk":{"S":"USER#loadtest"}}\' \\');
  console.log('     | jq -r \'.Items[]\'');
  console.log('='.repeat(60));
}
