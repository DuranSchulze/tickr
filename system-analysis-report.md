# System Analysis

> Audit date: 2026-09-21 · Repository: `/Users/zafajardo/Documents/Development/Tickr` · Method: static inspection only (no code executed, no files modified). All findings below are based on files read in the repository; anything not verifiable is marked "Not confirmed from codebase."

---

## 1. System Name

**Trackly** (package name `trackly` in `package.json`; formerly "Tickr" / "Time Tracker" per `docs/system-overview.md`). Live Vercel deployment URL referenced in code: `tickr-nu.vercel.app`. Internal owner: Duran File Pino (professional services firm).

## 2. System Overview

Trackly is an internal time-tracking platform built for a professional services company. Employees use it to log work hours against clients, projects, tasks, tags, and departments, marking each entry as billable or non-billable. It combines a live timer, manual time entry, multi-view dashboards (day / week / month), team analytics, and payroll-oriented employee profiles in a single web application.

The system is intended for three audiences at once: **employees**, who track their own time; **managers**, who monitor team and department activity, locations, and performance; and **owners/admins**, who manage the workspace, billing, catalogs, and integrations. It solves the operational problem of turning raw worked hours into billing-ready, payroll-ready, and reporting-ready data — including automated Google Sheets exports and a read-only public API for external systems.

Beyond the web app, Trackly ships a Chrome browser extension (side-panel timer with a live toolbar badge), a service worker for offline entry queuing, and a subscription/billing layer (Xendit-hosted checkout) that suggests it is being productized beyond pure internal use.

## 3. Primary Purpose

The main goal is accurate, attributable, billable time capture for a services business: every hour an employee works must be linked to a client/project, classified (billable vs not, tags, department), auditable, and exportable for invoicing, payroll, and management reporting. The system exists to replace ad-hoc timesheets and give managers real-time visibility into who is working on what, from where, and at what rate.

## 4. Target Users / User Roles

Roles are defined by the `RolePermission` enum (`OWNER`, `ADMIN`, `MANAGER`, `EMPLOYEE`) and an override-able permission catalog in `src/lib/rbac/permissions.ts` (12 permissions across 4 groups: Time tracking, Analytics & reports, People, Workspace). Workspace roles are custom-named records with a permission level plus per-permission JSON overrides, so an Owner can create arbitrary named roles.

- **Owner** — everything; the only role that can manage workspace settings and billing by default (both are `owner-controlled` delegations). All permissions resolve to `true`.
- **Admin** — member management, catalogs, audit logs, reports, team entries; cannot manage workspace settings or billing unless the Owner delegates.
- **Manager** — department-scoped visibility (hierarchy scope: department). Can view team activity, locations, and members within their own department; cannot manage members or catalogs by default.
- **Employee** — tracks own time, views own analytics/performance, manages own profile. Hierarchy scope: self.
- **External integrators** — non-human consumers of the read-only `/api/v1/*` API, authenticated via workspace API keys or short-lived JWTs (`docs/api-integrations.md`).
- **Developer accounts** — a separate machine-account table (`developer_accounts`) for the public API sign-in flow.

## 5. Core Features

### Implemented Features

