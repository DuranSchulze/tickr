# Clockify Timer

Internal time tracking platform for Duran File Pino. Designed for professional services billing — employees log hours against workspaces, projects, tags, departments, and billable status. Managers and owners get cross-team analytics, payroll-ready employee profiles, and automated Google Sheets exports for reporting and billing cycles.

## Key Features

- Time tracking — start/stop timer, manual entry, duplicate, live centisecond display
- Project tasks — create, select, and delete tasks under projects; all workspace roles can manage tasks
- Multi-view dashboard — day, week, and month views with date navigation
- Preset configurations — save up to 10 timer presets (client, project, task, tags, billable) per workspace
- Suspicious login alerts — emailed when signing in from a new IP address
- Analytics — heatmap and charts scoped to workspace, department, or personal
- Member management — invite, role assignment, per-member analytics and billable rates
- Catalog management — clients, projects, tags, departments, and cohorts
- Role-based access — Owner and Admin roles for workspace and member management; standard Authenticated access for time tracking and personal profile
- Google Sheets sync — export time entries, members, and catalog data via service account
- Workspace invites — token-based invitations with role assignment and expiry
- Theme customization — primary color picker and dark/light mode toggle
- Editorial design system — warm cream canvas, ink type, pill buttons, whisper elevation; see [`docs/ui-design-system.md`](docs/ui-design-system.md)
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
- **Email** — Resend (primary) with Nodemailer SMTP fallback
- **Package manager** — pnpm
- **Hosting & deployment** — DigitalOcean App Platform from [`.do/app.yaml`](#hosting--deployment), with GitHub Actions CI

---

## Hosting & Deployment

Production runs on **DigitalOcean App Platform** (the `tickr` app) from the app spec in [`.do/app.yaml`](.do/app.yaml), and the database lives in **Neon**. GitHub Actions runs the checks; DigitalOcean builds and deploys the app.

| Piece         | How it works                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hosting       | DigitalOcean App Platform, app `tickr`, a single `web` service (Node.js, HTTP port `3000`, `apps-s-1vcpu-1gb`) that runs `node .output/server/index.mjs`                                                                       |
| Domains       | `https://trackly.ph` (primary, also the Better Auth base URL) and `https://time-track.buildvault.live`                                                                                                                         |
| Database      | Neon Postgres, managed separately from the host and reached through `DATABASE_URL` (`DIRECT_URL` for drizzle-kit)                                                                                                              |
| CI            | GitHub Actions on every pull request and push to `main`                                                                                                                                                                        |
| CD            | App Platform auto-deploys the `web` service whenever `main` moves; the build command comes from `.do/app.yaml`. The GitHub repository connection and branch are configured in the App Platform dashboard, not in the spec file |
| Configuration | Non-secret settings live in `.do/app.yaml`; secrets (`BETTER_AUTH_SECRET`, database URLs, `RESEND_API_KEY`, `VITE_SENTRY_DSN`, Google service-account keys) live in the App Platform dashboard                                 |

### What GitHub Actions runs

| Workflow                                                 | Trigger                         | What it checks                                                                                                                |
| -------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`check.yml`](.github/workflows/check.yml)               | Pull requests, pushes to `main` | `typecheck`, `lint`, `test`, and `build`, plus a separate `performance` job that enforces the bundle budgets (`pnpm perf:ci`) |
| [`commitlint.yml`](.github/workflows/commitlint.yml)     | Pull requests                   | Conventional Commit messages                                                                                                  |
| [`react-doctor.yml`](.github/workflows/react-doctor.yml) | Pull requests, pushes to `main` | React security, performance, correctness, and accessibility scan                                                              |
| [`android.yml`](.github/workflows/android.yml)           | Changes under `mobile/**`       | Builds the Android app                                                                                                        |
| [`release.yml`](.github/workflows/release.yml)           | A `v*` tag or manual run        | Publishes the Android APK/AAB to a GitHub Release                                                                             |

### Deploying

1. Merge to `main` once the checks are green. App Platform deploys whatever lands on `main` and does **not** wait for GitHub Actions, so the checks are the merge gate, not the deploy trigger.
2. DigitalOcean runs the build command from `.do/app.yaml` (`pnpm install --frozen-lockfile && pnpm build`) and restarts the `web` service. Build and deploy status is in **DigitalOcean → Apps → tickr → Activity**.
3. Verify the deploy with `curl -sS https://trackly.ph/api/health`. It returns `{"status":"ok",...}` only when the app can reach Neon.
4. To roll back, redeploy the last known-good build from the **Activity** tab. An app rollback never touches database data — see [docs/backup-monitoring-recovery.md](docs/backup-monitoring-recovery.md).

The Android app ships separately through GitHub Releases and is not part of the web deploy. See [mobile/RELEASING.md](mobile/RELEASING.md).

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

# Email — Resend (primary) with optional SMTP fallback
RESEND_API_KEY=        # https://resend.com/api-keys
RESEND_FROM=           # verified domain from address (e.g. "Trackly <noreply@yourdomain.com>")
# SMTP_HOST=           # fallback SMTP server (optional, used if Resend fails)

