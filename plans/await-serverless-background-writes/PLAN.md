# Await or Queue Serverless Background Writes

> **Status:** 📋 Planned

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
- **`plans/import-pipeline-performance`** — the per-row Sheets fan-out in the import pipeline is the same shape as `bulkArchiveProjects`; both should converge on `runInBatches`.

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
- **Rewriting `streaming-import.server.ts`'s per-row loops.** Owned by `plans/import-pipeline-performance`.
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
- [ ] **Who owns reconciling the four plans that touch `catalog-sync.server.ts`?** This plan (Phase 1), `plans/gsheets-write-integrity`, and `plans/import-pipeline-performance` all reference it. Assign a merge order before any of them land to avoid conflicting edits.