- **Live timer & manual entries** — start/stop timer with centisecond display, manual entry creation, duplication, editing, and deletion (`src/lib/server/tracker/timer.server.ts`, `manual-entries.server.ts`).
- **Multi-view time dashboard** — day, week, month views plus an "all entries" section, with date navigation (`src/routes/app/time-tracker/`).
- **Timer presets** — up to 10 saved presets (client, project, task, tags, billable) per member (`timer_presets` table).
- **Catalog management** — clients (with ACTIVE/INACTIVE/SUSPENDED status), projects, project tasks, tags, departments, cohorts, and custom workspace roles (`src/routes/app/workspace/catalogs*.tsx`).
- **Member management** — invites, role assignment, departments, billable rates (per-member, per-client with effective-date ranges), per-member analytics (`members.$memberId.tsx`, `member-billing.server.ts`).
- **Analytics** — heatmap, charts, daily rollup tables (`analytics_daily_member_metrics`) for fast reporting, workspace/department/personal scopes (`analytics.server.ts`, `analytics-rollups.server.ts`).
- **Reports & timesheet** — report generation, sortable exports to Excel (exceljs), PDF (jspdf), timesheet view and export (`reports.tsx`, `timesheet.tsx`, `bulk-report.server.ts`).
- **Performance tracking** — KPI scoring (`performance-kpi.ts`), leaderboards, public share links (`performance.$token.tsx`, `performanceShareLinks` table).
- **Team activity & live presence** — activity screen with a workspace map (MapLibre GL) showing each member's latest geo-resolved entry; 30-second "pulse" polling (`activity.server.ts`, `pulse.server.ts`).
- **Entry origin capture** — IP, User-Agent, and city-level geolocation (ipinfo.io, 24 h in-memory cache) recorded per entry; gated by a per-workspace `locationTrackingEnabled` toggle.
- **Google Sheets sync** — one-way export of time entries, members, and catalogs to a connected sheet; also imports catalogs _from_ the sheet; sync queue + hourly Vercel cron (`gsheets/`, `/api/cron/sync-gsheets`).
- **Timer reminder emails** — hourly cron emails members with timers running past thresholds (`timer_reminder_emails` table, `/api/cron/timer-reminders`).
- **Suspicious-login alerts** — email on new-IP sign-in with geo/IP context (`auth-security.server.ts`, `geoip.ts`).
- **Offline support** — service worker (`public/sw.js`, `offline.html`) plus a client-side offline queue for manual entries (`offline-queue.ts`).
- **Chrome extension** — MV3 side panel embedding the app via iframe with `?embed=1`, live timer badge via postMessage (`extension/`).
- **Public read-only API** — `/api/v1/*` endpoints (clients, projects, tags, tasks, departments, members, time-entries, workspace, member-day-activity, DTR integration) with API keys, JWT exchange, OpenAPI spec, and Swagger UI at `/api/docs`.
- **Audit logging** — `audit_logs` table with an audit logger (`tracker/audit/audit-logger.server.ts`) and a viewer screen (`app/audit-logs.tsx`).
- **Subscriptions & billing** — plan catalog, workspace subscriptions with trial state, Xendit-hosted checkout and webhooks, subscription-gated write access with a billing-exempt escape hatch.
- **Employee HR profiles** — employment type/status, hire/regularization/separation dates, and Philippine government IDs (SSS, PhilHealth, TIN, Pag-IBIG) plus address and personal profile data.
- **Theme & brand customization** — primary-color picker, dark/light mode, single-source `BRAND` constant.
- **Newsletter capture** — landing-page subscription with welcome email (`newsletter.server.ts`).
- **Calendar & birthday celebration** — calendar view of entries and member birthdays (`calendar.tsx`, `BirthdayCelebration`).

### Partially Implemented Features

- **Rate limiting** — enabled on Better Auth endpoints but with `storage: 'memory'`. The schema comment and `plans/quick-fix/server-hygiene.md` acknowledge this is per-instance, so limits are weaker on multi-instance/serverless deployments; the `rate_limit` table exists but is unused. The hand-written `/api/v1/auth/*` routes are explicitly noted as unthrottled.
- **Location search performance** — leading-wildcard project search (`ILIKE '%term%'`) has no trigram index; a schema comment says the trigram index was dropped (migration 0005) and never rebuilt, with the decision deferred in `plans/database-performance`.
- **E2E testing** — Playwright is a devDependency, but no Playwright config or test suite was found in the repository. Installed but apparently unused.

### Planned / Placeholder Features

The `plans/` directory (36 plan folders, e.g. `invoicing-template-creation-payment`, `landing-page-redesign`, `analytics-reports-differentiation`) documents in-flight or proposed work. Notable signals:

- **Invoicing** — a plan folder exists (`invoicing-template-creation-payment`); no invoice feature was found in routes or schema. Planned.
- **Require email verification for membership claim** — plan folder exists; the `emailVerified` column exists but no enforcement flow was found in the auth config. Planned/partial.
- **Analytics enhancement** — `docs/analytics-enhancement-plan.md` describes a roadmap beyond the current analytics screens.
- No `TODO`/`FIXME` markers were found in `src/` (0 matches), suggesting tracked work lives in `plans/` rather than inline comments.

