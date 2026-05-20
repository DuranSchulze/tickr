# Clockify Timer

Internal time tracking platform for Duran File Pino. Designed for professional services billing — employees log hours against workspaces, projects, tags, departments, and billable status. Managers and owners get cross-team analytics, payroll-ready employee profiles, and automated Google Sheets exports for reporting and billing cycles.

## Key Features

- Time tracking — start/stop timer, manual entry, duplicate, live centisecond display
- Multi-view dashboard — day, week, and month views with date navigation
- Preset configurations — save up to 10 timer presets (project, tags, billable) per workspace
- Analytics — heatmap and charts scoped to workspace, department, or personal
- Member management — invite, role assignment, per-member analytics and billable rates
- Catalog management — clients, projects, tags, departments, and cohorts
- Role-based access — Owner and Admin roles for workspace and member management; standard Authenticated access for time tracking and personal profile
- Google Sheets sync — export time entries, members, and catalog data via service account
- Workspace invites — token-based invitations with role assignment and expiry
- Theme customization — primary color picker and dark/light mode toggle
- Employee profiles — profile photo upload, employment details, and government ID storage (SSS, PhilHealth, TIN, Pag-IBIG)

---

## Tech Stack

- **Framework** — TanStack Start (React SSR) + TanStack Router (file-based)
- **Server state** — TanStack Query (React Query)
- **Tables** — TanStack Table
- **Auth** — Better Auth (email/password, forgot/reset flow)
- **Database** — Neon (serverless PostgreSQL) + Drizzle ORM
- **UI** — Tailwind CSS v4 + shadcn/ui + Radix UI primitives
- **Icons** — Lucide React, Tabler Icons
- **Charts** — Recharts
- **Forms** — TanStack Form + Zod
- **Email** — Nodemailer
- **Package manager** — pnpm

---

## Getting Started

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in the values:

```env
# Database — Neon connection strings
# Pooled URL (used at runtime via PgBouncer)
DATABASE_URL="postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require"
# Direct URL (used by drizzle-kit for migrations)
DIRECT_URL="postgresql://user:password@ep-xxx.neon.tech/neondb?sslmode=require"

# Auth
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=   # generate with: pnpm dlx @better-auth/cli secret

# Google Sheets sync (Option A — recommended)
# Copy client_email and private_key from the service-account JSON downloaded
# from Google Cloud Console → IAM → Service Accounts → Keys → Add Key → JSON
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=   # keep the \n escapes in the key value
```

See [docs/google-sheets-integration.md](docs/google-sheets-integration.md) for the full Google Sheets setup guide.

### 3. Apply the database migration

Run this once to create all tables in your Neon database:

```bash
pnpm db:migrate
```

This applies the SQL from `drizzle/` to your Neon database. You must run this before starting the dev server — without it, the app will error with `relation "sessions" does not exist`.

### 4. Start the dev server

```bash
pnpm dev
```

The app runs at **http://localhost:3000**.

---

## All pnpm Scripts

| Command            | Description                                         |
| ------------------ | --------------------------------------------------- |
| `pnpm dev`         | Start the development server on port 3000           |
| `pnpm build`       | Build for production                                |
| `pnpm preview`     | Preview the production build locally                |
| `pnpm test`        | Run Vitest tests                                    |
| `pnpm lint`        | Run ESLint                                          |
| `pnpm format`      | Check formatting with Prettier                      |
| `pnpm check`       | Auto-fix formatting and lint issues                 |
| `pnpm db:generate` | Generate a new migration file after schema changes  |
| `pnpm db:migrate`  | Apply pending migrations to the database            |
| `pnpm db:push`     | Push schema directly to DB without a migration file |
| `pnpm db:studio`   | Open Drizzle Studio to browse/edit data             |
| `pnpm db:seed`     | Run the database seed script                        |

---

## Pre-Commit Hooks

This project uses **Husky** + **lint-staged** to run checks before each commit. The following commands are automatically executed on staged files:

**For `.ts` and `.tsx` files:**

- `eslint --fix --max-warnings 0 --no-warn-ignored`
- `prettier --write`

**For `.json`, `.md`, `.css`, `.yml`, `.yaml` files:**

- `prettier --write`

### Run checks manually before committing

To avoid commit failures, run these commands before `git commit`:

