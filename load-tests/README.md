# Load Testing Guide for Badger Class Tracker

This directory contains k6 load testing scripts to validate your application's performance before production deployment.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup](#setup)
3. [Test Scenarios](#test-scenarios)
4. [Running Tests](#running-tests)
5. [Interpreting Results](#interpreting-results)
6. [AWS Monitoring](#aws-monitoring)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

- k6 installed (already done - located at `~/bin/k6`)
- Deployed AWS infrastructure
- Valid JWT token for API authentication
- AWS CLI configured (for monitoring)

## Setup

### 1. Configure Test Parameters

**First time setup:**

```bash
# Copy the example config
cp load-tests/config.example.js load-tests/config.js
```

Then edit `config.js` and update:

```javascript
apiUrl: 'https://YOUR-API-ID.execute-api.us-east-2.amazonaws.com/prod'
```

**⚠️ Security Note**: `config.js` is gitignored because it contains your JWT token. Only `config.example.js` is committed to the repository.

### 2. Get Authentication Token

To test authenticated endpoints, you need a valid JWT token:

1. Open your frontend application
2. Sign in with Google OAuth
3. Open browser DevTools (F12)
4. Go to Application/Storage → Cookies or Local Storage
5. Find the JWT token (or inspect Network tab for Authorization header)
6. Copy the token to `config.js`:

```javascript
authToken: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...'
```

**Note**: JWT tokens expire! Update the token if tests start failing with 401 errors.

### 3. Update Test Data

Review `config.js` test data:
- `searchQueries` - Real UW-Madison courses to search for
- `terms` - Valid term codes from your system
- `sampleClassNumbers` - Valid class numbers for testing

## Test Scenarios

### 1. API Load Test (`api-load-test.js`)

**Purpose**: Basic API endpoint performance testing
**Scenario**: Light load (50-100 concurrent users)
**Duration**: ~15 minutes
**What it tests**:
- `/terms` endpoint
- `/search` endpoint
- `/subscriptions` (GET) endpoint

**When to use**: Initial validation, CI/CD pipeline

```bash
~/bin/k6 run load-tests/api-load-test.js
```

### 2. User Flow Test (`user-flow-test.js`)

**Purpose**: Realistic user behavior simulation
**Scenario**: Medium load (100-250 concurrent users)
**Duration**: ~20 minutes
**What it tests**:
- Complete user journeys
- Search → Subscribe flow
- Managing subscriptions
- Realistic think times

**When to use**: Pre-production validation, enrollment period prep

```bash
~/bin/k6 run load-tests/user-flow-test.js
```

### 3. Stress Test (`stress-test.js`)

**Purpose**: Find system breaking point
**Scenario**: Gradually increasing to 1000+ VUs
**Duration**: ~25 minutes
**What it tests**:
- Lambda concurrency limits
- DynamoDB throttling
- API Gateway capacity
- Auto-scaling behavior

**When to use**: Capacity planning, before high-traffic events

```bash
~/bin/k6 run load-tests/stress-test.js
```

### 4. Database Load Test (`database-load-test.js`)

**Purpose**: Test with many subscriptions
**Scenario**: Creates 1000+ subscriptions, tests queries
**Duration**: ~15 minutes
**What it tests**:
- DynamoDB performance with loaded data
- Query performance
- GSI efficiency

**When to use**: Before scaling to many users

```bash
~/bin/k6 run load-tests/database-load-test.js
```

**⚠️ Warning**: This creates real subscriptions! Clean up afterwards.

### 5. Poller Simulation (`poller-simulation.js`)

**Purpose**: Prepare database for poller testing
**Scenario**: Creates subscription patterns for poller
**Duration**: ~15 minutes
**What it tests**:
- Setup for manual poller testing
- Various subscription patterns

**When to use**: Before testing poller performance

```bash
~/bin/k6 run load-tests/poller-simulation.js
```

Then manually invoke the poller Lambda to test actual performance.

## Running Tests

### Basic Run

```bash
# Run with default settings
~/bin/k6 run load-tests/api-load-test.js
```

### Custom Load Levels

Override scenarios in config.js or via command line:

```bash
# Run with fewer VUs for quick test
~/bin/k6 run --vus 10 --duration 30s load-tests/api-load-test.js

# Run with custom scenario
~/bin/k6 run --stage 2m:50,5m:50,2m:0 load-tests/api-load-test.js
```

### Output Options

```bash
# Save results to JSON
~/bin/k6 run --out json=results.json load-tests/api-load-test.js

# Send metrics to InfluxDB (if you have it)
~/bin/k6 run --out influxdb=http://localhost:8086/k6 load-tests/api-load-test.js

# Multiple outputs
~/bin/k6 run --out json=results.json --out cloud load-tests/stress-test.js
```

### k6 Cloud (Optional)

For better visualization, use k6 Cloud (free tier available):

```bash
# Login to k6 cloud
~/bin/k6 login cloud

# Run with cloud output
~/bin/k6 run --out cloud load-tests/user-flow-test.js
```

Visit the URL provided to see real-time graphs and detailed analytics.

## Interpreting Results

### Key Metrics

**Response Time**:
- `http_req_duration`: Total request duration
- `p(95)`: 95th percentile (95% of requests faster than this)
- `p(99)`: 99th percentile
- Target: p(95) < 2 seconds for most endpoints

**Throughput**:
- `http_reqs`: Total requests per second
- `iterations`: Complete test scenarios per second

**Errors**:
- `http_req_failed`: Percentage of failed requests
- Target: < 1% error rate
- `errors`: Custom error metric

**HTTP Status Codes**:
- `200/201`: Success
- `401`: Auth token expired (update token)
- `429`: Throttling (expected at high load)
- `500/502/503`: Server errors (investigate)
- `504`: Gateway timeout (Lambda taking too long)

### Success Criteria

#### For Production Readiness:

**Light Load** (500 users, ~50 concurrent):
- ✅ p(95) response time < 2s
- ✅ Error rate < 0.5%
- ✅ No Lambda throttling
- ✅ No DynamoDB throttling

**Medium Load** (2,500 users, ~250 concurrent):
- ✅ p(95) response time < 3s
- ✅ Error rate < 1%
- ✅ Minimal throttling (< 2%)
- ✅ Auto-scaling works correctly

**Stress Test** (finding limits):
- ✅ Graceful degradation (no crashes)
- ✅ Identifies bottleneck (Lambda concurrency, DynamoDB, etc.)
- ✅ Recovery after load decreases

### Example Good Output

```
✓ search: status is 200
✓ search: response time < 3s
✓ list subs: response is array

http_req_duration..............: avg=823ms  min=245ms med=701ms max=2.1s p(90)=1.4s p(95)=1.7s
http_req_failed................: 0.12%
http_reqs......................: 12,453  103/s
iterations.....................: 4,151   34.59/s
```

### Example Problem Output

```
✗ search: status is 200        [91% passed] ← 9% failures!
✗ search: response time < 3s   [78% passed] ← Slow responses

http_req_duration..............: avg=4.2s   max=12s    p(95)=8.4s  ← TOO SLOW!
http_req_failed................: 9.23%                            ← HIGH ERROR RATE!
http_reqs......................: 3,421   28/s
```

**What to check**:
- CloudWatch Logs for errors
- Lambda throttling metrics
- DynamoDB throttling
- API Gateway errors

## AWS Monitoring

### CloudWatch Metrics to Watch

**During Load Tests**:

1. **Lambda Metrics** (one dashboard per function):
   ```bash
   # API Lambda metrics
   - Invocations
   - Duration (avg, p95, p99)
   - Errors
   - Throttles
   - ConcurrentExecutions
   ```

2. **DynamoDB Metrics**:
   ```bash
   - ConsumedReadCapacityUnits
   - ConsumedWriteCapacityUnits
   - UserErrors (throttling)
   - SystemErrors
   ```

3. **API Gateway Metrics**:
   ```bash
   - Count (requests)
   - 4XXError
   - 5XXError
   - Latency (p50, p90, p99)
   ```

### CLI Commands for Monitoring

```bash
# Watch Lambda concurrent executions
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name ConcurrentExecutions \
  --dimensions Name=FunctionName,Value=BadgerClassTrackerStack-SearchHandler \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Maximum

# Check for Lambda throttling
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Throttles \
  --dimensions Name=FunctionName,Value=BadgerClassTrackerStack-SearchHandler \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Sum

# DynamoDB consumed capacity
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name ConsumedReadCapacityUnits \
  --dimensions Name=TableName,Value=AppTable2 \
  --start-time $(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 60 \
  --statistics Sum
```

### Real-time Monitoring

Open CloudWatch Console during tests:
1. Go to CloudWatch → Dashboards
2. Create a custom dashboard with:
   - Lambda Duration (all functions)
   - Lambda Errors & Throttles
   - DynamoDB Read/Write Capacity
   - API Gateway 4XX/5XX errors
3. Set auto-refresh to 10 seconds
4. Run load test and watch metrics

## Troubleshooting

### Common Issues

#### 1. High Error Rate (401 Unauthorized)

**Cause**: JWT token expired
**Solution**: Get a fresh token and update `config.js`

```bash
# Check token expiration
echo 'YOUR_TOKEN' | cut -d. -f2 | base64 -d | jq .exp
```

#### 2. Lambda Throttling (429 errors)

**Cause**: Exceeded concurrent execution limit
**Solution**:
- Check Lambda concurrency limits in AWS Console
- Request limit increase if needed
- Add reserved concurrency to critical functions

```bash
# Check account concurrency limit
aws lambda get-account-settings | jq .AccountLimit.ConcurrentExecutions

# Set reserved concurrency
aws lambda put-function-concurrency \
  --function-name BadgerClassTrackerStack-SearchHandler \
  --reserved-concurrent-executions 100
```

#### 3. DynamoDB Throttling

**Cause**: Exceeded provisioned capacity
**Solution**:
- Switch to On-Demand billing mode (for testing)
- Or increase provisioned capacity

```bash
# Update to On-Demand
aws dynamodb update-table \
  --table-name AppTable2 \
  --billing-mode PAY_PER_REQUEST
```

#### 4. Slow Response Times

**Causes**:
- Cold starts (Lambda)
- Inefficient queries (DynamoDB)
- External API delays (UW enrollment API)

**Solutions**:
- Enable Lambda provisioned concurrency
- Optimize DynamoDB queries
- Add caching (ElastiCache/DynamoDB DAX)
- Review CloudWatch Logs Insights:

```sql
fields @timestamp, @duration, @message
| filter @type = "REPORT"
| stats avg(@duration), max(@duration), pct(@duration, 95) by bin(5m)
```

#### 5. Test Script Errors

**Issue**: `Cannot find module` errors
**Solution**: Ensure you're in the project root when running:

```bash
cd /home/jink/badger-class-tracker
~/bin/k6 run load-tests/api-load-test.js
```

## Load Testing Workflow

### Pre-Production Checklist

- [ ] Run `api-load-test.js` with light load
- [ ] Verify < 1% error rate
- [ ] Run `user-flow-test.js` with medium load
- [ ] Check CloudWatch for throttling
- [ ] Run `database-load-test.js` to seed data
- [ ] Manually test poller with loaded database
- [ ] Run `stress-test.js` to find limits
- [ ] Document breaking point
- [ ] Increase limits if needed
- [ ] Run final validation with medium load
- [ ] Review Grafana dashboards

### Recommended Test Schedule

**Before Initial Launch**:
1. API Load Test (light)
2. User Flow Test (medium)
3. Database Load Test
4. Stress Test (find limits)

**Before Each Enrollment Period**:
1. User Flow Test (medium)
2. Quick stress test spike
3. Verify auto-scaling works

**After Infrastructure Changes**:
1. API Load Test
2. Targeted test for changed component

## Cleanup

### After Database Load Tests

Remove test subscriptions:

```bash
# Query for test subscriptions
aws dynamodb query \
  --table-name AppTable2 \
  --key-condition-expression "PK = :pk" \
  --expression-attribute-values '{":pk":{"S":"USER#loadtest@example.com"}}'

# Delete items (use batch-write-item for efficiency)
# Or use DynamoDB Console for manual cleanup
```

### Reset for Fresh Test

```bash
# Clear CloudWatch Logs
aws logs delete-log-group --log-group-name /aws/lambda/BadgerClassTrackerStack-SearchHandler

# Or just wait - logs expire based on retention settings
```

## Additional Resources

- [k6 Documentation](https://k6.io/docs/)
- [AWS Lambda Monitoring](https://docs.aws.amazon.com/lambda/latest/dg/monitoring-metrics.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
- [k6 Cloud](https://k6.io/cloud/) - Free tier for better visualizations

## Questions?

Review the test output carefully. k6 provides excellent error details.

**Need help?** Check:
1. k6 output for specific errors
2. CloudWatch Logs for Lambda errors
3. CloudWatch Metrics for throttling
4. API Gateway logs for request/response details