## 6. Main User Flow

**Employee:** Sign up / sign in → (optional) accept workspace invite or create workspace in onboarding wizard → land on time tracker (week view) → pick client/project/task/tags → start timer or add manual entry → view/edit entries in day/week/month views → check own analytics, performance, and timesheet → export own data.

**Manager:** Sign in → workspace activity screen (live presence + map) → drill into department analytics or a member's calendar/report → review, edit, or approve team entries → export department reports.

**Owner/Admin:** Sign in → onboarding wizard creates workspace → configure catalogs (clients, projects, tags, departments, roles) → invite members with roles/rates → configure Google Sheets sync, API keys, location tracking, billing → monitor audit logs and analytics → manage subscription/billing (Xendit checkout) → periodic Google Sheets sync (hourly cron) and billing-cycle exports.

**External system:** Obtain workspace API key → call `/api/v1/*` endpoints directly or exchange the key for a short-lived JWT → fetch read-only workspace data (documented in `docs/api-integrations.md`).

## 7. Main Modules / Areas

- **Authentication** — Better Auth email/password with forgot/reset flow, session management, blocked signup domains, suspicious-login alerting.
- **Onboarding** — workspace creation wizard (`/onboarding`).
- **Time tracking** — timer, manual entries, presets, multi-view dashboard, offline queue, reminders.
- **Analytics & reports** — dashboards, heatmaps, rollups, reports, timesheet, bulk exports, performance/KPI, leaderboards.
- **People / HR** — member management, employee profiles, government IDs, birthdays.
- **Workspace administration** — catalogs, custom roles & permissions, settings, audit logs, locations/activity.
- **Billing & subscriptions** — plans, subscriptions, Xendit payments, subscription gating, billing exemptions.
- **Integrations** — Google Sheets sync, public REST API + Swagger, DTR integration endpoint, developer accounts.
- **Marketing surface** — landing page, lounge page, pricing page, newsletter capture, changelog.
- **Browser extension** — Chrome side-panel companion.
- **Announcements** — an in-app announcements feature (`src/features/announcements`).

## 8. Technology Stack

### Frontend

- React 19 + **TanStack Start** (SSR) + TanStack Router (file-based routing)
- **TanStack Query** (server state), TanStack Table, TanStack Form + **Zod**
- **Tailwind CSS v4** + shadcn/ui + Radix UI primitives
- **Recharts** (charts), MapLibre GL (activity map), Lucide/Tabler icons
- Three.js / OGL / postprocessing present as dependencies (landing-page visual effects)

### Backend

- TanStack Start server functions (Nitro 3 beta output), Vite 8
- **Better Auth** (drizzle adapter, TanStack Start cookies plugin)
- Server-side domain logic in `src/lib/server/tracker/`

### Database

- **Neon** serverless PostgreSQL (pooled URL at runtime, direct URL for migrations) via **Drizzle ORM**; `node-postgres` pool (`src/db.ts`)
- 22+ tables, 11 enums in `src/db/schema.ts`; 26 migration files in `drizzle/` (0000–0025)
- CUID2 primary keys; extensive deliberate indexing with explanatory comments

### Infrastructure / Hosting

- **Vercel** (`vercel.json`, `.vercel/`, deployment URL `tickr-nu.vercel.app`, region `sin1`, two scheduled crons)
- Neon for the database; DigitalOcean referenced only in extension docs as an alternative host
- No Dockerfile or docker-compose found

### Important Libraries

- `better-auth`, `drizzle-orm`/`drizzle-kit`, `pg`, `@neondatabase/serverless`
- `zod` (validation), `jose` (JWT for public API)
- `exceljs`, `jspdf` + `jspdf-autotable` (exports)
- `nodemailer`, Resend (email)
- `@sentry/react` + `@sentry/tanstackstart-react` (error monitoring)
- `@imagekit/react` (profile photo storage)
- `maplibre-gl` (maps), `vitest` + Testing Library (tests), `playwright` (installed, unused)

