# Fix Google Sheets Cron HTTP Method and Secret Handling

> **Status:** 📋 Planned

## Status

- [ ] **Investigation gate passed** — the cron's actual HTTP method has been confirmed from production evidence (not assumed).
- [ ] Differential test run: `timer-reminders` (GET+POST) vs `sync-gsheets` (POST-only) compared in Vercel logs.
- [ ] `pending_gsheets_syncs` row count and age distribution measured.
- [ ] `CRON_SECRET` presence confirmed in the production environment.
- [ ] GET handler added to `sync-gsheets` (safe regardless of the investigation outcome).
- [ ] Both crons converted to constant-time secret comparison.
- [ ] `CRON_SECRET` documented in `.env.example`.
- [ ] Per-invocation workspace batch bounded; unprocessed rows left for the next tick.
- [ ] Cron response no longer reports `ok: true` when every workspace failed.
- [ ] Validation: typecheck, lint, tests, plus the local route-method check and the production log re-check.

## Verify First (No Code Change)

> ### ⚠️ Read this before anything else
>
> **The core claim of this plan is NOT fully verified.** The finding is that Vercel Cron invokes a configured path with an HTTP **GET**, so a route that registers only a `POST` handler returns **405** — which Vercel records as a completed (not failed) invocation. I could only confirm Vercel's invocation method from **secondary sources**; Vercel's own documentation pages are JavaScript-rendered and returned no body when fetched, so the primary source was not readable. **Treat this as a high-likelihood hypothesis, not an established fact.**
>
> This matters because the _symptom_ is identical under two different root causes:
>
> - **(H1)** The cron returns 405 because Vercel sends GET and the handler is POST-only.
> - **(H2)** The cron is invoked correctly but returns 401 because `CRON_SECRET` is not set in the production environment (see §3 below — it is missing from `.env.example`).
>
> Both produce "the queue never drains". **§2's differential test distinguishes them, and it is the single most important step in this plan.** Do not skip it and do not assume H1.
>
> **Good news:** the primary fix for H1 — adding a `GET` handler that mirrors `POST` — is **zero-risk**. It cannot break anything that currently works, because a route with no `GET` handler today can only be returning 405 (or 404) to `GET`. So if the investigation is inconvenient, the code change is still safe to ship. What is **not** safe is _skipping the investigation and closing the ticket_, because H2 would remain unfixed and the queue would still never drain.

### 1. Local: prove the route's method behaviour (no production access needed)

- [ ] Start the dev server (note: `pnpm dev` fails in this environment with an EPERM error against `~/Library/pnpm`; use the binary directly):
  ```bash
  ./node_modules/.bin/vite dev --port 3000
  ```
- [ ] In another shell, probe both methods and record the status codes:
  ```bash
  curl -s -o /dev/null -w "GET  -> %{http_code}\n" http://localhost:3000/api/cron/sync-gsheets
  curl -s -o /dev/null -w "POST -> %{http_code}\n" -X POST http://localhost:3000/api/cron/sync-gsheets
  curl -s -o /dev/null -w "GET  -> %{http_code}\n" http://localhost:3000/api/cron/timer-reminders
  ```

  - [ ] **Expected:** `GET /api/cron/sync-gsheets` → **405** (only `POST` is registered at `src/routes/api/cron/sync-gsheets.ts:10`), while `GET /api/cron/timer-reminders` → **401** (a `GET` handler exists at `src/routes/api/cron/timer-reminders.ts:23`, so the request reaches the secret check and is rejected there).
  - [ ] This confirms the **route-level** asymmetry locally and with certainty. It does **not** confirm what Vercel sends — that is §2.
- [ ] Confirm the handler registration asymmetry by reading the two files side by side:
  ```bash
  sed -n '1,20p' src/routes/api/cron/sync-gsheets.ts
  sed -n '20,28p' src/routes/api/cron/timer-reminders.ts
  ```

  - [ ] Note that `timer-reminders` registers **both** `GET` and `POST`, while `sync-gsheets` registers **only** `POST`. This asymmetry is itself the strongest internal evidence for H1 — whoever wrote `timer-reminders` hit this problem and fixed one file but not the other.

### 2. Production: the differential test that discriminates H1 from H2 (requires Vercel access)

- [ ] **Is the hourly cron working at all?** `timer-reminders` runs `0 * * * *` (`vercel.json:13-15`) and handles **both** methods. If timer-reminder emails are being delivered on schedule, then Vercel Cron _is_ being invoked in this project — which means the difference between the two routes is the method or the secret, not cron configuration generally.
  ```sql
  SELECT kind, count(*), max(sent_at) AS last_sent
  FROM timer_reminder_emails
  GROUP BY kind;
  ```

  - [ ] Last-sent within the last few hours ⇒ crons are running ⇒ **H1 or H2**, and you can discriminate further below.
  - [ ] Nothing recent ⇒ crons are not running at all (a third possibility: cron configuration/plan problem). Investigate that before writing any code.
