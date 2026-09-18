# Server Write Reliability & Query Efficiency (Consolidated Mother Plan)

> **Status:** 📋 Planned
>
> **Consolidated:** 2026-09-18, from three plans whose timer-recording slices were absorbed by
> `plans/time-recording-performance/PLAN.md` during the merge pass. The three source plans —
> `await-serverless-background-writes`, `remove-redundant-database-round-trips`,
> `fix-overlap-cancel-bug` — were deleted as top-level folders; their **full original text is
> preserved verbatim below as Parts A–C**, so nothing was lost in the consolidation.
> **Owner rule:** this file is the single source of truth for the remaining (non-timer) scope.

## How to read this plan

Each Part is the complete, unmodified original plan (Verify First, Scope, Risks, Open Questions
intact), retitled as a Part. Implement Part by Part; each is independently shippable.

## Scope split with `plans/time-recording-performance`

The following slices moved out of these three plans and are **owned and tracked there** — do
not re-implement them here:

| Original plan                                    | Slice moved to `time-recording-performance`                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Part A (`await-serverless-background-writes`)    | The stop-path classification only: `timer.server.ts` `stopTimer` / `duplicateEntry` queue inserts are ENQUEUE-class (awaited, durable before response), rollup recompute LEAVE-class (deferred). Tracked there as Phase 2.                                                                                                                                                             |
| Part B (`remove-redundant-database-round-trips`) | The timer-path items: rollup refresh reduced from 4 round trips per target to ~1, and the `enqueueTimeEntry` fan-out replaced with a single statement. Tracked there as Phase 2. The **queue-consumer decision** (`recomputeQueuedAnalyticsRollups`: wire it up or delete it — its Open Question 1) stays HERE in Part B, because the stop path defers to whichever outcome is chosen. |
| Part C (`fix-overlap-cancel-bug`)                | The overlap-dialog extraction and rollback rule L1 for the _stop_ flow. Tracked there as Phases 1/3. Part C keeps the _edit-flow_ stale-display defect and the workspace-timezone fix.                                                                                                                                                                                                 |

**Sequencing note:** Part A and Part B both depend on the `time-recording-performance` Phase 2
outcome only where the stop path is concerned; their remaining scope (audit logs, newsletter,
sheet sharing, bulk archive, reports queries) is independent of it. Part C's dialog file
(`src/lib/time-tracker/overlap-confirmation.tsx`) is edited by both plans — land order is
either/or per the coordination note in `time-recording-performance` Phase 1.

---

# Part A — Await or Queue Serverless Background Writes

_(Original plan: `plans/await-serverless-background-writes/PLAN.md` — full text below.)_

> **Coordination — `plans/time-recording-performance/PLAN.md`:** that plan's Phase 2 applies this plan's AWAIT / ENQUEUE / LEAVE rule to the stop path: the gsheets and analytics queue inserts are ENQUEUE-class (awaited — durable before the HTTP response; never bare `void`, since Vercel may freeze the function after responding), and only the analytics rollup recompute is LEAVE-class (deferred). If the shared background-work helper from this plan has landed by then, the stop path should use it.

## Status

- [ ] Verify First section executed; severity confirmed against production evidence.
- [ ] Decision rule ratified: every fire-and-forget site classified as AWAIT / ENQUEUE / LEAVE.
- [ ] Shared background-work helper landed (or the decision recorded that none is needed).
- [ ] Access-granting writes awaited (`maybeShareSheetWithMember`, newsletter sends).
- [ ] Audit-log writes awaited or queued; silent `catch {}` in `audit-logger.server.ts` made observable.
- [ ] `bulkArchiveProjects` fan-out bounded and moved off the request path.
- [ ] Validation: typecheck, lint, tests, plus the manual cross-checks in Section 10.
- [ ] Reviewed against `plans/fix-gsheets-cron-http-method` and `plans/gsheets-write-integrity` for shared assumptions.

## Verify First (No Code Change)

**Why this section exists:** the defect is an _absence_ of work, not an error. Nothing throws, nothing logs, and the HTTP response is `200 OK`. You cannot see this bug by reading a stack trace — you have to go looking for the writes that should exist and aren't. **Run these before writing any code**, because if the evidence below shows the writes _are_ landing, the severity of this plan drops substantially (see "Confidence" at the end of this section).

### 1. Enumerate the surface (local, no access needed)

- [ ] Count the unawaited call sites. The audit estimated "roughly 40"; the precise measured number is larger, so confirm the real figure:

  ```bash
  grep -rn "void createAuditLog(\|void exportProject(\|void maybeShareSheetWithMember(\|void exportClientToSheet(\|void exportTagToSheet(\|void exportDepartmentToSheet(" src/ --include=*.ts | wc -l
  ```

  - [ ] Confirm the per-file distribution:
    ```bash
    grep -rn "void createAuditLog(\|void exportProject(\|void maybeShareSheetWithMember(" src/ --include=*.ts | cut -d: -f1 | sort | uniq -c | sort -rn
    ```
  - [ ] Confirm the unawaited calls really are inside request handlers (not inside an already-awaited wrapper): read each of the top files and trace whether the enclosing function is awaited by its caller.

- [ ] Confirm the silent-catch sites that make failures invisible:
  ```bash
  sed -n '85,95p' src/lib/server/tracker/audit/audit-logger.server.ts
  ```
- [ ] Confirm the newsletter comment that states the bug as intent:
  ```bash
  sed -n '64,74p' src/lib/server/newsletter.server.ts
  ```

### 2. Prove the writes are missing (requires production DB read access)

- [ ] Does the audit trail contain recent rows at all? An empty or stale result for high-traffic actions is the smoking gun:
  ```sql
  SELECT action, count(*) AS n, max(created_at) AS last_seen
  FROM audit_logs
  WHERE created_at > now() - interval '14 days'
  GROUP BY action
  ORDER BY last_seen DESC;
  ```
- [ ] Specifically check the actions that _cannot_ plausibly be zero, given the product's own usage:

  ```sql
  SELECT action, count(*), max(created_at)
  FROM audit_logs
  WHERE action IN ('MEMBER_INVITE_ACCEPT','PROJECT_ARCHIVE','PROJECT_ACTIVATE','GSHEET_SYNC','GSHEET_AUTO_SYNC','MEMBER_INVITE_RESEND')
  GROUP BY action;
  ```

  - [ ] `PROJECT_ARCHIVE` is emitted from a `Promise.all` loop (`void createAuditLog` at `src/lib/server/tracker/catalogs/projects.server.ts:182`) — if a bulk archive has ever been run and this count is 0 or far below the number of archived projects, the bug is confirmed live.

- [ ] Check for the queue rows that would indicate the auto-sync path has been exercised:
  ```sql
  SELECT count(*) AS pending_workspaces FROM pending_gsheets_syncs;
  ```
  (A non-zero count also feeds `plans/fix-gsheets-cron-http-method` — read that plan before interpreting it.)

### 3. Prove the missing writes reach users (requires production + Google/Resend access)

- [ ] **Sheet sharing.** Acceptance path calls `void maybeShareSheetWithMember(...)` at `src/lib/server/workspace-invites.server.ts:531`. Pick members who accepted an invite in the last 30 days and check whether their email appears in the workspace's Google Sheet share list (Drive → Share). Record how many accepted invitees are missing from it.
  ```sql
  SELECT wm.email, wm.status, wm.created_at
  FROM workspace_members wm
  JOIN workspaces w ON w.id = wm.workspace_id
  WHERE w.google_sheet_url IS NOT NULL
    AND wm.status = 'ACTIVE'
    AND wm.created_at > now() - interval '30 days'
  ORDER BY wm.created_at DESC;
  ```
- [ ] **Newsletter email.** Subscribe a test address and confirm whether exactly one, or zero, or repeated welcome mails arrive, and whether the internal notification arrives. Record observed behaviour. **Note:** this endpoint has a _separate, more serious_ defect (the `onConflictDoUpdate` + `.returning()` making `alreadySubscribed` permanently `false`, `src/lib/server/newsletter.server.ts:43-52`). That defect is owned by a different plan — do **not** fix it here. You only need its existence to interpret what you observe: if you see _repeated_ mails, you are looking at the dedupe bug; if you see _zero_ mails, you are looking at _this_ plan's bug.
- [ ] **Bulk report export.** Trigger a large export from the UI, confirm it succeeds for the user, and check whether the corresponding audit/log side effects landed.

### 4. Inspect the runtime (requires Vercel dashboard access)

- [ ] In Vercel → the production deployment → **Functions** → open a recent invocation of a route that performs an unawaited write. Confirm from the invocation duration and log tail whether the handler returned before the background work completed (look for `[mailer]` / `[cron/...]` / audit lines appearing _after_ the response is logged, or not at all).
- [ ] Search function logs for the strings the silent catches suppress:
  ```
  "[newsletter] Failed to send"
  "[mailer]"
  "Xendit webhook processing failed"
  ```
  Absence of these while the corresponding user actions occurred is consistent with (but does not alone prove) writes being dropped.
- [ ] If you have Vercel log drains or Sentry configured, confirm whether Sentry has any events for background-work failures. Per `plans/gsheets-write-integrity`, the silent `catch {}` blocks mean there should be **none** — an empty Sentry is expected, not reassuring.

### 5. Access you will likely need (and what to do without it)

| Evidence                | Access required                              | If you do not have it                                                             |
| ----------------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| Audit-log row counts    | Postgres read (`DIRECT_URL` in `.env.local`) | Ask a human with DB access to run the §2 queries and paste results. Do not guess. |
| Google Sheet share list | Drive access to the workspace sheet          | Ask a workspace OWNER to check one accepted invitee.                              |
| Vercel invocation logs  | Vercel dashboard / log drain                 | Ask for a screenshot of one invocation; otherwise mark this step UNVERIFIED.      |
| Newsletter mail arrival | A test mailbox                               | Self-serve; safe to do in production with a personal address.                     |

> **Confidence statement.** The _code_ finding is high confidence and fully verifiable locally: the call sites are unawaited, and the `catch {}` blocks are silent. What is **not** verified here — and cannot be, from the repository alone — is how often Vercel's isolate actually discards the pending work in this specific deployment. Vercel sometimes keeps an isolate warm long enough for a short background promise to settle, which would make the impact intermittent rather than total. Section 2 and §3 of this checklist exist to settle exactly that. **Do not assert "these writes never happen" in commit messages or user-facing communication until §2/§3 have been run.** The plan is worth executing either way, because "sometimes" is not an acceptable property for an access grant or an audit record.

## 1. Goal

Stop the application from depending on work that may never run. Today, ~65 call sites across 18 server files launch writes with `void` and return the HTTP response immediately; on a serverless platform the invocation can be frozen or reclaimed the moment the response is flushed, so the work is dropped with no error, no log, and no retry.

The deliverable is not "await everything" — awaiting a 2,000-row Google Sheets fan-out would simply convert a silent failure into a 30-second timeout (`vite.config.ts:23` sets `maxDuration: 30`). The deliverable is a **classified decision rule** applied to every site, so that:

- work a user was told succeeded (access grants, emails, audit records) is either awaited or handed to a durable queue that is actually drained;
- work that is too large to await is bounded and moved off the request path;
- work that is genuinely optional telemetry stops being _silent_ about its failure.

Users benefit because invited members reliably get sheet access and because the audit trail becomes usable as evidence. Operators benefit because a dropped write becomes an alertable error instead of a mystery.

## 2. Context Summary

### What exists today

The pattern is a bare `void` expression statement on an async function, inside a server function or API handler that has already produced its response value.

**Access-granting (highest user impact):**

- `src/lib/server/workspace-invites.server.ts:531` — `void maybeShareSheetWithMember(...)`, immediately after the `MEMBER_INVITE_ACCEPT` audit log at `:521-529`. The helper (`:40-52`) performs a real Google Drive permissions write via `shareSheetWithUser` (`src/lib/server/gsheets/auth.server.ts:167-185`). If it is dropped, the accepted member is told they joined the workspace but has **no access to the workspace spreadsheet**, and nobody is told.
- `src/lib/server/newsletter.server.ts:66-73`:
  ```ts
  // Fire-and-forget: send welcome email to subscriber + notify the team.
  // We never block the API response on email delivery.
  void sendWelcomeEmail(normalized).catch((err) =>
    console.error('[newsletter] Failed to send welcome email:', err),
  )
  void sendTeamNotification(normalized).catch((err) =>
    console.error('[newsletter] Failed to send team notification:', err),
  )
  ```
  The comment states the bug as intent. The `void` expression is the defect; the inline `.catch()` handlers are good practice but only run if the isolate survives long enough to reject.

**Audit trail (forensic impact):**