## 9. External Integrations

| Integration           | Used for                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Neon (PostgreSQL)** | Primary database                                                                                              |
| **Resend**            | Transactional email (primary): reset password, invites, suspicious login, timer reminders, newsletter welcome |
| **Nodemailer / SMTP** | Email fallback when Resend fails                                                                              |
| **Google Sheets API** | One-way export of entries/members/catalogs + catalog import, via service-account credentials                  |
| **Xendit**            | Subscription billing: hosted checkout, payment links, webhooks (`/api/webhooks/xendit`)                       |
| **ipinfo.io**         | IP geolocation for entry origin and login alerts                                                              |
| **ImageKit**          | Profile photo upload/storage                                                                                  |
| **Sentry**            | Client- and server-side error monitoring (tracing only; replay/profession deliberately disabled)              |
| **Vercel Cron**       | Hourly Google Sheets sync, hourly timer reminders                                                             |
| **Swagger / OpenAPI** | Self-hosted API docs at `/api/docs`                                                                           |

Secrets are configured via env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `EXTERNAL_API_JWT_SECRET`, `GOOGLE_*`, `RESEND_*`, `SMTP_*`, `IMAGEKIT_*`, `XENDIT_*`). No secret values are reproduced in this report.

## 10. Data & Main Entities

High-level model (all workspace-scoped unless noted):

- **Identity:** `users` → `user_profiles` → `user_addresses`; Better Auth `sessions`, `accounts`, `verifications`.
- **Organization:** `workspaces` (settings, billing flags, Google Sheet link, payroll cutoffs) → `workspace_roles` (custom roles w/ permission overrides) → `departments`, `cohorts`/`cohort_members`, `workspace_members` (join of user to workspace with role, department, billable rate, status INVITED/ACTIVE/DISABLED).
- **Catalog:** `clients` → `projects` → `project_tasks`; `tags`; `member_client_billable_rates` (rate history with effective date ranges).
- **Time tracking:** `time_entries` (project/task/tags via join table, billable flag, timestamps, IP/location/UA origin) + `timer_presets`; `timer_reminder_emails`.
- **Analytics:** `analytics_daily_member_metrics` (pre-aggregated daily rollups) + `pending_analytics_rollups` queue.
- **Billing:** `subscription_plans` → `subscriptions` (one per workspace) → `subscription_invoices` / `subscription_payments` (Xendit IDs).
- **Access & audit:** `workspace_api_keys` (hashed tokens), `developer_accounts`, `workspace_invites` (token hash, expiry), `performance_share_links`, `audit_logs`.
- **HR:** `employee_profiles`, `employee_government_ids` (Philippine statutory IDs).
- **Misc:** `newsletter_subscribers`, `pending_gsheets_syncs`.

Business meaning: a _workspace_ is the tenant boundary; everything — members, catalogs, entries, billing — hangs off it. A _time entry_ is the atomic economic record: whose time, on what client/project, billable at what rate. _Rollups_ exist to make analytics fast at scale. _Subscriptions_ gate write access per workspace.

## 11. Authentication & Permissions

- **Authentication:** Better Auth email/password only (no OAuth providers configured). Sessions are cookie-based; in production the session cookie is `SameSite=None; Secure` specifically so the cookie works inside the Chrome extension iframe. Sessions last 30 days with daily rolling updates; password-reset tokens expire in 15 minutes.
- **Rate limiting** on auth endpoints (see §5 — memory storage caveat).
- **Authorization:** custom RBAC layer (`src/lib/rbac/`) — 12 permissions with per-role defaults plus JSON overrides per custom role; OWNER always passes. Hierarchy scoping (workspace → department → self) is enforced by `canAccessMemberWithinHierarchy`. Sensitive permissions (workspace settings, billing, role-permission management) are owner-controlled (non-delegable).
- **Protected areas:** all `/app/*` routes require authentication; workspace management screens require Owner/Admin (or the specific permission); audit logs and billing are Owner/Admin-only; the public API requires a workspace API key or JWT.
- **External API auth:** API keys stored as SHA-256 hashes with prefix + last-four for display; optional expiry, revocation, last-used tracking; JWT exchange with a dedicated signing secret (`EXTERNAL_API_JWT_SECRET`) and configurable TTL.