- [ ] **Open Vercel → the project → Cron Jobs.** For `/api/cron/sync-gsheets`, record the HTTP status of the most recent invocations.
  - [ ] **405** ⇒ **H1 confirmed.** The fix is the `GET` handler.
  - [ ] **401** ⇒ **H2 confirmed.** The fix is the environment variable (§3) — and the `GET` handler is still worth adding for robustness.
  - [ ] **200** ⇒ this plan's premise is **falsified**; the cron runs. Stop and re-scope: investigate whether the queue drains but the sync itself fails inside `syncWorkspaceById`. Report this outcome to the plan owner.
  - [ ] No invocations listed at all ⇒ the schedule is not registered. Check that `vercel.json` was deployed with the `crons` block (`:7-16`) and that the plan/tier allows the configured interval.
- [ ] **Deployment logs.** In Vercel → the deployment → **Functions**, find invocations of `/api/cron/sync-gsheets` and read the log line the handler emits on success (`src/routes/api/cron/sync-gsheets.ts:59-61`):
  ```
  [cron/sync-gsheets] Done. pending=… success=… failures=… duration=…ms
  ```

  - [ ] If this line **never appears**, the handler body is not executing → H1 or H2.
  - [ ] If it appears with `pending=0` every day, the queue is empty and a _different_ problem exists (e.g. `enqueueTimeEntry` is not being called). That falsifies this plan's premise.
  - [ ] If it appears with `failures=N` matching `pending=N`, the cron runs but every sync fails — also a different problem, owned elsewhere.

### 3. Confirm the secret is present in production (independently of the above)

