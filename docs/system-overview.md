# System Overview — Trackly

> **Trackly** (formerly "Tickr" / "Time Tracker") — internal workspace time tracking platform by Duran File Pino. Professional services billing: employees log hours against workspaces, projects, tags, departments, and billable status. Managers and owners get cross-team analytics, payroll-ready employee profiles, and automated Google Sheets exports.

---

## Branding & Configuration

All brand values live in a single source-of-truth file:

**`src/lib/brand.ts`**

| Field         | Value                                 | Purpose                                                                     |
| ------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| `name`        | `'Trackly'`                           | Product/brand name — used in nav bars, page titles, email subjects, footers |
| `tagline`     | `'Workspace time tracking'`           | Shown next to the logo in navigation                                        |
| `description` | `'Workspace time tracking for teams'` | Email footers, meta descriptions                                            |
| `logoSrc`     | `'/2.svg'`                            | Path relative to `/public` (or an absolute URL)                             |
| `logoAlt`     | `'Trackly logo'`                      | Alt text for the logo image                                                 |

> **To rebrand:** edit these six values. Every UI component, email template, page title, action label, and 404 page reads from `BRAND.*`. Static files that can't import JS (manifest.json) need manual updates — see [Branded Static Assets](#branded-static-assets) below.

### Components that consume `BRAND`

