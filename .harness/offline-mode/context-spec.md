# Offline mode for the web tracker (hardening what exists)

Draft revision 1 · Harness spec · 2026-11-27

## Work item and sources

- Work item: `.harness/offline-mode/`. No GitHub issue was named; this spec starts from the user's request to "continue the offline mode and improve the system we already have."
- Product source: [PRD v3, offline-first mobile app](../../docs/ways-of-work/plan/cross-platform/offline-first-mobile-app/prd.md) (stakeholder-decided strategy O1 + O2, 2026-11-05). This spec covers the PRD's **web offline layer** (its milestones M1 and M2). It cites PRD `FR-`/`AC-` IDs instead of restating them.
- Engineering source: [implementation analysis](../../docs/ways-of-work/plan/cross-platform/offline-first-mobile-app/engineering/implementation-analysis.md) (work packages WP1–WP8, decisions D1–D17).
- Android shell: [mobile/README.md](../../mobile/README.md) and [mobile/offline-boot-qa.md](../../mobile/offline-boot-qa.md).

## Users and goal

The users are field and commuting employees (PRD personas P1, P2), and the people who rely on their hours: payroll (P5) and anyone sharing a device (P7). **Goal:** a member who has signed in once can open Trackly with no connection and land on their tracker. They can start and stop timers and add manual entries offline. Everything they capture reaches the server **exactly once** when the connection returns, and nothing is silently dropped. The same web build then runs unchanged inside the existing Android shell.

## Current behavior (verified 2026-11-27 on `staging` @ `7d57ed1`)

| Area               | What the code does today                                                                                                                   | Evidence                                                                                                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue storage      | Plain JSON in `localStorage` under `offline-queue:<workspace>:<member>`; storage errors are swallowed                                      | `load`/`save` in `src/lib/time-tracker/offline-queue.ts`                                                                                                |
| What is queued     | `startTimer`, `stopTimer`, `discardTimer`, `createManualEntry`, with client `startedAt`/`endedAt`                                          | `OfflineQueueItem` in the same file; enqueue calls in `src/components/time-tracker/dashboard/hooks/useTimerCore.ts` and `useDraftAndEdit.ts`            |
| Replay             | Runs only inside `TimeTrackerDashboard`'s effect, so it only happens while the tracker screen is mounted                                   | `drain()` in `src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx` (~line 325)                                                               |
| Server rejection   | The item is **deleted** from the queue, its dependents are dropped, and a toast is the only record                                         | Same `drain()`, `catch` branch                                                                                                                          |
| Idempotency        | None. No `client_mutation_id` anywhere; a lost response after commit can create a duplicate entry on retry                                 | `grep client_mutation_id src` → no hits; `timeEntries` in `src/db/schema.ts`                                                                            |
| Connectivity       | `navigator.onLine` plus `online`/`offline` events only; no reachability probe                                                              | `useNetworkStatus` in `src/lib/time-tracker/useNetworkStatus.ts`; `/api/health` exists in `src/routes/api/health.ts` but nothing on the client calls it |
| Offline boot       | `/app` `beforeLoad` awaits `getSessionFn()`; the loader's `catch` redirects **any** failure, including a network failure, to `/onboarding` | `Route` in `src/routes/app.tsx` lines 19–71                                                                                                             |
| Service worker     | Caches only `/offline.html` and `/_build/*` assets; offline navigations get the branded offline page, never the tracker                    | `public/sw.js` (header: "no offline data layer")                                                                                                        |
| Query cache        | In memory only (`networkMode: 'offlineFirst'`), lost on reload                                                                             | `getContext` in `src/integrations/tanstack-query/root-provider.tsx`                                                                                     |
| Logout             | `authClient.signOut` in three nav components; no local queue, cache, or storage wipe                                                       | `AppSidebar.tsx`, `MobileNav.tsx`, `Navbar.tsx`                                                                                                         |
| Encryption at rest | None                                                                                                                                       | —                                                                                                                                                       |
| Display copies     | Optimistic stopped entries kept in `localStorage` and reconciled against the queue                                                         | `reconcilePendingEntries` in `src/lib/time-tracker/pending-entries.ts`                                                                                  |