- `void createAuditLog(...)` across `src/lib/server/tracker/catalogs/*.server.ts` and beyond — measured distribution:

  | File                                                       | Unawaited sites |
  | ---------------------------------------------------------- | --------------- |
  | `src/lib/server/tracker/catalogs/projects.server.ts`       | 12              |
  | `src/lib/server/tracker/catalogs/clients.server.ts`        | 8               |
  | `src/lib/server/workspace-invites.server.ts`               | 7               |
  | `src/lib/server/tracker/catalogs/tags.server.ts`           | 6               |
  | `src/lib/server/tracker/manual-entries.server.ts`          | 5               |
  | `src/lib/server/tracker/catalogs/tasks.server.ts`          | 4               |
  | `src/lib/server/tracker/workspace-settings.server.ts`      | 3               |
  | `src/lib/server/tracker/catalogs/departments.server.ts`    | 3               |
  | `src/lib/server/tracker/catalogs/cohorts.server.ts`        | 3               |
  | `src/lib/server/tracker/members/members.server.ts`         | 2               |
  | `src/lib/server/tracker/members/member-billing.server.ts`  | 2               |
  | `src/lib/server/integrations/developer-accounts.server.ts` | 2               |
  | `src/lib/server/integrations/api-keys.server.ts`           | 2               |
  | `src/lib/server/gsheets/catalog-sync.server.ts`            | 2               |
  | `src/lib/server/tracker/location-history.server.ts`        | 1               |
  | `src/lib/server/tracker/bulk-report.server.ts`             | 1               |
  | `src/lib/server/gsheets/sync.server.ts`                    | 1               |
  | `src/lib/server/gsheets/settings.server.ts`                | 1               |

  Because these are unawaited **and** `createAuditLog` swallows its own errors (`src/lib/server/tracker/audit/audit-logger.server.ts:80-92`, `catch { // Audit log failures must never break the main operation }`), the forensic trail for `MEMBER_INVITE_ACCEPT`, `PROJECT_ARCHIVE`, `GSHEET_AUTO_SYNC` and similar can be empty for an entire deployment with zero signal anywhere.

- `src/lib/server/gsheets/sync.server.ts:298` — `void createAuditLog({ action: auditAction, ... })` immediately after the sync's own `workspaces` update at `:290-296`. Same class: the sync reports success to the caller while its audit row may never land.

**Unbounded fan-out (correctness + quota impact):**

- `src/lib/server/tracker/catalogs/projects.server.ts` `bulkArchiveProjects`:
  - `const bulkIdsSchema = z.object({ ids: z.array(z.string()).min(1) })` at `:139` — **no upper bound**.
  - The single bulk `UPDATE` at `:160-168` is correctly written.
  - But at `:171-201` it then runs `await Promise.all(rows.map(async (row) => { ... }))`, and inside that per-row callback does a client-name lookup (`:174-181`), a `void createAuditLog(...)` (`:182-191`), and a `void exportProject(...)` (`:192-199`).
  - `exportProject` reaches `catalog-sync.server.ts`, where each row costs **two** Sheets calls: a full-tab read via `getRowIndexForRecord` and then an `update`/`append`.
  - Selecting 1,000 projects therefore issues ~2,000 concurrent Google requests, most of which Google rate-limits (Sheets enforces roughly 300 read + 300 write requests/min/user), with nothing awaited and nothing retried — the 429s are dropped silently, and the invocation is torn down mid-flight.

**Why the response genuinely cannot wait for all of this:** `vite.config.ts:23` sets `maxDuration: 30` (read from the Nitro Vercel preset block) for every function. There is no per-route override anywhere in the repo.

### What already works correctly (build on these, do not invent)

- `src/routes/api/cron/sync-gsheets.ts` already implements a **durable queue drain**: `enqueueTimeEntry` (`src/lib/server/gsheets/sync-queue.ts`) writes a `pending_gsheets_syncs` row keyed by `workspace_id`, and the cron reads that table and calls `syncWorkspaceById` per workspace. This is the existing queue idiom in this codebase. **Caveat:** its reliability depends on the cron actually being invoked — see the cross-reference below.
- `src/lib/server/workspace-invites.server.ts:269` already **awaits** `sendInviteEmail(...)`. That is the correct shape for a user-facing email and should be the template for the newsletter sends.
- `src/lib/server/shared/import-utils.server.ts:28-36` provides `runInBatches(items, fn, batchSize = 25)`, the established bounded-concurrency helper.

### Cross-references (do not duplicate work)

- **`plans/fix-gsheets-cron-http-method`** — the `pending_gsheets_syncs` queue is only drained if `POST /api/cron/sync-gsheets` is actually invoked. If that plan's investigation shows the cron has never run, then _any_ resolution here that moves work onto that queue is unsafe until that plan is fixed. **Read it before choosing ENQUEUE for any site.**
- **`plans/gsheets-write-integrity`** — the same silent `catch {}` philosophy (and an additional `catch { return null }` that corrupts sheet data) is addressed there. This plan makes audit/export failures observable; that plan makes sheet-write failures fail closed.
- **`plans/database-performance (Workstream D)`** — the per-row Sheets fan-out in the import pipeline is the same shape as `bulkArchiveProjects`; both should converge on `runInBatches`.

### Assumptions

| Assumption                                                | Default assumed                                                                                 | If wrong                                                                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Vercel discards unawaited work on this deployment         | Assumed **partially or intermittently** true (see Verify First)                                 | If §2/§3 show the writes land reliably, de-prioritise the AWAIT class but still fix the silent-catch class. |
| A durable queue is acceptable infrastructure              | Assumed **not** required — reuse `pending_gsheets_syncs`-style queue tables already in Postgres | If a real queue (Upstash/SQS) is wanted, it becomes a new dependency and a separate plan.                   |
| Audit logs are a security control, not optional telemetry | Assumed **security control** (they exist to answer "who did what")                              | If the team considers them best-effort, downgrade the AWAIT class to observability-only.                    |

## 3. Scope

- `[CHECK]` Enumerate all unawaited writes and classify each as AWAIT / ENQUEUE / LEAVE using the decision rule in Section 7.
- `[CHECK]` Determine empirically whether dropped writes are occurring (Verify First §2–§4).
- `[CHECK]` Confirm the drain path for the ENQUEUE class actually runs (delegates to `plans/fix-gsheets-cron-http-method`).
- `[FIX]` Await `maybeShareSheetWithMember(...)` at `src/lib/server/workspace-invites.server.ts:531`.
- `[FIX]` Await the two newsletter sends at `src/lib/server/newsletter.server.ts:68` and `:71`.
- `[FIX]` Await the `createAuditLog(...)` call in `src/lib/server/gsheets/sync.server.ts:298`.
- `[FIX]` Convert the ~60 remaining `void createAuditLog(...)` sites in the catalog/member/integration server files to awaited calls (they are single small inserts, so awaiting is cheap).
- `[FIX]` Make `src/lib/server/tracker/audit/audit-logger.server.ts:89-91` observable: `console.error` with context so Sentry (already wired via `sentryTanstackStart`) captures it, while still not failing the caller's operation.
- `[FIX]` Add an upper bound to `bulkIdsSchema` (`src/lib/server/tracker/catalogs/projects.server.ts:139`) — the audit recommended `.max(100)` — and any sibling bulk-id schemas.
- `[FIX]` Move the per-row `exportProject` fan-out in `bulkArchiveProjects` (`:171-201`) off the request path or behind `runInBatches` with a small batch size.
- `[FIX]` Introduce one shared helper for "run this after the response safely" _only if_ the classification shows multiple ENQUEUE sites; otherwise await in place with no new abstraction.

## 4. Out of Scope

- **Fixing the newsletter dedupe bug.** `src/lib/server/newsletter.server.ts:43-52` (the `onConflictDoUpdate` + `.returning()` making `alreadySubscribed` permanently `false`) is a distinct defect with its own plan. This plan touches the same file at lines 68 and 71 only. Do not fold the dedupe fix in.
- **Fixing the Sheets cron HTTP method or `CRON_SECRET`.** Owned by `plans/fix-gsheets-cron-http-method`. This plan depends on it but does not change it.
- **Fixing `getRowIndexForRecord`'s swallowed read errors** (which cause duplicate sheet rows). Owned by `plans/gsheets-write-integrity`.
- **Rewriting `streaming-import.server.ts`'s per-row loops.** Owned by `plans/database-performance (Workstream D)`.
- **Introducing a new queue dependency** (Upstash, SQS, Vercel Queues, etc.). If the classification shows a genuine need, that is a follow-up plan, not this one.
- **Changing `maxDuration`.** Raising it is a separate decision with cost implications.
- **Restructuring `bulkArchiveProjects`'s client-name lookup** (an N+1 read) beyond what is required to bound the fan-out.
- **Backfilling audit rows that were already lost.** They cannot be reconstructed.

## 5. Affected Files and Folders

```txt
plans/await-serverless-background-writes/PLAN.md          (NEW)

src/lib/server/newsletter.server.ts                       (MODIFY)
  └─ await both sends at :68 and :71 (nothing else in this file)

src/lib/server/workspace-invites.server.ts                (MODIFY)
  ├─ :531 await maybeShareSheetWithMember(...)
  ├─ :521-529 await createAuditLog(...)
  └─ :48-50 keep the catch but log with context

src/lib/server/gsheets/sync.server.ts                     (MODIFY)
  └─ :298 await createAuditLog(...)

src/lib/server/tracker/audit/audit-logger.server.ts       (MODIFY)
  └─ :89-91 log the swallowed error instead of discarding it

src/lib/server/tracker/catalogs/projects.server.ts        (MODIFY)
  ├─ :139 bound bulkIdsSchema with .max(...)
  └─ :171-201 await audit logs; bound or offload exportProject fan-out

src/lib/server/tracker/catalogs/clients.server.ts         (MODIFY)
src/lib/server/tracker/catalogs/tags.server.ts            (MODIFY)
src/lib/server/tracker/catalogs/tasks.server.ts           (MODIFY)
src/lib/server/tracker/catalogs/departments.server.ts     (MODIFY)
src/lib/server/tracker/catalogs/cohorts.server.ts         (MODIFY)
src/lib/server/tracker/members/members.server.ts          (MODIFY)
src/lib/server/tracker/members/member-billing.server.ts   (MODIFY)
src/lib/server/tracker/manual-entries.server.ts           (MODIFY)
src/lib/server/tracker/workspace-settings.server.ts       (MODIFY)
src/lib/server/tracker/location-history.server.ts         (MODIFY)
src/lib/server/tracker/bulk-report.server.ts              (MODIFY)
src/lib/server/integrations/developer-accounts.server.ts  (MODIFY)
src/lib/server/integrations/api-keys.server.ts            (MODIFY)
src/lib/server/gsheets/catalog-sync.server.ts             (MODIFY)
src/lib/server/gsheets/settings.server.ts                 (MODIFY)
  └─ all of the above: await the existing createAuditLog / export calls

src/lib/server/shared/import-utils.server.ts              (MODIFY)
  └─ only if a shared batching/queue helper is added here

src/lib/server/shared/background-work.server.ts           (NEW — conditional)
  └─ ONLY if the classification identifies 3+ ENQUEUE sites needing
     the same bounded-fan-out treatment. Otherwise do NOT create this
     file; await in place instead.
```

No database migration is expected. No frontend files are in scope.

## 6. Database Design

**N/A — no schema change is expected.**

The ENQUEUE option reuses the existing `pending_gsheets_syncs` table (`src/db/schema.ts:1314-1321`, `workspace_id` as PRIMARY KEY, which is why `onConflictDoNothing()` in `src/lib/server/gsheets/sync-queue.ts` works correctly). If, and only if, the classification concludes that a _general-purpose_ background-work queue is required, that would need a new table — but that is explicitly out of scope (Section 4) and would be its own plan. Record the decision either way in Section 13.

## 7. Backend Implementation

### 7.1 The decision rule (apply to every site)

Classify each unawaited site into exactly one bucket. The rule is ordered — the first matching bucket wins.

| Bucket                             | Applies when                                                                                                                                                                                            | Treatment                                                                                                                                                        | Rationale                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **A. AWAIT**                       | The work is _small_ (one or two round-trips) **and** the caller has already told the user, or is about to tell the user, that something succeeded. Includes anything that grants access or entitlement. | Replace `void f()` with `await f()`.                                                                                                                             | A single insert or one Sheets call costs a fraction of the 30s budget. Making the user wait ~100ms is strictly better than lying to them. |
| **B. ENQUEUE**                     | The work is _fan-out_ (O(rows)) and awaiting it would plausibly exceed the 30s budget.                                                                                                                  | Write a durable row that an existing drain path picks up, or bound with `runInBatches(items, fn, smallN)` and accept partial progress with a recorded remainder. | Cannot await; must not drop; must be resumable.                                                                                           |
| **C. LEAVE (but make observable)** | The work is genuinely optional telemetry with **no** user-facing promise and **no** security/forensic role.                                                                                             | Keep it unawaited, but replace any bare `catch {}` with a contextual `console.error`.                                                                            | Best-effort is an acceptable product decision; _silent_ best-effort is not.                                                               |

### 7.2 Applying the rule to the known sites

