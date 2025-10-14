# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Structure

This is a monorepo with backend (AWS CDK) and frontend (Next.js) in separate directories:
- `backend/` - AWS CDK infrastructure and Lambda functions
- `frontend/` - Next.js 15 web application with shadcn/ui components
- `shared/` - Shared TypeScript types

## Build & Development Commands

**Root level (both backend + frontend):**
- `npm run build` - Build both backend and frontend
- `npm run dev` - Run both backend (watch) and frontend (dev server)
- `npm run clean` - Clean all node_modules and build outputs

**Backend specific:**
- `npm run backend:build` - Compile backend TypeScript  
- `npm run backend:deploy` - Deploy CDK stack to AWS
- `npm run backend:dev` - CDK watch mode
- `cd backend && npx cdk deploy` - Deploy stack to AWS (loads .env automatically via dotenv)
- `cd backend && npx cdk diff` - Compare deployed stack with current state
- `cd backend && npx cdk synth` - Emit CloudFormation template

**Frontend specific:**
- `npm run frontend:build` - Build Next.js app for production
- `npm run frontend:dev` - Start Next.js development server
- `npm run frontend:start` - Start Next.js production server

## Architecture Overview

This is a serverless AWS application built with CDK that tracks University of Wisconsin class enrollment status changes and notifies subscribed users via email.

### Core Components

**Single DynamoDB Table** (`AppTable2`):
- Primary keys: PK/SK with TTL support
- GSI1: Maps sections to subscriptions (`SEC#{term}#{classNbr}` → subscriptions)
- Item types: SUB (subscription), DEDUP (duplicate prevention), WATCH (course registry), STATE (section status), UNSUB (unsubscribe tokens), BREAD (breadcrumbs)

**Lambda Functions**:
- API handlers in `services/api/`: create/list/delete subscriptions, unsubscribe flow
- `services/poller/index.ts`: Multi-term poller that discovers active terms from WATCH items and polls UW enrollment API
- `services/notifier/index.ts`: Event-driven function that sends emails when seat status changes  
- `services/ses-feedback/index.ts`: Handles SES bounce/complaint feedback

**Event Flow**:
1. Poller scans DynamoDB for WATCH items with `subCount > 0` to discover active terms and courses
2. For each term, scans SUB items to find specific sections being watched
3. Fetches current status from UW Public Enroll API for each course
4. Compares with stored STATE items, emits SeatStatusChanged events to EventBridge
5. Notifier receives events, queries subscriptions via GSI1, sends emails via SES

**Authentication**: Cognito User Pool with Google OAuth integration for API access

### Data Model Key Patterns

- User subscriptions: `PK=USER#{email}`, `SK=SUB#{uuid}`
- Course watch registry: `PK=COURSE#{term}#{subject}#{courseId}`, `SK=WATCH`
- Section states: `PK=SEC#{term}#{classNbr}`, `SK=STATE` (with TTL)
- GSI1 section lookups: `GSI1PK=SEC#{term}#{classNbr}`, `GSI1SK=SUB#{uuid}`
- Unsubscribe tokens: `PK=UNSUB`, `SK=TOKEN#{uuid}` (with TTL)

### Important Implementation Notes

- **DynamoDB Queries**: KeyConditionExpression requires exact partition key match (`=`) and optional sort key operators (`begins_with`, `=`, etc.). Use `ScanCommand` with `FilterExpression` for cross-partition searches.
- **Multi-term polling**: Poller automatically discovers all active terms from WATCH items, or can poll specific term if `event.term` is provided
- **TTL management**: STATE items auto-expire 45 days after term end using UW aggregate API for accurate dates, with fallback calculations
- **User limits**: SUBCOUNT items track subscription limits per user, decremented on unsubscribe
- **Email suppression**: SES bounce/complaint feedback handled via configuration set → EventBridge → feedback handler
- **Metrics**: CloudWatch metrics in EMF format for SLO tracking across multiple terms
- **Monitoring**: Grafana Cloud integration for professional dashboard visualization (free tier)

### External APIs