## 12. Deployment & CI/CD

**Classification: Partially implemented (managed-platform level).**

- **Deployment:** Vercel (`vercel.json` — build/install commands, `sin1` region, cache headers, CSP). Production start command runs the Nitro build from `.output/`. No Dockerfile, no docker-compose, no staging environment config found.
- **CI:** two GitHub Actions workflows:
  - `check.yml` — on PR and main pushes: install, `typecheck`, `lint`, `test`. No build step, no deploy step, no migration verification.
  - `react-doctor.yml` — third-party React health scan (security/performance/a11y) with PR comments and commit statuses.
- **Pre-commit:** Husky + lint-staged run ESLint (`--max-warnings 0`) and Prettier on staged files.
- **Migrations:** manual/developer-run via `pnpm db:migrate` (drizzle-kit); nothing in CI applies migrations.
- **Rollback strategy:** not found in the repository. Relies on Vercel's built-in deployment rollback; not documented.

## 13. Testing & Quality

- **Test framework:** Vitest + jsdom + Testing Library; 78 test files found across `src/` (roughly 31 server-logic test files in `src/lib/server/__tests__/`, the rest in `src/lib/time-tracker/` and component tests).
- **Coverage of tested areas:** RBAC permissions and role gates, subscription access, work intervals/overlap, timesheet and export formatting, analytics overview, date handling, geo/reverse-geocode, external API JWT and query handling, Xendit return URLs, workspace location privacy, entry origin, performance KPI/date ranges, billing math, calendar access, task sync, network status, and many component tests (dashboard entries, reports, timesheet, settings, profile image upload, location history, leaderboard, etc.).
- **Quality gates:** `typecheck` (tsc), ESLint with zero-warning policy, Prettier check — all enforced in CI and pre-commit. `check-all` script chains all three.
- **Not found:** E2E tests (Playwright installed but no config/suite found), no coverage thresholds configured, no mutation/property testing, no load testing.
- **Assessment:** unit/integration coverage is genuinely broad for business logic — notably strong around permissions, billing math, and export formatting. The gap is the absence of any end-to-end or API-contract testing, so full-stack flows (auth → timer → report → export → gsheets sync) are unverified by automation. Process strength: good; depth at the UI/E2E layer: weak.

## 14. Security

**Implemented (evidence-backed):**

- Session-based auth with short-lived reset tokens (15 min) and blocked disposable/blocked signup domains.
- Auth rate limiting with stricter per-path rules (sign-up, forgot/reset password) — memory storage caveat noted in §5.
- Explicit CSRF gate: `assertTrustedOrigin()` rejects cross-origin state-mutating requests (`src/lib/server/csrf.server.ts`), necessary because production cookies are `SameSite=None`.
- API keys stored hashed (SHA-256) with prefix/last-four display only; revocation and expiry supported.
- Separate JWT signing secret for the public API, deliberately isolated from the session secret with documented rotation reasoning.
- Xendit webhook verification via callback token comparison (`/api/webhooks/xendit.ts`).
- Content-Security-Policy (`frame-ancestors 'self' chrome-extension://*`) and cache-control headers in `vercel.json`; auth responses marked `no-store`.
- Audit logging of administrative actions with a viewer UI.
- Subscription write-gating and workspace-access hardening layers with dedicated test files.
- Suspicious-login alerting on new-IP sign-ins.

**Gaps / concerns (supported by code):**

- **Secrets committed in `.env.example`:** live-looking Xendit development secret/public keys and a webhook verification token are present in the file (values intentionally not reproduced here). Even dev keys should be rotated and removed.
- Rate limiting is per-instance (memory) and does not cover the hand-written `/api/v1/auth/*` routes (both documented in code comments).
- No automated security scanning in CI beyond the third-party React Doctor scan; no dependency-audit step observed.
- Location/HR data (GPS coordinates, government IDs) is sensitive; access is permission-gated and there is a location-privacy test, but no at-rest encryption of these columns was found.