| Site                                                                                   | Bucket                    | Why                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace-invites.server.ts:531` `maybeShareSheetWithMember`                          | **A — AWAIT**             | Grants Drive access. The invite flow already reports success to the user. It is one `fetch` (`auth.server.ts:167-185`). Non-negotiable.                                                                                                                   |
| `newsletter.server.ts:68` `sendWelcomeEmail`                                           | **A — AWAIT**             | The endpoint returns `{ success: true }` to a user who was promised a welcome email. Must be awaited, or the API response must change to say the email is queued — pick one and make them agree.                                                          |
| `newsletter.server.ts:71` `sendTeamNotification`                                       | **A — AWAIT** (or drop)   | Internal notification. Awaiting is cheap. If it proves flaky, prefer removing it over silently dropping it.                                                                                                                                               |
| `gsheets/sync.server.ts:298` `createAuditLog`                                          | **A — AWAIT**             | Single insert; the sync has already written its own state and reports success.                                                                                                                                                                            |
| `void createAuditLog(...)` — all ~60 remaining sites                                   | **A — AWAIT**             | Single-insert cost. Audit records are a security control (they answer "who archived/edited/approved what"), not telemetry. This is the largest mechanical change in the plan and the lowest-risk per site.                                                |
| `projects.server.ts:192` `void exportProject(...)` inside `Promise.all(rows.map(...))` | **B — ENQUEUE**           | O(rows) × 2 Sheets calls each. Cannot be awaited for large `ids`. Best interim treatment: `runInBatches` with a small batch size **and** a bound on `ids`; the durable-queue treatment is preferred but is gated on `plans/fix-gsheets-cron-http-method`. |
| `projects.server.ts:174-181` per-row client-name lookup                                | **B** (bundle with above) | N+1 read. Not the headline defect, but it is inside the same loop being rewritten, so handle it in one pass rather than twice.                                                                                                                            |
| `audit-logger.server.ts:89-91` bare `catch {}`                                         | **C → observable**        | Keeping the caller's operation alive is the right call; discarding the error is not. Log with the action/workspace so Sentry captures it.                                                                                                                 |
| `workspace-invites.server.ts:48-50` bare `catch {}`                                    | **C → observable**        | Same reasoning; also cross-referenced by `plans/gsheets-write-integrity`.                                                                                                                                                                                 |

### 7.3 Behaviour changes to specify

- **Awaited audit logs must not become a new failure mode.** Awaiting `createAuditLog` is only safe because it already swallows its own errors internally (`audit-logger.server.ts:80-92`). Preserve that property — do **not** convert audit failures into user-facing errors as part of this plan. The change is "await it so it actually runs", not "make it able to fail the request".
- **A bound on `bulkIdsSchema` is a user-visible contract change.** Today the UI can submit an unbounded `ids` array. Adding `.max(100)` will cause the server to reject larger selections. The frontend must either chunk the request client-side or the UI must communicate the limit. Confirm which before implementing; see Section 13.
- **Partial progress must be reported.** For any ENQUEUE/bounded site, the caller must be able to tell the user "archived 100 of 340; the rest will sync shortly" rather than implying completion. If the response shape cannot express that, the queue must carry the remainder durably instead.

## 8. Frontend Implementation

**N/A — no new UI is required.**

Two conditional touchpoints, only if the corresponding backend decision lands that way:

1. If `bulkIdsSchema` gains an upper bound, the bulk archive caller must chunk or warn (see Section 7.3). Locate the caller before implementing; it is a UI affordance change, not a new component.
2. If the newsletter endpoint stops returning `{ success: true }` immediately, the subscribe form's success copy must match reality.

Neither introduces new components, routes, or state.

## 9. Access Control

**N/A — this plan changes no permissions.**

It does strengthen an existing control: audit logging. The sites in scope already call `assertCanManageCatalogs` / `assertPermission` _before_ the writes being re-plumbed, so no authorization decision changes. The only access-adjacent behaviour change is that `maybeShareSheetWithMember` becomes reliable — which _grants_ access that the invite flow already intended to grant. This makes the system match its documented behaviour rather than widening it.

One note for the reviewer: `createAuditLog` is called from paths gated by different permissions across the 18 files. When converting each `void createAuditLog(...)` to `await`, confirm you are not reordering it _before_ the permission check in any handler. Await in place.

## 10. Validation

### Commands

`pnpm <script>` fails in this environment with an EPERM error writing to `~/Library/pnpm`. Use the direct binaries:

```bash
# Type check — must be clean before and after.
./node_modules/.bin/tsc --noEmit -p tsconfig.json

# Unit tests.
./node_modules/.bin/vitest run

# Lint — the repo enforces zero warnings.
npx eslint src --ext .ts,.tsx --max-warnings 0

# Production build (confirms no server-only module leaked into a client chunk).
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> **Pre-existing failure — not yours.** `./node_modules/.bin/vitest run` currently reports **1 failing test in `src/lib/time-tracker/payroll-periods.test.ts`**. It is a date-dependent test that omits the `now` argument and has been failing since 2026-09-15. It is **not** a regression from this plan. Baseline before you start; treat "374 passing, 1 failing" as the expected result.

### Static verification

- [ ] The unawaited-call count drops to only the sites explicitly classified as **C — LEAVE**:
  ```bash
  grep -rn "void createAuditLog(\|void exportProject(\|void maybeShareSheetWithMember(" src/ --include=*.ts
  ```
- [ ] No bare `catch {}` remains in the in-scope files:
  ```bash
  grep -rn -A1 "} catch {" src/lib/server/tracker/audit/audit-logger.server.ts src/lib/server/workspace-invites.server.ts src/lib/server/gsheets/*.server.ts
  ```
- [ ] No `void ` expression statement was _deleted_ instead of awaited — verify the call still exists in each hunk:
  ```bash
  grep -rn "createAuditLog(" src/lib/server/tracker/catalogs/*.server.ts | wc -l
  ```

### Manual / integration verification