- **UW Aggregate API**: `https://public.enroll.wisc.edu/api/search/v1/aggregate` - Returns current terms and subjects
- **UW Search API**: `https://public.enroll.wisc.edu/api/search/v1` - Course search with POST body
- **UW Enrollment API**: `https://public.enroll.wisc.edu/api/search/v1/enrollmentPackages/{term}/{subject}/{courseId}` - Section status data

### File Structure

**Backend:**
- `backend/lib/badger-class-tracker-stack.ts` - CDK infrastructure definition
- `backend/bin/badger-class-tracker.ts` - CDK app entry point (loads dotenv)
- `backend/.env` - Google OAuth credentials (loaded via dotenv)
- `backend/services/api/` - API Gateway Lambda handlers with CORS support
- `backend/services/poller/index.ts` - Multi-term enrollment status poller
- `backend/services/notifier/index.ts` - Email notification handler
- `backend/services/ses-feedback/index.ts` - SES bounce/complaint processor

**Frontend:**
- `frontend/src/app/` - Next.js 15 App Router pages
- `frontend/src/components/` - React components and shadcn/ui components
- `frontend/src/lib/` - API client and AWS Amplify Auth configuration

**Shared:**
- `shared/types.ts` - TypeScript types shared between backend and frontend

## Current Tech Stack

**Backend (AWS CDK):**
- AWS CDK v2 with TypeScript
- DynamoDB (single table design with GSI)
- Lambda Functions (Node.js 20.x)
- API Gateway REST API with Cognito authorizer
- EventBridge for event-driven architecture
- SES for email notifications
- CloudWatch metrics and alarms
- Grafana Cloud for dashboard visualization

**Frontend (Next.js):**
- Next.js 15 with Turbopack
- React 18 with App Router
- shadcn/ui component library
- Tailwind CSS v4
- AWS Amplify Auth (not Amplify Gen 2)
- React Query for API state management
- TypeScript throughout

**Authentication:**
- AWS Cognito User Pool
- Google OAuth integration
- JWT tokens for API authorization

## Important Notes

**Environment Configuration:**
- Backend uses `dotenv` to load `backend/.env` for Google OAuth credentials
- Frontend uses `.env.local` for API endpoints and Cognito configuration
- CDK deployment automatically loads environment variables

**CORS Configuration:**
- API Gateway has explicit OPTIONS methods for protected endpoints
- Lambda functions return proper CORS headers
- No default CORS preflight to avoid conflicts

**Data Flow:**
1. Frontend uses AWS Amplify Auth for Cognito integration
2. API calls include JWT Bearer tokens
3. Backend validates tokens via Cognito authorizer
4. Search API proxies UW enrollment API (GET → POST transformation)
5. Event-driven notifications via EventBridge + SES

**Monitoring & Observability:**
- Grafana Cloud integration (free tier - 10k metrics, no time limit)
- IAM user created by CDK for CloudWatch data source access
- Pre-built dashboard JSON in `backend/grafana-cloud-dashboard.json`
- Public dashboard snapshot: https://imnotjin.grafana.net/dashboard/snapshot/s6ZrMrC4C6bZ5nd8McVvaRLctJ2w6rmu
- Dashboard includes:
  - SLO metrics (poller freshness p95 < 7min, notifier latency p95 < 2min)
  - Email delivery volume and suppression tracking
  - SES reputation (bounce/complaint rates with thresholds)
  - Operational metrics (watched courses, sections scanned, status changes)
  - Auto-refresh every 30 seconds with color-coded thresholds

## Git Commit Guidelines

**IMPORTANT: Always follow these commit message guidelines:**

1. **Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)** format: `type(scope): description`
2. **DO NOT include** "Generated with Claude Code" or "Co-Authored-By: Claude" lines
3. **Group similar changes** into logical commits rather than committing everything at once
4. **Stage and commit different files separately** when they represent different features/concerns

**Examples:**
- `feat(backend): add get-terms API endpoint`
- `fix(frontend): resolve section ordering issue`
- `style(ui): improve button contrast and spacing`
- `refactor(api): simplify subscription error handling`