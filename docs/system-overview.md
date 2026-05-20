# Flow Track — System Overview

## Product Identity

- **Internal name:** Flow Track (deployed as `flow-track-theta.vercel.app`)
- **Purpose:** Internal time tracking and HR management platform
- **Primary org:** Duran File Pino (Philippine law/professional services firm)
- **NOT a SaaS** — no subscription billing, no payment gateway; built for one organization
- **ORM:** Drizzle ORM (PostgreSQL dialect via Neon)

---

## Core Goals

1. Track billable vs. non-billable work hours across teams
2. Provide cross-team analytics and member performance visibility
3. Sync time/HR data to Google Sheets for payroll and billing workflows
4. Allow managers/admins to manage members, catalogs, and workspace settings
5. Offer a Chrome extension for quick in-browser time tracking

---

## User Roles & Permissions

| Role     | Access                                              |
| -------- | --------------------------------------------------- |
| OWNER    | Full control — workspace creation, all management   |
| ADMIN    | Member management, catalogs, settings, analytics    |
| MANAGER  | View team analytics and members, limited management |
| EMPLOYEE | Time tracking and personal profile only             |

---

## Major Features / Modules

### Time Tracking

- Live start/stop timer (centisecond precision)
- Manual time entry creation and editing
- Duplicate entries feature
- Timer presets (up to 10 per workspace, saves project/tag/billable config)
- Day / Week / Month views with date navigation
- Calendar view of time entries
- Offline queue support for entries when offline

### Analytics

- Heatmap and chart visualizations (Recharts)
- Scoped to: workspace-wide, department, or individual member
- Member performance comparison metrics
- Shareable performance links per member (`/performance/$token`)

### Workspace Management

- Multi-workspace support (users can belong to multiple)
- Role-based access control (OWNER → ADMIN → MANAGER → EMPLOYEE)
- Customizable timezone (default: Asia/Manila), billable rate, and currency (default: PHP)
- Theme color customization (primary color picker)
- Token-based workspace invitations with expiry and revocation

### Catalog Management

- **Clients** — client entities (ACTIVE/INACTIVE)
- **Projects** — linked to clients, with color and archive support
- **Tags** — for categorizing time entries, with colors and archive
- **Departments** — team groupings with optional head member
- **Roles** — custom workspace roles with permission level and color
- **Cohorts** — member groupings scoped to departments

### Member Management

- Email-based invites with role and department pre-assignment
- Member status: INVITED → ACTIVE → DISABLED
- Per-member billable rate override (falls back to workspace default)
- Pending invites panel
- Individual member analytics and detail view

### HR & Employee Profiles

- Personal info: name, birth date, gender, marital status, contact
- Address info: street, building, city, province, postal code
- Employment: position title, employment type, employment status, hire date, regularization date, separation date, employee number
- Government IDs: SSS, PhilHealth (PHIC), TIN, Pag-IBIG (PHMD)
- Profile photo via ImageKit

### Audit Logs & Activity

- All workspace actions tracked: actor, action type, target, timestamp
- Separate audit-logs and activity views

### Google Sheets Integration

- Service account auth (client_email + private_key)
- Batched sync queue: 30s window, max 100 entries
- Syncs: time entries, members, projects, clients, departments, tags, cohorts
- CRON endpoint: `POST /api/cron/sync-gsheets`
- Workspace owner pastes Sheet URL in settings and shares as Editor with service account email
- Tracks last sync timestamp and synced-by user

### Authentication

- Better Auth — email/password only
- Password reset via 15-min email link
- Session tokens with secure cookies
- Cross-site cookie handling (SameSite=None in production) for Chrome extension

### Chrome Extension

- Manifest V3, side panel UI
- Start/stop timers from any browser tab
- Background service worker + content script on all URLs
- Connects to `localhost:3000` (dev) or `flow-track-theta.vercel.app` (prod)

---

## Tech Stack

### Frontend

- **Framework:** TanStack Start (React 19, SSR, file-based routing)
- **Router:** TanStack Router
- **State / Data:** TanStack Query, TanStack Form, Zod
- **UI:** shadcn/ui, Radix UI, Tailwind CSS v4, Lucide React, Tabler Icons
- **Tables:** TanStack Table (React Table v8)
- **Charts:** Recharts
- **Animation:** Motion library

### Backend

- **Server functions:** TanStack Start
- **ORM:** Drizzle ORM (PostgreSQL dialect)
- **DB:** Neon (serverless PostgreSQL), PgBouncer for pooling
- **Auth:** Better Auth with Drizzle adapter
- **Email:** Nodemailer (SMTP — Brevo/SendGrid/Mailgun compatible)
- **Image uploads:** ImageKit

### DevOps

- **Package manager:** pnpm
- **Build:** Vite + TanStack Router plugin
- **Hosting:** Vercel (serverless)
- **Migrations:** drizzle-kit (`pnpm db:generate`, `pnpm db:migrate`, `pnpm db:push`, `pnpm db:studio`)
- **Testing:** Vitest
- **Linting/formatting:** ESLint, Prettier
- **Git hooks:** Husky + lint-staged

---

## Data Model (22 tables, 7 enums)

### Enums

