# Implementation analysis — lowest-effort path to cross-platform Trackly + offline mode

**Feature:** `offline-first-mobile-app` · **Doc:** Engineering analysis v1 · **Date:** 2026-11-05
**Author:** Lazy Developer (engineering) · **Status:** Draft for PRD v2 / adversarial review
**Evidence baseline:** working tree at commit `05e24a2` (2026-11-03), with 6 unrelated uncommitted export edits present. Every count in this document was measured on that tree on 2026-11-05; commands are listed in [Appendix A](#appendix-a--evidence-log).
**Related:** [Epic](../../epic.md) · [PRD](../prd.md) · [Research](../research/platform-feasibility.md)

Everything below labelled **(est.)** is an estimate, not a measurement. Est. ranges assume **one senior full-stack engineer already familiar with this repo**, 1 dev-week = 5 focused days, and exclude PM/design time, IT/MDM enrollment work, and device procurement. Ranges are roughly ±40% until the M0 instrumentation exists.

---

## 0. TL;DR

**Recommendation: Strategy A — keep the existing React app, harden offline, then ship it inside an Android Capacitor shell that loads the production web app (`server.url`), distributed via Android Enterprise/MDM. iOS stays an installable PWA until a written gate passes. No React Native, no monorepo, no sync engine, no new API.**

| Question                         | Answer (est.)                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New UI code                      | **0** — the 54k LOC React UI, 42 pages, 289 `.tsx` files ship as-is                                                                                                               |
| New server code                  | **~1 nullable DB column + unique index, ~60–100 lines** across 4 existing server functions for idempotency                                                                        |
| New offline code                 | **~8–12 files, ~1,000–1,700 lines net** (IndexedDB queue adapter, cache persister wiring, sync coordinator, status UI, encryption helper)                                         |
| New shell code                   | **one `mobile/` Capacitor project** (~2–3 plugin deps, config, signing)                                                                                                           |
| Total path to managed-Android v1 | **9–16.5 dev-weeks (est.)**, excluding IT/MDM setup and QA device time                                                                                                            |
| React Native alternative         | **22–40 dev-weeks (est.)** initial + permanent dual maintenance — see §4                                                                                                          |
| Biggest risk                     | Offline cold boot in the Android WebView (`server.url` + service worker), not the queue                                                                                           |
| Biggest "do not build"           | **A sync engine / local-first database (WatermelonDB, PowerSync, CRDT).** The 4 mutation types and one queried state tree do not justify replacing the server as source of truth. |

The web app is already 70% of an offline-first app: mutations queue in `localStorage`, optimistic ids are mapped on replay, `networkMode: 'offlineFirst'` is the Query default, a service worker caches build assets and an offline page, and a PWA manifest exists. The missing 30% is durability (IndexedDB + idempotency), honesty (never silently drop), reachability (replay outside the tracker dashboard), and boot (offline cold start currently fails). That is a hardening project, not a rewrite.

---

## 1. How this analysis was produced

- Read the real code paths that make offline work (or not): `src/lib/time-tracker/offline-queue.ts`, `pending-entries.ts`, `useNetworkStatus.ts`, `device-location.ts`, `src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx`, `hooks/useTimerCore.ts`, `src/lib/server/tracker/*.server.ts`, `src/routes/app.tsx`, `src/routes/app/time-tracker/index.tsx`, `src/routes/app/timesheet.tsx`, `src/integrations/tanstack-query/root-provider.tsx`, `public/sw.js`, `public/favicon/site.webmanifest`, `src/routes/__root.tsx`, `src/lib/auth.ts`, `vercel.json`, `perf/bundle-budget.config.json`, `docs/testing.md`, `.github/workflows/check.yml`.
- Counted coupling with `find`/`grep` (routes, `createServerFn`, `localStorage`, `window`/`document`/`navigator`, heavy libraries, test files, migrations). Counts, not vibes.
- Ran the existing offline-adjacent unit tests to confirm the harness works before assuming it can be extended: **3 files / 14 tests pass** (`pending-entries`, `device-location`, `useNetworkStatus`), Vitest 3.2.4.
- Verified the four replay/durability findings the Lead flagged: (a) no client mutation id on either duplicate-prone mutation, (b) rejected items are silently removed, (c) queue is `localStorage`-only, (d) timestamp clamping/tolerance rules. Details in §3.4 and the risk table (§11).
- Deliberately did **not** run a production build or performance gate (writes build artifacts); bundle evidence comes from the committed budgets in `perf/bundle-budget.config.json`.

Scope of this document: engineering feasibility, strategy, milestones, estimates, risks, decisions. Product behaviour is the PRD; platform/MDM/store research is the research report.

---

## 2. Current architecture map (as-is)

### 2.1 Stack and topology

| Layer          | What is actually there                                                                                                                                                                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App framework  | TanStack Start `1.167.39` (SSR) + TanStack Router file routes, React `19.2.5`, TypeScript                                                                                                                                                                                                                                                                       |
| Build/runtime  | Vite `8.0.8` + Nitro `3.0.260415-beta`, Nitro preset `vercel` (else `node-server`), deployed to Vercel `sin1`; serverless function `maxDuration: 30s` (weekly-report cron 60s)                                                                                                                                                                                  |
| Data           | Drizzle ORM `0.45.2` + `@neondatabase/serverless` Postgres; **31 migration files** in `drizzle/`; schema is 1,500 lines in `src/db/schema.ts`                                                                                                                                                                                                                   |
| Auth           | Better Auth `1.6.18`, Drizzle adapter, **cookie sessions** (30-day expiry, 1-day update age), DB-backed rate limits, trusted origins from env; `/api/auth/$` handler; prod cookies `SameSite=None; Secure` (for the Chrome extension iframe)                                                                                                                    |
| Server API     | **136 `createServerFn` definitions across 12 files** (108 in `src/lib/server/tracker.ts`); file-based HTTP routes under `src/routes/api/` (22 files)                                                                                                                                                                                                            |
| Client state   | TanStack Query `5.99.0` (single `QueryClient`, `staleTime: 30s`, `gcTime: 10min`, `networkMode: 'offlineFirst'`), **no persistence plugin**, **0 IndexedDB usage anywhere**                                                                                                                                                                                     |
| UI             | 289 `.tsx` files, ~54k LOC components; 42 user-facing page routes; responsive with `MobileNav` + floating timer + full-screen mobile dialog; 18 `*Screen.tsx`, 10 `*Page.tsx` components                                                                                                                                                                        |
| Charts/maps/3D | Recharts (3 chart modules), MapLibre GL (2 static importers), three.js/postprocessing/ogl (marketing + auth only)                                                                                                                                                                                                                                               |
| Export         | `exceljs` and `jspdf` **dynamically imported**, client-side CSV/Excel/PDF generation (`timesheet-export.ts`, `bulk-report-export.ts`, `member-report-export.ts`)                                                                                                                                                                                                |
| Geo            | `src/lib/time-tracker/device-location.ts` — `navigator.geolocation` + Permissions API, per-workspace toggle, entry origin stored on `time_entries`; **no background geolocation, no camera**                                                                                                                                                                    |
| Integrations   | Read-only external REST API `/api/v1/*` (10 GET resources + 4 auth POSTs), API keys + separate JWT secret, OpenAPI at `/api/openapi.json` (`openapi.server.ts`, 33KB); Chrome MV3 extension (iframe + `postMessage` badge bridge); Xendit webhook; Resend/SMTP email; Vercel crons (`timer-reminders` hourly, `weekly-reports` every 5 min); Google Sheets env  |
| Observability  | Sentry React + TanStackStart (source maps via Vite plugin), client/server configs; web-vitals logging in `Monitoring`; structured `console.log` in crons                                                                                                                                                                                                        |
| Tests/CI       | **103 Vitest files**; `client-dialog.vitest.config.ts` for 4 dialog suites; Playwright `1.60.0` installed but **no config, no `e2e/` suite, no CI job**; CI = typecheck → lint → Vitest → build → bundle budget                                                                                                                                                 |
| PWA            | `public/favicon/site.webmanifest` (standalone, `/app/time-tracker` start URL, maskable icons, shortcuts), `public/offline.html`, `public/sw.js` (~90 lines: cache-first `/_build/*`, network-first navigation → offline page, **API traffic never touched**), prod-only SW registration in `src/routes/__root.tsx`, `usePwaInstall` hook, `beforeinstallprompt` |

### 2.2 How a screen gets its data (the load-bearing pattern)

Every signed-in page is a route file that fetches through **route loaders** into the Query cache:

`route loader` → `queryClient.ensureQueryData`/`fetchQuery` → `createServerFn` POST/GET → Drizzle → Neon.
Components then read the same cache through `useQuery` (74 hook call sites) or route data.

Measured coupling:

- **37 `loader:` definitions**, **21 route files with `beforeLoad`**, 29 loaders under `src/routes/app/`.
- **88 component files import `#/lib/server/*`** (server functions called directly from UI); 46 files carry `'@tanstack/react-start/server-only'`.
- `src/routes/app.tsx` (the signed-in shell) has `beforeLoad` → live `getSessionFn()`, then a loader with `fetchFreshWorkspaceAuthorization` (`staleTime: 0`), self-profile and subscription; its catch-all is:

```ts
} catch {
  throw redirect({ to: '/onboarding', search: { plan: undefined } })
}
```

That catch is why **offline cold start lands on onboarding or an error, not the tracker** — a network failure is indistinguishable from an authorization failure. This is the single highest-value offline fix and it is a few lines, not a rewrite.

### 2.3 Offline today (real, partial, not durable)

- **Queue**: `src/lib/time-tracker/offline-queue.ts` — 4 mutation types (`startTimer`, `stopTimer`, `discardTimer`, `createManualEntry`), optimistic ids, client timestamps (`startedAt`/`endedAt`), device location attached post-hoc, key `offline-queue:${workspaceId}:${memberId}` in **`localStorage`**. Call sites are only 3 files.
- **Pending display copies**: `pending-entries.ts` — `localStorage` copies of stopped entries reconciled against server rows and the queue (`retained`/`confirmed`/`orphaned`).
- **Replay**: a `useEffect` inside `TimeTrackerDashboard.tsx` (~lines 281–380) drains the queue serially when `isOnline` flips; maps optimistic→real ids so a queued stop hits the server id; removes each item **only after `await` succeeds**; on fetch-type failure it breaks and retries on next reconnect; **on any non-network error it removes the item and the optimistic entry and shows a toast**.
- **Network truth**: `useNetworkStatus` = `navigator.onLine` + `online`/`offline` events (4 files use `navigator.onLine`).
- **Query cache**: in-memory only. A reload, OS kill, or WebView process death destroys it — which is exactly the offline scenario.
- **Service worker**: navigation is network-first with `offline.html` fallback, so an offline cold start shows the branded offline page, **not the app**. `/_build/*` is cached; nothing else is.
- **Storage keys in use**: `theme`, `primary-color`, `font`, offline queue, pending entries, plus celebration/announcement flags — 9 files / 23 `localStorage` references; **`indexedDB` appears nowhere**.

### 2.4 Server-side behaviour that offline must respect

- `startTimer` (`src/lib/server/tracker/timer.server.ts:76`) pre-checks for an existing running timer (throws "Stop your current timer before starting a new one"), clamps a future `startedAt` to server now, and inserts with `entrySource: 'TIMER'`, origin capture, and audit logging.
- `stopTimer` (same file, line 253) **returns `null` when the entry is already stopped** — a replayed stop is therefore naturally idempotent; a replayed start or manual entry is not.
- `createManualEntry` (`manual-entries.server.ts:90`) validates ordered times, inserts, refreshes analytics rollups, writes an audit log. It trusts client-supplied times as-is (no future clamp).
- `CLOCK_SKEW_TOLERANCE_MS = 60_000` (`shared/schemas.ts:60`) applies to **timer edits**; offline timer start/stop are clamped into `(startedAt, now]`; manual entries are not clamped.
- Overlap checking exists server-side (`overlap.server.ts`) and client-side (`overlap-confirmation.tsx`).
- Writes fan out to analytics rollups + audit logs. **Any new write path that bypasses these functions is a correctness bug**, which is the main reason not to add a separate sync endpoint.
- Auth: `/api/v1/*` is a **read-only** external contract with its own JWT (`EXTERNAL_API_JWT_SECRET`) and API keys; there is no mobile write API.

### 2.5 What is already mobile-shaped (reuse, don't rebuild)

- Responsive layouts across the app; `MobileNav`, `TimerMobileControls`, full-screen mobile timer dialog; 85 time-tracker TSX files use responsive prefixes.
- Installable PWA with maskable icons, standalone display, shortcuts, offline page, `usePwaInstall` (native install prompt on Chromium, A2HS instructions on iOS).
- `TaskSyncCoordinator` (`src/components/time-tracker/TaskSyncCoordinator.tsx`) already owns cross-tab/cross-device refresh triggers: BroadcastChannel, `visibilitychange`/`focus`/`pageshow`/`online`, and a 30s pulse poll. Note it is mounted **inside `AppShell`**, which renders only after the `/app` loader succeeds — offline replay cannot rely on that mount point and must reuse the trigger pattern from the root shell instead (see WP5).
- `preload-error-recovery.ts` handles stale/deleted lazy chunks (the classic post-deploy WebView failure) with a sessionStorage-guarded reload.

### 2.6 Diagram (as-is, with the offline gaps marked)

```
                        ┌──────────────────────────── Vercel (sin1) ────────────────────────────┐
  Browser / WebView     │                                                                       │
  ┌──────────────────┐  │  TanStack Start SSR (Nitro)                                           │
  │ React 19 UI      │◄─┼── route loaders ──► createServerFn (136) ──► Drizzle ──► Neon Postgres │
  │ 42 pages, 289 tsx│  │       │                    │                                              │
  │                  │  │       ▼                    ├── audit log + analytics rollups             │
  │ QueryClient      │  │  QueryClient (SSR dehy.)   ├── Better Auth cookie sessions               │
  │ (memory only)    │  │                            └── /api/auth, /api/v1 (read-only, JWT)      │
  │        ▲         │  │                                                                         │
  │        │ 74 hooks│  │  /api/cron/* (2) · /api/webhooks/xendit · /api/openapi.json             │
  │  service worker  │  └───────────────────────────────────────────────────────────────────────┘
  │  sw.js: /_build +│
  │  offline.html,   │   GAPS (verified):
  │  navigation      │   1. no IndexedDB: cache dies on reload/kill; queue evictable
  │  network-first ⚠ │   2. no client mutation id on startTimer / createManualEntry  → duplicates
  │                  │   3. rejected replay = item deleted + toast                   → silent loss
  │  localStorage ⚠  │   4. replay lives in the dashboard component only            → unreachable elsewhere
  │  (queue)         │   5. /app beforeLoad needs live session; catch → /onboarding → no offline boot
  └──────────────────┘   6. SW navigation never caches the app shell                → no offline boot
```

---

## 3. Coupling inventory (measured)

### 3.1 Surface size

| Measure                             | Count                                                                                                                                                                                                                                                             | Where                                                |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Source files                        | 595 (289 `.tsx`, ~298 `.ts` + config)                                                                                                                                                                                                                             | `src/`                                               |
| LOC                                 | routes 5,586 · components 54,184 · lib 36,701 · db 1,500                                                                                                                                                                                                          | `src/`                                               |
| Route files                         | 67 total: 44 `.tsx`, 23 `.ts`                                                                                                                                                                                                                                     | `src/routes/`                                        |
| User-facing pages                   | **42** (33 under `src/routes/app/`, 3 auth, 6 public/redirect) + 2 shells (`__root.tsx`, `app.tsx`)                                                                                                                                                               | `src/routes/`                                        |
| API route files                     | 22 (10 resources under `/api/v1`, 4 auth, 2 cron, health, openapi, docs, newsletter, webhook)                                                                                                                                                                     | `src/routes/api/`                                    |
| `createServerFn` definitions        | **136** across 12 files (108 in `tracker.ts`)                                                                                                                                                                                                                     | `src/lib/server/`                                    |
| Components calling server fns       | **88** `.tsx` files import `#/lib/server/*`                                                                                                                                                                                                                       | `src/components/`                                    |
| SSR-only markers                    | 46 files import `server-only`                                                                                                                                                                                                                                     | `src/`                                               |
| Route loaders / beforeLoad          | 37 / 21 files                                                                                                                                                                                                                                                     | `src/routes/`                                        |
| `useQuery`/`useMutation` call sites | 74 (25 component files use `useQuery`; mutations funnel through `useTrackerMutations`)                                                                                                                                                                            | `src/components/`                                    |
| `localStorage`                      | **9 files / 23 references**                                                                                                                                                                                                                                       | `src/`                                               |
| `indexedDB`                         | **0**                                                                                                                                                                                                                                                             | —                                                    |
| `window`/`document` use             | **75 files** (14 also use `navigator`)                                                                                                                                                                                                                            | `src/`                                               |
| Browser APIs worth noting           | `matchMedia` 14 files, `history` 11, `crypto` 9, clipboard 7, `requestAnimationFrame` 7, `ResizeObserver` 7, `URL.createObjectURL` 6, `IntersectionObserver` 3, `devicePixelRatio` 3, `sessionStorage` 2, `visibilityState` 2, `serviceWorker` 1, `geolocation` 1 | `src/`                                               |
| Heavy libs                          | maplibre-gl (2 static importers, ~245KB gz chunk), three+postprocessing+ogl (marketing/auth), recharts (3 modules, ~102KB gz), exceljs/jspdf (dynamic only, ~250/126KB gz)                                                                                        | `src/components/`, `src/lib/time-tracker/`           |
| Bundle budgets (committed)          | total JS ≤1,950KB, largest chunk ≤400KB, root initial ≤250KB, tracker route ≤150KB, auth route ≤165KB, maplibre route ≤300KB                                                                                                                                      | `perf/bundle-budget.config.json`                     |
| Tests                               | **103 Vitest files**; Playwright installed, no suite/config; CI has no e2e                                                                                                                                                                                        | `src/**/*.test.ts(x)`, `.github/workflows/check.yml` |
| DB migrations                       | 31                                                                                                                                                                                                                                                                | `drizzle/`                                           |

### 3.2 What this coupling means for portability

| Coupling                               | Consequence for porting the UI                                                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 88 components calling `createServerFn` | A native port must re-expose 136 server functions as HTTP endpoints (the read-only `/api/v1` has 10 GET resources; no write endpoints). This alone is a multi-week backend project with a second auth path. |
| 37 route loaders + 21 `beforeLoad`     | Each ported screen must re-implement SSR-time data loading and auth guards; TanStack Router does not exist in React Native.                                                                                 |
| 75 files touching `window`/`document`  | 75 bespoke rewrites of focus, keyboard, clipboard, media-query, animation, and scroll behaviour — the main hidden cost of a native port.                                                                    |
| `maplibre-gl` / three / recharts       | No RN equivalents; each needs a library swap and re-tested rendering (`react-native-maps`/`victory-native`/`expo-gl` are not drop-ins).                                                                     |
| `exceljs` / `jspdf`                    | Client-side export streams must be re-implemented in RN (`expo-file-system` + `xlsx`/`pdf-lib`) or moved server-side — new work either way.                                                                 |
| Better Auth cookie sessions            | RN has no browser cookie jar with the same semantics; the shell would need a token flow and a new auth contract.                                                                                            |
| Offline replay in a page component     | A native app re-implements queue, optimistic ids, replay ordering, and the display copy entirely (there is no DOM/Query cache to reuse).                                                                    |

### 3.3 Screen/route audit (v1 offline scope per the PRD)

| Screen                                                                     | Route file(s) / components                                                                                                                                                             | v1 offline treatment                                                                    | Browser APIs / weight                                                                                             | Notes                                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Time tracker (day/week/month/all)                                          | `app/time-tracker/index.tsx` (+ `day`, `week`, `month` are redirects), `components/time-tracker/dashboard/*` (46 files; `TimeTrackerDashboard.tsx` 796 lines, `useTimerCore.ts` 1,104) | **Offline write + read**                                                                | `localStorage`, `geolocation`, `crypto.randomUUID`, `visibilitychange`, `rAF`, `document.title`, `ResizeObserver` | Heart of MVP; replay, optimistic ids, overlap confirmation already here |
| Timesheet                                                                  | `app/timesheet.tsx` + `TimesheetScreen`                                                                                                                                                | **Offline read (own week)**                                                             | Intl/timezone only                                                                                                | Loader + `fetchFreshWorkspaceAuthorization` must gain cached fallback   |
| Calendar                                                                   | `app/calendar.tsx` + `calendar/*`                                                                                                                                                      | Online-only (team scope)                                                                | Intl                                                                                                              | Keep                                                                    |
| Analytics / overview / department                                          | `app/analytics*.tsx`, `app/department-*.tsx` + `analytics/*`                                                                                                                           | Online-only (explicit non-goal)                                                         | recharts                                                                                                          | Keep; heavy chart chunks stay route-lazy                                |
| Reports                                                                    | `app/reports.tsx` + `reports/*`                                                                                                                                                        | Online-only                                                                             | recharts                                                                                                          | Keep                                                                    |
| My performance                                                             | `app/my-performance.tsx` + `performance/*`                                                                                                                                             | Online-only                                                                             | charts                                                                                                            | Keep                                                                    |
| Workspace catalogs (clients/projects/tasks/tags/departments/roles/cohorts) | 9 catalog route pages + `catalogs-route.ts` + `catalogs/*` (30 files)                                                                                                                  | **Read-only cached catalog pickers** (needed to log offline); no offline admin writes   | minimal                                                                                                           | Cache all five picker catalogs with `updatedAt`; stale after 7 days     |
| Members / member detail                                                    | `app/workspace/members*.tsx` + `screens/MembersScreen/*`                                                                                                                               | Online-only                                                                             | —                                                                                                                 | Keep                                                                    |
| Workspace settings                                                         | `app/workspace/settings.tsx` + `screens/SettingsScreen/*`                                                                                                                              | Online-only; but **offline policy values must be cached** (grace, location toggle)      | file upload (ImageKit) for profile                                                                                | Read settings snapshot at last online session                           |
| Activity / locations / map                                                 | `app/workspace/activity*.tsx`, `locations.tsx` + MapLibre                                                                                                                              | Online-only                                                                             | maplibre-gl (~245KB gz)                                                                                           | Keep out of offline scope                                               |
| Billing / subscription                                                     | `app/workspace/billing.tsx` + subscription components                                                                                                                                  | Online-only (webhook-driven)                                                            | —                                                                                                                 | Cached subscription status only for shell banner                        |
| Profile                                                                    | `app/profile.tsx` + `screens/ProfileScreen/*`                                                                                                                                          | Online-only (avatar upload needs network); profile read may come from cached shell data | ImageKit, file input, `URL.createObjectURL`                                                                       | Keep                                                                    |
| Auth (sign-in / forgot / reset)                                            | `auth/index.tsx` (815 lines!) + 2                                                                                                                                                      | **Online-only; offline = grace gate + "sign in to continue"**                           | password managers, focus                                                                                          | Do not attempt offline sign-in                                          |
| Onboarding / invite / public performance / pricing / lounge / changelog    | 6 public routes                                                                                                                                                                        | Out of scope                                                                            | —                                                                                                                 | Keep                                                                    |
| Chrome extension                                                           | `extension/` iframe of the web app                                                                                                                                                     | Unchanged                                                                               | `postMessage`, `chrome.storage`                                                                                   | Independent surface; unaffected                                         |

**Count for a hypothetical native port:** 42 page routes (30 distinct signed-in app pages + 3 auth + 6 public + shells), 18 named `*Screen` components, 10 `*Page` components, 289 TSX files, 75 browser-API-touching files. The "~70 screens/components that use 75 browser-API touches" framing is directionally right and, if anything, conservative: it counts the screens but not the auth/loader/export/chart/map re-wiring each one needs.

### 3.4 Verified replay/durability findings (the ones that drive M1)

1. **No idempotency key.** `startTimerSchema`/`entryInputSchema` (`shared/schemas.ts:44,38`) carry no client mutation id; `time_entries` (`src/db/schema.ts:1073`) has no dedupe column. The queue item's own `id` (a `crypto.randomUUID()`) exists but is never sent to the server. Replay removes the queue item only after `await` succeeds, so **a commit whose response is lost replays into a duplicate manual entry**, while a replayed `startTimer` hits the "timer already running" pre-check and errors instead.
2. **Silent loss path.** Any non-network rejection runs `removeOfflineQueueItem(...)` + `removeOptimisticStoppedEntry(...)` + `toast.error(...)`. Examples: an offline start while a desktop timer is running; a project deleted while offline; a tag archived. **Work is discarded, visibly for ~5 seconds, and the queue cannot recover it.**
3. **Durability gap.** `localStorage` (sync, ~5MB, evictable, no transactions). Replay is a serial loop with no durable "in-flight" marker: a process kill between server commit and queue removal is the duplicate window; a process kill mid-loop leaves remaining items untouched (ok) but the display copies are best-effort.
4. **Clock rules are uneven.** Timer start/stop replay is clamped server-side (`startedAt` → now if future; `endedAt` → now if implausible); manual entries are trusted as sent; `CLOCK_SKEW_TOLERANCE_MS` (60s) guards timer _edits_, not manual entries. A phone with a wrong clock can therefore write wrong payroll time with no server-side detection.
5. **Replay is dashboard-bound.** The drain `useEffect` lives in `TimeTrackerDashboard`; a user who opens `/app/timesheet` or `/app/profile` never replays until they visit the tracker.
6. **Offline boot fails.** `/app` `beforeLoad` calls the session server fn; its loader catch redirects to onboarding; navigation is network-first with an offline-page fallback; Query cache is in-memory. Three independent blockers to the same requirement (FR-16 / NFR-4).

---

## 4. Strategy scorecard

Scoring: 1 = worst, 5 = best. Effort is dev-weeks **(est.)** for the _v1 scope in the PRD_ (offline write + read, managed Android, iOS PWA), not for a full parity app.

### A) PWA-first, then Capacitor shell reusing the web build

Two sub-variants, because this is the decision that actually determines effort:

| Sub-variant                                      | How it works                                                                                                                                                                                                                                             | Effort (est.)                                                             | Verdict         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------- |
| **A1. Shell with `server.url` (remote web app)** | Capacitor Android project points its WebView at the production URL. Same origin ⇒ Better Auth cookies, `createServerFn`, CSP, SW, and TanStack Router behave exactly as in Chrome. Web deploys update the app instantly; MDM distributes the thin shell. | **+2–3.5 wk** on top of web offline work                                  | **Recommended** |
| **A2. Shell with bundled web assets**            | Copy `.output/public` into the APK, load from `capacitor://`/`https://localhost`.                                                                                                                                                                        | **+5.5–9 wk** (same shell work **plus** cross-origin auth/write-API path) | Rejected for v1 |

Why A2 is much more expensive: `createServerFn` calls are same-origin HTTP requests. With bundled assets the origin is the device, so every one of the 136 server functions needs a remote base URL, CORS, a token/bearer auth path, and a **write API that does not exist** (`/api/v1` is read-only). It also breaks the Better Auth cookie contract (`SameSite=None` cross-site cookies in a WebView are browser-version dependent). That is a second backend contract to maintain forever. A1 wins on every axis: less work, fewer bugs, one deployment.

**A1 in one line:** the app _is_ the web app; the shell adds installability, a managed distribution channel, reliable Android geolocation permission UX, and app-lifecycle resume — and keeps the server on Vercel unchanged.

### B) Expo / React Native sharing only domain logic

| Dimension     | Assessment                                                                                                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI reuse      | **~0%.** The 42 pages / 289 TSX files are DOM + Tailwind + shadcn/radix + MapLibre + Recharts. RN needs a parallel component library and a navigation model.                                                                                                                                                  |
| Domain reuse  | Types, pure helpers (`store.ts`, `timesheet.ts`, `billing.ts`, `payroll-periods.ts`, `entry-timing.ts`, `device-location.ts`), validation, and the Drizzle schema types (~10–15% of the codebase by LOC).                                                                                                     |
| Server reuse  | Requires exposing the server functions as authenticated HTTP endpoints (136; no write API today) plus a token flow.                                                                                                                                                                                           |
| Offline       | Queue/replay must be rebuilt natively, then kept in behavioural parity with the web's replay forever.                                                                                                                                                                                                         |
| Effort (est.) | **22–40 dev-weeks initial** (≈14–26 for the 30 signed-in screens at 1.5–2.5 dev-days each incl. responsive/date/time fidelity, + 1–2 wk auth/token API, + 3–5 wk offline sync, + 2–4 wk chart/map/export replacements, + 3–5 wk parity/QA), **plus permanent dual maintenance** (every future feature twice). |
| UX            | Best-in-class native feel, but no user-visible requirement in the PRD needs it.                                                                                                                                                                                                                               |
| Verdict       | **Reject for v1.** Reopen only if the shell path fails on a hard constraint (cookie sessions unusable in WebView _and_ no acceptable workaround) and the firm is willing to fund a second app.                                                                                                                |

### C) Monorepo with a platform abstraction

| Dimension     | Assessment                                                                                                                                                                                                                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What it buys  | Shared UI primitives for a future native app, consistent design tokens across platforms.                                                                                                                                                                                                                                                         |
| What it costs | **8–14 dev-weeks (est.)** of pure refactoring _before_ any offline value ships: split `src/components` into packages, make every screen platform-agnostic, extract the TanStack SSR data layer behind an interface, and rewire 88 server-calling components. Then permanent cross-package build/version/tooling overhead for a one-product team. |
| Risk          | High: TanStack Start SSR, Node/Nitro server code, and DOM-heavy components do not abstract cleanly; the refactor churns working code exactly when payroll reliability matters most.                                                                                                                                                              |
| Verdict       | **Reject.** It is a bet on a native app that the strategy explicitly does not plan to build. It violates "no speculative abstraction."                                                                                                                                                                                                           |

### Scorecard

| Criterion                | A1 PWA + remote Capacitor shell                                 | A2 bundled shell                 | B Expo/RN                    | C monorepo                      |
| ------------------------ | --------------------------------------------------------------- | -------------------------------- | ---------------------------- | ------------------------------- |
| Effort (est.)            | **9–16.5 wk** (includes offline work + hardening)               | ~12–21.5 wk                      | 22–40 wk                     | 8–14 wk refactor + feature work |
| UI reuse                 | **~100%**                                                       | ~100%                            | ~0%                          | ~100% after refactor            |
| Server reuse             | **100%** (one idempotency change)                               | ~70% (new write API)             | ~30–50% (new API + auth)     | 100%                            |
| Offline correctness risk | Medium (queue/clock/SW)                                         | Medium-high (+cross-origin auth) | High (rebuilt sync)          | Medium                          |
| UX for field staff       | Good (native shell + install + GPS + resume)                    | Good                             | Best (native)                | Good                            |
| Maintenance              | **One UI, one server, one test suite**                          | Two auth paths                   | Two apps forever             | Extra build tooling             |
| iOS v1                   | Installable PWA, documented limits                              | Same                             | RN iOS possible (extra work) | Same                            |
| Reversibility            | High (shell is a thin `mobile/` dir; delete it and PWA remains) | Medium                           | Low (second product)         | Low (repo-wide)                 |
| **Verdict**              | **Recommend**                                                   | Reject                           | Reject                       | Reject                          |

### Distribution / store rules (v1 has no public store requirement)

- **Android v1** = Android Enterprise/MDM: a signed APK/AAB pushed through the firm's EMM, or a **Managed Google Play private app** if IT prefers a managed catalog. Private/managed distribution avoids consumer store review and consumer policy surface; IT gains remote wipe and device policy.
- **Do not plan a public Play listing.** Google Play's spam/minimum-functionality policy targets thin webview-only apps; if a public listing is ever desired, the app must carry native value (offline guarantees, GPS, managed config) and be reviewed as such. [Play spam & minimum functionality](https://support.google.com/googleplay/android-developer/answer/14906471)
- **iOS v1** = installable PWA (A2HS). If a native iOS shell is ever proposed, the gate must account for **App Store guideline 4.2 (minimum functionality)** if distributed publicly, or use **Apple Business Manager custom/unlisted apps** to stay off the public store. [Guideline 4.2.2 discussion](https://developer.apple.com/forums/thread/783092)
- A `server.url` shell is technically a web wrapper. That is acceptable for internal/MDM distribution, but it must be documented as such internally so nobody later submits it to a public store without adding native capability. This is a governance item, not a blocker.

---

## 5. The recommended target architecture

### 5.1 What stays exactly as it is (the "minimum new code" claim)

| Unchanged                                                                                | Why it matters                                                            |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| React 19 + TanStack Router UI, 42 pages, 54k LOC components                              | Zero UI fork; every future feature ships to web, PWA, and Android at once |
| TanStack Query data flow, route loaders, `networkMode: 'offlineFirst'`                   | Offline becomes a persistence/queue problem, not a data-fetching redesign |
| 136 server functions, Drizzle schema (one new column), Neon, Better Auth cookie sessions | No new API contract, no token flow, no second auth system                 |
| Vercel/Nitro deployment, crons, webhooks, Sentry, bundle budgets                         | No infrastructure change                                                  |
| Exports, charts, maps, external API, Chrome extension                                    | Untouched surfaces                                                        |
| 103-test Vitest suite + CI gates                                                         | New work must pass the existing gates, not bypass them                    |

### 5.2 What genuinely changes (all of it small and contained)

| Change                                                                                                                                                                                                              | Size (est.)                                              | Reuse                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `mobile/` Capacitor Android shell (new dir, own `package.json`; `server.url` = prod; plugins: `@capacitor/geolocation`, `@capacitor/app`; signed APK/AAB in CI)                                                     | ~6–10 files, ~300–500 lines config/CI                    | The entire web app                                                                               |
| IndexedDB-backed queue + dead-letter store (`offline-queue.ts` + a small `offline-db.ts` using `idb-keyval`)                                                                                                        | ~250–400 lines                                           | Existing queue API and 3 call sites stay                                                         |
| Query cache persistence to IndexedDB (`root-provider.tsx`, new deps)                                                                                                                                                | ~60–120 lines                                            | Existing Query setup; no query rewrites                                                          |
| Idempotency: nullable `client_mutation_id` column + unique index + dedupe in `startTimer`/`createManualEntry` (+ replay passes item id)                                                                             | ~60–100 lines + 1 migration, 4 files                     | Existing insert/audit/rollup paths                                                               |
| Replay moved out of the dashboard into an `OfflineSyncCoordinator` mounted in the **root shell** (`__root.tsx`, client-only) so it survives `/app` loader failure (reusing `TaskSyncCoordinator`'s trigger pattern) | ~150 lines moved + ~80 new                               | Existing drain logic, `useNetworkStatus`                                                         |
| Needs-review UI (drawer listing parked items + retry/discard) + sync status pill                                                                                                                                    | ~250–400 lines, existing Drawer/Dialog/Button primitives | Existing design system                                                                           |
| Offline boot/auth grace: `app.tsx` beforeLoad catch, cached authorization/`ensureWorkspaceAuthorization` use on the 2 offline-scope loaders, SW shell-document caching, logout wipe                                 | ~150–250 lines, 5–7 files                                | `ensureWorkspaceAuthorization` already exists (7 call sites) — reuse it plus an offline fallback |
| Encryption at rest for queue/cache payloads (PRD NFR-5): AES-256-GCM via WebCrypto, non-exportable `CryptoKey` persisted as a structured-cloned key in IndexedDB; native Keystore later in M3 if required           | ~120–200 lines                                           | Browser built-in crypto; no new dependency                                                       |
| Tests: ~12–18 Vitest files (fake-indexeddb + node env) + 4–6 Playwright specs + fault-injection harness                                                                                                             | ~1,500–2,500 lines test code                             | Existing test conventions                                                                        |

New runtime dependencies (web): `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`, `idb-keyval` — **≤10KB gzip total (est.)**, comfortably inside the PRD's ≤150KB offline-layer budget and the existing root budget (`≤250KB`). Shell deps live only in `mobile/`.

### 5.3 Shell mechanics, auth, and webview constraints (size these explicitly)

- **Remote-origin shell (`server.url`)**: first launch needs network; after that the service worker owns offline boot. Cookies persist in the WebView cookie jar across process death (Android `CookieManager`), so a 30-day Better Auth session behaves like Chrome. No `trustedOrigins` change, no CORS work, no new auth path. **This is the assumption that M3 must validate on a real device before any shell UI polish.**
- **Native plugins needed in v1 (keep the list tiny):** `@capacitor/geolocation` (reliable permission prompt + high-accuracy fix from a WebView — `navigator.geolocation` in a WebView can silently fail or need native `WebChromeClient` handling), `@capacitor/app` (resume/back-button lifecycle for replay). Optional: `@capacitor/network` only if device testing shows `navigator.onLine` is unreliable behind captive portals/MDM proxies. **No push plugin** (out of scope), **no background-location plugin**, **no SQLite**.
- **WebView constraints to test, not assume:** service-worker/Cache-API availability and persistence in the managed device's Android System WebView; SW registration on a remote origin inside a Capacitor shell; cookie persistence across force-stop; `visibilitychange`/freeze behaviour when the app is backgrounded (JS is paused — replay must be driven by resume, not a timer); keyboard/safe-area insets; back-button navigation vs router history; TLS inspection by MDM proxies.
- **Offline cold boot strategy (the risky bit):** the current SW is network-first for navigations and falls back to `offline.html`. For offline boot it must cache a **single app-shell HTML document** for the tracker route (cache-first for that document, network-first with background refresh for everything else) and never cache authenticated API responses. **Security caveat:** SSR HTML can contain user data, so caching HTML on a shared device is a data-at-rest decision. Mitigations: cache only the tracker shell document, purge on logout, rely on per-user IndexedDB namespaces, and keep device policy single-user. If caching HTML is rejected, the fallback is to boot a neutral shell and hydrate from IndexedDB — slightly more work, same milestone. This must be decided in M0 (see §12).
- **What must be tested on devices (cannot be proven in CI):** SW offline boot inside the WebView; cookie persistence after force-stop; geolocation permission prompt + fix quality; storage eviction under pressure; background/resume replay; back button and keyboard on the 4 core screens; MDM install/update/wipe; battery/data growth per NFR-8; cold-start p95 on the actual low-end managed model (NFR-4).
- **MDM packaging/distribution (IT-owned, engineering-supported):** Android signing keystore generated and stored as a CI secret; `versionCode`/`versionName` policy; release build in CI (Android SDK + JDK on the runner or a local build host); distribution via the firm's EMM or Managed Google Play private app; app-config for environment/server URL; enrollment + rollback + remote-wipe runbook; device inventory/OS floor from IT. Engineering effort: ~0.5–1 wk inside M3; IT effort is separate and is the most likely schedule dependency.
- **Update model:** web UI updates ship with Vercel deploys (no store/MDM re-release). The APK only needs re-releasing for shell/plugin/Android-policy changes (quarterly-ish). This is the operational payoff of A1.
- **Server hardening actually required for A1:** only the idempotency column + dedupe. No new endpoints, no CORS, no mobile token flow, no `/api/v1` writes. If research or device testing finds cookie sessions unusable in the WebView, the fallback is: keep the shell on `server.url` and add a **narrow** session-token handshake to `/api/auth` — not a second write API (est. +1–2 wk, still far below A2).

### 5.4 iOS and desktop

- **iOS v1 = installable PWA** on Safari 16.4+: same code, same offline layer, SW caching, A2HS install. Documented limits: no background sync, no push until installed, and Safari's 7-day unused-site-data eviction can clear caches/queues on dormant devices. Therefore **iOS is best-effort BYOD for offline capture; it must not be sold as payroll-critical** until a native shell exists.
- **iOS native shell gate (M4/M5 decision):** evidence required = Android field results, iOS user count, ABM availability, and whether a wrapper passes internal/ABM review. If approved, the same `mobile/` shell pattern applies (`npx cap add ios`), with the same web build — est. +1.5–2.5 wk.
- **Desktop:** deferred; no work.

---

## 6. Minimum viable lazy path (work packages)

Ordered by risk reduction per week. Each package reuses something that already exists.

### WP1 — Idempotent replay (server + queue) — the duplicate killer

- Add nullable `client_mutation_id varchar(64)` to `time_entries` + **unique index** (Postgres allows multiple NULLs). One migration in `drizzle/`.
- `startTimerSchema` / `entryInputSchema` gain optional `clientMutationId`; `tracker.ts` server fns pass it through.
- `startTimer`/`createManualEntry` insert with `onConflictDoNothing` (or catch unique violation) and, on conflict, return the existing row serialized — **before** the "active timer" pre-check for start. Audit/rollups untouched.
- Queue: use the existing item `id` (`crypto.randomUUID()`, `offline-queue.ts`) as the mutation id — **no new field in the queue item**, one extra property in the payload.
- `stopTimer` needs nothing: it already returns `null` for an already-stopped entry, so a replayed stop is a no-op success.
- **Reuse:** existing fns, schemas, audit, rollups; 3 queue call sites.
- **Effort: 0.5–1 wk (est.).** Highest value per line in the whole plan.

### WP2 — Durable queue in IndexedDB

- Keep the queue module's public API (`enqueueOfflineMutation`, `loadOfflineQueue`, `removeOfflineQueueItem`, `clearOfflineQueue`, helpers) and swap the storage engine to IndexedDB (`idb-keyval` + a versioned key `offline-queue:v2:<workspaceId>:<memberId>`), with a one-time migration from the localStorage key and a zod-validated item schema (corrupt items are parked, never dropped).
- Persist per-workspace/member; `navigator.storage.persist()` request with a non-blocking warning when denied; soft cap + warning at ~500 items (payloads are tiny).
- Write a durable "in-flight" marker **before** the network call and clear it only after the server confirms or dedupe proves success — this closes the duplicate window even without response idempotency.
- **Reuse:** the 4 existing mutation types and all callers.
- **Effort: 0.75–1.5 wk (est.).**

### WP3 — Query cache persistence to IndexedDB (offline reads)

- Wrap the root provider in `PersistQueryClientProvider` + `createAsyncStoragePersister` on an IndexedDB store; **client-only** (never on the server).
- `shouldDehydrateQuery` allowlist, small and security-conscious: `tracker-state`, `tracker-state-lite`, `timer-presets`, `workspace-authorization`, `workspace-settings` (grace/location toggle), catalog bootstrap, member directory, self profile, timesheet by key prefix, and **only the member's own** entry queries. **Do not persist** analytics, reports, team/department views, exports, or subscription/secret-ish data.
- Set `gcTime` for persisted data (e.g., 24h–7d, decide) and `persistQueryClient` `maxAge`.
- Add a tiny cached-loader helper: `ensureOfflineQueryData` that returns fresh cache, else fetches with `retry: false`, else returns cached data and marks the route "stale/offline" — used by only the **2 offline-scope loaders** (`app/time-tracker/index.tsx`, `app/timesheet.tsx`) and `app.tsx`. Use the existing `ensureWorkspaceAuthorization` (already used by some loaders) on those routes, and add the offline fallback it currently lacks; stop calling `fetchFreshWorkspaceAuthorization` (`staleTime: 0`) on the offline scope.
- **Reuse:** existing Query cache/`networkMode: 'offlineFirst'`; no query hook rewrites.
- **Effort: 0.75–1.5 wk (est.).**

### WP4 — Never silently drop: dead-letter + needs-review

- On a non-network rejection in the drain: move the item to `offline-queue-failures` in IndexedDB with the server message, attempt count, timestamps, and the serialized payload; keep the optimistic display copy visible.
- Add a `needs-review` list surface (drawer, reusing `Drawer`/`Dialog`/`Button`) with per-item: payload summary, error, Retry, Discard (confirm dialog), and a link to fix the underlying cause where possible (open catalogs).
- Keep the existing toast, but as a pointer ("1 item needs review"), not the only record.
- Handle dependencies: a parked `startTimer` means its queued `stopTimer`/`discardTimer` stay blocked, not dropped; surface the chain.
- **Reuse:** existing toast, drawer primitives, queue module, optimistic-entry store.
- **Effort: 0.75–1.25 wk (est.).**

### WP5 — Sync status UI and reachable replay

- Extract the drain `useEffect` from `TimeTrackerDashboard` into an `OfflineSyncCoordinator` and mount it in the **root route shell** (`__root.tsx`, inside a client-only component like `ServiceWorkerRegistrar`), reusing `TaskSyncCoordinator`'s trigger pattern (`online`, `visibilitychange`, `focus`, `pageshow`, app resume via `@capacitor/app`) and its coalesced invalidation. **Do not mount it in `AppShell`:** `AppShell` is rendered by `app.tsx` after its loader succeeds (`src/routes/app.tsx:95–101`), so offline/expired-session failures would leave replay and pending-count UI unreachable. Gate replay on an **authenticated session call** (a connectivity probe alone is not auth — `GET /api/health` is explicitly unauthenticated) and read queue keys from IndexedDB so items remain visible when `/app` is blocked.
- Add a `SyncStatusPill` (online/offline, pending count, oldest pending age, last sync) with `aria-live`, placed in the dashboard header/nav and the needs-review drawer; reuse existing pill/button styles.
- Replay policy: serial, ordered, exponential backoff with jitter (5s → 30s → 2min → 10min, matching FR-9), single-flight guard (already a `drainingRef`), pause on network error, no retry loop while offline, an **unauthenticated** connectivity probe (`GET /api/health`) plus an **authenticated session call** before draining, to survive captive portals without replaying under stale auth.
- **Reuse:** `TaskSyncCoordinator` lifecycle, `useNetworkStatus`, existing invalidation helpers.
- **Effort: 0.75–1.25 wk (est.).**

### WP6 — Offline boot and auth grace (PWA + shell)

- `app.tsx` `beforeLoad`: use the persisted session cache; if offline and cache age ≤ grace, proceed; if expired, render a "sign in to keep tracking" gate; **never redirect to `/onboarding` on a network error** (distinguish `isNetworkError`).
- `app.tsx` loader: on network failure, use cached workspace/profile/authorization snapshot; keep the shell usable.
- Service worker: cache the app-shell document for the tracker route and bump `CACHE_VERSION`; add an update prompt (new SW waiting) instead of unconditional `skipWaiting` during an active replay; keep API traffic untouched (existing invariant).
- Logout/wipe (FR-14): clear IndexedDB stores (queue, failures, persisted Query cache, keys), `localStorage`, `sessionStorage`, Cache Storage entries for the app shell, and request a cookie/session sign-out; warn if pending items exist.
- **Reuse:** existing `offline.html`, manifest, SW structure, `preload-error-recovery`.
- **Effort: 1–2 wk (est.).** Riskiest package after M3 (HTML caching policy + SW in WebView).

### WP7 — Encryption at rest (PRD NFR-5) — small, non-negotiable addition

- Encrypt queue/dead-letter/persisted-cache payloads with **AES-256-GCM (WebCrypto)**. Generate a non-extractable `CryptoKey`, store the `CryptoKey` object in IndexedDB (structured clone supports this) under the user namespace; wipe on logout. This keeps the web/PWA path viable without a plugin.
- In the Android shell, the WebView's app-private storage is already OS-encrypted (FBE/work profile); if the security review demands Keystore-backed keys, add it in M3 behind the same encrypt/decrypt seam (one plugin call, no data-model change).
- Never log entry descriptions, notes, times, or coordinates; Sentry events carry ids/counters/durations only (FR-19, NFR-5).
- **Reuse:** browser built-ins; one helper module.
- **Effort: 0.5–1 wk (est.).**

### WP8 — Offline read surface (own entries + own timesheet + catalog cache)

- Tracker dashboard already renders from `tracker-state`; persistence makes it available after reload. Badge queued entries as pending (already supported).
- Timesheet: loader offline fallback + read-only banner for own current/previous pay period (FR-11); block offline edits of synced entries with an explicit message.
- Catalogs: ensure the picker data (clients/projects/tasks/tags/departments + tags for active projects) is inside the persisted cache allowlist and shows a stale indicator after 7 days (FR-10). No catalog mutations offline.
- **Reuse:** existing state shapes, pickers, timesheet screen.
- **Effort: 0.5–1 wk (est.).**

### WP9 — Android Capacitor shell + MDM (M3)

- `mobile/` project: Capacitor config with `server.url` per environment, `androidScheme: https`, `allowNavigation` for auth domains, splash/icon, status bar/safe area, back-button handling, deep links (optional).
- Plugins: geolocation (permission + capture, respecting the workspace toggle), app (resume replay, back button).
- Permissions: only location when tracking enabled; no background location; no unnecessary permissions (MDM review-friendly).
- Build/sign in CI: keystore secret, `assembleRelease`/`bundleRelease`, versionCode policy, artifact upload to the MDM/managed catalog; app-config JSON for environment.
- **Reuse:** the entire web build; no native UI.
- **Effort: 2–3.5 wk (est.)** including device QA; IT enrollment time is additional.

### WP10 — Hardening, fault injection, rollout (M4)

- Fault-injection suite (§9.4) as the release gate; staging under the Sentry-test env; canary via a workspace flag; runbook.
- **Effort: 1–1.5 wk (est.).**

**Total path = M0–M4 = 9–16.5 dev-weeks (est.)** (decisions/baseline 0.5–1 + web offline 5.5–10.5 + shell 2–3.5 + hardening/rollout 1–1.5).

---

## 7. Do NOT build (explicit)

| Temptation                                                                                              | Why we won't (lazy reasoning)                                                                                          | Cheaper alternative                                             |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| React Native / Expo app, shared UI kit                                                                  | 22–40 dev-weeks (est.) + permanent dual maintenance; PRD non-goal                                                      | Capacitor shell reuses 100% of the UI                           |
| Local-first sync engine (WatermelonDB, PowerSync, ElectricSQL, RxDB, Dexie-based ORM)                   | Replaces Neon as source of truth, duplicates audit/rollup logic, new learning curve; 4 mutation types don't justify it | IndexedDB queue + Query persistence + 1 unique column           |
| CRDT / real-time multi-device merge (Yjs, Automerge)                                                    | Explicit non-goal; server already enforces single active timer                                                         | Return `needs-review` on conflicts                              |
| User-visible "sync engine" service/worker architecture, message broker, background job queue for replay | Replay is a serial loop of ≤50 calls; serverless function timeout is 30s and queues are small                          | Existing coordinator + backoff                                  |
| New write API (`/api/v1` POST sync endpoints, token flow, GraphQL)                                      | Duplicates 136 server fns, audit/rollups, and auth; second contract forever                                            | Idempotency on existing server fns                              |
| Bundled-assets shell (A2) unless cookie auth is proven unusable                                         | Requires new write API + CORS; more work than the entire offline layer                                                 | `server.url` remote shell                                       |
| Public Play/App Store listing in v1                                                                     | Explicit stakeholder decision (internal/MDM); review + wrapper-policy risk                                             | MDM private distribution                                        |
| Offline analytics, team views, reports, exports, PDF                                                    | Explicit non-goal; heavy libs (recharts/maplibre/jspdf) and team-scoped queries; high cost, low value                  | Online-only, visible "online required" state                    |
| Offline admin (catalog/member/settings mutations)                                                       | Conflict-heavy, low field value, admin screens are online                                                              | Read-only cached catalogs                                       |
| Push notifications, background geolocation, background sync (WorkManager)                               | Non-goals; battery/policy/permission cost; iOS PWA can't do it anyway                                                  | Resume-driven replay + foreground sync pill                     |
| SQLite/Drizzle-on-device mirror                                                                         | Second schema, migrations, and query layer; concurrency bugs                                                           | Query persistence + IDB queue (no new schema)                   |
| Offline sign-in / offline Better Auth provider / token rotation                                         | Auth server is the only authority; offline auth is a security anti-pattern                                             | Cached session + bounded grace + re-auth flow                   |
| Replacing `sw.js` with Workbox or a PWA generator                                                       | Existing SW is ~90 lines and already versioned; Workbox adds config and build coupling                                 | Extend the existing file                                        |
| Mobile redesign / native-feel design system work                                                        | The responsive UI already exists; no requirement for a visual fork                                                     | Reuse; fix only broken device cases                             |
| Full encryption KMS/vault service                                                                       | NFR-5 needs AES-256-GCM at rest, not infrastructure                                                                    | WebCrypto + non-exportable key; native Keystore later if needed |
| Sentry session replay for offline debugging                                                             | Repo deliberately removed replay (CPU/memory on the per-second timer UI)                                               | Structured events + breadcrumbs (no PII)                        |
| "While we're here" refactors of loaders/state/queue                                                     | Every touched shared file is a regression surface; payroll correctness first                                           | Minimal diffs; isolate new modules                              |

---

## 8. Milestones M0–M4

Dependencies, acceptance criteria, and effort **(est.)**. PRD v2 should align its provisional phase names to these.

### M0 — Decisions, baseline, instrumentation (0.5–1 wk est.)

**Depends on:** PRD v2 direction (done), research report (final 2026-11-05).
**Work:** decision log for §12; baseline instrumentation for offline events (enqueue/replay/fail/park/duplicate-prevented/offline-boot, queue depth/oldest age, sync duration) in Sentry **without PII**; device inventory + MDM mechanism + test devices; time-boxed spikes (≤1 day each: WebView service-worker offline boot + cookie persistence; offline session bootstrap; IndexedDB restore/eviction; MDM Web Clip) that feed the M3 go/no-go; baseline metrics captured so targets aren't guessed.
**Acceptance criteria**

- [ ] All §12 decisions recorded with owner and date; no unresolved decision blocks M1.
- [ ] Sentry events visible in staging with release tags; `queue_depth`/`oldest_pending_age` dashboards exist; no entry text/coords in payloads.
- [ ] Device matrix + MDM mechanism + at least one physical test device available to engineering.
- [ ] Spike result written: does SW offline boot work in the Android WebView (`server.url`)? If not, fallback path chosen and re-estimated.
- [ ] Baseline: current offline attempts/queue depth/replay failures instrumented and recorded.

### M1 — Durable offline core (3–6 wk est.) ← WP1, WP2, WP4, WP5, WP7

**Depends on:** M0.
**Work:** idempotent replay, IndexedDB queue + durability markers, dead-letter/needs-review, sync status + coordinator-mounted replay, encryption at rest, replay policy/backoff/probe, tests.
**Acceptance criteria (release gate for the core)**

- [ ] Offline timer start/stop and manual entry complete locally in ≤1s, survive reload, force-quit, reboot, and app update; queued count visible (FR-1/2/3, AC1/3).
- [ ] Response-lost replay produces **exactly one** server entry; queue clears; asserted by automated test (FR-5, AC6).
- [ ] Server rejection (stale project, timer running elsewhere) → item visible as `needs-review` with message/retry/discard; nothing auto-deleted (FR-5/7/8, AC7/8).
- [ ] Queued start→stop replays in order and stops the correct server entry; optimistic ids map correctly (FR-5, AC7).
- [ ] Replay triggers on launch/foreground/connectivity/re-auth from **any** `/app` route, not just the dashboard (FR-9).
- [ ] Captured timestamps preserved through replay; server clamp/tolerance rules tested, including a 2h-fast device clock and a 9h-delayed sync (FR-4, AC5).
- [ ] Queue/cache payloads encrypted at rest (AES-256-GCM); no PII/time/location in logs (NFR-5, FR-19).
- [ ] Existing 103 Vitest files + new tests green; typecheck/lint/bundle budgets pass; no root budget regression >5% (NFR-9).

### M2 — Offline read, boot, auth grace (PWA) (2–4.5 wk est.) ← WP3, WP6, WP8

**Depends on:** M1 (queue/persistence primitives).
**Work:** Query persistence allowlist, cached-loader fallback for the 2 offline routes, own entries/timesheet read, catalog cache + staleness, SW shell-document cache + update prompt, auth grace + re-auth without data loss, logout/wipe, accessibility pass.
**Acceptance criteria**

- [ ] Installed PWA launches offline within grace to the tracker shell (≤3s p95 target, measured) with pending count visible; no `/onboarding` redirect (FR-16, NFR-4, AC14).
- [ ] Offline read renders the member's own last 14 days + own timesheet for current/previous pay period, read-only, pending items badged; synced-entry edits blocked with explicit messaging (FR-11, AC10).
- [ ] All five catalog types selectable offline; stale indicator after 7 days; no offline catalog mutations (FR-10, AC9).
- [ ] Grace expiry blocks capture with visible pending count and deletes nothing; re-auth resumes replay (FR-12/13, AC11).
- [ ] Logout/wipe clears queue, catalogs, entries, drafts, location, session ≤5s; relaunch requires sign-in and shows no previous-user data (FR-14, AC12).
- [ ] Location toggle off ⇒ no prompt, no coordinates stored; on ⇒ one fix attached and survives replay (FR-15, AC13).
- [ ] `aria-live` sync announcements, 44px targets, 200% zoom pass (NFR-6, AC16).
- [ ] Playwright airplane-mode specs for the above (project on device profiles).

### M3 — Android shell + MDM (2–3.5 wk est.) ← WP9

**Depends on:** M2 (offline boot proven in PWA), M0 spike.
**Work:** `mobile/` Capacitor project, server target config, plugins (geolocation/app), permissions, signing/CI build, MDM package, device QA, update/rollback path, secure-storage escalation if the security review requires it.
**Acceptance criteria**

- [ ] Signed APK/AAB installs via the firm's MDM on a managed device; no Play Services dependency; only location permission (and only when enabled) (FR-17, AC15).
- [ ] Offline cold start works **inside the WebView** after one online run; cached tracker renders; no white screen/offline-page-only failure (FR-16, NFR-4, AC14).
- [ ] Timer start/stop/manual entry offline with GPS capture (toggle respected) on device; replay on resume produces exactly one entry (AC1/6/13).
- [ ] Session survives app kill/restart; expiry shows re-auth without losing queue (FR-12/13, AC11).
- [ ] Web deploy updates UI on relaunch; shell version update via MDM works; rollback to previous APK verified.
- [ ] Back button, safe areas, keyboard, rotation do not break the 4 core screens; cold start p95 measured on a mid-tier device.
- [ ] Crash-free sessions ≥99.5% target on pilot group (baseline recorded in M0).
- [ ] Remote wipe/uninstall removes app data; MDM runbook documented.

### M4 — Hardening, rollout, measurement (1–1.5 wk est.) ← WP10

**Depends on:** M2 + M3.
**Work:** fault-injection suite, observability dashboards/alerts, feature flags, staged rollout (internal → field pilot one pay period → workspace), security/accessibility sign-off, runbook, iOS PWA validation + gate decision.
**Acceptance criteria**

- [ ] Fault-injection matrix (§9.4) green: 0 lost, 0 duplicated across randomized force-quit/reboot/response-loss runs (NFR-1/2).
- [ ] Alerts: duplicate-prevented (should be zero user-visible), replay failure rate, offline boot failures, queue depth/oldest age, sync latency p95; triage runbook exists.
- [ ] Flags gate offline cache, durable queue v2, shell, and per-workspace grace; can be disabled without a redeploy; rollback exercised.
- [ ] One full pay period of pilot data with 0 lost/duplicate entries and ≥99% synced within 5 min of resume (NFR-3); metric restated for native (resume-based).
- [ ] Security/DPA sign-off on data at rest, retention, location consent, wipe; accessibility pass recorded.
- [ ] iOS: PWA install + offline validation documented with limitations; native-iOS gate decision recorded (go/no-go + criteria).

**Total: 9–16.5 dev-weeks (est.)** for M0–M4 to managed-Android v1 + iOS PWA, excluding IT/MDM setup, device procurement, PM/design time, and a payroll pilot period (calendar time, not effort).

**Parallelism:** with two engineers, WP1–WP2 and shell scaffolding can overlap after M0, but M3 device validation must wait for M2's offline boot. Do not parallelize edits to `offline-queue.ts`/`root-provider.tsx` (single writer per file).

---

## 9. Test strategy

### 9.1 Unit / integration (Vitest, existing harness)

- **Queue** (new `fake-indexeddb` tests): enqueue/load/remove, migration from localStorage v1, corrupt-item parking, schema version tolerance, encryption round-trip, quota failure (mock rejection) → draft preserved, no success state.
- **Replay logic** (extract to a pure function where possible): order, dependency chains, optimistic-id mapping, network-error pause vs server-reject park, backoff schedule, single-flight, dedupe-hit path, in-flight marker crash recovery.
- **Server idempotency** (existing `src/lib/server/__tests__` patterns): duplicate `clientMutationId` returns the same row; concurrent inserts; start-timer pre-check ordering; manual-entry dedupe; audit/rollup not double-applied.
- **Clock**: start/stop clamping bounds, manual-entry tolerance policy (new offset flag), 60s tolerance boundaries, overnight/long-running entries.
- **Cache allowlist**: dehydration excludes analytics/team queries and secrets; includes catalogs/settings/tracker/timesheet; wipe clears all.
- **Existing suite:** all 103 files must stay green; CI runs `typecheck → lint → test → build → perf:bundle` already (`.github/workflows/check.yml`).

### 9.2 E2E (Playwright — greenfield, but installed)

There is **no e2e suite today** (`docs/testing.md` §292: "Playwright is installed but… no config and no e2e/ suite"). Add `playwright.config.ts` + `e2e/offline/` specs and a CI job (Chromium + Pixel 7/iPhone 13 device profiles):

1. **Airplane mode**: start timer → stop → manual entry → reload → queue persists → go online → exactly N entries, queue empty (`context.setOffline(true/false)`).
2. **Response lost**: route-interception drops the response after the request reaches the server (simulate with a proxy/mock or by aborting after a known write) → replay → no duplicate (AC6).
3. **Server rejection**: queue an entry against a project that is deleted/deactivated → replay → `needs-review` UI with retry/discard; fix catalog → retry succeeds.
4. **Kill/restart**: persist `storageState`, new context with the same IndexedDB profile → queue survives.
5. **Offline boot**: install PWA (Chromium), load once online, kill, `setOffline`, navigate to `/app/time-tracker` → shell renders from cache with pending count; no `/onboarding`.
6. **Auth grace**: expire the cached session/grace, offline → blocked state with pending count; sign in online → replay resumes.
7. **Shared device**: logout with pending items → warning → wipe → sign in as another user → no previous data.
8. **Catalogs**: offline pickers show cached values; stale badge after backdated cache.

Caveat: Playwright cannot validate WebView service workers, cookie persistence across process death, native geolocation, or MDM install/wipe. Those are device tests.

### 9.3 Real-device matrix (manual, but scripted)

Managed device(s) from M0 inventory (e.g., a mid-tier Samsung + a Pixel, Android 10+/12+ per NFR-7, current Android System WebView) and one iPhone for the PWA path:

- Install via MDM; first run online; force-stop; airplane mode; cold boot to tracker; pending count; capture with GPS on/off; permission prompt wording; background/resume replay; back button; keyboard; rotation; 200% text zoom/TalkBack; clock changed in device settings; storage pressure; app update via MDM; remote wipe; battery/data growth per NFR-8.

### 9.4 Fault-injection suite (release gate, PRD NFR-1/2)

Randomized 500-iteration harness (can be a scripted Playwright + unit-simulated driver) over: force-quit at each replay step, response loss after commit, duplicate enqueue (double tap), server reject mid-queue, clock ±2h, storage quota failure, corrupt queue JSON, token expiry mid-replay, two devices with an active timer, network flapping (online→offline→online), storage eviction of cache. Assertions: **0 lost**, **0 duplicated**, queue converges to empty or `needs-review`, replay is ordered.

### 9.5 Gates and budgets

- Every milestone: `pnpm check-all` (typecheck + lint + Vitest), build, `pnpm perf:bundle` (offline layer ≤150KB gzip per NFR-9; root ≤250KB; tracker ≤150KB).
- M2–M4: e2e suite green (M1 covers unit/integration); M3–M4: device checklist signed; M4: fault injection green + security/accessibility sign-off.

---

## 10. Observability, rollout, feature flags

**Sentry (already integrated; `sentry.client.config.ts`, `sentry.server.config.ts`, Vite plugin uploads source maps):**

- Structured events (no PII, no coordinates, no descriptions): `offline.enqueued {type}`, `offline.replayed {type, durationMs, attempt}`, `offline.replay_failed {type, status, reason}`, `offline.parked {type, reason}`, `offline.duplicate_prevented {type}`, `offline.boot {cached: boolean, ms}`, `offline.grace_expired`, `offline.wipe {ok}`, `offline.queue_depth {n, oldestAgeS}`, `offline.auth_refresh_offline`.
- Breadcrumbs around replay steps; release tags include web release **and** shell version (`trackly-android-shell@x.y.z`) so device issues are attributable.
- Alerts: `offline.duplicate_prevented` unexpected >0 (indicates a bug), replay failure rate >1% per hour, offline boot failure >0.5%, queue depth >50 for >1h, oldest pending >1 pay period, wipe failure.
- Dashboards per PRD §13 instrumentation; support correlation id per queue item (mutation id) so tickets map to server rows.

**Rollout (aligns with PRD §13):**

1. Internal dogfood (1–2 engineers, managed test devices, airplane-mode daily) — gates: fault injection + device pass.
2. Field pilot (3–5 users, one full pay period, PWA and managed APK in parallel) — gates: 0 lost/dup, ≥99% synced within 5 min of resume.
3. Workspace-wide managed APK for field staff; PWA for BYOD.
4. iOS PWA offered with documented limits; native-iOS gate decision.

**Feature flags (no new infrastructure):** follow the existing precedent `WEEKLY_REPORT_EMAILS_ENABLED` + `WEEKLY_REPORT_WORKSPACE_IDS` (`src/routes/api/cron/weekly-reports.ts`). Add env flags `OFFLINE_CACHE_ENABLED`, `OFFLINE_QUEUE_V2_ENABLED`, `OFFLINE_GRACE_HOURS`, `ANDROID_SHELL_ENABLED` + optional workspace allowlist, read server-side and exposed via the cached workspace settings snapshot. Flags must be able to disable: cache persistence, durable queue v2, replay-on-resume, sync UI. Rollback: flag off (web), previous APK via MDM, SW cache-version bump. **Do not gate** the idempotency column — it is server-side dedupe and must stay on permanently.

**Ops runbook (M4):** triage `needs-review` (fix catalog → retry; discard with payroll note), queue-depth alert, replay-storm response (throttle by backoff already), offline-boot regression (SW cache version), MDM re-enroll/remote wipe, session-grace support script.

---

## 11. Risks and mitigations

Likelihood/impact are qualitative (H/M/L); each risk names its early-warning signal.

| #   | Risk                                                                                                               | L              | I   | Mitigation                                                                                                                                                                                                                                     | Early warning                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------ | -------------- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| R1  | **Duplicate entries** on lost replay response or double tap                                                        | M              | H   | Client mutation id (= queue item id) + nullable unique column + dedupe/`onConflictDoNothing`; in-flight marker before network; background suite per NFR-2; stop already returns `null`                                                         | `offline.duplicate_prevented` >0; payroll reports showing identical entries |
| R2  | **Silent data loss** when server rejects queued work (stale catalog, active timer on another device, archived tag) | H (today)      | H   | Dead-letter store + `needs-review` UI + retry/discard; never delete on non-network error; preserve payload and message                                                                                                                         | parked-item count >0 with no follow-up; support tickets "my hours vanished" |
| R3  | **Clock skew / wrong device time** (manual entries trust client; timers clamp)                                     | M              | H   | Capture server-time offset at last successful call; keep client time per FR-4; flag items with >5 min offset for confirmation; audit-log the offset (no schema change needed — audit details); show server-adjusted times                      | flagged entries cluster on one device; payroll queries about wrong times    |
| R4  | **Queue corruption / schema drift** (`localStorage` corrupt today; v2 must not inherit)                            | M              | H   | zod-validate every item on read; versioned store + migration; park unreadable items with raw payload export instead of dropping; atomic put/delete via one IDB transaction                                                                     | parked/corrupt-item events; queue depth stuck                               |
| R5  | **Storage eviction / quota** (Safari ITP 7-day purge; Android pressure; private mode)                              | M              | H   | `navigator.storage.persist()` + estimate warnings; keep queue tiny (ids + payloads, no history); persist only allowlisted data; show blocking error when write fails (FR-3); MDM-managed devices avoid browser eviction for the WebView origin | `storage.persisted == false`; eviction events; failed writes                |
| R6  | **Session expiry while offline** (30-day expiry; grace 24h default)                                                | M              | H   | Cached session/authorization snapshot with grace; preserve queue across re-auth; bind queue to workspace/member and refuse to replay under a different identity; never delete on auth failure (park)                                           | grace-expired events; re-auth abandonment                                   |
| R7  | **Offline payroll/geo data at rest** (notes, times, coordinates on a phone)                                        | M              | H   | AES-256-GCM with non-extractable WebCrypto key (WP7); per-user IDB namespaces; no PII in logs; location only when workspace toggle on; wipe on logout/remote wipe; PH DPA retention decision in M0                                             | security review findings; cache-size report; log audit                      |
| R8  | **Shared / kiosk devices** (next user sees previous data)                                                          | M              | H   | Sign-in required after logout; ≤5s wipe of queue/cache/cookies/Cache Storage; no cross-user HTML cache; per-user IDB partitions; document MDM single-user policy; test in AC12                                                                 | stale data visible after account switch; MDM compliance reports             |
| R9  | **iOS PWA limits** (no background sync, no push, 7-day eviction, install friction)                                 | H              | M   | Position as BYOD/best-effort; on-launch warm-up and persist request; never promise payroll-critical iOS until native gate; document A2HS steps in-app                                                                                          | iOS sync failures rising; Safari eviction reports                           |
| R10 | **Android WebView offline boot fails** (SW not registering/persisting under `server.url`, frozen on background)    | M              | H   | M0 spike before shell build; SW shell-document caching; fallback plan (neutral shell + IDB hydration); device matrix includes WebView version                                                                                                  | M0 spike result; `offline.boot` failures; white screens                     |
| R11 | **Cookie/session behaviour in WebView** (SameSite=None, third-party blocking, MDM TLS proxies)                     | M              | H   | `server.url` same-origin keeps first-party cookies; test cookie persistence after force-stop and reinstall; fallback narrow token handshake (est. +1–2 wk)                                                                                     | sign-in loops on device; 401s after resume                                  |
| R12 | **App-store wrapper rejection** if public listing is ever attempted                                                | L for v1 (MDM) | M   | No public listing v1; internal/MDM + private app distribution; if public later, add native value/ABM unlisted; document the wrapper decision                                                                                                   | stakeholder request for public listing                                      |
| R13 | **MDM/IT schedule dependency** (enrollment, private app, signing custody, test devices)                            | H              | M   | Engineering supports with signed CI artifacts + app-config; IT owner named in M0 with dates; test on a real device early; document install/update/wipe                                                                                         | no enrolled test device by M1 end; keystore delay                           |
| R14 | **Replay storms / battery / function cost** (long queue, flapping network)                                         | L              | M   | Serial replay + backoff/jitter + single-flight; probe before drain; batch only if measured (do not pre-build); idle probes paused when backgrounded (NFR-8)                                                                                    | queue depth spikes; Vercel invocation bursts; battery complaints            |
| R15 | **Multi-device conflicts** (same member, phone + desktop)                                                          | M              | M   | Server remains arbiter (one active timer); queued conflicting start parks as `needs-review`; last-write-wins on edits; no merge UI                                                                                                             | needs-review cluster after pilots                                           |
| R16 | **Bundle/regression creep** (offline layer, plugins)                                                               | L              | M   | New deps ≤10KB gz target; keep heavy libs lazy; `pnpm perf:bundle` gate (NFR-9); no new UI framework                                                                                                                                           | budget check failures; cold-start regression                                |
| R17 | **SW/stale-asset breakage after deploy**                                                                           | L              | M   | Existing `preload-error-recovery`; cache-version bump; network-first navigations; update prompt instead of mid-replay reload                                                                                                                   | preload-error events; Sentry release regressions                            |
| R18 | **Scope creep into offline analytics/admin**                                                                       | H              | M   | Explicit §7 do-not-build + PRD non-goals; any exception needs an Epic change                                                                                                                                                                   | backlog requests for offline reports/exports                                |

---

## 12. What must be decided before coding

| #   | Decision                                                                                                                                                                      | Why it blocks work                                                         | Owner                                | Needed by |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------ | --------- |
| D1  | **Offline boot HTML caching**: cache the tracker shell document (fast, but SSR HTML may contain user data) vs neutral shell + IndexedDB hydration (safer, slightly more work) | Determines SW design, security review, and M2 acceptance                   | Lead + Owner/security                | M1 end    |
| D2  | **Data-at-rest approach**: WebCrypto AES-256-GCM with non-extractable key in IDB (recommended) vs native Keystore-backed plugin in v1 vs OS sandbox only                      | Affects WP7 scope and NFR-5 sign-off                                       | Owner/security + engineering         | M1 start  |
| D3  | **Auth offline grace value** (24h default per PRD) and where it is configured (Owner setting vs env flag)                                                                     | Affects `app.tsx` gate, FR-12, and UI copy                                 | Owner + Lead                         | M1        |
| D4  | **Which queries are allowed in the persisted cache** (member-only allowlist; exclude analytics/team)                                                                          | Security + storage + D1 interaction                                        | Engineering + Owner/security         | M2        |
| D5  | **Idempotency scope**: only `time_entries` (start + manual) vs all queued mutations; confirm stop/discard naturally idempotent                                                | Sizing WP1; schema review                                                  | Engineering                          | M1 start  |
| D6  | **Queue retention + dead-letter policy** (how long parked items are kept; when/whether payroll admin is notified)                                                             | Affects schema, storage growth, support workflow                           | Owner + HR/payroll                   | M1        |
| D7  | **Canonical server target / origin strategy** for the shell (prod URL, staging, custom domain, `allowNavigation`, trusted origins)                                            | Shell config + cookie/auth + MDM app-config                                | IT + Lead                            | M2 end    |
| D8  | **MDM mechanism**: managed Google Play private app vs EMM-distributed APK/AAB; keystore custody; versionCode/versioning; update cadence; remote-wipe runbook owner            | M3 cannot start without it; PRD OQ-1                                       | IT (decision), engineering (support) | M2        |
| D9  | **Device support floor** (Android 10+ per PRD baseline; exact models, RAM/storage, WebView version) and who procures test devices                                             | NFR-7 and the whole device test plan                                       | IT + Lead                            | M0        |
| D10 | **iOS PWA scope + native gate criteria** (what evidence triggers a native iOS shell; ABM availability; who decides and when)                                                  | M4 deliverable; avoids silent iOS promises                                 | Lead + IT                            | M2        |
| D11 | **Timeline semantics for sync metrics on mobile** (PRD NFR-3 says "within 5 min of connectivity returning", but a killed app cannot replay until opened)                      | Prevents an unachievable release gate; needs wording for resume-based sync | PM + Lead                            | M1        |
| D12 | **Location consent copy, retention, and whether device location is mandatory when the toggle is on** (PH DPA)                                                                 | FR-15/AC13, NFR-8, security review                                         | Owner + legal                        | M2        |
| D13 | **Telemetry content policy** (no descriptions/times/coordinates in Sentry; which ids are allowed)                                                                             | FR-19/NFR-5; engineering can implement immediately once confirmed          | Owner/security + engineering         | M1        |
| D14 | **Feature-flag ownership + rollout rings** and who can flip offline flags per workspace                                                                                       | M4 rollout; avoids redeploy-freeze confusion                               | Lead + engineering                   | M3        |
| D15 | **Manual-entry clock tolerance policy**: keep + flag >5 min (FR-4) and how the flag surfaces to payroll (needs-review vs report column)                                       | Affects server payload/audit and payroll workflow; avoid schema creep      | PM + payroll admin + engineering     | M1        |
| D16 | **Payroll cutoffs accept delayed sync** (PRD A4) and who reconciles parked items before cutoff                                                                                | Operational policy without which `needs-review` becomes lost work          | HR/payroll + Owner                   | M1 end    |
| D17 | **Bundle/plugin approval**: is the 2–3 plugin list (geolocation, app) acceptable under MDM security policy?                                                                   | Shell scope; unnecessary plugins mean re-release cycles                    | IT security                          | M2        |

---

## 13. Estimate summary and confidence

| Item                                      | Low (est.) | High (est.) | Basis                                                               |
| ----------------------------------------- | ---------- | ----------- | ------------------------------------------------------------------- |
| M0 decisions/baseline/instrumentation     | 0.5 wk     | 1 wk        | ~6 files of telemetry + spikes + doc                                |
| M1 durable core                           | 3 wk       | 6 wk        | 5 work packages; ~600–1,000 new/changed lines + tests               |
| M2 offline read/boot/auth                 | 2 wk       | 4.5 wk      | 2 routes + SW rewrite + auth gate + wipe                            |
| M3 Android shell + MDM                    | 2 wk       | 3.5 wk      | shell is thin; device QA dominates                                  |
| M4 hardening/rollout                      | 1 wk       | 1.5 wk      | fault-injection harness + runbook + flags                           |
| **Total to managed-Android v1 + iOS PWA** | **9 wk**   | **16.5 wk** | excludes IT/MDM, device procurement, PM/design, pilot calendar time |
| iOS native shell (if gate passes)         | +1.5 wk    | +2.5 wk     | same `mobile/` pattern                                              |
| A2 bundled shell delta instead of A1      | +3 wk      | +5 wk       | new write API + CORS + token auth                                   |

**Why the confidence is medium, not high:** the offline surface is small and already exists (queue, optimistic ids, `networkMode`, SW, manifest), so M1–M2 are mostly mechanical on known files. The uncertainty is concentrated in three places: SW offline boot inside the Android WebView (M0 spike de-risks it early), cached HTML vs security policy (D1/D2), and IT/MDM scheduling (R13). If the M0 spike fails and the neutral-shell fallback is chosen, add ~0.5–1 wk; if cookie sessions fail in the WebView, add ~1–2 wk for a narrow token handshake — both still far below Strategy B's 22–40 wk.

**Throughput assumption:** one engineer. With two engineers on disjoint scopes (e.g., one on server idempotency + queue, one on SW/cache/shell scaffold), calendar time could compress ~25–35%, but review and device testing do not parallelize and total effort is unchanged.

---

## Appendix A — Evidence log

Run on 2026-11-05 in `/Users/zafajardo/Documents/Development/Tickr` (tree at `05e24a2` + 6 unrelated uncommitted export edits; `docs/ways-of-work/` untracked):

| Check                     | Command (abridged)                                                                                | Result                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------- |
| Route files               | `find src/routes -type f \( -name '*.tsx' -o -name '*.ts' \)`                                     | 67 (44 tsx, 23 ts)                                                                          |
| Server fns                | `grep -rho "createServerFn(" src` / per-file `grep -rc`                                           | 136 total; 12 files; 108 in `src/lib/server/tracker.ts`                                     |
| Loaders/guards            | `grep -rn "loader:"` / `grep -rln "beforeLoad"`                                                   | 37 / 21 files                                                                               |
| Queries                   | `grep -rn "useQuery\|useMutation"`                                                                | 74                                                                                          |
| localStorage              | `grep -rl "localStorage"` / `grep -rn`                                                            | 9 files / 23 refs                                                                           |
| IndexedDB                 | `grep -rl "indexedDB"`                                                                            | 0                                                                                           |
| Browser APIs              | `grep -rlE "\b(window                                                                             | document)\."`/`navigator`                                                                   | 75 / 14 files |
| Server-calling components | `grep -rln "from '#/lib/server/" src/components`                                                  | 88                                                                                          |
| Tests                     | `find src -name '*.test.ts*'`                                                                     | 103; offline suite run: 3 files / 14 tests pass                                             |
| Playwright                | `find . -name e2e`; CI workflow; `docs/testing.md`                                                | installed, no config/suite/CI job                                                           |
| Migrations                | `ls drizzle`                                                                                      | 31                                                                                          |
| Bundle budgets            | `perf/bundle-budget.config.json`                                                                  | root 250KB, total 1,950KB, tracker 150KB, maplibre 270KB, exceljs 275KB, jspdf 140KB        |
| SW                        | `public/sw.js`                                                                                    | `/_build/*` cache-first, navigation network-first → `offline.html`; no API cache            |
| PWA                       | `public/favicon/site.webmanifest`, `src/routes/__root.tsx`, `src/hooks/usePwaInstall.ts`          | standalone, start `/app/time-tracker`, maskable icons, shortcuts; prod-only SW registration |
| Auth                      | `src/lib/auth.ts`                                                                                 | cookie sessions 30d/updateAge 1d, DB rate limits, `SameSite=None; Secure` prod              |
| Replay code               | `TimeTrackerDashboard.tsx:281–380`                                                                | serial drain, remove-after-await, delete+toast on non-network error                         |
| Idempotency               | `shared/schemas.ts`, `timer.server.ts:76`, `manual-entries.server.ts:90`, `src/db/schema.ts:1073` | no client mutation id anywhere                                                              |
| Clock rules               | `shared/schemas.ts:60`, `timer.server.ts:104`, `stopTimer:307`, `manual-entries.server.ts:73`     | 60s tolerance; start/stop clamped; manual entries trusted as sent                           |
| Offline boot              | `src/routes/app.tsx:21–71`                                                                        | live session `beforeLoad`; catch-all `redirect('/onboarding')` (lines 69–70)                |
| Sync patterns             | `TaskSyncCoordinator.tsx`, `lib/time-tracker/task-sync.ts`                                        | BroadcastChannel + visibility/focus/online/pageshow + 30s pulse poll                        |

## Appendix B — Key files touched by the recommended path

| File / dir                                                                                                                 | Change                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/db/schema.ts` + new `drizzle/00xx_*.sql`                                                                              | `time_entries.client_mutation_id` nullable + unique index                                           |
| `src/lib/server/tracker/shared/schemas.ts`                                                                                 | optional `clientMutationId` on start/manual schemas                                                 |
| `src/lib/server/tracker/timer.server.ts`                                                                                   | dedupe before active-timer pre-check                                                                |
| `src/lib/server/tracker/manual-entries.server.ts`                                                                          | dedupe on insert                                                                                    |
| `src/lib/server/tracker.ts`                                                                                                | 2 pass-through lines                                                                                |
| `src/lib/time-tracker/offline-queue.ts`                                                                                    | IndexedDB adapter, v2 schema, in-flight marker, dead-letter helpers, encryption, reuse existing API |
| `src/lib/time-tracker/offline-db.ts` (new)                                                                                 | tiny IDB key-value store (`idb-keyval`) + stores                                                    |
| `src/lib/time-tracker/crypto.ts` (new)                                                                                     | AES-256-GCM encrypt/decrypt + non-extractable key handling                                          |
| `src/lib/time-tracker/persist.ts` (new)                                                                                    | Query persister + dehydrate allowlist                                                               |
| `src/lib/time-tracker/use-offline-drain.ts` (new) / `src/components/time-tracker/offline/OfflineSyncCoordinator.tsx` (new) | replay moved out of the dashboard; mounted in the root shell (`__root.tsx`), not `AppShell`         |
| `src/components/time-tracker/offline/SyncStatusPill.tsx`, `SyncIssuesDrawer.tsx` (new)                                     | status + needs-review UI                                                                            |
| `src/integrations/tanstack-query/root-provider.tsx`                                                                        | `PersistQueryClientProvider` (client-only)                                                          |
| `src/routes/app.tsx`                                                                                                       | offline-safe `beforeLoad`/loader, no onboarding redirect on network failure, logout wipe            |
| `src/routes/app/time-tracker/index.tsx`, `src/routes/app/timesheet.tsx`                                                    | cached-loader fallback (`ensureWorkspaceAuthorization`)                                             |
| `public/sw.js`                                                                                                             | app-shell document cache + update prompt + cache version                                            |
| `src/routes/__root.tsx`                                                                                                    | SW update prompt hook (small)                                                                       |
| `mobile/` (new)                                                                                                            | Capacitor Android project, config, plugins, signing/CI                                              |
| `playwright.config.ts`, `e2e/offline/*` (new), `.github/workflows/check.yml`                                               | e2e job on device profiles                                                                          |
| `perf/bundle-budget.config.json`                                                                                           | only if an intentional budget change is approved                                                    |
