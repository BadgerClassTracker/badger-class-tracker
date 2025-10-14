#!/usr/bin/env python3
"""
Generate architecture diagram for Badger Class Tracker
Using diagrams library: https://diagrams.mingrammer.com/
"""
from diagrams import Diagram, Cluster, Edge
from diagrams.aws.compute import Lambda
from diagrams.aws.database import Dynamodb
from diagrams.aws.integration import Eventbridge, SimpleQueueServiceSqs
from diagrams.aws.network import APIGateway, CloudFront
from diagrams.aws.security import Cognito
from diagrams.aws.management import Cloudwatch
from diagrams.aws.engagement import SimpleEmailServiceSes
from diagrams.onprem.client import Users
from diagrams.onprem.monitoring import Grafana
from diagrams.generic.place import Datacenter
from diagrams.programming.framework import React

with Diagram(
    "Badger Class Tracker - System Architecture",
    filename="architecture_diagram",
    show=False,
    direction="LR",
    outformat="png"
):
    # Far left: User
    users = Users("Students")

    # Frontend Layer
    with Cluster("Frontend Layer"):
        nextjs = React("Next.js 15\nApp Router")
        cdn = CloudFront("Amplify\nCloudFront")
        nextjs - cdn

    # Authentication
    with Cluster("Authentication"):
        cognito = Cognito("Cognito\nGoogle OAuth")

    # API Layer
    with Cluster("API Layer"):
        api_gw = APIGateway("API Gateway\nREST API")

        with Cluster("API Functions"):
            api_subs = Lambda("Subscriptions")
            api_courses = Lambda("Courses")
            api_unsub = Lambda("Unsubscribe")

    # Data Layer
    with Cluster("Data Layer"):
        ddb = Dynamodb("DynamoDB\nSingle Table + GSI")

    # Event Processing
    with Cluster("Event Processing"):
        eventbridge = Eventbridge("EventBridge")

        with Cluster("Background Workers"):
            poller = Lambda("Poller\n(1min schedule)")
            notifier = Lambda("Notifier")
            feedback = Lambda("SES Feedback")

    # External APIs
    with Cluster("External APIs"):
        uw_api = Datacenter("UW-Madison\nEnrollment API")

    # Far right: Email Service
    with Cluster("Email Service"):
        ses = SimpleEmailServiceSes("Amazon SES")

    # Observability
    with Cluster("Observability"):
        cw = Cloudwatch("CloudWatch\nMetrics + Logs")
        grafana = Grafana("Grafana Cloud")

        with Cluster("DLQs"):
            dlq_poller = SimpleQueueServiceSqs("Poller DLQ")
            dlq_notifier = SimpleQueueServiceSqs("Notifier DLQ")

    # User → Frontend
    users >> Edge(color="darkblue") >> cdn

    # Frontend → Auth & API
    nextjs >> Edge(color="darkgreen", label="authenticate") >> cognito
    nextjs >> Edge(color="darkblue", label="API + JWT") >> api_gw

    # API Gateway → Authorizer & Lambdas
    api_gw >> Edge(color="darkgreen", style="dashed") >> cognito
    api_gw >> Edge(color="darkblue") >> [api_subs, api_courses, api_unsub]

    # API Lambdas → DynamoDB
    [api_subs, api_courses, api_unsub] >> Edge(color="purple") >> ddb

    # Poller Flow
    poller >> Edge(color="darkorange", label="poll") >> uw_api
    poller >> Edge(color="purple", label="read/write STATE") >> ddb
    poller >> Edge(color="firebrick", label="SeatStatusChanged") >> eventbridge
    poller >> Edge(color="red", style="dashed", label="failures") >> dlq_poller

    # Notifier Flow
    eventbridge >> Edge(color="firebrick", label="trigger") >> notifier
    notifier >> Edge(color="purple", label="query GSI1") >> ddb
    notifier >> Edge(color="green", label="send") >> ses
    notifier >> Edge(color="red", style="dashed", label="failures") >> dlq_notifier

    # SES back to user (long arrow)
    ses >> Edge(color="darkgreen", label="deliver email", style="bold") >> users

    # SES Feedback Loop
    ses >> Edge(color="orange", style="dotted", label="bounce/complaint") >> eventbridge
    eventbridge >> Edge(color="orange") >> feedback
    feedback >> Edge(color="purple", label="suppress") >> ddb

    # Monitoring
    [api_subs, poller, notifier] >> Edge(color="gray", style="dotted") >> cw
    cw >> Edge(color="gray") >> grafana
    [dlq_poller, dlq_notifier] >> Edge(color="gray", style="dotted") >> cw

print("✅ Architecture diagram generated: architecture_diagram.png")