- `Gender`: MALE, FEMALE, NON_BINARY, PREFER_NOT_TO_SAY
- `MaritalStatus`: SINGLE, MARRIED, SEPARATED, WIDOWED, DIVORCED
- `RolePermission`: OWNER, ADMIN, MANAGER, EMPLOYEE
- `ClientStatus`: ACTIVE, INACTIVE
- `MemberStatus`: INVITED, ACTIVE, DISABLED
- `EmploymentType`: FULL_TIME, PART_TIME, CONTRACTOR, INTERN, PROBATIONARY
- `EmploymentStatus`: ACTIVE, ON_LEAVE, RESIGNED, TERMINATED

### Key Tables

| Table                     | Purpose                                                         |
| ------------------------- | --------------------------------------------------------------- |
| `users`                   | Core user identity (Better Auth)                                |
| `sessions`                | Session tokens with expiry                                      |
| `accounts`                | OAuth provider links                                            |
| `verifications`           | Email verification tokens                                       |
| `user_profiles`           | Personal info (name, birth date, gender, contact)               |
| `user_addresses`          | Address info (city, province, etc.)                             |
| `workspaces`              | Tenant unit (name, slug, timezone, rates, Google Sheet URL)     |
| `workspace_roles`         | Custom roles per workspace                                      |
| `workspace_members`       | User ↔ workspace join (role, status, billable rate, department) |
| `workspace_invites`       | Token-based invitations                                         |
| `departments`             | Team groupings                                                  |
| `cohorts`                 | Member sub-groupings within departments                         |
| `cohort_members`          | Cohort ↔ member join                                            |
| `clients`                 | Client records                                                  |
| `projects`                | Projects linked to clients                                      |
| `tags`                    | Time entry categorization                                       |
| `time_entries`            | Core tracked hours (start/end, duration, billable, project)     |
| `time_entry_tags`         | Entry ↔ tag join                                                |
| `employee_profiles`       | Employment details                                              |
| `employee_government_ids` | SSS, PHIC, TIN, PHMD per employee                               |
| `performance_share_links` | Shareable analytics tokens                                      |
| `audit_logs`              | All workspace actions                                           |

**Key design patterns:**

- Tenant isolation: every business table has `workspaceId` FK
- Soft deletes: `archived` boolean on projects and tags
- Status enums on members and employment
- Unique constraints on workspace-scoped names

---

## Route Map

| Path                                  | Description                | Access        |
| ------------------------------------- | -------------------------- | ------------- |
| `/`                                   | Landing page               | Public        |
| `/lounge`                             | Demo/lounge page           | Public        |
| `/auth`                               | Sign in / sign up          | Public        |
| `/auth/forgot-password`               | Request password reset     | Public        |
| `/auth/reset-password`                | Reset via token            | Public        |
| `/invite/$token`                      | Accept workspace invite    | Public        |
| `/onboarding`                         | Create/configure workspace | Authenticated |
| `/app`                                | Authenticated layout shell | Authenticated |
| `/app/time-tracker`                   | Timer (default week view)  | Authenticated |
| `/app/time-tracker/day`               | Day view                   | Authenticated |
| `/app/time-tracker/week`              | Week view                  | Authenticated |
| `/app/time-tracker/month`             | Month view                 | Authenticated |
| `/app/analytics`                      | Analytics dashboard        | Authenticated |
| `/app/calendar`                       | Calendar view              | Authenticated |
| `/app/my-performance`                 | Personal performance       | Authenticated |
| `/app/profile`                        | User profile & employment  | Authenticated |
| `/app/audit-logs`                     | Audit log                  | Admin         |
| `/app/workspace/members`              | Member list                | Admin         |
| `/app/workspace/members/$memberId`    | Member detail + analytics  | Admin         |
| `/app/workspace/catalogs`             | Catalog router             | Admin         |
| `/app/workspace/catalogs/clients`     | Client catalog             | Admin         |
| `/app/workspace/catalogs/projects`    | Project catalog            | Admin         |
| `/app/workspace/catalogs/tags`        | Tag catalog                | Admin         |
| `/app/workspace/catalogs/departments` | Department catalog         | Admin         |
| `/app/workspace/catalogs/roles`       | Role catalog               | Admin         |
| `/app/workspace/catalogs/cohorts`     | Cohort catalog             | Admin         |
| `/app/workspace/settings`             | Workspace settings         | Admin         |
| `/app/workspace/activity`             | Activity log               | Admin         |
| `/performance/$token`                 | Shareable member perf link | Public        |
| `/api/auth/$`                         | Better Auth catch-all      | Internal      |
| `/api/health`                         | Server health check        | Public        |
| `/api/cron/sync-gsheets`              | Scheduled GSheets sync     | Internal/Cron |

---

## Notable Architecture Patterns

1. **SSR with TanStack Start** — full-stack React with server functions
2. **Multi-tenant isolation** — `workspaceId` on every business table
3. **Token-based invitations** — email links with expiry and revocation
4. **Batched GSheets sync** — queue system (30s window, 100 entry max)
5. **RBAC hierarchy** — OWNER > ADMIN > MANAGER > EMPLOYEE
6. **Offline queue** — client-side queue for timer entries when offline
7. **Chrome Extension** — cross-origin authenticated communication (SameSite=None)
8. **Audit logging** — all workspace actions tracked with actor + timestamp
9. **Currency formatting** — locale-aware (en-PH), defaults to PHP
10. **ImageKit** — for profile photo uploads (optional; can paste URL instead)