| Component / File                            | What it shows                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Navbar.tsx`                                | `{BRAND.name}` + `{BRAND.tagline}` in the app shell header                                                   |
| `MarketingNavbar.tsx`                       | `{BRAND.name}` on the landing page header                                                                    |
| `AppLogo.tsx`                               | `{BRAND.logoSrc}` / `{BRAND.logoAlt}` — logo mark in a rounded container                                     |
| `AuthSplitLayout.tsx`                       | Sidebar with `{BRAND.logoSrc}` / `{BRAND.logoAlt}` + `{BRAND.name}` link, and `© {year} {BRAND.name}` footer |
| `DashboardHeader.tsx`                       | `<h1>{BRAND.name}</h1>` heading above the time tracker dashboard                                             |
| `PublicPerformancePage.tsx`                 | `"Powered by {BRAND.name}"` footer on shared performance pages                                               |
| `404 pages` (`__root.tsx`, `router.tsx`)    | `"Go to {BRAND.name}"` button                                                                                |
| `time-tracker/index.tsx` (route)            | Page `<title> = BRAND.name`                                                                                  |
| `changelog.tsx`                             | Page `<title> = "Changelog — BRAND.name"` + body text                                                        |
| `my-performance.tsx`                        | Page `<title> = "My Performance — BRAND.name"`                                                               |
| `mailer.ts`                                 | Email `From:` address uses `{BRAND.name}`                                                                    |
| `suspicious-login.ts` / `reset-password.ts` | Email subjects, body text, HTML headers, footers all use `{BRAND.name}`                                      |
| `invite.$token.tsx`                         | Invitation page                                                                                              |
| `onboarding.tsx`                            | Workspace creation wizard                                                                                    |
| `auth/index.tsx`                            | Sign-in page                                                                                                 |

### Branded static assets

These files contain brand name strings directly (they can't import `BRAND`):

| File                                       | What to update                                |
| ------------------------------------------ | --------------------------------------------- |
| `src/features/announcements/manifest.json` | `"title"`, `"description"`, `"label"` strings |
| `README.md`                                | `RESEND_FROM` example value and header name   |
| `package.json`                             | `"name"` field (npm package name)             |

---

## Recent Changes

### 1. Manual Entry Panel — Blank Default State

**Files changed:** `src/components/time-tracker/dashboard/hooks/useDraftAndEdit.ts`, `src/components/time-tracker/dashboard/utils.ts`

**Problem:** Opening the manual entry panel pre-selected the first active client, its first project, and the first tag. The user had to clear these before entering a fresh manual time entry.

**Fix:** `useDraftAndEdit.ts` now calls `emptyDraft()` with no arguments instead of passing `initialClientId`, `initialProject`, and `state.tags[0]?.id`. The `resetDraft()` function and `editingDraft` initial state were updated the same way.

- Removed `activeClients`, `initialClientId`, `initialProject` variables — they were only used to pre-fill the draft
- `emptyDraft()` in `utils.ts` already defaults all parameters to `''` when omitted, so calling it bare gives a truly blank draft

### 2. System Rename — Tickr → Trackly

**Scope:** All user-facing "Tickr" strings across the full codebase.

**Files changed (17 occurrences in 8 files):**

- `package.json` — project name → `trackly`
- `README.md` — email from address example
- `forgot-password.tsx` — "Enter the email you use for Tickr"
- `TimeTrackerDashboard.tsx` — PDF report footer
- `suspicious-login.ts` — email subject, body, HTML header, footer (6 spots)
- `reset-password.ts` — email subject, body, HTML header, footer (6 spots)
- `announcements/manifest.json` — onboarding title
- `workspace-export-feature/README.md` — file paths and document text

**Left unchanged intentionally:**

- `announcements/types.ts` — `tickr_onboarding_dismissed`, `tickr_changelog_version` (localStorage keys — renaming would reset existing users' stored state)
- Vercel deployment URLs (`tickr-nu.vercel.app`) — still point to the live deployment

### 3. Brand Consolidation — Single Source of Truth

**Files changed:**

- `src/lib/brand.ts` — expanded from 4 fields to 6 (added `description`)
- `DashboardHeader.tsx` — `"Time Tracker"` → `{BRAND.name}`
- `PublicPerformancePage.tsx` — `"Powered by DFP Time Tracker"` → `Powered by {BRAND.name}`
- `__root.tsx` — `"Go to Time Tracker"` → `Go to {BRAND.name}`
- `router.tsx` — `"Go to Time Tracker"` → `Go to {BRAND.name}`
- `manifest.json` — `"Open Time Tracker"` → `"Open Trackly"` (3 action labels), `"The Time Tracker dashboard"` → `"The Trackly dashboard"`

**Result:** Every UI component that shows the product name now reads from `BRAND.name`. To change it again, edit only `src/lib/brand.ts`.

---

## Key Features

- **Time tracking** — start/stop timer, manual entry, duplicate, live centisecond display
- **Project tasks** — create, select, and delete tasks under projects; all workspace roles can manage tasks
- **Multi-view dashboard** — day, week, month, and "all" views with date navigation
- **Preset configurations** — save up to 10 timer presets (client, project, task, tags, billable) per workspace
- **Suspicious login alerts** — emailed when signing in from a new IP address
- **Analytics** — heatmap and charts scoped to workspace, department, or personal
- **Member management** — invite, role assignment, per-member analytics and billable rates
- **Catalog management** — clients, projects, tags, departments, and cohorts
- **Role-based access** — Owner, Admin, Manager, and Employee roles
- **Google Sheets sync** — export time entries, members, and catalog data
- **Workspace invites** — token-based invitations with role assignment and expiry
- **Theme customization** — primary color picker and dark/light mode toggle
- **Employee profiles** — profile photo upload, employment details, and government ID storage
- **Offline support** — manual entries queued locally and synced on reconnect

---

## Tech Stack

| Layer               | Technology                                                        |
| ------------------- | ----------------------------------------------------------------- |
| **Framework**       | TanStack Start (React SSR) + TanStack Router (file-based routing) |
| **Server state**    | TanStack Query (React Query)                                      |
| **Tables**          | TanStack Table                                                    |
| **Auth**            | Better Auth (email/password, forgot/reset flow)                   |
| **Database**        | Neon (serverless PostgreSQL) + Drizzle ORM                        |
| **UI**              | Tailwind CSS v4 + shadcn/ui + Radix UI primitives                 |
| **Icons**           | Lucide React, Tabler Icons                                        |
| **Charts**          | Recharts                                                          |
| **Forms**           | TanStack Form + Zod                                               |
| **Email**           | Resend (primary) with Nodemailer SMTP fallback                    |
| **Package manager** | pnpm                                                              |

---

## Project Structure

```
src/
├── components/
│   ├── time-tracker/   # All app-specific UI
│   │   ├── dashboard/  # DashboardHeader, TimerPanel, ManualEntryPanel, entries
│   │   ├── analytics/  # AnalyticsScreen, charts, heatmap
│   │   ├── workspace/  # Members, Catalogs, Settings screens
│   │   └── shared/     # AppShell, AppSidebar, Navbar, pickers
│   └── ui/             # shadcn/ui primitives
├── lib/
│   ├── brand.ts             # BRAND name/constants (single source of truth)
│   ├── auth.ts              # Better Auth server config
│   ├── auth-client.ts       # Better Auth client
│   ├── auth-validation.ts   # Blocked email domains
│   ├── utils.ts             # cn() utility
│   ├── server/
│   │   ├── mailer.ts        # Email delivery (Resend + SMTP)
│   │   └── tracker/         # Server functions
│   └── time-tracker/        # Client store, types, presets, query keys
├── routes/
│   ├── index.tsx            # Landing page
│   ├── auth/                # Sign in/up, forgot-password, reset-password
│   ├── app/time-tracker/    # Timer, Day, Week, Month views
│   ├── app/analytics/       # Analytics dashboard
│   └── app/workspace/       # Members, Catalogs, Settings
├── db/
│   └── schema.ts            # Drizzle schema
└── styles.css               # Global Tailwind styles
```

---

## Useful Commands

| Command            | Purpose                                |
| ------------------ | -------------------------------------- |
| `pnpm dev`         | Start dev server on port 3000          |
| `pnpm build`       | Production build                       |
| `pnpm test`        | Run Vitest tests                       |
| `pnpm lint`        | Run ESLint                             |
| `pnpm typecheck`   | Run TypeScript type-checking           |
| `pnpm check`       | Auto-fix formatting + lint             |
| `pnpm db:push`     | Push schema to DB (no migration file)  |
| `pnpm db:generate` | Generate migration from schema changes |
| `pnpm db:migrate`  | Apply pending migrations               |