## 15. Current Development State

**Classification: Active Development (approaching stabilization in core areas).**

Evidence: 26 migrations with recent, focused changes (analytics indexes, API keys, subscriptions, entry origin); a `plans/` directory with 36 tracked plans, many completed (their results are visible in code); extensive unit-test growth; two CI workflows; a live Vercel deployment; and documented remediation work (`audit-2026-09-remediation`). The core time-tracking loop is complete and hardened, while billing/subscriptions and invoicing are newer and still evolving. The README, docs, and system-overview are actively maintained.

## 16. How Complete Is the System?

| Area                    |      Score |
| ----------------------- | ---------: |
| Core Functionality      |      26/30 |
| UI/UX                   |      12/15 |
| Backend & Integrations  |      12/15 |
| Testing & Reliability   |       9/15 |
| Deployment & Operations |       5/10 |
| Security                |       7/10 |
| Documentation           |        4/5 |
| **TOTAL**               | **75/100** |

### Why it is at this percentage

The core product — time tracking, catalogs, members, analytics, reports, exports, Google Sheets sync, public API, RBAC, audit logs — is implemented, tested at the unit level, documented, and deployed. The schema shows deliberate production engineering (index strategy with explanatory comments, rollup tables, privacy toggles). Documentation is unusually good for an internal tool (design system, system overview, API integration guide, email logic docs, 36 implementation plans).

### What prevents it from being 100%

- No E2E tests and no CI build step; Playwright installed but unused (Testing −6).
- Deployment is Vercel-only with manual migrations and no documented rollback/staging strategy (Operations −5).
- Secrets in `.env.example`, per-instance rate limiting, unthrottled hand-written auth routes, no dependency auditing (Security −3).
- Invoicing, email-verification enforcement, and several `plans/` items unfinished; analytics search index deferred (Core/Backend −7).
- HR/government-ID and location data lacks at-rest encryption evidence (Security partially counted above).

## 17. Remaining Work

### High Priority

1. Remove live Xendit keys from `.env.example` and rotate them.
2. Add a CI build step (`pnpm build`) so typecheck/lint/test can't pass on an unbuildable app.
3. Switch auth rate limiting to the prepared `database` storage and throttle the hand-written `/api/v1/auth/*` routes.
4. Introduce E2E coverage for the critical flows (sign-in → timer → report → export; invite acceptance; subscription checkout webhook).
5. Decide and implement a migration-deployment story (CI-applied migrations or documented runbook) plus rollback procedure.

### Medium Priority

6. Rebuild the trigram index (or implement an alternative) for project/task name search (`plans/database-performance`).
7. Add dependency auditing (e.g. `pnpm audit` / Dependabot) and secret scanning to CI.
8. Complete invoicing (planned) and email-verification enforcement for membership claims.
9. Add coverage thresholds to Vitest to keep the current strong unit-test discipline from regressing.

### Nice to Have

10. Playwright smoke suite against the deployed preview per PR.
11. Encryption-at-rest strategy for government IDs and precise location data.
12. Docker-based local stack for contributors who want a non-Neon database.
13. Staging environment distinct from production.

## 18. Recommended Next Steps

1. **Purge and rotate committed Xendit credentials** in `.env.example`, add a secret-scanning pre-commit hook (e.g. gitleaks).
2. **Extend `check.yml`** with `pnpm build` so CI proves the app compiles and bundles.
3. **Flip rate-limit storage to `database`** (one-line change; table already migrated) and add equivalent throttling to `/api/v1/auth/sign-in` and `developer-sign-in`.
4. **Stand up a minimal Playwright suite** (5–10 tests) covering sign-in, timer start/stop, manual entry, invite acceptance, and Xendit webhook handling in sandbox mode.
5. **Document the deployment runbook**: migration order, rollback via Vercel instant rollback, environment variable inventory per environment.
6. **Add `pnpm audit` (or Dependabot/Renovate)** to CI to catch vulnerable dependencies automatically.
7. **Resolve the deferred search-index decision** in `plans/database-performance` so catalog search scales predictably.
8. **Finish invoicing** per `plans/invoicing-template-creation-payment` to close the loop from tracked time → invoice.
9. **Enforce email verification** before a user can claim a workspace membership (plan exists; column already present).
10. **Set a Vitest coverage floor** (e.g. 60% lines on `src/lib`) to protect the existing investment in business-logic tests.

