import {
  Stack,
  StackProps,
  Duration,
  RemovalPolicy,
  CfnOutput,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigw from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ses from "aws-cdk-lib/aws-ses";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as cw from "aws-cdk-lib/aws-cloudwatch";
import * as actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cognito from "aws-cdk-lib/aws-cognito";

export class BadgerClassTrackerStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    /* ──────────────────────────────────────────────────────────────────────────
     * 0) Constants / helpers
     * ────────────────────────────────────────────────────────────────────────── */
    const account = Stack.of(this).account;
    const region = Stack.of(this).region;
    const stage =
      this.node.tryGetContext("stage") ?? process.env.CDK_STAGE ?? "prod";

    // ── Cognito: User Pool + Client + Hosted UI domain ───────────────────────────
    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `bct-${stage}-users`,
      signInAliases: { email: true },
      selfSignUpEnabled: true,
      standardAttributes: { email: { required: true, mutable: true } },
      removalPolicy: RemovalPolicy.DESTROY, // dev only; change to RETAIN in prod
    });

    // Google identity provider with picture attribute
    let googleProvider;
    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

    const supportedProviders = [cognito.UserPoolClientIdentityProvider.COGNITO];

    if (
      googleClientId &&
      googleClientSecret &&
      googleClientId !== "your-google-client-id.apps.googleusercontent.com" &&
      googleClientSecret !== "your-google-client-secret"
    ) {
      googleProvider = new cognito.UserPoolIdentityProviderGoogle(
        this,
        "GoogleProvider",
        {
          userPool,
          clientId: googleClientId,
          clientSecret: googleClientSecret,
          scopes: ["openid", "email", "profile"],
          attributeMapping: {
            email: cognito.ProviderAttribute.GOOGLE_EMAIL,
            givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
            familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
            profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
          },
        }
      );
      supportedProviders.push(cognito.UserPoolClientIdentityProvider.GOOGLE);
    }

    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool,
      userPoolClientName: `bct-${stage}-web`,
      generateSecret: false, // SPA-friendly
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          "http://localhost:3000/",
          ...(process.env.PRODUCTION_DOMAIN ? [process.env.PRODUCTION_DOMAIN] : [])
        ],
        logoutUrls: [
          "http://localhost:3000/",
          ...(process.env.PRODUCTION_DOMAIN ? [process.env.PRODUCTION_DOMAIN] : [])
        ],
      },
      preventUserExistenceErrors: true,
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      supportedIdentityProviders: supportedProviders,
    });

    // Ensure the client depends on the Google provider if it exists
    if (googleProvider) {
      userPoolClient.node.addDependency(googleProvider);
    }

    // hosted UI domain (prefix must be globally unique in the region)
    const domainPrefix = `bct-${stage}-${this.account.slice(-6).toLowerCase()}`;

    const domain = userPool.addDomain("CognitoDomain", {
      cognitoDomain: { domainPrefix },
    });

    // handy outputs
    // Build the fully qualified Hosted UI domain explicitly (don’t rely on domain.domainName)
    const hostedUiDomain = `${domainPrefix}.auth.${region}.amazoncognito.com`;
    const redirectUri = "http://localhost:3000/"; // keep in sync with client oAuth callbackUrls

    new CfnOutput(this, "HostedUiDomain", { value: hostedUiDomain });
    new CfnOutput(this, "CognitoLoginUrl", {
      value:
        `https://${hostedUiDomain}/login` +
        `?client_id=${userPoolClient.userPoolClientId}` +
        `&response_type=code&scope=openid+email` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}`,
    });

    // SES identity
    const SES_FROM_EMAIL = "jkim927@wisc.edu";
    const SES_IDENTITY_ARN = `arn:aws:ses:${region}:${account}:identity/${SES_FROM_EMAIL}`;
    const SES_CONFIG_SET_NAME = `BCT-${Stack.of(this).stackName}-Cfg`;
    const SES_CONFIG_SET_ARN = `arn:aws:ses:${region}:${account}:configuration-set/${SES_CONFIG_SET_NAME}`;
    const DEFAULT_BUS_ARN = `arn:aws:events:${region}:${account}:event-bus/default`;

    // NodejsFunction wrapper that also creates an explicit LogGroup
    const nodeFn = (
      id: string,
      entry: string,
      env: Record<string, string>,
      overrides: Partial<node.NodejsFunctionProps> = {}
    ) =>
      new node.NodejsFunction(this, id, {
        functionName:
          overrides.functionName ??
          `bct-${stage}-${id.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}`,
        entry,
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: overrides.memorySize ?? 256,
        timeout: overrides.timeout ?? Duration.seconds(30),
        environment: { STAGE: stage, ...env, ...(overrides.environment ?? {}) },
        ...overrides,
      });

    // helper: attach retention to the lambda's log group name
    const attachRetention = (id: string, fn: lambda.Function) => {
      new logs.LogRetention(this, `${id}LogRetention`, {
        logGroupName: `/aws/lambda/${fn.functionName}`,
        retention: logs.RetentionDays.TWO_WEEKS,
      });
    };

    /* ──────────────────────────────────────────────────────────────────────────
     * 1) Data layer (DynamoDB)
     * ────────────────────────────────────────────────────────────────────────── */
    const table = new dynamodb.Table(this, "AppTable2", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.DESTROY, // dev only
      timeToLiveAttribute: "ttl",
    });

    table.addGlobalSecondaryIndex({
      indexName: "GSI1", // section → subs
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
    });

    /* ──────────────────────────────────────────────────────────────────────────
     * 2) Eventing (EventBridge)
     * ────────────────────────────────────────────────────────────────────────── */
    const bus = new events.EventBus(this, "SeatBus", {
      eventBusName: "SeatEvents",
    });

    /* ──────────────────────────────────────────────────────────────────────────
     * 3) API (API Gateway) + handlers
     * ────────────────────────────────────────────────────────────────────────── */
    const api = new apigw.RestApi(this, "Api", {
      deployOptions: {
        stageName: "prod",
        methodOptions: {
          "/subscriptions/POST": {
            throttlingRateLimit: 5,
            throttlingBurstLimit: 10,
          },
        },
      },
      // Removed defaultCorsPreflightOptions to avoid conflicts with explicit OPTIONS methods
    });

    // Add gateway responses for CORS on authorization failures
    api.addGatewayResponse("Unauthorized", {
      type: apigw.ResponseType.UNAUTHORIZED,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'Content-Type,Authorization,X-Requested-With,x-api-key'",
        "Access-Control-Allow-Methods": "'OPTIONS,GET,POST,DELETE,PUT,PATCH'",
      },
    });

    api.addGatewayResponse("AccessDenied", {
      type: apigw.ResponseType.ACCESS_DENIED,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
        "Access-Control-Allow-Headers": "'Content-Type,Authorization,X-Requested-With,x-api-key'",
        "Access-Control-Allow-Methods": "'OPTIONS,GET,POST,DELETE,PUT,PATCH'",
      },
    });

    // Create Subscription
    const createSub = nodeFn(
      "CreateSubscriptionFn",
      "services/api/create-subscription.ts",
      { TABLE: table.tableName, EVENT_BUS_NAME: bus.eventBusName },
      { functionName: `bct-${stage}-create-sub`, timeout: Duration.seconds(15) }
    );
    attachRetention("CreateSubscriptionFn", createSub);
    table.grantReadWriteData(createSub);
    bus.grantPutEventsTo(createSub);

    const listSubs = nodeFn(
      "ListSubscriptionsFn",
      "services/api/list-subscriptions.ts",
      { TABLE: table.tableName },
      { functionName: `bct-${stage}-list-subs` }
    );
    attachRetention("ListSubscriptionsFn", listSubs);
    table.grantReadData(listSubs);

    const deleteSub = nodeFn(
      "DeleteSubscriptionFn",
      "services/api/delete-subscription.ts",
      { TABLE: table.tableName },
      { functionName: `bct-${stage}-delete-sub` }
    );
    attachRetention("DeleteSubscriptionFn", deleteSub);
    table.grantReadWriteData(deleteSub);

    const unsubscribeFn = nodeFn(
      "UnsubscribeFn",
      "services/api/unsubscribe.ts",
      { TABLE: table.tableName },
      { functionName: `bct-${stage}-unsubscribe` }
    );
    attachRetention("UnsubscribeFn", unsubscribeFn);
    table.grantReadWriteData(unsubscribeFn);

    const searchCoursesFn = nodeFn(
      "SearchCoursesFn",
      "services/api/search-courses.ts",
      {},
      {
        functionName: `bct-${stage}-search-courses`,
        timeout: Duration.seconds(10),
      }
    );
    attachRetention("SearchCoursesFn", searchCoursesFn);

    const getTermsFn = nodeFn(
      "GetTermsFn",
      "services/api/get-terms.ts",
      {},
      {
        functionName: `bct-${stage}-get-terms`,
        timeout: Duration.seconds(10),
      }
    );
    attachRetention("GetTermsFn", getTermsFn);

    const swaggerFn = nodeFn(
      "SwaggerFn",
      "services/api/swagger.ts",
      {},
      {
        functionName: `bct-${stage}-swagger`,
        timeout: Duration.seconds(5),
      }
    );
    attachRetention("SwaggerFn", swaggerFn);

    // Routes
    const subs = api.root.addResource("subscriptions");
    // Authorizer wired to your user pool
    const authorizer = new apigw.CognitoUserPoolsAuthorizer(
      this,
      "ApiAuthorizer",
      {
        cognitoUserPools: [userPool],
        authorizerName: `bct-${stage}-cognito`,
        identitySource: "method.request.header.Authorization",
      }
    );

    // Add explicit OPTIONS methods for CORS (without authentication)
    subs.addMethod("OPTIONS", new apigw.MockIntegration({
      integrationResponses: [{
        statusCode: "200",
        responseParameters: {
          "method.response.header.Access-Control-Allow-Headers": "'Content-Type,Authorization,X-Requested-With,x-api-key'",
          "method.response.header.Access-Control-Allow-Methods": "'OPTIONS,GET,POST,DELETE,PUT,PATCH'",
          "method.response.header.Access-Control-Allow-Origin": "'*'",
        },
      }],
      requestTemplates: {
        "application/json": '{"statusCode": 200}',
      },
    }), {
      methodResponses: [{
        statusCode: "200",
        responseParameters: {
          "method.response.header.Access-Control-Allow-Headers": true,
          "method.response.header.Access-Control-Allow-Methods": true,
          "method.response.header.Access-Control-Allow-Origin": true,
        },
      }],
    });

    // Protect /subscriptions (POST, GET) and /subscriptions/{id} (DELETE)
    subs.addMethod("POST", new apigw.LambdaIntegration(createSub), {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    });
    subs.addMethod("GET", new apigw.LambdaIntegration(listSubs), {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    });
    const subId = subs.addResource("{id}");
    subId.addMethod("OPTIONS", new apigw.MockIntegration({
      integrationResponses: [{
        statusCode: "200",
        responseParameters: {
          "method.response.header.Access-Control-Allow-Headers": "'Content-Type,Authorization,X-Requested-With,x-api-key'",
          "method.response.header.Access-Control-Allow-Methods": "'OPTIONS,GET,POST,DELETE,PUT,PATCH'",
          "method.response.header.Access-Control-Allow-Origin": "'*'",
        },
      }],
      requestTemplates: {
        "application/json": '{"statusCode": 200}',
      },
    }), {
      methodResponses: [{
        statusCode: "200",
        responseParameters: {
          "method.response.header.Access-Control-Allow-Headers": true,
          "method.response.header.Access-Control-Allow-Methods": true,
          "method.response.header.Access-Control-Allow-Origin": true,
        },
      }],
    });
    subId.addMethod("DELETE", new apigw.LambdaIntegration(deleteSub), {
      authorizer,
      authorizationType: apigw.AuthorizationType.COGNITO,
    });
    const unsub = api.root.addResource("unsubscribe");
    unsub.addMethod("GET", new apigw.LambdaIntegration(unsubscribeFn));
    unsub.addMethod("POST", new apigw.LambdaIntegration(unsubscribeFn));

    // Public course search endpoint (no auth required)
    const courses = api.root.addResource("courses");
    courses.addMethod("OPTIONS", new apigw.MockIntegration({
      integrationResponses: [{
        statusCode: "200",
        responseParameters: {
          "method.response.header.Access-Control-Allow-Headers": "'Content-Type,Authorization,X-Requested-With,x-api-key'",
          "method.response.header.Access-Control-Allow-Methods": "'OPTIONS,GET,POST,DELETE,PUT,PATCH'",
          "method.response.header.Access-Control-Allow-Origin": "'*'",
        },
      }],
      requestTemplates: {
        "application/json": '{"statusCode": 200}',
      },
    }), {
      methodResponses: [{
        statusCode: "200",
        responseParameters: {
          "method.response.header.Access-Control-Allow-Headers": true,
          "method.response.header.Access-Control-Allow-Methods": true,
          "method.response.header.Access-Control-Allow-Origin": true,
        },
      }],
    });
    courses.addMethod("GET", new apigw.LambdaIntegration(searchCoursesFn));

    // Public terms endpoint (no auth required)
    const terms = api.root.addResource("terms");
    terms.addMethod("OPTIONS", new apigw.MockIntegration({
      integrationResponses: [{
        statusCode: "200",
        responseParameters: {
          "method.response.header.Access-Control-Allow-Headers": "'Content-Type,Authorization,X-Requested-With,x-api-key'",
          "method.response.header.Access-Control-Allow-Methods": "'OPTIONS,GET,POST,DELETE,PUT,PATCH'",
          "method.response.header.Access-Control-Allow-Origin": "'*'",
        },
      }],
      requestTemplates: {
        "application/json": '{"statusCode": 200}',
      },
    }), {
      methodResponses: [{
        statusCode: "200",
        responseParameters: {
          "method.response.header.Access-Control-Allow-Headers": true,
          "method.response.header.Access-Control-Allow-Methods": true,
          "method.response.header.Access-Control-Allow-Origin": true,
        },
      }],
    });
    terms.addMethod("GET", new apigw.LambdaIntegration(getTermsFn));

    // Public API documentation endpoint (Swagger UI)
    const docs = api.root.addResource("docs");
    docs.addMethod("GET", new apigw.LambdaIntegration(swaggerFn));

    // Support swagger.json and openapi.json paths
    const swaggerJson = docs.addResource("swagger.json");
    swaggerJson.addMethod("GET", new apigw.LambdaIntegration(swaggerFn));

    const openapiJson = docs.addResource("openapi.json");
    openapiJson.addMethod("GET", new apigw.LambdaIntegration(swaggerFn));

    /* ──────────────────────────────────────────────────────────────────────────
     * 4) Compute: Poller (scheduled) + Notifier (event-driven)
     * ────────────────────────────────────────────────────────────────────────── */
    const pollerDlq = new sqs.Queue(this, "PollerDLQ", {
      retentionPeriod: Duration.days(14),
    });
    const notifierDlq = new sqs.Queue(this, "NotifierDLQ", {
      retentionPeriod: Duration.days(14),
    });

    const pollerFn = nodeFn(
      "PollerFn",
      "services/poller/index.ts",
      { TABLE: table.tableName, BUS_NAME: bus.eventBusName },
      { functionName: `bct-${stage}-poller`, timeout: Duration.seconds(60) }
    );
    attachRetention("PollerFn", pollerFn);
    table.grantReadWriteData(pollerFn);
    bus.grantPutEventsTo(pollerFn);

    // Every 5 minutes - triggers polling for all active terms
    // The poller will scan for active WATCH items to determine which terms to poll
    new events.Rule(this, "PollEvery5m", {
      schedule: events.Schedule.rate(Duration.minutes(1)),
      targets: [
        new targets.LambdaFunction(pollerFn, {
          retryAttempts: 2,
          maxEventAge: Duration.hours(2),
          deadLetterQueue: pollerDlq,
        }),
      ],
    });

    const notifierFn = nodeFn(
      "NotifierFn",
      "services/notifier/index.ts",
      { TABLE: table.tableName, FROM: SES_FROM_EMAIL, API_BASE: api.url },
      { functionName: `bct-${stage}-notifier`, timeout: Duration.seconds(30) }
    );
    attachRetention("NotifierFn", notifierFn);
    table.grantReadWriteData(notifierFn);

    notifierFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: [SES_IDENTITY_ARN, SES_CONFIG_SET_ARN],
        conditions: { StringEquals: { "ses:FromAddress": SES_FROM_EMAIL } },
      })
    );

    new events.Rule(this, "NotifyOnChange", {
      eventBus: bus,
      eventPattern: {
        source: ["uw.enroll.poller"],
        detailType: ["SeatStatusChanged"],
      },
      targets: [
        new targets.LambdaFunction(notifierFn, {
          retryAttempts: 2,
          maxEventAge: Duration.hours(2),
          deadLetterQueue: notifierDlq,
        }),
      ],
    });

    /* ──────────────────────────────────────────────────────────────────────────
     * 5) SES feedback (BOUNCE/COMPLAINT → suppression via DEFAULT bus)
     * ────────────────────────────────────────────────────────────────────────── */
    const sesCfg = new ses.CfnConfigurationSet(this, "SesCfg", {
      name: SES_CONFIG_SET_NAME,
    });
    const sesEvtDest = new ses.CfnConfigurationSetEventDestination(
      this,
      "SesDefaultEvtDest",
      {
        configurationSetName: sesCfg.name!,
        eventDestination: {
          name: "ToDefaultEventBridge",
          enabled: true,
          matchingEventTypes: ["BOUNCE", "COMPLAINT"],
          eventBridgeDestination: { eventBusArn: DEFAULT_BUS_ARN },
        },
      }
    );
    sesEvtDest.addDependency(sesCfg);

    const sesFeedback = nodeFn(
      "SesFeedbackFn",
      "services/ses-feedback/index.ts",
      { TABLE: table.tableName },
      { functionName: `bct-${stage}-ses-feedback` }
    );
    attachRetention("SesFeedbackFn", sesFeedback);
    table.grantReadWriteData(sesFeedback);

    new events.Rule(this, "SesFeedbackRule", {
      eventPattern: { source: ["aws.ses"] },
      targets: [new targets.LambdaFunction(sesFeedback)],
    });

    notifierFn.addEnvironment("SES_CONFIG_SET", SES_CONFIG_SET_NAME);

    /* ──────────────────────────────────────────────────────────────────────────
     * 6) Observability (SLO Alerts + Dashboard)
     * ────────────────────────────────────────────────────────────────────────── */
    const alerts = new sns.Topic(this, "BctAlerts");

    const pollerFreshnessP95 = new cw.Metric({
      namespace: "BCT",
      metricName: "PollerScanAgeSeconds",
      dimensionsMap: { Service: "Poller", Stage: stage },
      statistic: "p95",
      period: Duration.minutes(5),
    });
    const notifierLatencyP95 = new cw.Metric({
      namespace: "BCT",
      metricName: "NotifyLatencyMs",
      dimensionsMap: { Service: "Notifier", Stage: stage },
      statistic: "p95",
      period: Duration.minutes(5),
    });
    const emailSentSum = new cw.Metric({
      namespace: "BCT",
      metricName: "EmailSentCount",
      dimensionsMap: { Service: "Notifier", Stage: stage },
      statistic: "sum",
      period: Duration.minutes(5),
    });
    const emailSuppressedSum = new cw.Metric({
      namespace: "BCT",
      metricName: "EmailSuppressedCount",
      dimensionsMap: { Service: "Notifier", Stage: stage },
      statistic: "sum",
      period: Duration.minutes(5),
    });

    const bounceSum = new cw.Metric({
      namespace: "BCT",
      metricName: "BounceCount",
      dimensionsMap: { Stage: stage },
      statistic: "sum",
      period: Duration.minutes(5),
    });
    const complaintSum = new cw.Metric({
      namespace: "BCT",
      metricName: "ComplaintCount",
      dimensionsMap: { Stage: stage },
      statistic: "sum",
      period: Duration.minutes(5),
    });
    const bounceRate = new cw.MathExpression({
      expression: "IF(sent>0, b/sent, 0)",
      usingMetrics: { b: bounceSum, sent: emailSentSum },
      period: Duration.minutes(5),
    });
    const complaintRate = new cw.MathExpression({
      expression: "IF(sent>0, c/sent, 0)",
      usingMetrics: { c: complaintSum, sent: emailSentSum },
      period: Duration.minutes(5),
    });

    const pollerFreshnessAlarm = new cw.Alarm(this, "PollerFreshnessSLO", {
      alarmName: `bct-${stage}-poller-freshness-p95`,
      metric: pollerFreshnessP95,
      threshold: 7 * 60,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    pollerFreshnessAlarm.addAlarmAction(new actions.SnsAction(alerts));

    const notifierLatencyAlarm = new cw.Alarm(this, "NotifierLatencySLO", {
      alarmName: `bct-${stage}-notifier-latency-p95`,
      metric: notifierLatencyP95,
      threshold: 2 * 60 * 1000,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    notifierLatencyAlarm.addAlarmAction(new actions.SnsAction(alerts));

    const bounceRateAlarm = new cw.Alarm(this, "SesBounceRateHigh", {
      alarmName: `bct-${stage}-ses-bounce-rate-high`,
      metric: bounceRate,
      threshold: 0.05,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    bounceRateAlarm.addAlarmAction(new actions.SnsAction(alerts));

    const complaintRateAlarm = new cw.Alarm(this, "SesComplaintRateHigh", {
      alarmName: `bct-${stage}-ses-complaint-rate-high`,
      metric: complaintRate,
      threshold: 0.01,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    complaintRateAlarm.addAlarmAction(new actions.SnsAction(alerts));

    new cw.Alarm(this, "PollerDlqNotEmpty", {
      alarmName: `bct-${stage}-poller-dlq-not-empty`,
      metric: pollerDlq.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
        statistic: "max",
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
    }).addAlarmAction(new actions.SnsAction(alerts));

    new cw.Alarm(this, "NotifierDlqNotEmpty", {
      alarmName: `bct-${stage}-notifier-dlq-not-empty`,
      metric: notifierDlq.metricApproximateNumberOfMessagesVisible({
        period: Duration.minutes(5),
        statistic: "max",
      }),
      threshold: 0,
      evaluationPeriods: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_THRESHOLD,
    }).addAlarmAction(new actions.SnsAction(alerts));

    // Grafana Cloud Integration
    // Create IAM user for Grafana Cloud to access CloudWatch metrics
    // This will be used to configure CloudWatch data source in Grafana Cloud
    const grafanaUser = new iam.User(this, "GrafanaCloudUser", {
      userName: `bct-${stage}-grafana-cloud`,
    });

    grafanaUser.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "cloudwatch:DescribeAlarmsForMetric",
          "cloudwatch:DescribeAlarmHistory",
          "cloudwatch:DescribeAlarms",
          "cloudwatch:ListMetrics",
          "cloudwatch:GetMetricStatistics",
          "cloudwatch:GetMetricData",
          "cloudwatch:GetInsightRuleReport",
        ],
        resources: ["*"],
      })
    );

    grafanaUser.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "logs:DescribeLogGroups",
          "logs:GetLogGroupFields",
          "logs:StartQuery",
          "logs:StopQuery",
          "logs:GetQueryResults",
          "logs:GetLogEvents",
        ],
        resources: ["*"],
      })
    );

    grafanaUser.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "ec2:DescribeRegions",
          "tag:GetResources",
        ],
        resources: ["*"],
      })
    );

    const grafanaAccessKey = new iam.CfnAccessKey(this, "GrafanaCloudAccessKey", {
      userName: grafanaUser.userName,
    });

    /* ──────────────────────────────────────────────────────────────────────────
     * 7) Outputs (sanity)
     * ────────────────────────────────────────────────────────────────────────── */
    new CfnOutput(this, "ApiUrl", { value: api.url });
    new CfnOutput(this, "TableName", { value: table.tableName });
    new CfnOutput(this, "BusName", { value: bus.eventBusName });
    new CfnOutput(this, "SesConfigSet", { value: SES_CONFIG_SET_NAME });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });
    new CfnOutput(this, "GrafanaCloudAccessKeyId", {
      value: grafanaAccessKey.ref,
      description: "AWS Access Key ID for Grafana Cloud CloudWatch data source",
    });
    new CfnOutput(this, "GrafanaCloudSecretAccessKey", {
      value: grafanaAccessKey.attrSecretAccessKey,
      description: "AWS Secret Access Key for Grafana Cloud (store securely!)",
    });
  }
}