**Conflict with the documentation.** `mobile/README.md` and `mobile/offline-boot-qa.md` report passing emulator runs for an encrypted IndexedDB queue, cached offline boot, a 24-hour grace period, and offline sign-out. The Android tests (`StorageCapabilityTest`) and scripts (`mobile/scripts/boot-fixture-server.mjs`) import `src/lib/time-tracker/offline-db.ts`, `src/lib/time-tracker/offline-signout.ts`, `src/lib/local-signout.ts`, and `src/lib/time-tracker/__tests__/offline-bootstrap-fixtures.ts`. **None of these files exist on any branch** (`staging`, `main`, `origin/MCP`, `origin/mobile`), so that work is not in the repository. See [Q1](#q1).

## Scope

**Included** (PRD M1 + M2, web only):

- A durable, encrypted IndexedDB queue that replaces the `localStorage` queue, with a one-time migration.
- Idempotent replay through one new server column.
- A needs-review store instead of silent deletion.
- Replay from the root shell, a sync status pill, and a connectivity probe with backoff.
- Offline boot of the tracker and own timesheet from a cached session snapshot within a grace window.
- Cached catalogs and the member's own recent entries.
- Logout wipe.
- Automated tests for all of the above, plus one Playwright offline spec.

**Excluded:**

- Android shell changes, MDM, signing, and physical-device QA (PRD M3). The existing shell is reused as is.
- iOS, desktop, app-wide CSP, Sentry offline telemetry and alerts, and the fault-injection matrix as a release gate (PRD M4).
- Everything in [PRD §8](../../docs/ways-of-work/plan/cross-platform/offline-first-mobile-app/prd.md#8-out-of-scope). In particular: offline edit of synced entries, offline admin and catalog editing, team, analytics and report views, and any sync engine.

Location capture keeps today's behavior (`deviceLocation` on queued items) and gains no new location features.

## Journeys

1. **Happy path.** The member signs in online and opens the tracker, which caches the session snapshot, catalogs, and recent entries. The signal drops. They start a timer, stop it 90 s later, and add a manual entry. The pill shows "Offline · 3 pending." They reload the page or relaunch the app and still land on the tracker with the same 3 pending items. The signal returns while they are on the timesheet screen. The probe succeeds, replay runs serially, and the pill shows "Synced." Exactly 2 server entries exist.
2. **Lost response.** A replayed `startTimer` commits on the server, but the response never arrives. Retry returns the existing row, and still exactly one entry exists.
3. **Server rejects an item** (for example, its project was archived). The item moves to needs-review with the server message, and its dependent stop stays blocked rather than dropped. The rest of the queue syncs. The member chooses Retry or Discard; Discard asks for confirmation first.
4. **"Online" but unreachable** (captive portal, server down). `navigator.onLine` is true, the probe fails, and the pill shows offline with backoff. No item is marked failed.
5. **Grace expired offline.** Capture is blocked with "Sign in to keep tracking" and the pending count, and nothing is deleted. After an online sign-in, replay resumes. If a _different_ member signs in, the first member's queue is neither shown nor replayed.
6. **No snapshot** (never signed in on this device) offline: the sign-in gate appears, never `/onboarding`.
7. **Logout.**
   - With pending items, the member is warned and offered cancel or export.
   - On confirm, the queue, needs-review store, cached data, key, and session are removed.
   - Logout also works with no network.
8. **Storage failure** (quota, private mode, IndexedDB unavailable). A blocking error appears, the draft stays, and capture never claims success. There is no fallback to a lossy queue.

## Requirements

### [REQ-1] Durable, encrypted local queue

PRD FR-3, FR-20, NFR-5(b), NFR-7.

- A versioned IndexedDB store holds the queue, the needs-review items, and the in-flight marker, scoped per workspace + member.
- Payloads are encrypted with AES-256-GCM using a non-extractable WebCrypto key stored per user.
- A one-time, idempotent migration moves existing `offline-queue:*` and `pending-stopped-entries:*` `localStorage` data, then removes the old keys only after the IndexedDB write commits.
- Every item is schema-validated on read; corrupt items are parked, never dropped.
- `navigator.storage.persist()` is requested, and a warning shows if it is denied.
- A write failure keeps the draft and shows a blocking error with retry.
- **Accept:**
  - Unit tests cover migration, including running it twice with no duplicates.
  - Corrupt-item parking, write failure, and unavailable IndexedDB are tested (degraded-mode message, capture blocked).
  - A reload with 5 queued items keeps all 5 in order.
  - Stored records are not readable as plaintext.

### [REQ-2] Idempotent replay

PRD FR-4, FR-5, NFR-2.

- Add a nullable, unique `client_mutation_id` column to `time_entries`, set to the queue item `id`, in one Drizzle migration.
- `startTimer` and `createManualEntry` accept it. On a unique conflict they return the existing row, and this check runs before the active-timer pre-check.
- A replayed `stopTimer` on an already-stopped entry is a no-op success.
- An in-flight marker is written before each network call and cleared only on confirmation.
- Replay is serial, ordered, and single-flight across tabs, using the Web Locks API with an IndexedDB lease fallback.
- Replay sends the captured times. When the recorded server/device clock offset exceeds 5 minutes, the item is flagged for confirmation.
- **Accept:**
  - A server test calls `startTimer`/`createManualEntry` twice with the same id → one row, no duplicate audit log.
  - A client test kills replay after commit and before the response → after restart, exactly one entry.
  - Two tabs drain at once → each item is sent once.

### [REQ-3] Needs-review instead of silent loss

PRD FR-8, FR-10.

- A non-network rejection moves the item to needs-review with the server message, attempt count, and timestamps.
- Its dependents stay blocked.
- A drawer lists the items with Retry and Discard (Discard asks for confirmation).
- The current toast-and-delete path in `TimeTrackerDashboard` is removed.
- An overlap or "another timer is running" rejection lands here, and no second running timer is created.
- **Accept:** with a queued start, then stop, where the start is rejected → both appear in needs-review, nothing is deleted, and other items sync.

### [REQ-4] Replay from the root shell, with a probe and backoff

PRD FR-6, FR-9.

- An `OfflineSyncCoordinator` mounted client-only in `src/routes/__root.tsx`, beside `ServiceWorkerRegistrar`, owns replay.
- It triggers on launch, `online`, `visibilitychange`, `focus`, `pageshow`, and after re-auth, and the dashboard's `drain()` is deleted.
- Before replay, the unauthenticated `GET /api/health` probe must succeed, followed by a session check.
- Backoff is 5 s → 30 s → 2 min → 10 min with jitter. There is no retry loop while offline, and idle probes run at most once a minute while visible.
- The queue refuses to replay under a different workspace or member than its owner.
- **Accept:** replay starts while the member is on `/app/timesheet`. With the probe failing and `navigator.onLine === true`, nothing is marked failed.

### [REQ-5] Sync status

PRD FR-7, NFR-6.

- A pill reachable from every `/app` screen shows:
  - online or offline, based on the probe,
  - the pending count and the age of the oldest pending item,
  - the last sync time,
  - the needs-review count.
- Changes are announced through `aria-live`, targets are at least 44×44 px, and status is never conveyed by color alone.
- **Accept:** component tests for each state; the pending count updates within 1 s of an enqueue.

### [REQ-6] Offline boot within a grace window

PRD FR-13, FR-14, FR-15, FR-18.

- On a successful online load, store a session snapshot holding the user, workspace, member, permissions, and timezone, encrypted as in REQ-1.
- `/app` `beforeLoad` and the loader tell network failures apart from authorization failures:
  - On a network failure within grace (24 h default, set by `OFFLINE_GRACE_HOURS`), they boot from the snapshot.
  - Outside grace, or with no snapshot, they show the "Sign in to keep tracking" gate with the pending count.
  - They never redirect to `/onboarding` on a network error; a real authorization failure still does.
- `public/sw.js` caches the app shell for `/app/time-tracker` and `/app/timesheet` using the design chosen in [Q2](#q2). API and server-function traffic is never cached.
- `CACHE_VERSION` is bumped per release, and a waiting worker prompts for an update instead of reloading mid-replay.
- **Accept:** a Playwright spec runs against a production build:
  1. Visit once online.
  2. Go offline and reload.
  3. The tracker renders with the offline banner and pending count.
  4. Capture an entry.
  5. Go online, and the entry syncs once.
- Grace expiry and the no-snapshot case each show the gate.

### [REQ-7] Offline read and cached catalogs

PRD FR-11, FR-12.

- Persist an allowlisted subset of the Query cache, encrypted:
  - active clients, projects, tasks, tags, and departments,
  - the member's own entries for the last 14 days,
  - the member's own timesheet for the current and previous pay period.
- Analytics, team, report, and subscription data are never persisted.
- Catalogs older than 7 days show a stale indicator.
- Offline, synced entries are read-only with an explicit message, and queued entries stay editable.
- **Accept:** offline, all five catalog pickers are populated, the timesheet shows own data only, and other screens show "Online required."

### [REQ-8] Logout and shared-device wipe

PRD FR-16.

- One `wipeLocalData` path clears:
  - the IndexedDB stores and the key,
  - the offline `localStorage` and `sessionStorage` keys,
  - the cached shell documents,
  - the session snapshot.
- It is called from all three `signOut` call sites and works with no network.
- With pending items, logout warns first and offers cancel or export (JSON download).
- **Accept:**
  - After logout, nothing of member A remains in storage or pickers.
  - Member B signs in and sees only B's data.
  - Offline logout succeeds.

### [REQ-9] Compatibility with existing behavior and the Android shell

- Online behavior of timers, manual entries, the timesheet, and all other screens is unchanged.
- All existing tests stay green (`pnpm check-all`), `pnpm build` passes, and the offline layer adds at most 150 KB gzipped (`pnpm perf:bundle`).
- New web dependencies, if any, are 10 KB gzipped or less.
- No new routes or pages are added; offline UI is additive.
- The `mobile/` shell needs no code change.

### [REQ-10] Rollout flags

- `OFFLINE_QUEUE_V2_ENABLED` and `OFFLINE_CACHE_ENABLED` can each switch off the new queue or cache path by configuration, with no code change.
- When the queue flag is off, items already in IndexedDB are still replayed and never dropped.
- The `client_mutation_id` column is not gated.
- **Accept:** a test with each flag off shows the old online behavior and no data loss.

## Constraints, assumptions, dependencies

- **Constraint:** server functions stay the only write path. No new API is added; the only server change is the `client_mutation_id` column and dedupe ([PRD §10](../../docs/ways-of-work/plan/cross-platform/offline-first-mobile-app/prd.md#10-dependencies)).
- **Constraint:** the migration goes to a non-production database first. Per [the MCP work item](../tickr-mcp-read-only/context.md), the production Neon database has drift and `.env.local` is missing, so applying to production needs explicit confirmation and a rollback point.
- **Assumption:** members sign in online at least once per grace window (PRD A3).
- **Assumption:** the encryption threat model in PRD NFR-5 is accepted. It protects storage inspection and shared devices, not XSS or an unlocked device.
- **Dependency:** dependencies must be installed in this workspace. `node_modules` is missing today, so no test was run for this spec.
- **Dependency:** Playwright is already in `package.json`, but no offline spec exists yet.
- **Not covered:** the Graphify knowledge graph failed to install (`tree-sitter` wheel build error), so this spec was written from local search only.

## Questions

| ID                | Question                                                                                                                                                                                 | Impact | Blocks approval | If wrong                                                                                 | Recommended answer                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="q1"></a>Q1 | Does the uncommitted offline work exist on a teammate's machine: `offline-db.ts`, `offline-signout.ts`, `local-signout.ts`, and the bootstrap fixtures behind the passing emulator runs? | 4      | No              | If it exists, rebuilding it wastes weeks; if it is reused, it must still meet these REQs | Ask the `ecf0ef5` author. Proceed with this spec either way; recovered code is adopted only where it satisfies REQ-1, REQ-6, and REQ-8 |
| <a id="q2"></a>Q2 | Offline boot shell (PRD OQ-7/D1): cache the server-rendered tracker HTML, or a neutral shell that hydrates from IndexedDB?                                                               | 5      | **Yes**         | Cached SSR HTML can hold one user's data and leak it on a shared device                  | **Neutral shell + IndexedDB hydration**, which is safer and matches REQ-8's wipe guarantee                                             |
| <a id="q3"></a>Q3 | Encryption at rest (PRD OQ-8): non-extractable WebCrypto key in IndexedDB, or none in this slice?                                                                                        | 5      | **Yes**         | Without it, payroll, notes, and location data sit readable on shared devices             | **WebCrypto AES-256-GCM, non-extractable key**, as REQ-1 states                                                                        |
| Q4                | Grace window default                                                                                                                                                                     | 3      | No              | Too short blocks field work; too long weakens revocation                                 | 24 h via `OFFLINE_GRACE_HOURS` (PRD OQ-3 default)                                                                                      |
| Q5                | Deliver as one work item or split into two releases (REQ-1–5 durable core first, then REQ-6–8 offline boot)?                                                                             | 3      | No              | One big release delays the duplicate and loss fixes                                      | **Two releases in this one work item**, so the core fixes ship first; the workflow stage orders them                                   |

Approving this revision with Q2 and Q3 as recommended unblocks the workflow stage.