```bash
# Fix and format everything
pnpm check

# Or run individually:
pnpm lint          # Check ESLint
pnpm format        # Check Prettier formatting
```

---

## Adding shadcn/ui Components

```bash
pnpm dlx shadcn@latest add <component>
```

Example:

```bash
pnpm dlx shadcn@latest add dialog
pnpm dlx shadcn@latest add table
```

---

## Project Structure

```
src/
├── components/
│   ├── time-tracker/   # All app-specific UI
│   │   ├── dashboard/  # TimeTrackerDashboard, TimerPanel, EntriesSection
│   │   ├── analytics/  # AnalyticsScreen, charts, heatmap
│   │   ├── workspace/  # Members, Catalogs, Settings screens
│   │   └── shared/     # AppShell, AppSidebar, Navbar, pickers
│   └── ui/             # shadcn/ui primitives
├── integrations/
│   └── tanstack-query/ # TanStack Query root provider and devtools
├── lib/
│   ├── auth.ts         # Better Auth server config
│   ├── auth-client.ts  # Better Auth client
│   ├── utils.ts        # cn() utility
│   ├── gsheets/        # Google Sheets service (auth.server.ts, sync.server.ts)
│   └── time-tracker/   # store.ts (pure utils) + types.ts
├── routes/
│   ├── index.tsx               # Landing page (/)
│   ├── lounge.tsx              # Public lounge page
│   ├── auth/                   # Sign in/up, forgot-password, reset-password
│   ├── invite/$token.tsx       # Workspace invite acceptance
│   ├── onboarding/             # Workspace creation wizard
│   ├── app.tsx                 # Authenticated layout shell (/app)
│   ├── app/time-tracker/       # Timer, Day, Week, Month views
│   ├── app/analytics/          # Analytics dashboard
│   ├── app/workspace/          # Members (with $memberId), Catalogs, Settings
│   ├── app/profile.tsx         # User profile
│   └── api/auth/$.ts           # Better Auth API handler — do not delete
├── db/
│   └── schema.ts               # Drizzle schema (22 tables, 8 enums)
├── db.ts                       # Drizzle client (node-postgres pool)
└── styles.css                  # Global Tailwind styles
drizzle/
└── *.sql                       # Migration files managed by drizzle-kit
```

---

## Routes

| Path                               | Description                             | Access        |
| ---------------------------------- | --------------------------------------- | ------------- |
| `/`                                | Landing page                            | Public        |
| `/lounge`                          | Public lounge page                      | Public        |
| `/auth`                            | Sign in / Sign up                       | Public        |
| `/auth/forgot-password`            | Request a password reset link           | Public        |
| `/auth/reset-password`             | Reset password via emailed token        | Public        |
| `/invite/$token`                   | Accept a workspace invitation           | Public        |
| `/onboarding`                      | Create and configure a new workspace    | Authenticated |
| `/app/time-tracker`                | Timer (week view default)               | Authenticated |
| `/app/time-tracker/day`            | Day view                                | Authenticated |
| `/app/time-tracker/week`           | Week view                               | Authenticated |
| `/app/time-tracker/month`          | Month view                              | Authenticated |
| `/app/analytics`                   | Analytics dashboard                     | Authenticated |
| `/app/workspace/members`           | Manage workspace members                | Owner / Admin |
| `/app/workspace/members/$memberId` | Individual member detail and analytics  | Owner / Admin |
| `/app/workspace/catalogs`          | Manage clients, projects, tags, depts   | Owner / Admin |
| `/app/workspace/settings`          | Workspace settings and Google Sheets    | Owner / Admin |
| `/app/profile`                     | Personal profile and employment details | Authenticated |

---

## Database Workflow

After editing `src/db/schema.ts`:

```bash
# Generate a new migration file from schema changes
pnpm db:generate

# Apply the migration to the database
pnpm db:migrate
```

Browse data visually:

```bash
pnpm db:studio
```

---

## Auth Setup

Better Auth is pre-configured with email/password. The API handler lives at `src/routes/api/auth/$.ts` — do not delete or modify this file without checking the [Better Auth docs](https://www.better-auth.com).

Generate a secret for `BETTER_AUTH_SECRET`:

```bash
pnpm dlx @better-auth/cli secret
```