- [ ] **Invite acceptance → sheet access.** In a staging workspace with a Google Sheet connected, accept an invite as a new member and confirm within one request that the member's email appears in the sheet's share list (Drive → Share). Repeat 3× to catch intermittency.
- [ ] **Newsletter.** Subscribe a fresh address; confirm the welcome mail arrives and that the internal notification is generated. (Interpret repeated mails as the _other_ plan's dedupe bug, not this one.)
- [ ] **Audit trail.** After a batch of catalog operations (create/edit/archive a client, project, tag, department), confirm the expected rows exist:
  ```sql
  SELECT action, count(*), max(created_at)
  FROM audit_logs
  WHERE created_at > now() - interval '1 hour'
  GROUP BY action ORDER BY action;
  ```
  Every operation you performed should appear. Compare this result against the same query run _before_ the change — the delta is the evidence.
- [ ] **Bounded bulk archive.** Attempt to archive more than the new limit and confirm the response is a clear, actionable message rather than a raw Zod error.
- [ ] **No latency regression on hot paths.** Time a timer stop and a manual entry create before and after (the awaited audit insert adds one small round-trip). Neon round-trips in-region should make this imperceptible; confirm rather than assume.
- [ ] **Error observability.** Deliberately break an audit write (e.g. point at a bad table in a local branch) and confirm the error reaches the log/Sentry instead of vanishing.

## 11. Sequencing

Each phase should be independently shippable.

- [ ] **Phase 0 — Classify (no code).** Run the Verify First checklist. Produce the AWAIT / ENQUEUE / LEAVE table for all sites. Confirm the drain path in `plans/fix-gsheets-cron-http-method`. Ship nothing.
- [ ] **Phase 1 — Make failures visible (lowest risk, immediate value).** Replace the bare `catch {}` blocks at `audit-logger.server.ts:89-91` and `workspace-invites.server.ts:48-50` with contextual logging, and in `catalog-sync.server.ts:143-145` and `:163-165` if `plans/gsheets-write-integrity` has not already claimed them. No behaviour change. **Coordinate to avoid a double-edit of `catalog-sync.server.ts`.**
- [ ] **Phase 2 — Access-granting writes.** Await `maybeShareSheetWithMember` (`:531`), the two newsletter sends (`:68`, `:71`), and the sync audit (`sync.server.ts:298`). Small, high-value, independently verifiable.
- [ ] **Phase 3 — Audit-log conversion.** Mechanically convert the remaining `void createAuditLog(...)` sites to `await`, file by file, with the typecheck and tests run per file. Confirm the awaited calls are still placed after their permission checks.
- [ ] **Phase 4 — Bounded bulk archive.** Add the `bulkIdsSchema` bound, adjust the caller, and bound or queue the `exportProject` fan-out. **Blocked on Phase 0's drain-path answer** — if the cron is not running, do not enqueue; bound with `runInBatches` and accept partial progress with a reported remainder instead.
- [ ] **Phase 5 — Re-validate.** Re-run the audit-trail query and compare against the pre-change baseline. Update this plan's Status checklist.

## 12. Risks & Considerations

| Risk                                                                                                  | Likelihood       | Impact | Mitigation                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------------- | ---------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Awaiting audit logs adds latency to every mutating request                                            | High (by design) | Low    | Each audit write is one small insert. Measure the timer-stop path before/after. If it regresses noticeably, batch audit inserts per request instead of per operation.                                                                                                                                                                                                                                    |
| Awaiting `maybeShareSheetWithMember` makes the invite-accept request fail when Google is down         | Medium           | Medium | Wrap in `try/catch` so the accept still succeeds, but **log loudly** and consider recording a "sheet share pending" marker rather than swallowing. Do not simply revert to `void`.                                                                                                                                                                                                                       |
| Awaiting newsletter sends makes a public unauthenticated endpoint slower, worsening the abuse surface | Medium           | Medium | The endpoint needs rate limiting regardless (noted in the newsletter dedupe plan). Awaiting does not create the exposure; it makes an existing one slower. Do not let this block the fix.                                                                                                                                                                                                                |
| `.max(100)` on `bulkIdsSchema` breaks an existing UI flow                                             | High             | Medium | Put the client-side chunking/warning in the same PR, or stage the bound behind a higher limit first. Verify against a real bulk-archive flow.                                                                                                                                                                                                                                                            |
| **Google Sheets API quota** — batching changes the _shape_ of outbound traffic                        | Medium           | High   | `runInBatches` with a batch size ≤ 10 for Sheets writes, not the default 25, since each row costs 2 calls. Google enforces ~300 read + 300 write requests/min/user. Monitor 429s in the `console.error` added in Phase 1. **Rollback:** the change is bounded-fan-out or queue-only; reverting to the previous `Promise.all` restores prior behaviour exactly, so a revert is a single-commit operation. |
| **Resend quota** — awaiting sends means quota exhaustion now surfaces as a user-visible error         | Medium           | Medium | Awaiting does not increase sends, it makes failures visible. Confirm the subscribe form can render a failure state. **Rollback:** revert to `void` restores silent behaviour (not recommended) — prefer fixing the quota instead.                                                                                                                                                                        |
| **Xendit** — not touched by this plan                                                                 | N/A              | N/A    | No outbound Xendit traffic changes. Listed for completeness because other plans in this batch do touch it.                                                                                                                                                                                                                                                                                               |
| A single `await` is added to a code path that is itself inside a `db.transaction(...)`                | Low              | High   | Note that `db.transaction()` throws unconditionally on the neon-http driver (`node_modules/drizzle-orm/neon-http/session.js:151`). If any in-scope call site sits inside a transaction block, that block is already dead code and is out of scope here — flag it rather than "fixing" it in this plan.                                                                                                   |
| ENQUEUE class silently depends on a cron that never runs                                              | Medium           | High   | This is exactly the failure being fixed, one level up. **Do not choose ENQUEUE for any site until `plans/fix-gsheets-cron-http-method` verifies the drain path.**                                                                                                                                                                                                                                        |
| Converting ~60 sites by hand introduces a typo or a dropped call                                      | Medium           | Medium | Do it per file with the typecheck and test suite between files. Use the grep counts in Section 10 as a before/after invariant.                                                                                                                                                                                                                                                                           |
| Sentinel: awaited work still exceeds 30s on a very large fan-out                                      | Medium           | High   | That is precisely why the ENQUEUE bucket exists. If a site is AWAIT-classified but its worst case approaches 30s, it is misclassified — reclassify rather than raising `maxDuration`.                                                                                                                                                                                                                    |

## 13. Open Questions

- [ ] **Is the ENQUEUE bucket even usable?** Blocked on `plans/fix-gsheets-cron-http-method` confirming that `POST /api/cron/sync-gsheets` is invoked. If the cron does not run, the ENQUEUE bucket must be replaced with bounded `runInBatches` + a reported remainder for this iteration.
- [ ] **Should audit logging be a hard requirement or best-effort?** Assumed security control (⇒ AWAIT) in Section 2. If the team considers it best-effort, the ~60 conversions collapse into a single observability change.
- [ ] **Is `sendTeamNotification` worth keeping?** It is an internal notification to a hardcoded recipient. Awaiting it is cheap; removing it is cheaper. Decide rather than leaving it ambiguous.
- [ ] **What is the right bound for `bulkIdsSchema`?** The audit suggested `.max(100)`. Confirm against real usage — what is the largest legitimate bulk selection? The answer determines whether client-side chunking is needed.
- [ ] **Should the newsletter endpoint's response shape change** to acknowledge that email delivery is now part of the request, or should delivery stay off the response path via a queue? Assumed AWAIT in Section 7.2; a queue would contradict the "no new queue dependency" boundary in Section 4.
- [ ] **Do we need a general-purpose background-work helper?** Only create `src/lib/server/shared/background-work.server.ts` if Phase 0 finds 3+ ENQUEUE sites with identical needs. Otherwise awaiting in place is simpler and adds no abstraction.
- [ ] **Who owns reconciling the four plans that touch `catalog-sync.server.ts`?** This plan (Phase 1), `plans/gsheets-write-integrity`, and `plans/database-performance (Workstream D)` all reference it. Assign a merge order before any of them land to avoid conflicting edits.

---

# Part B — Remove Redundant Database Round Trips

_(Original plan: `plans/remove-redundant-database-round-trips/PLAN.md` — full text below. The rollup-refresh and `enqueueTimeEntry` timer-path items are superseded by `time-recording-performance` Phase 2; the queue-consumer Open Question 1 stays here.)_

> **Coordination — `plans/time-recording-performance/PLAN.md`:** the stop-path slice (`stopTimer` / `duplicateEntry` no longer awaiting the full rollup refresh inside the request) is owned by that plan. This plan keeps the refresh cost reduction (4 → ~1 round trip per target) and the queue-consumer decision (`recomputeQueuedAnalyticsRollups` has no caller). The stop path must keep working under whichever outcome this plan picks — re-check both plans when implementing either.

## Status

- [ ] Verify First block executed; round-trip counts per request confirmed against the cited lines.
- [ ] Decision recorded on `recomputeQueuedAnalyticsRollups` (wire it up or delete it) — Open Question 1.
- [ ] Rollup refresh reduced from 4 round trips per target to ~1, with bounded concurrency.
- [ ] Unconsumed rollup queue removed from the synchronous path, or given a real consumer.
- [ ] `reports.server.ts` serialized `COUNT(DISTINCT ...)` folded into the existing `Promise.all`.
- [ ] Separate `count(*)` scans replaced with `count(*) OVER ()` where the empty-page case is handled.
- [ ] Duplicate predicate scans removed at the three cited sites.
- [ ] `enqueueTimeEntry` fan-out replaced with a single statement and the unused parameter removed.
- [ ] Validation commands in Section 10 all pass, with a post-deploy round-trip count recorded.

## Verify First (No Code Change)

Run these **before changing any query**. This plan removes work by _counting_ work, so the first step is establishing how many round trips and scans each request actually performs. **[needs DB access]** items require production or staging credentials; without them, the redundant statements are still provably redundant by reading the code (items 6–9 are pure static checks), but the measured improvement cannot be claimed.

**1. Confirm Neon's HTTP driver is in use — this is why round trips, not CPU, are the unit of cost:**

```bash
cat src/db.ts
```

Expected: `drizzle-orm/neon-http` with `neon(process.env.DATABASE_URL!)`. Consequence: **each `await` is an HTTPS round trip**, so sequential awaits dominate latency. This is the premise of the entire plan. If the driver were `pg`-based with a connection pool, batching would matter far less and the plan would need re-scoping.

**2. Count the round trips in the rollup refresh — the headline finding [needs DB access for timing, not for the count]:**

```bash
sed -n '155,222p' src/lib/server/tracker/analytics-rollups.server.ts
```

Count the awaits per target in `refreshAnalyticsRollups` (`:160-192`): `enqueueAnalyticsRollup` (insert), `recomputeAnalyticsDailyMemberMetric` (which itself does 2 parallel reads + 1 upsert + possibly a delete), then an explicit `delete` of the row just inserted. That is **4 sequential round trips per target**, two of which are pure churn.

**3. Prove the queue has no consumer** — this is a strong, purely static check:

```bash
grep -rn "recomputeQueuedAnalyticsRollups" src/ scripts/ --include=*.ts --include=*.tsx
```

Expected: **one** match — its own `export async function` definition at `analytics-rollups.server.ts:203`. No caller. That means `pending_analytics_rollups` is written to and deleted from within the same request and is never read by anything, so the durable-queue machinery serves no purpose. **If a caller appears, this finding changes** — re-scope accordingly.

**4. Confirm the queue churn empirically [needs DB access]:**

```sql
-- If the synchronous path inserts and deletes in the same invocation, and
-- nothing else writes here, this table should be empty (or near-empty).
SELECT count(*) AS pending_rows FROM pending_analytics_rollups;
```

```sql
-- The table's whole purpose is to be drained by a consumer. Check growth over
-- time — a monotonically rising count would mean rows ARE accumulating and
-- something else depends on them.
SELECT date_trunc('hour', created_at) AS hour, count(*)
FROM pending_analytics_rollups
GROUP BY 1 ORDER BY 1 DESC LIMIT 24;
```

Expected: near-zero, consistent with "inserted then immediately deleted, never consumed". **A growing count contradicts the premise** — investigate before removing the enqueue/delete.

**5. Confirm `runInBatches` exists and note its signature constraint:**

```bash
sed -n '22,40p' src/lib/server/shared/import-utils.server.ts
```

Expected:

```ts
export async function runInBatches<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  batchSize = 25,
): Promise<void>
```

**Note the `Promise<void>` return type** — callers whose operation returns a value must adapt (the codebase already does this elsewhere as `db.update(...).then(() => undefined)`). Confirm the batch size of 25 is appropriate for this workload: a rollup recompute is heavier than a row update, so a **smaller** batch (e.g. 10) is likely right, since `runInBatches` fires all 25 concurrently.

**6. Verify the serialized `COUNT(DISTINCT ...)` has no dependency on the preceding wave:**

```bash
sed -n '230,360p' src/lib/server/tracker/reports.server.ts
```

Purpose: confirm the `Promise.all` covering the six main queries and the `COUNT(DISTINCT projectId)` at `:344-351` share the same `whereClause`, and that the count result is used only for presentation. If it genuinely depends on an earlier result, it cannot be moved — verify before folding it in.

**7. Verify the three `count(*)` sites share a predicate with an adjacent paginated query:**

```bash
grep -n "count(\*)" src/lib/server/tracker/reports.server.ts src/lib/server/tracker/analytics.server.ts src/lib/server/tracker/department-dashboard.server.ts
```

Expected matches at `reports.server.ts:287-291`, `analytics.server.ts:385-388`, `department-dashboard.server.ts:1087-1090`. For each, confirm the surrounding `Promise.all` already runs a paginated query with the **same** `whereClause` — that is the precondition for the `count(*) OVER ()` consolidation.

**8. Verify the duplicate-predicate sites really are duplicates:**

```bash
sed -n '440,490p' src/lib/server/tracker/department-dashboard.server.ts
sed -n '145,180p' src/lib/server/tracker/state.server.ts
sed -n '845,900p' src/lib/server/tracker/department-dashboard.server.ts
```

Purpose: for each site, compare the two (or three) predicates **character by character**. The audit reports them as identical, but "nearly identical" is not the same as "identical" — if the tag query differs by even one condition, it is not redundant and must not be removed. This is the check that prevents a silent correctness change.

**9. Verify the `enqueueTimeEntry` parameter is genuinely unused — a purely static, conclusive check:**

```bash
cat src/lib/server/gsheets/sync-queue.ts
grep -n -A 6 "pendingGsheetsSyncs = pgTable" src/db/schema.ts
```

Expected: `enqueueTimeEntry(workspaceId: string, _entryId: string)` — the underscore-prefixed parameter is unused, and `pending_gsheets_syncs` has `workspaceId` as its **primary key**. Therefore `ids.map((id) => enqueueTimeEntry(wsId, id))` issues N inserts of the _identical_ row, of which N−1 are guaranteed no-ops by `onConflictDoNothing`. Conclusive without a database.

**10. Confirm all call sites of the to-be-changed function, so none is missed:**

```bash
grep -rn "enqueueTimeEntry" src/ scripts/ --include=*.ts
```

Expected: the definition plus six call sites in `manual-entries.server.ts` (`:131`, `:221`, `:311`, `:353`, `:397`, `:468`) and one import in `timer.server.ts`. **If the signature changes, every call site changes** — enumerate them before editing.

**11. Capture the round-trip baseline for a representative request [needs staging access]:**

Enable query logging (or use `pg_stat_statements`) and perform one timer stop, one bulk entry delete, and one analytics rollup refresh. Count the statements per request:

```sql
SELECT calls, mean_exec_time, query
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 20;
```

Purpose: turns "this looks redundant" into "this request issues N statements, of which M are provably no-ops". That is the number the PR should report before and after.

**What you cannot verify without extra access:** per-request round-trip counts and `pg_stat_statements` data (item 11) need staging/production access. Items 3, 9, and 10 are conclusive static checks and need nothing. **If you have no database access, the code-reading case for removal is still sound — but do not claim a measured latency improvement.**

---

## 1. Goal

Remove database work that is provably unnecessary — statements whose results are never read, statements that re-derive a value already in hand, and statements that issue N identical writes where one would do.

- **Eliminate pure churn:** `refreshAnalyticsRollups` does 4 sequential round trips per target, two of which insert and then delete a queue row that nothing ever consumes.
- **Remove a serialization:** `reports.server.ts:344-351` runs a full-range `COUNT(DISTINCT ...)` as a separate `await` immediately after a six-query `Promise.all`, with no dependency on it — a free hop deleted.
- **Stop scanning the same predicate twice:** three sites run a dedicated `count(*)` where `count(*) OVER ()` yields the total from the paginated query already in flight; three more run a second full scan of a predicate identical to one just executed.
- **Bound concurrency:** the rollup refresh uses an unbounded `Promise.all` over all targets — the exact pattern `runInBatches(..., 25)` exists in this codebase to prevent.
- **Delete a guaranteed no-op fan-out:** `manual-entries.server.ts:468` maps `enqueueTimeEntry` over every id, but the function ignores its second parameter and the table is keyed on `workspace_id` alone — so a 500-entry bulk delete fires 500 concurrent inserts of which **499 are certain no-ops**.

Who benefits: every user of the app's mutation paths (timer stop is the highest-frequency mutation in the product), plus the database's connection and compute budget. The gain is latency, not throughput — removing a round trip removes a full network hop on the Neon HTTP driver.

## 2. Context Summary

### 2.1 Why round trips are the unit of cost

`src/db.ts` wires Drizzle to the **neon-http** driver:

```ts
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
...
function createDb() {
  const sql = neon(process.env.DATABASE_URL!)
  return drizzle({ client: sql, schema })
}
```

Each `await` is an HTTPS round trip — there is no connection pool amortising them and no pipelining across separate awaits. This is why the codebase already parallelises aggressively (`Promise.all` waves appear throughout `timer.server.ts` and the audit found that pattern applied well) and why the remaining sequential awaits are worth hunting. It is also why a `Promise.all` over 500 items is a different kind of problem: it trades latency for 500 concurrent connections.

### 2.2 The rollup refresh — 4 round trips per target, 2 of them pointless

`src/lib/server/tracker/analytics-rollups.server.ts:160-192`:

```ts
export async function refreshAnalyticsRollups(targets: RollupTarget[]) {
  const uniqueTargets = [
    ...new Map(
      targets.map((target) => [
        `${target.workspaceId}:${target.workspaceMemberId}:${target.date}`,
        target,
      ]),
    ).values(),
  ]

  await Promise.all(
    uniqueTargets.map(async (target) => {
      await enqueueAnalyticsRollup(
        target.workspaceId,
        target.workspaceMemberId,
        target.date,
      )
      await recomputeAnalyticsDailyMemberMetric(target)
      await db
        .delete(pendingAnalyticsRollups)
        .where(
          and(
            eq(pendingAnalyticsRollups.workspaceId, target.workspaceId),
            eq(
              pendingAnalyticsRollups.workspaceMemberId,
              target.workspaceMemberId,
            ),
            eq(pendingAnalyticsRollups.date, target.date),
          ),
        )
    }),
  )
}
```

Per target: **enqueue insert → (2 parallel reads → upsert → possible delete) → delete the row just inserted.** Four sequential round trips, and the first and last are pure churn: the queue row is created and destroyed inside one invocation, so it never functions as a queue. A bulk import or bulk delete producing 500 targets costs roughly **2,000 sequential round trips**.

The `Promise.all` is also unbounded: 500 targets × 4 queries means up to 500 concurrent in-flight HTTP requests. `runInBatches` exists in this codebase precisely to prevent that pattern.

### 2.3 The queue has no consumer

`recomputeQueuedAnalyticsRollups` at `:203-221` is the function that would drain `pending_analytics_rollups`:

```ts
export async function recomputeQueuedAnalyticsRollups(limit = 100) {
  const rows = await db
    .select()
    .from(pendingAnalyticsRollups)
    .orderBy(asc(pendingAnalyticsRollups.createdAt))
    .limit(limit)

  for (const row of rows) {
    await recomputeAnalyticsDailyMemberMetric(row)
    await db
      .delete(pendingAnalyticsRollups)
      .where(/* matching workspaceId + memberId + date */)
  }
}
```

It has the shape of a cron-drainable queue. **It is exported but never called** (Verify First item 3). There is also no cron route for it — `vercel.json` registers only `/api/cron/sync-gsheets` and `/api/cron/timer-reminders`. So the durable queue is written and read by nothing.

This creates a design fork worth deciding explicitly (Open Question 1): either the queue was intended to be drained by a cron and the wiring was never finished, or the synchronous path is intended to be the only writer and the queue should be deleted. **The current state is the worst of both** — it pays for queue writes and deletes without gaining durability.

Note the sequential loop in `recomputeQueuedAnalyticsRollups` (a `for … await`) would cost 200+ serial round trips at the default `limit = 100`. If the queue is ever wired up, that loop needs `runInBatches` too.

### 2.4 The free hop in `reports.server.ts`

`:344-351`:

```ts
// Distinct projects touched
const projectsTouched = await db
  .select({
    c: sql<number>`COUNT(DISTINCT ${timeEntries.projectId})::int`,
  })
  .from(timeEntries)
  .where(whereClause)
  .then((rows) => rows[0]?.c ?? 0)
```

This is a separate `await` on the line after a six-query `Promise.all` (`:234-342`), scanning the same `whereClause` over `time_entries` again. It depends on nothing in that block, so it is a pure wasted hop. It also serialises _in front of_ the tag fetch at `:355` (which genuinely does depend on `rawRows`), stacking two sequential hops where one would do.

### 2.5 `count(*)` as a separate full scan

Three sites run a dedicated count over the same predicate as an adjacent paginated query:

- `reports.server.ts:287-291` — inside the same `Promise.all` as the paginated `rawRows` (`:254-285`)
- `analytics.server.ts:385-388`
- `department-dashboard.server.ts:1087-1090`

These are parallelised, so they are not latency hops — but each **doubles the scan work** of the heaviest query on the page, and in two of the three the predicate is unbounded in the range dimension (see plan `database-performance (Workstream B)`).

`entries-list.server.ts:45-51` already uses the cleaner `limit + 1` idiom for has-more detection, which is the right model to follow.

### 2.6 Duplicate predicate scans

**(a) `department-dashboard.server.ts:445-485`** runs the same filter over `time_entries` twice — once for entries, once purely to fetch tags — with the tag query re-stating the entire `and(...)` including the `inArray` over every active member:

```ts
const [entryRows, tagEntryRows] = await Promise.all([
  db
    .select({
      /* ... */
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        inArray(timeEntries.workspaceMemberId, memberIds),
        isNotNull(timeEntries.endedAt),
        lt(timeEntries.startedAt, rangeEnd),
        gt(timeEntries.endedAt, rangeStart),
      ),
    ),
  // Fetch tags for entries in range (we'll join them in memory)
  db
    .select({
      timeEntryId: timeEntryTags.timeEntryId,
      tagId: timeEntryTags.tagId,
    })
    .from(timeEntryTags)
    .innerJoin(timeEntries, eq(timeEntryTags.timeEntryId, timeEntries.id))
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        inArray(timeEntries.workspaceMemberId, memberIds),
        isNotNull(timeEntries.endedAt),
        lt(timeEntries.startedAt, rangeEnd),
        gt(timeEntries.endedAt, rangeStart),
      ),
    ),
])
```

The second query re-scans `time_entries` with an identical predicate merely to feed a join. `analytics.server.ts:400-412` does this correctly with an `inArray` on ids already in hand.

**(b) `state.server.ts:152-174`** has the same duplication on the **hot app-bootstrap path** — `entriesWhere` is used for the entries select (`:152-156`) and again for the tag select (`:167-174`). The file's own comment at `:51-53` acknowledges round-trip cost, but the duplication remains.

**(c) `department-dashboard.server.ts:848-896`** issues three queries against `time_entries` for one member where one suffices:

- `todayRows` — `startedAt < todayEnd AND (endedAt IS NULL OR endedAt >= todayStart)`
- `activeRows` — `endedAt IS NULL` (**a strict subset of `todayRows`**)
- `latestCompletedRows` — `endedAt >= todayStart AND endedAt < todayEnd` (**also a subset of `todayRows`**)

Both subsets are derivable in JS from `todayRows`. The two `.limit(1)` queries are cheap index lookups, so the cost is mostly two extra hops rather than scan work — but they are still two hops that need not exist.

### 2.7 The guaranteed no-op fan-out

`src/lib/server/tracker/manual-entries.server.ts:468`:

```ts
await Promise.all(ids.map((id) => enqueueTimeEntry(access.workspace.id, id)))
```

and `src/lib/server/gsheets/sync-queue.ts` in full:

```ts
export async function enqueueTimeEntry(
  workspaceId: string,
  _entryId: string,
): Promise<void> {
  await db
    .insert(pendingGsheetsSyncs)
    .values({ workspaceId })
    .onConflictDoNothing()
}
```

`_entryId` is **unused** — the underscore is the author's own signal — and `pending_gsheets_syncs` declares `workspaceId` as its **primary key** (`schema.ts:1314-1321`). So `ids.map` fires N `INSERT … ON CONFLICT DO NOTHING` statements against the _identical_ row: N−1 are no-ops **by construction**, not by luck. A bulk delete of 500 entries issues 500 concurrent inserts of which 499 are guaranteed to do nothing — and it does so with unbounded concurrency, unlike the `runInBatches(..., 25)` discipline used elsewhere.

The adjacent `void Promise.all(ids.map((id) => createAuditLog({ ... })))` at `:472-483` has the same unbounded shape but _does_ write N distinct rows (distinct `targetId`), so it needs batching, not collapsing.

### 2.8 Assumptions and missing information

| Assumption                                                        | Default if unverified                                                                     | How to resolve          |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------- |
| Neon HTTP driver means each `await` is a round trip               | Assume yes — verified by reading `src/db.ts`                                              | Verify First item 1     |
| `pending_analytics_rollups` has no consumer                       | Assume yes — the grep is conclusive                                                       | Verify First items 3, 4 |
| The duplicate predicates are **identical**, not merely similar    | **Do not assume.** Compare character by character                                         | Verify First item 8     |
| `runInBatches`'s default batch size of 25 suits rollup recomputes | Assume not — use a smaller batch (~10), since each recompute is heavier than a row update | Verify First item 5     |
| A target count of 500 is realistic for a bulk operation           | Unknown; sizing only affects whether the concurrency fix is urgent                        | Verify First item 11    |

## 3. Scope

### `[CHECK]` — verification only, no code change

- `[CHECK]` Confirm the neon-http driver, establishing that round trips (not CPU) are the unit of cost (Verify First item 1).
- `[CHECK]` Enumerate and count the awaits in `refreshAnalyticsRollups` to confirm "4 sequential round trips per target" (Verify First item 2).
- `[CHECK]` Prove `recomputeQueuedAnalyticsRollups` has no caller, so the durable queue serves no purpose (Verify First item 3).
- `[CHECK]` Confirm `pending_analytics_rollups` is empty/near-empty in production, consistent with insert-then-delete-in-one-invocation (Verify First item 4).
- `[CHECK]` Confirm `runInBatches`'s signature and the `Promise<void>` constraint on its callback, and choose an appropriate batch size for rollup work (Verify First item 5).
- `[CHECK]` Confirm the `COUNT(DISTINCT projectId)` query has no dependency on the preceding `Promise.all` (Verify First item 6).
- `[CHECK]` Confirm each `count(*)` site shares its predicate with an adjacent paginated query (Verify First item 7).
- `[CHECK]` **Compare the duplicate predicates character by character** at all three sites — the check that prevents a silent correctness change (Verify First item 8).
- `[CHECK]` Confirm the `enqueueTimeEntry` second parameter is unused and `pending_gsheets_syncs` is keyed on `workspace_id` alone (Verify First item 9).
- `[CHECK]` Enumerate every `enqueueTimeEntry` call site before changing its signature (Verify First item 10).
- `[CHECK]` Capture a per-request statement-count baseline for a timer stop, a bulk delete, and a rollup refresh (Verify First item 11).
- `[CHECK]` After deploy: re-count statements per request and compare against the baseline.

### `[FIX]` — code changes

**Rollup refresh (`analytics-rollups.server.ts`):**

- `[FIX]` Remove the enqueue insert and the trailing delete from `refreshAnalyticsRollups` — the queue is not consumed by anything.
- `[FIX]` Replace the unbounded `Promise.all` with `runInBatches(uniqueTargets, recomputeAnalyticsDailyMemberMetric, 10)`.
- `[FIX]` Resolve the `recomputeQueuedAnalyticsRollups` question (Open Question 1): either wire it to a cron route **and** convert its sequential loop to `runInBatches`, or delete it and drop `pending_analytics_rollups` from the synchronous path entirely.

**`reports.server.ts`:**

- `[FIX]` Fold the `COUNT(DISTINCT projectId)` query into the existing six-query `Promise.all`.
- `[FIX]` Replace the separate `count(*)` at `:287-291` with `count(*) OVER ()` on the paginated query, handling the empty-last-page case.

**`analytics.server.ts` and `department-dashboard.server.ts`:**

- `[FIX]` Apply the same `count(*) OVER ()` consolidation at `analytics.server.ts:385-388` and `department-dashboard.server.ts:1087-1090`.
- `[FIX]` Remove the duplicate predicate scan at `department-dashboard.server.ts:445-485` — fetch tags via `inArray` on the ids already returned, as `analytics.server.ts:400-412` does.
- `[FIX]` Collapse the three queries at `department-dashboard.server.ts:848-896` into one, deriving the active and latest-completed entries in JS.

**Bootstrap path:**

- `[FIX]` Remove the duplicate predicate scan at `state.server.ts:152-174`.

**`enqueueTimeEntry` fan-out:**

- `[FIX]` Replace `manual-entries.server.ts:468`'s `Promise.all(ids.map(...))` with a single statement.
- `[FIX]` Remove the unused `_entryId` parameter from `enqueueTimeEntry` and update all call sites.
- `[FIX]` Batch the adjacent `createAuditLog` fan-out at `manual-entries.server.ts:472-483` (distinct rows, so batch rather than collapse).

## 4. Out of Scope

- **Adding date bounds, replacing JS reduction with `GROUP BY`, or removing `inArray` id lists.** Those are plan `database-performance (Workstream B)`, which touches several of the same files. **The boundary is deliberate: this plan changes how many round trips a request takes; that plan changes what each query aggregates and how much data it touches.** Keep them in separate PRs to avoid conflicting edits to `reports.server.ts` and `department-dashboard.server.ts`.
- **Indexes.** The `(workspace_id, project_id)` and `updated_at` indexes that would make several of these queries cheaper are owned by plan `database-performance (Workstream A)`.
- **The tracker pulse query.** Covered by plan `database-performance (Workstream C)` — even though it too is a query-shape change with a round-trip dimension.
- **Schema changes.** No table, column, or index is modified. Note this means `pending_analytics_rollups` is **left in place** even if its writer is removed — dropping it is a separate, later decision (Open Question 1), because a schema change makes rollback materially harder than a code revert.
- **Repairing or backfilling `analytics_daily_member_metrics`.** This plan makes the _refresh path_ cheaper; it does not audit whether existing rollup rows are correct. That is Open Question 3 and a prerequisite for plan `database-performance (Workstream B)`' rollup-backed totals.
- **Replacing the rollup architecture** (e.g. with incremental counters, triggers, or a materialized view). Considered and deferred — see Open Question 2.
- **`requireWorkspaceAccess` optimisation.** Already request-cached via a `WeakMap` and confirmed clean by the audit.
- **Serverless-invocation concerns** such as fire-and-forget writes being killed when the isolate freezes. Related reliability issue, different failure mode, not a round-trip reduction.
- **Changing batch sizes globally.** `runInBatches`'s default of 25 is appropriate for its existing callers; this plan passes a smaller explicit size only where the operation is heavier.

## 5. Affected Files and Folders

```txt
Tickr/
├── src/
│   ├── lib/
│   │   └── server/
│   │       ├── gsheets/
│   │       │   └── sync-queue.ts                   (MODIFY)
│   │       │         - L4-12: remove the unused `_entryId` parameter from
│   │       │           enqueueTimeEntry. Body unchanged (one insert).
│   │       │
│   │       └── tracker/
│   │           ├── analytics-rollups.server.ts     (MODIFY)
│   │           │     - L160-192 refreshAnalyticsRollups: drop the enqueue
│   │           │       insert and the trailing delete (2 of 4 round trips
│   │           │       per target); replace the unbounded Promise.all with
│   │           │       runInBatches(..., 10).
│   │           │     - L203-221 recomputeQueuedAnalyticsRollups: either wire
│   │           │       to a cron route AND convert its serial loop to
│   │           │       runInBatches, or delete it (Open Question 1).
│   │           │     - L39-48 enqueueAnalyticsRollup: delete if the queue is
│   │           │       retired; keep if wired to a cron.
│   │           │
│   │           ├── reports.server.ts                (MODIFY)
│   │           │     - L344-351: fold COUNT(DISTINCT projectId) into the
│   │           │       Promise.all at L234-342 (free hop removed).
│   │           │     - L287-291: replace the separate count(*) with
│   │           │       count(*) OVER () on the paginated rawRows query;
│   │           │       handle the empty-last-page case.
│   │           │
│   │           ├── analytics.server.ts              (MODIFY)
│   │           │     - L385-388: same count(*) OVER () consolidation.
│   │           │
│   │           ├── department-dashboard.server.ts   (MODIFY)
│   │           │     - L445-485: remove the duplicate predicate scan; fetch
│   │           │       tags via inArray on ids in hand.
│   │           │     - L848-896: collapse three member queries into one;
│   │           │       derive active + latest-completed in JS.
│   │           │     - L1087-1090: same count(*) OVER () consolidation.
│   │           │
│   │           ├── manual-entries.server.ts         (MODIFY)
│   │           │     - L468: replace Promise.all(ids.map(enqueueTimeEntry))
│   │           │       with a single insert.
│   │           │     - L131, L221, L311, L353, L397: update the
│   │           │       enqueueTimeEntry call signature (drop the id arg).
│   │           │     - L472-483: batch the createAuditLog fan-out (distinct
│   │           │       rows — batch, do not collapse).
│   │           │
│   │           ├── timer.server.ts                  (MODIFY)
│   │           │     - Update the enqueueTimeEntry call signature only
│   │           │       (2 sites). No other change.
│   │           │
│   │           └── state.server.ts                  (MODIFY)
│   │                 - L152-174: remove the duplicate predicate scan; fetch
│   │                   tags via inArray on the ids already returned.
│   │
│   └── routes/api/cron/                             (MODIFY — only if Open
│                                                      Question 1 = wire up
│                                                      the rollup queue)
│
├── vercel.json                                      (MODIFY — only if a new
│                                                      cron is registered;
│                                                      requires the POST-only
│                                                      vs GET lesson from the
│                                                      existing cron routes)
│
└── plans/
    └── remove-redundant-database-round-trips/
        └── PLAN.md                                  (NEW)
```

No schema or migration changes. No new dependencies. Note the deliberate asymmetry: **the code is changed but `pending_analytics_rollups` is left in the database**, so rollback is a pure code revert.

## 6. Database Design

**N/A — no schema change, deliberately.** This plan removes statements; it does not add or alter tables, columns, or indexes.

Three schema facts are load-bearing for the analysis and are recorded here rather than in a schema section:

1. **`pending_gsheets_syncs.workspaceId` is the primary key** (`schema.ts:1314-1321`, created in `drizzle/0002_heavy_revanche.sql`). This is what makes the N-insert fan-out provably wasteful: every insert after the first targets the same row.
2. **`pending_analytics_rollups` has a composite primary key** `(workspace_id, workspace_member_id, date)` (created in `drizzle/0008_analytics_daily_rollups.sql`), which is why `enqueueAnalyticsRollup`'s `onConflictDoNothing()` is a no-op for duplicate targets — and why `refreshAnalyticsRollups`'s own `uniqueTargets` dedupe is doing the same job twice.
3. **`analytics_daily_member_metrics`** is the rollup the refresh path writes. This plan changes how cheaply it is refreshed, not what it contains.

**If Open Question 1 resolves to retiring the queue**, the follow-up would eventually drop `pending_analytics_rollups` — but **that is explicitly not part of this plan**, because a schema change converts a trivial code revert into a migration reversal and is better decided once the code-only removal has proven safe.

## 7. Backend Implementation

### 7.1 The rollup refresh — 4 round trips down to ~1

Remove the enqueue and the trailing delete, since nothing reads the queue:

```ts
// After — one round trip per target, bounded concurrency.
export async function refreshAnalyticsRollups(targets: RollupTarget[]) {
  const uniqueTargets = [
    ...new Map(
      targets.map((t) => [
        `${t.workspaceId}:${t.workspaceMemberId}:${t.date}`,
        t,
      ]),
    ).values(),
  ]
  // A rollup recompute is heavier than a row update, so use a smaller batch
  // than runInBatches' default of 25.
  await runInBatches(uniqueTargets, recomputeAnalyticsDailyMemberMetric, 10)
}
```

`recomputeAnalyticsDailyMemberMetric` internally already does 2 parallel reads + 1 upsert, so the result is ~2 waves per target instead of 4 sequential statements, with concurrency capped at 10.

**Note the batch-size choice.** `runInBatches` fires `batchSize` operations concurrently, and each recompute is a multi-query aggregate — so 25 concurrent recomputes means up to 75 concurrent statements. A size of 10 bounds that at ~30. This is a deliberate difference from the default, not an oversight.

### 7.2 Resolving the queue (Open Question 1)

Two coherent end states; the current one is neither:

**Option A — retire the queue (recommended).** Delete `recomputeQueuedAnalyticsRollups` and `enqueueAnalyticsRollup`, remove the queue writes from the synchronous path, and leave the table in place but unused. Rationale: the synchronous recompute is idempotent and reads from the source of truth, so durability was never actually needed. Fewer moving parts, and the removal is a pure code revert.

**Option B — wire the queue up.** Keep `enqueueAnalyticsRollup` in the synchronous path, delete only the trailing `delete`, add a cron route that calls `recomputeQueuedAnalyticsRollups`, and convert its `for … await` loop to `runInBatches`. Rationale: a user's entry mutation returns faster because the expensive recompute is deferred. **Cost:** the rollup is then eventually-consistent, so any surface reading it can show stale numbers until the cron runs — which directly conflicts with plan `database-performance (Workstream B)`' requirement that the rollup be current before it is trusted for lifetime totals. Also note that adding a cron route must handle **both GET and POST**, given the existing `sync-gsheets.ts` POST-only issue.

**Recommendation: Option A.** It is simpler, keeps the rollup consistent, and removes the round trips this plan is about. Option B trades latency for consistency — the wrong trade in a billing product.

### 7.3 The free hop in `reports.server.ts`

Move the `COUNT(DISTINCT projectId)` query into the existing wave. The only thing to verify first is that it truly has no dependency (Verify First item 6):

```ts
const [
  summaryRows,
  rawRows,
  countResult,
  memberCountResult,
  memberBreakdownRows,
  summaryAmountResult,
  projectsTouchedRows,
] = await Promise.all([
  /* ...existing six... */
  db
    .select({ c: sql<number>`COUNT(DISTINCT ${timeEntries.projectId})::int` })
    .from(timeEntries)
    .where(whereClause),
])
const projectsTouched = projectsTouchedRows[0]?.c ?? 0
```

One hop removed, and the serialization in front of the dependent tag fetch (`:355`) disappears.

### 7.4 `count(*) OVER ()` — including the edge case

The consolidation replaces a second full scan with a window function evaluated after `WHERE` and before `LIMIT`:

```ts
const rawRows = await db
  .select({
    /* ...existing columns... */
    totalCount: sql<number>`count(*) over ()::int`,
  })
  .from(timeEntries)
  .leftJoin(/* ... */)
  .where(whereClause)
  .orderBy(desc(timeEntries.startedAt))
  .limit(pageSize)
  .offset((page - 1) * pageSize)

const entriesTotal = rawRows[0]?.totalCount ?? 0
```

**The edge case that must be handled:** when `page` is past the last page, the result set is empty and the total is lost. A naive implementation would then report a total of 0 for a non-empty result set, breaking pagination UI. Options:

- Keep the separate `count(*)` as a fallback **only** when `rawRows.length === 0` (the rare path).
- Fetch one row at `offset = 0` alongside the page when the page is empty.
- Clamp `page` to the last valid page before querying, so an out-of-range page never reaches the window function.

**Recommendation: the third option (clamp the page)** — it fixes the UX problem at its source and keeps the query single-pass. This must be settled before implementing, since getting it wrong produces a visible pagination bug rather than a slow query.

### 7.5 Removing the duplicate predicate scans

**(a) `department-dashboard.server.ts:445-485`** — fetch entries first, then tags for the ids in hand, mirroring `analytics.server.ts:400-412`:

```ts
// The tag query no longer re-states the whole predicate; it needs only the ids.
.where(inArray(timeEntryTags.timeEntryId, entryRows.map((e) => e.id)))
```

**Precondition:** Verify First item 8 must confirm the two predicates are character-for-character identical. If the tag query's predicate differs at all, it selects a **different set** and this change would alter the output.

**(b) `state.server.ts:152-174`** — same treatment on the app-bootstrap path, which is the highest-frequency application of this fix.

**(c) `department-dashboard.server.ts:848-896`** — keep only `todayRows` and derive the other two, since both are strict subsets:

```ts
const activeEntry = todayRows.find((r) => r.endedAt === null) ?? null
const latestCompletedEntry =
  todayRows
    .filter((r) => r.endedAt !== null)
    .sort((a, b) => b.endedAt!.getTime() - a.endedAt!.getTime())[0] ?? null
```

**Caution:** `todayRows` is ordered `DESC(started_at)`, while the original `latestCompletedRows` ordered `DESC(ended_at)`. The JS derivation must sort by `endedAt` explicitly (as above) rather than relying on the inherited order, or the "latest completed" entry will be wrong for an entry that started earlier but ended later. This is a real correctness trap in the collapse.

### 7.6 The `enqueueTimeEntry` fan-out

One statement, since the entry id was never used and the table is keyed on workspace alone:

```ts
// sync-queue.ts — signature simplified; body unchanged.
export async function enqueueTimeEntry(workspaceId: string): Promise<void> {
  await db
    .insert(pendingGsheetsSyncs)
    .values({ workspaceId })
    .onConflictDoNothing()
}
```

```ts
// manual-entries.server.ts:468 — one insert instead of N.
await enqueueTimeEntry(access.workspace.id)
```

All seven call sites must be updated (Verify First item 10). The adjacent `createAuditLog` fan-out at `:472-483` writes N **distinct** rows, so it cannot be collapsed — batch it with `runInBatches` instead.

### 7.7 What was deliberately not changed

`recomputeAnalyticsDailyMemberMetric`'s internal `Promise.all` of two reads is already correct and stays. The rate-cascade join, the interval-merge logic, and every `Promise.all` the audit found applied correctly are untouched. This plan removes only statements proven redundant.

## 8. Frontend Implementation

**N/A — with one caveat.** No component, route, hook, or client-state change. Every fix here is server-side and produces **identical responses** for identical inputs, so no client contract changes.

**The caveat:** if the `count(*) OVER ()` consolidation is implemented without handling the empty-last-page case (§7.4), the pagination UI will report a total of 0 on an out-of-range page — a visible regression in the reports, analytics, and department screens. That is a server-side fix with a client-visible symptom, and it is why §7.4 must be settled before coding rather than discovered in QA. No UI code needs to change to fix it correctly.

## 9. Access Control

**N/A — no authorization change.** Every statement removed by this plan operates inside an existing, verified scope:

- Rollup recomputes filter on `workspace_id` + `workspace_member_id` derived from `requireWorkspaceAccess()`.
- Reports/analytics/department queries apply the existing `memberScopeCondition` gating (self / department / workspace), which the audit confirmed correct.
- `state.server.ts` is self-scoped to the session's workspace.
- `enqueueTimeEntry` operates on the session's workspace only.

Critically, **removing a redundant statement cannot widen access**: it either removes a row-fetch that is then re-fetched by the primary query, or removes a write whose result was already guaranteed. The one thing to preserve deliberately is that each surviving query keeps its **full** predicate — §7.5's tag-query change replaces a re-stated predicate with an `inArray` over ids that came from the _already-scoped_ primary query, so the scoping is inherited rather than dropped. Verify First item 8's character-by-character comparison is the guard.

Section 9 is included for template completeness.

## 10. Validation

> **Environment note:** `pnpm <script>` fails in this sandbox with `EPERM: operation not permitted, mkdir '~/Library/pnpm/.tools/...'`. Use the direct binaries below.

### Pre-change baseline

```bash
# Static conclusions that need no database.
grep -rn "recomputeQueuedAnalyticsRollups" src/ scripts/ --include=*.ts
# Expect exactly ONE match: its own definition. No caller.

cat src/lib/server/gsheets/sync-queue.ts
# Confirm `_entryId` is unused and the body inserts workspaceId only.

grep -rn "enqueueTimeEntry" src/ --include=*.ts
# Enumerate all 7 call sites before changing the signature.
```

```sql
-- Confirm the rollup queue is empty, consistent with insert-then-delete churn.
SELECT count(*) AS pending_rows FROM pending_analytics_rollups;
```

```sql
-- Per-request statement-count baseline. Perform a timer stop, a bulk entry
-- delete, and a rollup refresh, then read the counts. Record these numbers —
-- they are what the PR must improve.
SELECT calls, mean_exec_time, rows, left(query, 120) AS query
FROM pg_stat_statements
ORDER BY calls DESC
LIMIT 20;
```

### Post-change statement-count comparison

```sql
-- Same query after deploy. Expect:
--   * one INSERT into pending_gsheets_syncs per bulk delete, not N
--   * no INSERT/DELETE pair against pending_analytics_rollups from the
--     synchronous mutation path
--   * one fewer statement per reports page load
SELECT calls, mean_exec_time, rows, left(query, 120) AS query
FROM pg_stat_statements
WHERE query ILIKE '%pending_gsheets_syncs%'
   OR query ILIKE '%pending_analytics_rollups%'
ORDER BY calls DESC;
```

```sql
-- The rollup table must still be populated and current after removing the
-- queue churn — this proves the recompute still runs.
SELECT count(*) AS rollup_rows, max(date) AS newest_date
FROM analytics_daily_member_metrics;
```

```sql
-- If OQ1 = retire the queue, this table should stay empty and unused.
SELECT count(*) AS pending_rows FROM pending_analytics_rollups;
```

### Behaviour-preservation checks

Because this plan must not change any returned value:

| Check                        | Method                                                       | Pass criterion                                                                                             |
| ---------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Timer start / stop / discard | Manual smoke test on the dashboard                           | Entry created/stopped with the correct duration; no visible delay increase                                 |
| Bulk entry delete            | Delete ~20 entries in one action                             | Entries gone; the gsheets pending row exists **once**; audit rows written (one per entry)                  |
| Reports page                 | Open with filters; paginate to the last page and **past** it | Totals identical to the pre-change baseline; **past-the-last-page still reports the correct total, not 0** |
| Analytics page               | Open with a date range                                       | Totals and pagination identical                                                                            |
| Department member sheet      | Open a member's detail                                       | Today's activity, active entry, and latest completed entry all match pre-change                            |
| Tag display                  | Open analytics/department views                              | Tags identical on every row (this is what §7.5's predicate check protects)                                 |

The **past-the-last-page** row is the most likely regression and is called out deliberately — it is the specific consequence of getting §7.4 wrong.

### Code quality gates

```bash
# Typecheck.
./node_modules/.bin/tsc --noEmit -p tsconfig.json

# Lint — must be warning-free (repo enforces --max-warnings 0).
npx eslint src --ext .ts,.tsx --max-warnings 0

# Full test suite.
./node_modules/.bin/vitest run

# Build.
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> ⚠️ **Pre-existing failure warning.** `./node_modules/.bin/vitest run` currently reports **one** failure: the first test in `src/lib/time-tracker/payroll-periods.test.ts`, a date-dependent time bomb unrelated to this plan (see plan `fix-payroll-period-test-time-bomb`). Expect **374 passed, 1 failed** on a clean checkout. That failure is **not** caused by this plan — do not attempt to fix it here. Any _additional_ failure, especially in the aggregation or pagination tests, is a real regression.

### Definition of done

- [ ] `recomputeQueuedAnalyticsRollups` is either called by a real consumer or deleted — no third state remains.
- [ ] `refreshAnalyticsRollups` issues ~1 round trip per target instead of 4, with concurrency capped.
- [ ] No synchronous mutation path inserts-then-deletes a `pending_analytics_rollups` row.
- [ ] The `reports.server.ts` `COUNT(DISTINCT ...)` is inside the existing `Promise.all`.
- [ ] All three `count(*)` sites use `count(*) OVER ()` **and** report the correct total past the last page.
- [ ] Duplicate predicate scans removed at all three sites; tag output verified identical.
- [ ] A 500-id bulk delete issues **one** `pending_gsheets_syncs` insert, not 500.
- [ ] Before/after `pg_stat_statements` call counts recorded in the PR.
- [ ] `tsc`, `eslint`, `vite build` exit 0; only the known pre-existing payroll failure appears.

## 11. Sequencing

Six phases. Each is independently shippable; the ordering front-loads the changes with the largest mechanical win and the least ambiguity.

- [ ] **Phase 0 — Verify (no code).** Run the entire Verify First block. Capture the `pg_stat_statements` baseline, confirm the queue has no consumer, and — most importantly — **complete the character-by-character predicate comparison** (item 8). Answer Open Questions 1 and 2. Exit criteria: baselines recorded and both questions answered.
- [ ] **Phase 1 — `enqueueTimeEntry` fan-out.** Simplify the signature and collapse `manual-entries.server.ts:468` to one insert; update all 7 call sites. Provably safe (the parameter is unused and the table is keyed on workspace alone), self-contained, and it removes a 500-statement fan-out from a common bulk operation. **Highest win-to-risk ratio in the plan — do this first.**
- [ ] **Phase 2 — The free hop and the serialization.** Fold `COUNT(DISTINCT projectId)` into the existing `Promise.all` in `reports.server.ts`. One-line-shaped change, no behaviour change, removes a full hop from every reports page load.
- [ ] **Phase 3 — Duplicate predicate scans.** The three sites in §7.5. Removes scans on the app-bootstrap path and the department dashboard. **Gated on Phase 0 item 8** — do not proceed without the character-by-character comparison, and take care with the sort-order trap in the three-query collapse (§7.5c).
- [ ] **Phase 4 — `count(*) OVER ()`.** All three sites, together with the empty-last-page handling from §7.4. The consolidation is only safe as a set: implementing it without the edge-case fix introduces a visible pagination bug. Verify the past-the-last-page behaviour explicitly.
- [ ] **Phase 5 — Rollup refresh + queue resolution.** Drop the enqueue/delete churn and bound concurrency with `runInBatches(..., 10)`; then execute the Open Question 1 decision. If retiring the queue, delete the dead functions. If wiring it up, add the cron route (handling GET **and** POST) and convert the drain loop to `runInBatches`. **Depends on Open Question 1** — and note it also affects plan `database-performance (Workstream B)`' rollup dependency, so resolve it before that plan reaches Phase 4.
- [ ] **Phase 6 — Post-deploy verification.** Re-run the `pg_stat_statements` comparison, confirm the rollup table is still current, and verify the pagination edge case in production. Record results in the Status checklist.

Phase 1 alone is a worthwhile standalone PR. Phases 1–2 together are the recommended first shippable unit.

## 12. Risks & Considerations

| Risk                                                                                                                                                                                   | Likelihood                                                | Impact                                                                                     | Mitigation                                                                                                                                                                                                                                                                             | Rollback                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Removing the queue makes the rollup eventually-inconsistent** if some consumer the grep missed actually depends on `pending_analytics_rollups`.                                      | Low (the grep is conclusive)                              | **High** — stale analytics totals served without warning                                   | Verify First item 3 is a conclusive static check, and item 4 confirms the table is empty in production. **Both must pass before removing.** If the table shows growth, do not remove — that means rows are accumulating and something is reading them.                                 | Re-add the enqueue and delete calls — a two-statement revert. `pending_analytics_rollups` is **deliberately left in the database**, so rollback requires no migration.             |
| **Deleting a duplicate predicate that was not actually duplicate**, changing which rows are returned (most likely the tags in §7.5a, or the bootstrap entries in §7.5b).               | Medium                                                    | **High** — silently missing or extra tags/entries in analytics, reports, and the dashboard | Verify First item 8: compare both predicates **character by character**, not by eye at a glance. Ship §7.5 behind a manual spot-check of tag output on a real workspace (Section 10 behaviour checks). If they differ at all, do not remove the query.                                 | Revert the individual site's commit. No data is modified, so the revert is complete and immediate.                                                                                 |
| **`count(*) OVER ()` breaks pagination when the requested page is past the last page**, reporting a total of 0.                                                                        | **High if implemented naively**                           | Medium — a visible pagination bug on reports, analytics, and department screens            | Settle §7.4 **before** coding and prefer clamping `page` to the last valid page. The Section 10 behaviour table includes an explicit "past-the-last-page" check — run it, do not assume.                                                                                               | Revert to the separate `count(*)` query for the affected site. The original pattern is retained in git history and is known-correct.                                               |
| **Collapsing three queries into one (§7.5c) picks the wrong "latest completed" entry**, because `todayRows` is ordered by `started_at` while the original query ordered by `ended_at`. | **Medium–High** — this is a real trap, not a hypothetical | Medium — the wrong entry is shown as most recent on a member's activity panel              | §7.5c explicitly re-sorts by `endedAt` in JS rather than inheriting the query order. Verify against the pre-change output for a member who has an entry that started earlier but ended later than another.                                                                             | Revert to the three-query form — a contained revert in one function.                                                                                                               |
| **Removing round trips reduces latency but increases perceived complexity**, making the code harder to follow for the next reader.                                                     | Medium                                                    | Low — maintainability, not correctness                                                     | Keep the `Promise.all` waves explicit and commented with what each query does, as the existing code already does in `timer.server.ts`. Removing churn often _simplifies_ — §7.1's before/after is shorter and clearer than the original.                                               | N/A — a style consideration, not a rollback trigger.                                                                                                                               |
| **Reducing concurrency (bounded batches) makes a large bulk operation slower in wall-clock terms** than the current unbounded `Promise.all`, even though it uses fewer resources.      | Medium                                                    | Low — a trade, not a regression, but it should be a conscious one                          | `runInBatches` with a batch of 10 still parallelises 10×; the current unbounded form risks overwhelming the connection pool and is worse under load. Measure the bulk-refresh path before and after (Verify First item 11) and adjust the batch size if wall-clock suffers materially. | Raise the batch size, or revert to `Promise.all` for that single call site.                                                                                                        |
| **Merge conflicts with plan `database-performance (Workstream B)`**, which touches `reports.server.ts`, `analytics.server.ts`, and `department-dashboard.server.ts` too.               | **High** — the overlap is real and specific               | Low–Medium — wasted effort and confusing diffs, not breakage                               | Respect the boundary: **this plan changes statement counts; that plan changes aggregation shape and result-set size.** Do not add date bounds or `GROUP BY` conversions here. Sequence the two plans rather than running them concurrently on the same files.                          | N/A — process risk, mitigated by sequencing.                                                                                                                                       |
| **No money path is touched and no user data is modified.** Every change removes a statement that was provably redundant or replaces two scans with one.                                | —                                                         | —                                                                                          | The one place a _value_ could change is §7.5's predicate removal, which is why Verify First item 8 and the tag-output spot-check are mandatory rather than optional.                                                                                                                   | All rollbacks are code reverts. No migration, no data repair, no external service, and `pending_analytics_rollups` is intentionally left in place so no schema reversal is needed. |

## 13. Open Questions

- [ ] **Q1 — Retire the rollup queue, or wire it up?** `recomputeQueuedAnalyticsRollups` is exported but never called, so the queue is written and deleted within a single invocation and never consumed. **Option A (recommended): retire it** — delete the dead functions and drop the queue writes from the synchronous path; leave the table in place for a later decision. Simpler, keeps the rollup consistent, and is a pure code revert. **Option B: wire it to a cron** — the mutation returns faster because the expensive recompute is deferred, but the rollup becomes eventually-consistent, which directly conflicts with plan `database-performance (Workstream B)` requiring rollup currency before trusting it for lifetime totals. **Blocked on:** Verify First items 3 and 4 (no consumer, empty table) — both must pass for Option A. **Recommendation: Option A**, because trading consistency for latency is the wrong trade in a billing product.
- [ ] **Q2 — Should the rollup architecture be replaced rather than repaired?** If the rollup is only ever refreshed synchronously on entry mutation, it is arguably not a "rollup" at all — it is a denormalised cache with one writer. Alternatives: compute on read (no staleness, more cost), maintain via database triggers (no application coupling, harder to reason about), or a materialized view with a scheduled refresh. **Recommendation:** out of scope; the current design is adequate once the churn is removed. Filed because Q1's answer determines whether the rollup stays authoritative or becomes a deferred cache — and because plan `database-performance (Workstream B)` may come to depend on it. **Blocked on:** Q1, and on whether analytics latency is currently a complaint.
- [ ] **Q3 — Should the `pending_analytics_rollups` table be dropped once the queue is retired?** A code-only removal is trivially reversible; a schema change is not. **Recommendation:** retire the code first (Q1), observe for a release cycle, then drop the table in its own migration if nothing regressed. **Blocked on:** Q1's outcome and a period of production observation. **Explicitly not part of this plan.**
- [ ] **Q4 — Is the `count(*) OVER ()` edge case better solved by clamping the page or by keeping a fallback count?** Clamping fixes the UX at source and keeps the query single-pass; a fallback count runs a second query only on the rare out-of-range page. **Recommendation: clamp the page** — it also improves the user experience (an out-of-range page redirects to the last valid one rather than showing an empty table). **Blocked on:** confirming the pagination components tolerate a clamped page value, which needs a look at the reports/analytics paging UI before implementing.
- [ ] **Q5 — Should `recomputeAnalyticsDailyMemberMetric`'s internal queries also be consolidated?** It performs two reads in a `Promise.all` plus an upsert — already correct, so not a finding. But its aggregate joins five tables, and if the rollup ever becomes a hot path the aggregate itself may deserve the treatment in plan `database-performance (Workstream B)`. **Recommendation:** leave it; it is not redundant and this plan is scoped to redundancy. **Blocked on:** nothing — recorded to prevent scope creep.
- [ ] **Q6 — Is there a general guard against this class of redundancy recurring?** Several findings here share a root cause: a query written for clarity without checking whether an adjacent query already returns the data. A lint rule cannot catch this. Possibilities: a short convention note in the plan directory on batching and predicate reuse, or a review checklist item. **Recommendation:** low priority, but worth a decision, since the audit found six instances of the same pattern across four files — which suggests it is a habit rather than an oversight. **Blocked on:** team preference; no technical prerequisite.

---

# Part C — Fix Overlap Cancel + Timezone Display Defects

_(Original plan: `plans/fix-overlap-cancel-bug/PLAN.md` — full text below. The stop-flow dialog/L1 slice moved to `time-recording-performance` Phases 1/3; this Part keeps the edit-flow defect and the timezone fix.)_

> **Coordination — `plans/time-recording-performance/PLAN.md`:** that plan introduces the same optimistic-then-maybe-rollback overlap pattern for the _stop_ flow and adopts this plan's rollback lesson as rule L1 (a cancelled conflict check must leave zero residual optimistic state — cache, inputs, operation machine). It also extracts `showOverlapConfirmation` out of `overlap-confirmation.tsx`, the file this plan edits for timezone support — either plan may land first, but the dialog markup must not fork: the extraction must carry this plan's workspace-timezone parameter through.

## 1. Goal

Fix two remaining edge-case defects in the Tracked vs. Actual hours feature:

1. **Overlap cancel during editing leaves stale display** — When a user edits a stopped entry and the overlap warning appears, clicking "Cancel" on the warning leaves the optimistically-updated entry visible and closes the edit drawer, so the user sees stale data without any visual indication that their edit was discarded.

2. **Overlap-confirmation dialog uses viewer's browser timezone** — The overlap warning dialog formats the conflicting entry times using `toLocaleString()` (browser timezone / locale) instead of the workspace timezone, which can be misleading in multi-timezone teams.

## 2. Context Summary

The Reviewed Verdict highlighted two remaining defects:

- In `useDraftAndEdit.ts`, `saveEdit()` optimistically patches the query cache (`patchEntryOptimistically`) and clears the editing state (`setEditingId(null)`) **before** calling `mutations.updateEntry()`, which internally runs `confirmTimeEntryOverlap()`. If the user cancels the overlap warning, the mutation returns `undefined` — neither `onSuccess` nor `onError` fires — so the optimistic cache update is never rolled back and the drawer is already closed.

- In `overlap-confirmation.tsx`, the `formatConflictTime()` function formats timestamps with the browser's default `toLocaleString()`. The workspace timezone is available from `TrackerState.workspace.timezone` (dashboard) or `detail.timezone` (department member detail), but the overlap confirmation dialog doesn't receive or use it.

The `DepartmentMemberDetailScreen.tsx` already handles the overlap check correctly (it checks overlap **before** mutating), but the main dashboard's `saveEdit` in `useDraftAndEdit.ts` does not.

## 3. Scope

- Fix `saveEdit()` in `useDraftAndEdit.ts` so the optimistic cache update and editing-state clear happen **after** the overlap check passes (or inside `onSuccess`).
- Add workspace timezone support to the overlap confirmation dialog.
- Update all call sites of `confirmTimeEntryOverlap` to pass the workspace timezone.

## 4. Out of Scope

- Any other issues in the Tracked vs. Actual hours feature that are not listed here.
- Code cleanup or refactoring beyond the minimal fix.
- Committing or pushing the changes (the user said not to).
- The `DepartmentMemberDetailScreen.tsx` `saveEdit` — it already handles overlap correctly.

## 5. Affected Files and Folders

```txt
EDIT (fix Issue 1):
  src/components/time-tracker/dashboard/hooks/useDraftAndEdit.ts
    - Move optimistic cache update + setEditingId(null) inside the
      onSuccess callback of mutations.updateEntry

EDIT (fix Issue 2):
  src/lib/time-tracker/overlap-confirmation.tsx
    - Add timezone parameter to OverlapCheckInput
    - Update formatConflictTime to use the workspace timezone
    - Pass timezone through showOverlapConfirmation → formatConflictTime

EDIT (pass timezone at call sites):
  src/components/time-tracker/dashboard/hooks/useTrackerMutations.ts
    - Read workspace timezone from queryClient cache
    - Pass timezone to confirmTimeEntryOverlap calls

  src/components/time-tracker/analytics/department/DepartmentMemberDetailScreen.tsx
    - Pass detail.timezone to confirmTimeEntryOverlap call

  src/lib/time-tracker/overlap-confirmation.ts
    - No change needed (just re-export, types flow through)

  src/lib/server/tracker/shared/schemas.ts
    - Add optional timezone field to overlapCheckSchema
      (so the server can log/report in workspace timezone if needed,
       though the primary fix is client-side formatting)

  src/lib/server/tracker/overlap.server.ts
    - No server-side changes needed (timestamps are always UTC)
```

## 6. Implementation Plan

### Step 1: Fix `saveEdit()` in `useDraftAndEdit.ts` (Issue 1)

**Location:** `src/components/time-tracker/dashboard/hooks/useDraftAndEdit.ts`, lines 136-190

**Problem:** `saveEdit()` calls `patchEntryOptimistically()` and `setEditingId(null)` **before** the overlap check in `mutations.updateEntry()` runs. If the overlap check is cancelled, the optimistic update is never rolled back.

**Fix:** Move the optimistic update and editing-state clear into the `onSuccess` callback of `mutations.updateEntry()`.

```typescript
function saveEdit() {
  if (!editingId || !editingDraft.description.trim() || !editingEntry) return
  const prev = editingEntry

  // Running entry — update without touching endedAt (no overlap check here)
  if (!prev.endedAt) {
    // ... unchanged for running entries (updateActiveTimer has no overlap check)
    return
  }

  const origStart = dateTimeLocalValue(new Date(prev.startedAt))
  const origEnd = dateTimeLocalValue(new Date(prev.endedAt))
  const timesUnchanged =
    editingDraft.startedAt === origStart && editingDraft.endedAt === origEnd
  const durationSeconds = timesUnchanged
    ? prev.durationSeconds
    : calculateManualSeconds(editingDraft)

  const payload = { ...toEntryPayload(editingDraft), durationSeconds }

  // Do NOT optimistically patch or clear editing state here.
  // The mutation internally checks for overlaps. Only update the cache
  // AFTER the server confirms the save.
  void mutations.updateEntry(editingId, payload, {
    invalidate: false,
    onSuccess: () => {
      patchEntryOptimistically({ ...prev, ...payload })
      setEditingId(null)
      onMutated?.()
    },
    onError: () => {
      // Mutation failed — close the drawer so the user isn't stuck.
      // The cache was never optimistically updated, so no rollback needed.
      setEditingId(null)
    },
  })
}
```

**Key changes:**

- Remove `patchEntryOptimistically({ ...prev, ...payload })` from before the mutation call
- Remove `setEditingId(null)` from before the mutation call
- Move both inside the `onSuccess` callback
- In `onError`, only close the drawer (no rollback needed since we never optimistically updated)
- The `onSuccess` now also calls `onMutated?.()` (moved from the original `onSuccess` at line 186, though the original `onSuccess` from the caller — `() => onMutated?.()` — would still fire; we'll adjust to avoid double-calling)

**Wait — double-call risk:** The original code passes `onSuccess: () => onMutated?.()` in the options object at line 186-187. The new code will have `onSuccess` inside `mutations.updateEntry`'s options that does `patchEntryOptimistically + setEditingId + onMutated`. But `mutations.updateEntry`'s internal `run()` function also calls `options.onSuccess?.(result)`. So when both the internal and our custom onSuccess are set, they both fire. Let me trace the flow:

```typescript
// mutations.updateEntry calls:
return run(async () => updateEntryFn(...), {
  successMessage: 'Entry updated',
  ...options,  // options = { invalidate: false, onSuccess, onError }
})

// run() calls:
options.onSuccess?.(result)  // This fires our onSuccess
```

But wait, `run` receives options with `...options` spread. So when `saveEdit` passes `{ invalidate: false, onSuccess: () => { ... } }`, the `run` function will call `options.onSuccess?.(result)` which fires our callback. That's fine — our callback runs after the server confirms.

And from `saveEdit`'s original code:

```typescript
void mutations.updateEntry(editingId, payload, {
  invalidate: false,
  onSuccess: () => onMutated?.(), // ← this is in the options passed to mutations.updateEntry
  onError: () => patchEntryOptimistically(prev),
})
```

When we move things to `onSuccess`:

```typescript
void mutations.updateEntry(editingId, payload, {
  invalidate: false,
  onSuccess: () => {
    patchEntryOptimistically({ ...prev, ...payload })
    setEditingId(null)
    onMutated?.()
  },
  onError: () => {
    setEditingId(null)
  },
})
```

This should work correctly. The `run()` function's `options.onSuccess?.(result)` will call our callback which does all three things.

### Step 2: Add workspace timezone to `overlap-confirmation.tsx` (Issue 2)

**Location:** `src/lib/time-tracker/overlap-confirmation.tsx`

**Changes:**

1. Add `timezone` field to `OverlapCheckInput`:

```typescript
export type OverlapCheckInput = {
  memberId?: string
  entryId?: string
  excludeEntryId?: string
  startedAt?: string
  endedAt?: string
  timezone?: string
}
```

2. Update `showOverlapConfirmation()` and `confirmTimeEntryOverlap()` to accept and pass through the timezone.

3. Update `formatConflictTime()` to accept a timezone parameter and use `toLocaleString()` with the timezone:

```typescript
function formatConflictTime(value: string, timezone?: string): string {
  const date = new Date(value)
  const options: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  }
  if (timezone) {
    options.timeZone = timezone
  }
  return date.toLocaleString([], options)
}
```

**Note on timezone input:** Workspace timezones stored in the DB are IANA timezone names like `'Asia/Manila'`, `'America/New_York'`, `'UTC'`. These are valid inputs to `toLocaleString()`'s `timeZone` option.

### Step 3: Pass timezone at all call sites

#### 3a. `useTrackerMutations.ts`

**Location:** `src/components/time-tracker/dashboard/hooks/useTrackerMutations.ts`

The workspace timezone is available from the tracker state in the query cache. We need to read it and pass it to `confirmTimeEntryOverlap()`.

The `useTrackerMutations` hook currently doesn't have access to the tracker state. We have two options:
a. Read it from the query cache: `queryClient.getQueryData<TrackerState>(trackerKeys.state)?.workspace.timezone`
b. Accept it as a parameter to the hook

Option (a) is simplest and least invasive — no need to update all callers.

Add a helper inside the hook:

```typescript
function getWorkspaceTimezone(): string | undefined {
  const state = queryClient.getQueryData<TrackerState>(trackerKeys.state)
  return state?.workspace?.timezone
}
```

Then pass it to each `confirmTimeEntryOverlap` call:

```typescript
const timezone = getWorkspaceTimezone()
const confirmed = await confirmTimeEntryOverlap({
  entryId: id,
  timezone,
})
```

Repeat for `addManualEntry` and `updateEntry`.

#### 3b. `DepartmentMemberDetailScreen.tsx`

**Location:** `src/components/time-tracker/analytics/department/DepartmentMemberDetailScreen.tsx`, line 81-86

Simply add `timezone: detail.timezone` to the `confirmTimeEntryOverlap` call:

```typescript
const confirmed = await confirmTimeEntryOverlap({
  memberId: editingEntry.workspaceMemberId,
  excludeEntryId: editingEntry.id,
  startedAt: new Date(editingDraft.startedAt).toISOString(),
  endedAt: new Date(editingDraft.endedAt).toISOString(),
  timezone: detail.timezone,
})
```

## 7. Testing Plan

1. **Issue 1 manual test:**
   - Open the time tracker dashboard
   - Edit a stopped entry that overlaps with another
   - Click Save → overlap warning appears → click "Cancel"
   - **Expected:** The edit drawer remains open (or reopens), the entry appears unchanged, no stale data
   - Click Save → overlap warning → click "Save anyway"
   - **Expected:** Entry updates correctly, drawer closes

2. **Issue 2 manual test:**
   - Set a workspace timezone different from browser timezone (e.g. `America/New_York` while browser is in `Asia/Manila`)
   - Edit/create an entry that will trigger an overlap warning
   - **Expected:** Conflict times displayed in the workspace timezone, not the browser timezone

3. **Regression check:**
   - Run `pnpm typecheck` and `pnpm lint` — must pass
   - Run `pnpm test` — all 44 tests must pass
   - Running entry editing (no overlap check) should still work as before

## 8. Risks and Edge Cases

- **Cached state being stale:** Reading workspace timezone from the query cache assumes it's been fetched. If the cache is empty (e.g. during the first render before the router loader completes), `getQueryData` returns `undefined`. In that case, the fallback is browser timezone — which is the current (buggy) behaviour, so no regression.
- **DepartmentMemberDetailScreen already correct:** This screen's `saveEdit` already checks overlap before mutating. We only need to add the timezone parameter — no logic changes.
- **Running entries not affected by Issue 1:** The `!prev.endedAt` branch uses `updateActiveTimer` which has no overlap check, so it's unaffected by the bug.
- **The overlap check in `useTrackerMutations.updateEntry` also calls `confirmTimeEntryOverlap` synchronously before the async server call.** The returned value (undefined vs the result) means we need to await it properly. In the new `saveEdit`, we fire `mutations.updateEntry(editingId, payload, ...)` as `void` — this is fine because the `onSuccess`/`onError` callbacks handle the post-mutation state. The function itself is async but we don't need to await it for the flow to work correctly.