# Google Sheets sync (Option A — recommended)
# Copy client_email and private_key from the service-account JSON downloaded
# from Google Cloud Console → IAM → Service Accounts → Keys → Add Key → JSON
GOOGLE_CLIENT_EMAIL=
GOOGLE_PRIVATE_KEY=   # keep the \n escapes in the key value
```

See [docs/google-sheets-integration.md](docs/google-sheets-integration.md) for the full Google Sheets setup guide.

For external systems that need read-only workspace data, see [docs/api-integrations.md](docs/api-integrations.md).

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

## Build an Android APK

Install Node.js 22+, pnpm 10.10.0, JDK 21, and Android SDK Platform 36 with the
platform and build tools. Run `pnpm install --frozen-lockfile` from the repository
root.

Create `mobile/.env` with the HTTPS origin the app should open. Use your
deployment's origin if it differs from this example.

```dotenv
MOBILE_SERVER_URL=https://timetrackly.com
```

Check the toolchain and compile the debug APK from the repository root. The
commands load `mobile/.env` automatically. Exported shell variables take
precedence.

```sh
pnpm --dir mobile run doctor
pnpm --dir mobile build:apk
```

The build exports `mobile/dist/Tickr-debug.apk` and `mobile/dist/SHA256SUMS.txt`.
Install the APK on a connected Android 10+ test device with
`adb install -r mobile/dist/Tickr-debug.apk`. See the [Android setup guide](mobile/README.md)
for emulator builds and the [release guide](mobile/RELEASING.md) for production signing.

---

## All pnpm Scripts

| Command            | Description                                         |
| ------------------ | --------------------------------------------------- |
| `pnpm dev`         | Start the development server on port 3000           |
| `pnpm build`       | Build for production                                |
| `pnpm preview`     | Preview the production build locally                |
| `pnpm test`        | Run all Vitest unit tests + the performance guard   |
| `pnpm lint`        | Run ESLint (zero-warning policy)                    |
| `pnpm lint:commit` | Lint commit messages against Conventional Commits   |
| `pnpm format`      | Check formatting with Prettier                      |
| `pnpm check`       | Auto-fix formatting and lint issues                 |
| `pnpm typecheck`   | Type-check with `tsc --noEmit`                      |
| `pnpm perf:bundle` | Check client bundle size against the budgets        |
| `pnpm check-all`   | Run typecheck + lint + tests (the mergeable bar)    |
| `pnpm db:generate` | Generate a new migration file after schema changes  |
| `pnpm db:migrate`  | Apply pending migrations to the database            |
| `pnpm db:push`     | Push schema directly to DB without a migration file |
| `pnpm db:studio`   | Open Drizzle Studio to browse/edit data             |
| `pnpm db:seed`     | Run the database seed script                        |

---

## Pre-Commit Hooks

This project uses **Husky** + **lint-staged** to run checks before each commit. The following commands are automatically executed on staged files:

Commit **messages** are validated too — see [Commit Message Convention](#commit-message-convention).

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

## Commit Message Convention

Every commit must follow [Conventional Commits](https://www.conventionalcommits.org):

```
<type>(<optional scope>): <subject>
```

The type is lowercase and must be one of:

| Type       | Use for                                         |
| ---------- | ----------------------------------------------- |
| `feat`     | A new feature                                   |
| `fix`      | A bug fix                                       |
| `docs`     | Documentation only                              |
| `style`    | Formatting — no change to code behaviour        |
| `refactor` | A code change that is neither a fix nor feature |
| `perf`     | A performance improvement                       |
| `test`     | Adding or fixing tests                          |
| `build`    | Build system or dependency changes              |
| `ci`       | CI configuration and scripts                    |
| `chore`    | Other changes that don't touch `src` or tests   |
| `revert`   | Reverts a previous commit                       |

The subject is required, must not end with a period, and the header must stay under 100 characters. Subject casing is free, so both `feat: Add presets` and `feat: add presets` pass. Merge commits are ignored.

Examples:

```
feat(timer): add manual entry creation
fix: stop the running timer from duplicating
chore(deps): bump eslint
docs(api): document the members search endpoint
```

Enforcement:

- **Locally** — `.husky/commit-msg` runs [commitlint](https://commitlint.js.org) and aborts the commit when the message is invalid, so a bad message can't be pushed.
- **On GitHub** — [`.github/workflows/commitlint.yml`](.github/workflows/commitlint.yml) lints every commit in a pull request. Mark the `commitlint` job as a required status check so the PR can't merge until the messages pass.

The rules live in [`commitlint.config.mjs`](commitlint.config.mjs). Validate manually with:

```bash
# Check a single message
echo "feat: something" | pnpm exec commitlint

# Check the last few commits
pnpm lint:commit --from HEAD~3 --to HEAD --verbose
```

---

## Testing

Testing is organised into seven distinct layers — formatting, lint, types, React
diagnostics, unit/integration tests, performance budgets, and manual testing — each
answering a different question and labelled differently.

| Document                               | Read it for                                                      |
| -------------------------------------- | ---------------------------------------------------------------- |
| **[TEST.md](TEST.md)**                 | How to **run** tests: commands, expected output, troubleshooting |
| **[docs/testing.md](docs/testing.md)** | How testing **works**: layers, conventions, labels, known gaps   |

Quick start:

```bash
pnpm check-all   # typecheck + lint + tests — run this before pushing
pnpm perf:ci     # build + performance budgets
```

**See [TEST.md](TEST.md) for the full runbook**, including:

- every command, what it checks, and how long it takes;
- how to run a single file, a directory, or a test by name;
- the current expected baseline (79 files, 417 tests);
- troubleshooting for the errors you will actually hit;
- what cannot be run locally yet (E2E, coverage, load testing).

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
│   ├── auth.ts              # Better Auth server config
│   ├── auth-client.ts       # Better Auth client
│   ├── auth-validation.ts   # Blocked email domains
│   ├── brand.ts             # BRAND name/constants
│   ├── utils.ts             # cn() utility
│   ├── gsheets/             # Google Sheets service
│   ├── server/
│   │   ├── mailer.ts        # Email delivery (Resend + SMTP)
│   │   ├── auth-security.server.ts  # Suspicious login detection
│   │   ├── geoip.ts         # IP geolocation
│   │   └── tracker/         # Server functions (timer, catalogs, analytics)
│   └── time-tracker/        # Client store, types, presets, query keys
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