- [ ] In Vercel → project → **Settings → Environment Variables**, confirm `CRON_SECRET` exists for the production environment and is non-empty.
  - [ ] **It is absent from `.env.example`** — verified: that file documents only `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `EMAIL_FROM`, `EMAIL_TEMPLATE_TEST_RECIPIENT`, the `SMTP_*` set, `IMAGEKIT_*`, `APP_URL`, and `XENDIT_*`. `grep -c CRON_SECRET .env.example` returns **0**. So a deploy that followed the example would silently 401 **both** crons. Because both handlers fail closed on a missing secret (`if (!cronSecret || …) return 401`), the failure is a 401 with no alert.
- [ ] Confirm the secret's value matches what Vercel injects as `Authorization: Bearer $CRON_SECRET`. A mismatch produces the same 401.

### 4. Measure the backlog (requires DB read access)

- [ ] Count and age the pending rows:
  ```sql
  SELECT count(*) AS pending_workspaces, min(created_at) AS oldest, max(created_at) AS newest
  FROM pending_gsheets_syncs;
  ```

  - [ ] **A large count, or an `oldest` timestamp many days old, indicates the queue has never drained** — this is the decisive evidence that time entries are not reaching spreadsheets.
  - [ ] Cross-check that the rows _should_ have been drained: the cron filters to workspaces with a sheet URL (`src/routes/api/cron/sync-gsheets.ts:27`):
    ```sql
    SELECT count(*) FROM pending_gsheets_syncs p
    JOIN workspaces w ON w.id = p.workspace_id
    WHERE w.google_sheet_url IS NOT NULL;
    ```
    A non-zero result here is a queue that is due for processing and has not been processed.
- [ ] Confirm the enqueue side is working (a zero backlog could mean nothing is being enqueued rather than everything being drained):
  ```bash
  grep -rn "enqueueTimeEntry" src/ --include=*.ts
  ```

  - [ ] Confirm `src/lib/server/gsheets/sync-queue.ts` is called from the entry mutation paths (`src/lib/server/tracker/timer.server.ts`, `src/lib/server/tracker/manual-entries.server.ts`). If enqueueing works and the backlog is non-zero, the cron is the bottleneck.
- [ ] Establish the end-to-end expectation: as soon as this plan is applied, `count(*)` should drop toward zero after the next daily tick. **Record the pre-fix count — you will need it as the baseline.** See Section 10.

### 5. Access you will likely need (and what to do without it)

| Evidence                         | Access required                                 | If you do not have it                                                                                           |
| -------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Route returns 405 to GET locally | None                                            | N/A — always doable (§1). **Do this even if you can do nothing else.**                                          |
| Vercel cron status codes / logs  | Vercel dashboard                                | Ask for a screenshot of the Cron Jobs page, or a log export. Otherwise mark H1/H2 UNRESOLVED.                   |
| `CRON_SECRET` presence           | Vercel env settings                             | Ask an operator to confirm the variable exists (name only — never paste the value).                             |
| Backlog size                     | Postgres read (`DIRECT_URL` in `.env.local`)    | Ask a human with DB access to run the §4 queries.                                                               |
| Timer-reminder delivery          | DB read, or a mailbox subscribed to a workspace | If neither is available, the differential test is inconclusive; fall back to the Vercel Cron Jobs status codes. |

> **Confidence statement (restated for the record).** Confirmed with certainty: the route-level asymmetry (`sync-gsheets` registers only `POST`; `timer-reminders` registers `GET` and `POST`), that `vercel.json` schedules the path daily, that `CRON_SECRET` is absent from `.env.example`, and that the secret comparison is not constant-time. Confirmed only from **secondary sources**: the claim that Vercel Cron issues `GET`. **Not verified at all:** whether this specific production deployment is affected, and whether the backlog is currently non-zero. The plan is structured so that the code changes are safe to apply even if H1 turns out to be false — but the _severity claim_ ("no time entries ever reach spreadsheets") must not be repeated until §2 and §4 have been run.

## 1. Goal

Establish with evidence whether the daily Google Sheets sync cron is actually running, and fix the defects that would prevent it from working.

Three independent defects are stacked on this one route, and all three produce the same silent symptom — `pending_gsheets_syncs` grows forever and no workspace's time entries ever reach its spreadsheet:

1. The route registers **only** a `POST` handler (`src/routes/api/cron/sync-gsheets.ts:10`) while its sibling registers both `GET` and `POST`. If Vercel Cron sends `GET` (high likelihood, not certain — see above), the route returns 405 on every invocation, which Vercel logs as completed.
2. `CRON_SECRET` is absent from `.env.example`, so a deploy following the example returns 401 on **both** crons. Both handlers fail closed, which is the right behaviour and also completely silent.
3. Even when the route is reached, the handler loops over pending workspaces **sequentially**, each performing a full Sheets sync, inside a 30-second function budget (`vite.config.ts:23`) — so more than a couple of pending workspaces will time out and be killed mid-loop.

The deliverable is a route that is invoked correctly, authenticated with a documented secret compared in constant time, and bounded so that it makes durable progress instead of dying.

## 2. Context Summary

### The route

`src/routes/api/cron/sync-gsheets.ts`:

```ts
export const Route = createFileRoute('/api/cron/sync-gsheets')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // ← :10 — POST only
        const cronSecret = process.env.CRON_SECRET
        const authHeader = request.headers.get('authorization')
        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
          // ← :11-15
          return new Response('Unauthorized', { status: 401 })
        }

        const startedAt = Date.now()

        // Pick up workspaces flagged as pending by enqueueTimeEntry
        const pendingRows = await db
          .select({ id: workspaces.id, name: workspaces.name })
          .from(pendingGsheetsSyncs)
          .innerJoin(
            workspaces,
            eq(pendingGsheetsSyncs.workspaceId, workspaces.id),
          )
          .where(isNotNull(workspaces.googleSheetUrl)) // ← :27

        let successCount = 0
        let failureCount = 0
        const errors: { workspaceId: string; error: string }[] = []

        for (const workspace of pendingRows) {
          // ← :33 — SEQUENTIAL loop
          try {
            await syncWorkspaceById({
              /* full Sheets sync */
            })
            await db
              .delete(pendingGsheetsSyncs)
              .where(eq(pendingGsheetsSyncs.workspaceId, workspace.id))
            successCount++
          } catch (err) {
            // Leave the pending row — it will be retried on the next cron tick
            failureCount++
            errors.push({ workspaceId: workspace.id, error: message })
            console.error(
              `[cron/sync-gsheets] Auto-sync failed for workspace ${workspace.id} (${workspace.name}): ${message}`,
            )
          }
        }

        // ...
        return new Response(
          JSON.stringify({
            ok: true,
            processed: pendingRows.length,
            successCount,
            failureCount,
            durationMs,
            errors,
          }), // ← :63-73
          { headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
```

Its sibling, `src/routes/api/cron/timer-reminders.ts:21-27`, registers **both**:

```ts
export const Route = createFileRoute('/api/cron/timer-reminders')({
  server: {
    handlers: {
      GET: async ({ request }) => handleTimerRemindersCron(request), // ← :23
      POST: async ({ request }) => handleTimerRemindersCron(request), // ← :24
    },
  },
})
```

This asymmetry is the strongest internal evidence for the primary hypothesis: the author clearly encountered the method problem and fixed it in one file only.

### The schedule

`vercel.json:7-16`:

```json
"crons": [
  { "path": "/api/cron/sync-gsheets",    "schedule": "0 0 * * *" },
  { "path": "/api/cron/timer-reminders", "schedule": "0 * * * *" }
],
```

Note also that the handler **always returns `ok: true`** (`:63-73`) even when `failureCount === pendingRows.length`. Nothing in the response or the status code distinguishes total failure from total success, so a monitoring check keyed on HTTP status would report healthy.

### The queue that depends on it

- `src/lib/server/gsheets/sync-queue.ts` — `enqueueTimeEntry(workspaceId, entryId)` writes a row to `pending_gsheets_syncs` with `onConflictDoNothing()`.
- `src/db/schema.ts:1314-1321` — `pending_gsheets_syncs` is keyed on `workspace_id` as the **PRIMARY KEY**, which is why `onConflictDoNothing()` correctly collapses many enqueues into one pending row per workspace. (This also means the queue cannot grow past one row per workspace, and it cannot accumulate duplicates — so a large _count_ means many workspaces, not many events.)
- The cron is the **only** consumer. It deletes the pending row on success (`:43-45`) and deliberately leaves it on failure (`:47-48`, a correct retry design).
- Because the row is deleted only on success and the queue is keyed per workspace, the design is already idempotent and resumable. The problem is purely invocation and throughput.

### Why the sequential loop is a problem

`vite.config.ts:23` sets `maxDuration: 30` for **every** function — there is no per-route override anywhere in the repo. Each iteration of the `for` loop at `:33` performs a full `syncWorkspaceById` (`src/lib/server/gsheets/sync.server.ts:54`), which reads all of the workspace's completed time entries plus catalog tabs and writes them to Google Sheets. That is multiple external round-trips per workspace. With more than a small handful of pending workspaces, the invocation is killed mid-loop; the current workspace's pending row survives (good) but the remaining ones were never attempted (also fine, they retry next tick) — so the real risk is **never making progress** rather than losing data, because the daily tick may only ever process the first one or two workspaces.

### Assumptions

| Assumption                                         | Default assumed                                                  | If wrong                                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel Cron sends `GET`                            | Assumed **high likelihood, NOT certain**                         | If it sends `POST`, then H1 is false and the real cause is H2 (missing `CRON_SECRET`) or a config problem. The `GET` handler is harmless either way. |
| `CRON_SECRET` is what Vercel injects automatically | Assumed yes (secondary sources)                                  | If Vercel does not inject it, the route needs a different authentication mechanism that the platform actually supplies.                              |
| The queue should drain at least daily              | Assumed yes (`0 0 * * *` matches the product's reporting rhythm) | If near-real-time sync is required, a daily cron is the wrong mechanism and this plan's bounding work becomes a redesign.                            |
| Failing closed on a missing secret is correct      | Assumed **yes** — keep it                                        | Never weaken this to "allow when unset"; that would expose the route publicly.                                                                       |

## 3. Scope

- `[CHECK]` Locally confirm the route's method behaviour with `curl` (Verify First §1) — needs no production access.
- `[CHECK]` Run the production differential test to distinguish H1 (405) from H2 (401) from "cron not running at all" (Verify First §2).
- `[CHECK]` Confirm `CRON_SECRET` exists in the production environment (Verify First §3).
- `[CHECK]` Measure the `pending_gsheets_syncs` backlog and its age (Verify First §4) and record the baseline.
- `[CHECK]` Determine a safe per-invocation workspace batch size from observed `syncWorkspaceById` durations.
- `[FIX]` Add a `GET` handler to `src/routes/api/cron/sync-gsheets.ts` that delegates to the same logic as `POST` — mirroring `timer-reminders.ts:21-27`. **Zero-risk: a route with no `GET` handler cannot currently be serving `GET` traffic.**
- `[FIX]` Replace the non-constant-time `authHeader !== \`Bearer ${cronSecret}\``comparison in **both** cron files with`crypto.timingSafeEqual`, following the existing model at `src/routes/api/webhooks/xendit.ts:12-16`.
- `[FIX]` Document `CRON_SECRET` in `.env.example`, including a note that both cron routes return 401 without it and that the failure is silent.
- `[FIX]` Bound the per-invocation batch: process at most N pending workspaces per tick, leave the rest for the next tick, and report how many remain.
- `[FIX]` Stop reporting `ok: true` when the work did not succeed (see Section 7.4) so that monitoring and Vercel's own status are meaningful.
- `[FIX]` Add a `console.error`/log line for the 401 path so an unauthenticated invocation is distinguishable from an absent one.

## 4. Out of Scope

- **Rewriting `syncWorkspaceById` or the Sheets write path.** Owned by `plans/gsheets-write-integrity` and `plans/import-pipeline-performance`.
- **Moving the sync to a real background-job platform** (Vercel Queues, a Workflow, an external scheduler). Bounding the batch is the proportionate fix; a platform migration is a separate plan.
- **Raising `maxDuration`** above 30s (`vite.config.ts:23`). That is a cost/plan-tier decision, and the bounding fix makes it unnecessary.
- **Changing the cron schedule.** `0 0 * * *` is assumed correct.
- **Adding alerting/monitoring infrastructure** beyond making the response and logs truthful. If a monitor is wanted, it is a follow-up.
- **Backfilling sheets for workspaces whose entries never synced.** Once the cron works, the next tick re-syncs each pending workspace from scratch (the sync is a full read-and-write, not an incremental append), so the backlog self-heals. **Confirm this assumption during Phase 4** — if the sync turns out to be incremental, a backfill plan is required.
- **The `timer-reminders` cron's own throughput.** It shares the 30s budget and the secret handling, but it is out of scope except for the `timingSafeEqual` change and the `.env.example` documentation, which are shared.
- **Investigating why `enqueueTimeEntry` ignores its `entryId` parameter.** Noted in other plans; no functional impact on the queue because the table is keyed per workspace.

## 5. Affected Files and Folders

```txt
plans/fix-gsheets-cron-http-method/PLAN.md          (NEW)

src/routes/api/cron/sync-gsheets.ts                 (MODIFY)
  ├─ :10       add a GET handler alongside POST (mirror timer-reminders)
  ├─ :11-15    replace the string comparison with a constant-time check
  ├─ :20-27    bound the pending query with a per-invocation limit
  ├─ :33-56    keep the sequential loop but cap its length; report remainder
  └─ :63-73    stop returning ok:true when every workspace failed

src/routes/api/cron/timer-reminders.ts              (MODIFY)
  └─ :5-9      replace the string comparison with a constant-time check
               (handler registration already correct at :23-24)

src/lib/server/gsheets/cron-auth.server.ts          (NEW — recommended)
  └─ one shared constant-time "is this a valid cron invocation" helper,
     so both routes cannot drift apart again. Model: the tokensMatch
     helper at src/routes/api/webhooks/xendit.ts:12-16.

.env.example                                        (MODIFY)
  └─ document CRON_SECRET with a note that both cron routes 401
     silently without it

vercel.json                                         (VERIFY ONLY — no change expected)
  └─ :7-16 confirm the crons block is deployed as written
```

No database migration. No frontend files. No new dependencies.

## 6. Database Design

**N/A — no schema change.**

The queue table already exists and is correctly designed for this purpose: `pending_gsheets_syncs` (`src/db/schema.ts:1314-1321`) with `workspace_id` as the PRIMARY KEY and a cascade delete to `workspaces`. The primary key is what makes `onConflictDoNothing()` in `src/lib/server/gsheets/sync-queue.ts` collapse repeated enqueues into a single pending row per workspace, which is exactly the behaviour the bounded batch needs: "process at most N workspaces per tick" has a well-defined upper bound equal to the number of workspaces with a sheet URL.

No index is needed for the bounded query. The join from `pending_gsheets_syncs` to `workspaces` is on the primary key of a small table.

## 7. Backend Implementation

### 7.1 Add the `GET` handler (`sync-gsheets.ts:10`)

Extract the existing handler body into a named function and register it for both methods, exactly as `timer-reminders.ts:4-27` already does:

- `async function handleSyncGsheetsCron(request: Request)` holds the current body.
- `handlers: { GET: …, POST: … }` both delegate to it.

This is safe in every scenario: today a `GET` to this route cannot be doing useful work, so adding a handler cannot regress anything. It also makes the two cron routes structurally consistent, which removes the class of bug rather than one instance.

### 7.2 Constant-time secret comparison (both cron files)

Current shape in both files:

```ts
if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return new Response('Unauthorized', { status: 401 })
}
```

Replace with a shared, length-checked `timingSafeEqual` comparison. The pattern already exists in this codebase at `src/routes/api/webhooks/xendit.ts:12-16`:

```ts
function tokensMatch(received: string, expected: string) {
  const left = Buffer.from(received)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}
```

Notes for the implementer:

- **Preserve the fail-closed behaviour.** Keep `if (!cronSecret) return 401`. Never relax this to "allow when the secret is unset" — that would make the route publicly triggerable.
- Extract the helper to **one** shared module (`src/lib/server/gsheets/cron-auth.server.ts` or similar) rather than copying it into both files, so the two routes cannot drift again. The drift between these two files is the origin of the whole finding.
- The practical risk of a non-constant-time compare on a long bearer token over the network is low. The reason to fix it is consistency with the codebase's own existing standard, not an urgent exposure. Say so in the PR rather than overstating it.

### 7.3 Bound the per-invocation batch

The `for` loop at `:33` iterates every pending workspace. Change it to process a bounded number per invocation:

- Add a `.limit(N)` to the pending query (`:20-27`), ordered so the oldest pending rows are processed first (order by `pendingGsheetsSyncs.createdAt`, which exists at `schema.ts:1318-1320`). Oldest-first guarantees that a persistently failing workspace cannot starve the others — with no ordering, the same first N could be retried forever.
- Choose `N` from observed data (Verify First §5). The constraint is that `N × (duration of one syncWorkspaceById)` must fit comfortably inside 30s. Instrument from the existing log line, which already reports `duration`, and derive `N` from a measured per-workspace cost rather than guessing.
- Report the remainder explicitly in the response so that a human (or a future monitor) can tell "queue drained" from "queue draining".
- Keep the existing retry semantics: **delete the pending row only on success** (`:43-45`), leave it on failure (`:47-48`). This is already correct and is what makes the bounded batch safe — an unprocessed or failed workspace is simply picked up next tick.

### 7.4 Make the response truthful

Today the handler returns `{ ok: true, … }` unconditionally (`:63-73`). A caller — Vercel's own view, or a future monitor — cannot distinguish success from total failure.

- Keep returning a JSON body with the per-workspace error detail (it is useful for debugging).
- Make the overall outcome representable: either use a non-200 status when `successCount === 0 && failureCount > 0`, or keep `200` but make the body's `ok` reflect reality. Decide which, and note it in Section 13, because a non-200 status may cause Vercel to flag the cron as failed — which is arguably desirable here.
- Do **not** change the semantics so that a partial failure returns non-200, or a single bad workspace would make the whole tick look failed forever.

### 7.5 Log the 401 path

Add a log line to the unauthorized branch in both cron files. Without it, a 401 is indistinguishable from a 405 or an absent invocation in the logs — which is precisely the ambiguity this plan exists to remove.

## 8. Frontend Implementation

**N/A — this plan has no user interface.**

The observable user-facing consequence is indirect: once the cron drains, workspaces' Google Sheets stop being stale. There is no UI state, component, route, or client-side cache involved, and no "sync status" surface is currently rendered anywhere for the cron specifically (`workspaces.googleSheetSyncedAt` and `googleSheetSyncedBy` at `src/db/schema.ts:266-272` are written by the sync and readable in the database, but displaying them is not part of this fix).

If the team wants a visible last-synced indicator as a follow-up, that is a new feature, not a remediation item.

## 9. Access Control

**N/A — no permission changes.**

The route is intentionally unauthenticated except for the shared `CRON_SECRET` bearer token, and this plan does not change who can call it. It changes _how_ the token is compared (constant time) and documents the variable. No workspace-level roles, permissions, or RBAC helpers are involved — the route acts as a system actor (`syncedByValue: 'system:auto'`, `actorId: null`, per `src/routes/api/cron/sync-gsheets.ts:36-41`).

One hardening note, not a permission change: adding a log line to the 401 branch (Section 7.5) means failed authentication attempts against the route become visible in logs. That is a security improvement, not a widening.

## 10. Validation

### Commands

`pnpm <script>` fails in this environment with an EPERM error writing to `~/Library/pnpm`. Use the direct binaries:

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/vitest run
npx eslint src --ext .ts,.tsx --max-warnings 0
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> **Pre-existing failure — not yours.** `./node_modules/.bin/vitest run` currently reports **1 failing test in `src/lib/time-tracker/payroll-periods.test.ts`** (a date-dependent test that omits the `now` argument, failing since 2026-09-15). It is unrelated to this plan. Baseline: **374 passing, 1 failing**.

### Local route verification (the key pre-ship check)

- [ ] Start the dev server and probe both methods for both cron routes:
  ```bash
  ./node_modules/.bin/vite dev --port 3000
  ```
  ```bash
  # After the fix, GET must no longer be 405 — it should reach the secret
  # check and return 401 without a valid secret.
  curl -s -o /dev/null -w "GET  sync-gsheets -> %{http_code}\n" http://localhost:3000/api/cron/sync-gsheets
  curl -s -o /dev/null -w "POST sync-gsheets -> %{http_code}\n" -X POST http://localhost:3000/api/cron/sync-gsheets
  curl -s -o /dev/null -w "GET  timer-reminders -> %{http_code}\n" http://localhost:3000/api/cron/timer-reminders
  ```

  - [ ] **Before:** `GET sync-gsheets` → 405. **After:** `GET sync-gsheets` → 401.
  - [ ] Record both values as the evidence that the primary fix landed.
- [ ] Prove the constant-time comparison still accepts a correct secret and still rejects a wrong one. With `CRON_SECRET` set locally:
  ```bash
  curl -s -o /dev/null -w "wrong secret -> %{http_code}\n" \
    -H "Authorization: Bearer definitely-not-the-secret" \
    http://localhost:3000/api/cron/sync-gsheets
  curl -s -o /dev/null -w "no secret    -> %{http_code}\n" \
    http://localhost:3000/api/cron/sync-gsheets
  ```

  - [ ] Both must return **401**. Then with the real secret, confirm the handler body runs (it will reach the DB).
- [ ] Confirm the missing-secret path still fails closed:
  ```bash
  # With CRON_SECRET unset in the shell/env:
  curl -s -o /dev/null -w "unset secret -> %{http_code}\n" http://localhost:3000/api/cron/sync-gsheets
  ```

  - [ ] Must return **401**, never 200.

### Static verification

- [ ] Both cron files register both methods:
  ```bash
  grep -n "GET:\|POST:" src/routes/api/cron/sync-gsheets.ts src/routes/api/cron/timer-reminders.ts
  ```
- [ ] No non-constant-time comparison remains in either file:
  ```bash
  grep -n "authHeader !==\|timingSafeEqual" src/routes/api/cron/*.ts
  ```

  - [ ] Expect `timingSafeEqual` present and `authHeader !==` absent.
- [ ] `CRON_SECRET` is documented:
  ```bash
  grep -n "CRON_SECRET" .env.example
  ```
- [ ] The pending query is bounded:
  ```bash
  grep -n "limit\|orderBy" src/routes/api/cron/sync-gsheets.ts
  ```
- [ ] The success-only delete is preserved (this is what makes bounding safe):
  ```bash
  sed -n '33,58p' src/routes/api/cron/sync-gsheets.ts
  ```

### Production verification (post-deploy — this is the real acceptance test)

- [ ] **Baseline first.** Record the backlog before deploying:
  ```sql
  SELECT count(*) FROM pending_gsheets_syncs p
  JOIN workspaces w ON w.id = p.workspace_id
  WHERE w.google_sheet_url IS NOT NULL;
  ```
- [ ] After the next scheduled tick (`0 0 * * *`), confirm the count **decreased**:
  ```sql
  SELECT count(*), min(created_at) AS oldest FROM pending_gsheets_syncs;
  ```

  - [ ] A decreasing count is the definitive proof that the cron is draining. A count that is unchanged after a full day means the fix did not address the actual cause — return to Verify First §2 with the new evidence.
- [ ] Confirm the success log line now appears in Vercel function logs:
  ```
  [cron/sync-gsheets] Done. pending=… success=… failures=… duration=…ms
  ```
- [ ] Confirm in Vercel → Cron Jobs that the invocation for `/api/cron/sync-gsheets` is no longer 405.
- [ ] **Cross-check a real spreadsheet.** Pick a workspace that had a pending row and confirm its time-entry tab reflects recent entries. This is the end-to-end proof and the thing the user actually cares about.
- [ ] Confirm a persistently failing workspace does not starve others: with `N` bounded and oldest-first ordering, verify that after one tick the `min(created_at)` has advanced even if one workspace keeps failing.

## 11. Sequencing

- [ ] **Phase 0 — Investigate (no code).** Run Verify First §1 locally, then §2–§4. **Gate:** do not proceed past this phase until you know which of H1 / H2 / "cron not running" applies, or until you have explicitly accepted that you are shipping the `GET` handler blind because it is zero-risk while leaving the H1-vs-H2 question open. Record the outcome and the backlog baseline.
- [ ] **Phase 1 — The zero-risk fix.** Add the `GET` handler (Section 7.1) and the 401 log line (Section 7.5). Independently shippable. Safe regardless of the investigation outcome.
- [ ] **Phase 2 — Secret handling.** Extract the shared constant-time helper, apply it to both cron files (Section 7.2), and document `CRON_SECRET` in `.env.example`. Independently shippable. **If Phase 0 showed H2, this phase is the actual fix** — verify the variable exists in production before closing.
- [ ] **Phase 3 — Bound the batch.** Choose `N` from measured per-workspace duration, add the limit and oldest-first ordering, and report the remainder (Section 7.3). Independently shippable.
- [ ] **Phase 4 — Truthful response.** Make `ok`/status reflect reality (Section 7.4) and confirm whether the sync is a full re-read (which makes the backlog self-healing) or incremental (which would require a backfill plan). Independently shippable.
- [ ] **Phase 5 — Deploy and measure.** Record the pre-deploy backlog, deploy, wait for one full daily tick, and confirm the count decreased. Update the Status checklist with the observed numbers.

## 12. Risks & Considerations

| Risk                                                                                                                                                                                                                                          | Likelihood      | Impact                                    | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The premise is wrong** — Vercel sends `POST`, so the 405 hypothesis is false and the real cause is elsewhere                                                                                                                                | Medium          | Low for the code, High for the conclusion | The `GET` handler cannot regress anything (a route with no `GET` handler serves no `GET` traffic today), so shipping it is safe. But **do not close the ticket as "cron fixed" without confirming the backlog actually drains** (Section 10, production verification). If it does not drain after the fix, return to Verify First §2 — the answer is probably H2.                                                                                                                                                                                                                     |
| **H2 is the real cause** and the fix is an environment variable, not code                                                                                                                                                                     | Medium          | High                                      | Verify First §3 before Phase 2. If `CRON_SECRET` is missing in production, adding it is the fix, and the code changes in this plan become hardening. **Documenting it in `.env.example` is what prevents the next deploy from repeating the mistake.**                                                                                                                                                                                                                                                                                                                                |
| Both crons return 401 silently today, so the _hourly_ reminder cron is also dead                                                                                                                                                              | Medium          | Medium                                    | The differential test in Verify First §2 catches this (no recent `timer_reminder_emails` rows). Fixing the secret fixes both. This is the strongest argument for doing §3 early.                                                                                                                                                                                                                                                                                                                                                                                                      |
| **Google Sheets API quota** — bounding the batch changes the _shape_ of outbound traffic. Processing fewer workspaces per tick means each workspace's sync still issues the same volume, but concentrated across fewer concurrent invocations | Medium          | High                                      | The change _reduces_ peak concurrency (fewer workspaces sequentially rather than many in one loop), so it should lower 429 risk rather than raise it. Google enforces roughly 300 read + 300 write requests/min/user, and `syncWorkspaceById` reads all completed entries for a workspace — so a very large workspace can itself approach quota. Watch for 429s in the sync's error paths after Phase 5. **Rollback:** reverting the `.limit(N)` restores the previous unbounded loop in one commit; the queue is idempotent and keyed per workspace, so no rows are lost either way. |
| Bounding the batch slows backlog drain during an outage recovery                                                                                                                                                                              | Medium          | Low–Medium                                | Oldest-first ordering plus a generous `N` sized from measured duration. If recovery speed matters, temporarily raise `N` or run the route manually with a larger batch.                                                                                                                                                                                                                                                                                                                                                                                                               |
| A persistently failing workspace starves the queue                                                                                                                                                                                            | Medium          | Medium                                    | Explicitly mitigated by ordering the pending query by `createdAt` ascending (Section 7.3). Without ordering this is a real risk — call it out in review.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| The `timingSafeEqual` conversion accidentally breaks authentication                                                                                                                                                                           | Low             | High                                      | Length check first (as `xendit.ts:13-15` does — `timingSafeEqual` throws on unequal lengths). Validate all three cases in Section 10: correct secret, wrong secret, missing secret.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Making the response non-200 causes Vercel to flag every partial failure                                                                                                                                                                       | Medium          | Low–Medium                                | Decide the semantics in Section 13. Recommended: non-200 only when `successCount === 0 && failureCount > 0`, so one bad workspace never makes the whole tick look failed.                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Not** changing the sync internals leaves the 30s ceiling in place                                                                                                                                                                           | High (by scope) | Low                                       | Explicitly out of scope (Section 4). Bounding the batch is the proportionate fix; deeper work belongs to `plans/import-pipeline-performance`. Note the dependency rather than expanding this plan.                                                                                                                                                                                                                                                                                                                                                                                    |
| Backlog does not self-heal if the sync is incremental rather than a full re-read                                                                                                                                                              | Low–Medium      | High                                      | Verify First §4 / Phase 4 asks this question explicitly. If the sync is incremental, the backlog will drain but historical gaps will remain — that requires a backfill plan, which is out of scope here. **Confirm before declaring the incident closed.**                                                                                                                                                                                                                                                                                                                            |
| The `.env.example` edit is made without the variable actually being set in production                                                                                                                                                         | Medium          | Medium                                    | Documentation is necessary but not sufficient. Phase 2 requires confirming the variable in Vercel → Settings → Environment Variables, not just adding the line to the example file.                                                                                                                                                                                                                                                                                                                                                                                                   |

## 13. Open Questions

- [ ] **H1 or H2?** The whole plan branches on this. Blocked on Verify First §2 and §3, both of which need Vercel dashboard access. If neither is available, the honest position is: "the code defects are verified; the production impact is unconfirmed."
- [ ] **What is the correct per-invocation batch size `N`?** Assumed to be derived from the measured duration of one `syncWorkspaceById` inside the 30s budget. Needs a real measurement — the existing `durationMs` log field is the input.
- [ ] **Should a fully-failed tick return non-200?** Assumed yes (so monitoring and Vercel see it), with partial failure still returning 200. Confirm, because it changes what Vercel's Cron Jobs page reports.
- [ ] **Is `CRON_SECRET` set in production right now?** Name-only confirmation is needed; never paste the value into a plan or a log.
- [ ] **Is `syncWorkspaceById` a full re-read or incremental?** This determines whether the existing backlog self-heals on the next tick or needs a separate backfill plan. Assumed full re-read (the queue is per-workspace, not per-entry, which strongly implies a full sync) — but confirm, because the answer changes whether this incident can be closed by deploying.
- [ ] **Should a monitor be added** for "pending queue non-empty for more than 24h"? Assumed out of scope, but a single alert would have caught this class of failure months earlier. If wanted, file it separately.
- [ ] **Where should the shared cron-auth helper live?** Proposed `src/lib/server/gsheets/cron-auth.server.ts`, but it is used by the _timer-reminders_ cron too, which is not Sheets-related. A more neutral location (e.g. `src/lib/server/cron-auth.server.ts`) may be better. Decide before Phase 2 so the file is not created twice.
- [ ] **Who owns verifying the production outcome?** Phase 5 requires Vercel and DB access that the implementer may not have. Assign an owner before Phase 1 ships, otherwise the plan will land with its central question unresolved.