## 19. Short Portfolio Description

Trackly is the company's internal time-tracking and workforce-analytics platform, built for professional services billing. Employees track time with a live timer or manual entries tied to clients, projects, tasks, and billable rates, while managers get real-time team activity, department analytics, performance scores, and location-aware presence on a live map. Owners configure workspaces through a granular role-and-permission system, manage catalogs and billable rates, and export payroll- and billing-ready data through automated Google Sheets sync, Excel/PDF reports, and a documented read-only REST API with Swagger docs. The platform also includes employee HR profiles with Philippine government ID records, a Chrome side-panel extension, offline entry support, suspicious-login alerts, and subscription billing via Xendit. Core time tracking is complete and well tested; billing and invoicing are the active frontier. Overall maturity: production-deployed and actively developed, with remaining work concentrated in end-to-end testing, deployment automation, and billing expansion.

## 20. Evidence Reviewed

- `README.md`, `docs/system-overview.md`, `docs/api-integrations.md`, `docs/ui-design-system.md` (header), `DESIGN.md` (presence)
- `package.json`, `pnpm-workspace.yaml`, `vercel.json`, `.env.example`, `drizzle.config.ts`, `vite.config.ts`, `doctor.config.json`
- `src/db/schema.ts` (full, 1,399 lines), `drizzle/` (26 migration filenames)
- `src/lib/auth.ts`, `src/lib/rbac/permissions.ts`, `src/lib/rbac/authorization.ts`
- `src/lib/server/csrf.server.ts`, `subscription-gate.server.ts`, `newsletter.server.ts`, `tracker/` (server function inventory), `gsheets/`, `integrations/` (inventory), `email-templates/` (inventory)
- `src/routes/` (full route listing, incl. `api/v1/*`, `api/cron/*`, `api/webhooks/xendit.ts`, `api/docs.ts`, `api/openapi[.]json.ts`)
- `.github/workflows/check.yml`, `.github/workflows/react-doctor.yml`, `.husky/` + lint-staged config
- `extension/README.md`, `extension/manifest.json`, `public/sw.js` / `offline.html` (presence)
- `plans/` (36 plan-folder names), `src/sentry.client.config.ts`
- Test inventory: 78 `*.test.*` files across `src/`

---

SYSTEM SUMMARY
Name: Trackly (formerly Tickr) — internal time-tracking platform
Purpose: Billable time capture, team analytics, and payroll/reporting exports for a professional services firm
Primary Users: Employees, Managers (department scope), Owners/Admins, external API integrators
Current Status: Production-deployed (Vercel) and in active development
Completion Estimate: ~75/100
Main Features: Live timer + manual entries, multi-view dashboard, presets, catalogs, member/HR management, analytics & reports with rollups, performance KPIs, Google Sheets sync, public REST API + Swagger, audit logs, Chrome extension, offline queue, subscriptions
Main Integrations: Neon Postgres, Better Auth, Resend/SMTP, Google Sheets, Xendit, ipinfo.io, ImageKit, Sentry, Vercel Cron
Deployment Maturity: Partially implemented (Vercel + CI typecheck/lint/test; no build step, manual migrations, no documented rollback)
Testing Maturity: Good unit/integration coverage (78 test files); no E2E despite Playwright dependency
Biggest Remaining Gaps: Secrets in `.env.example` (needs rotation), no E2E tests, per-instance rate limiting + unthrottled API auth routes, no CI build/audit steps, invoicing unfinished
Recommended Immediate Priority: Rotate committed Xendit keys, add `pnpm build` to CI, switch rate limiting to database storage, and establish a minimal Playwright suite
