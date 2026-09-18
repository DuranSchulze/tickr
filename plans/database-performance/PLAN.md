# Database Performance & Efficiency

> **Status:** 🟡 In Progress — Workstream A (schema + generated migration) and C landed, B1 chunked; B2–B4, D and E remain, gated on production data or a decision. See the progress note below.
>
> **Progress (2026-09-18, uncommitted).**
>
> - **Workstream A — schema done, migration generated, NOT applied.** Added `sessions_user_id_idx`, `project_tasks_workspace_name_idx`, `time_entries_ws_member_updated_idx`, `time_entries_workspace_updated_idx` and `time_entries_workspace_project_idx` to `src/db/schema.ts`, and `drizzle-kit generate` produced `drizzle/0025_silent_rictor.sql` containing exactly five additive `CREATE INDEX` statements (no drops, no alters). The false trigram comment in `schema.ts` was corrected and now states that the btree index does not serve leading-wildcard `ILIKE`. **The migration has not been run against any database** — there is no production access here, and this plan requires a non-production branch first.
> - **Workstream C — Option A landed via A.** The pulse's `max(updated_at)` aggregate now has an index it can scan backwards; the misleading cost note in `pulse.server.ts` was rewritten to state the real behaviour. Option B (the `entriesVersion` counter) is not needed unless the measured per-poll cost says otherwise.
> - **Workstream B1 — chunked, not joined.** Added `chunkArray` to `src/lib/server/shared/import-utils.server.ts` and used it at both cliff sites (`gsheets/sync.server.ts`, `bulk-report.server.ts`), so no statement can exceed 65,535 bind parameters. Number-preserving. The sync fetch **date bound was not added** — it can drop rows and needs the production row counts first.
> - **Still gated:** B2 (a default 12-month window is a product decision that changes displayed numbers), B3 (needs the number-preservation check against real data), B4 (broad column-list rewrite across two bootstrap loaders), D (consolidate-vs-port decision), E (blocked on the production duplicate-open-entry count and the human-reviewed cleanup).
> - **Not verified:** every Verify First item — the `pg_indexes` inventory, `EXPLAIN (ANALYZE, BUFFERS)` baselines, table row counts, and the duplicate-open-entry count all require production database access.
>
> **Merged 2026-09-18** from five single-concern plans, all code-verified as not implemented on that date: `add-missing-database-indexes`, `bound-unbounded-query-result-sets`, `tracker-pulse-query-scaling`, `import-pipeline-performance`, and `prevent-duplicate-active-timers`. The verbatim originals are preserved in `absorbed/` for full detail — every Verify First query, code sketch, risk table, and open question lives there. This file is the working plan; the absorbed files are reference material.

## Overview

Five workstreams, one theme: the database layer currently degrades linearly with tenant history, and two paths are already at hard-failure thresholds.

- **Workstream A — Missing indexes.** Add the indexes the actual query shapes need (sessions FK, project_tasks ordering, time_entries `updated_at` and `(workspace_id, project_id)`, trigram rebuilds), correct a false source comment, and fix the migration that dropped a needed trigram index.
- **Workstream B — Bound unbounded queries.** Four query classes grow without bound: `inArray` id lists that hit PostgreSQL's 65,535-parameter ceiling, catalog stats that re-aggregate all history per click, JS-side reductions that belong in `GROUP BY`, and bare-`select()` bootstrap payloads.
- **Workstream C — Tracker pulse scaling.** The app's most frequent query (polled every 30 s per visible tab) runs `max(updated_at)` + `count(*)` with no index support, degrading permanently. Fix via the Workstream A index (Option A, recommended) or a maintained version counter (Option B).
- **Workstream D — Import pipeline batching.** The Sheets importer issues one DB round trip per row inside `for` loops; a 2,000-row import exceeds the 30 s platform budget and dies silently (UI reports success). Port the existing, working batching pattern from `catalog-sync.server.ts`.
- **Workstream E — One open entry per member.** Correctness, not performance — but its canonical fix is a partial unique index, so it shares this plan's DDL/migration track. `startTimer`'s check-then-insert races; only a database constraint closes it.

**Sequencing logic:** A first (DDL is additive and low-risk, and C depends on it) → C piggybacks on A → B next (biggest user-visible wins, gated on production row counts) → D and E last (D is self-contained; E is gated on a pre-migration data cleanup that needs production access).

**Not absorbed, deliberately:** `fix-neon-http-transaction-failure` (billing-incident correctness — keep its own plan and its own Verify First), `server-write-reliability` Part B (round-trip reduction — a server-write concern with its own coordination), `gsheets-write-integrity`, `import-stream-csrf-bypass`, and `fix-gsheets-cron-http-method` (integrity/security/ops — separate tracks). Workstream D interacts with all of them; see §7.

## Status

### Workstream A — Missing indexes

- [ ] Production `pg_indexes` inventory captured for the seven affected tables and diffed against `schema.ts` (absorbed file, Verify First item 1).
- [ ] `pg_trgm` presence confirmed; `CONCURRENTLY` vs plain `CREATE INDEX` decision recorded.
- [ ] `EXPLAIN (ANALYZE, BUFFERS)` baselines captured for the four representative queries **before** any DDL.
- [x] `sessions_user_id_idx`, `project_tasks_workspace_name_idx`, both `time_entries` `updated_at` variants, and `time_entries_workspace_project_idx` added to `schema.ts` and generated into one migration. _(done — `drizzle/0025_silent_rictor.sql`, five additive `CREATE INDEX` statements; **not applied**)_
- [x] Trigram indexes added (or explicitly deferred with recorded reason — Open Question in absorbed file §13). _(explicitly deferred: rebuilding `projects_name_trgm_idx` is contingent on the write-cost-vs-search-speed decision; only the comment was corrected)_
- [x] False trigram comment at `schema.ts:872-877` corrected.
- [ ] Migration applied to a non-production branch first; `db:push` drift check clean; post-deploy `idx_scan > 0` confirmed on every new index.

### Workstream B — Bound unbounded queries

- [ ] Production row counts and `EXPLAIN` baselines captured (severity is a function of real row counts).
- [ ] **WS-B1 bind ceiling:** `inArray` id lists eliminated (join preferred) or chunked in `gsheets/sync.server.ts:116-121` and `bulk-report.server.ts:399-410`; date bound added to the sync entry fetch. — **partially done**: both sites are now chunked via `chunkArray` (number-preserving), which closes the 65,535-parameter ceiling; the sync fetch **date bound was not added** (it can drop rows and needs production row counts), so this box stays open.
- [ ] **WS-B2 catalog stats:** default 12-month window on client/project/tag stats, surfaced in the UI; lifetime totals sourced from `analytics_daily_member_metrics` only if that table is verified current.
- [ ] **WS-B3 JS→SQL:** pure aggregates converted to `GROUP BY` at the cited sites; interval-merge sites keep bounded row fetches; report range given a schema-level upper bound; `performance.server.ts` lookback narrowed to the 30-day window it uses.
- [ ] **WS-B4 bootstrap:** explicit column lists + caps on the `state.server.ts` / `state-lite.server.ts` catalog loads.
- [ ] Number-preservation check passes: no reported total changes for the same inputs.
- [ ] Post-deploy: all baselines re-run and compared.

### Workstream C — Tracker pulse scaling

- [ ] Per-poll cost measured on production-shaped data (`EXPLAIN` of the exact aggregate — absorbed file, Verify First item 1).
- [x] Decision recorded: Option A (index, recommended) vs Option B (`entriesVersion` counter). _(Option A — no query change, no counter column, no 14 write sites to touch)_
- [x] **Option A:** `time_entries_ws_member_updated_idx` landed via Workstream A; misleading cost note at `pulse.server.ts:11-16` corrected. _(index is in `schema.ts` + the generated migration, so not yet applied to any database; the comment is corrected in code)_
- [ ] **Option B (only if A proves insufficient):** counter column on `workspace_members`, all 14 write sites covered (including the two bulk multi-member operations), backfill in the same migration, `TrackerPulse`/`isSameTrackerPulse` extended.
- [ ] Post-deploy: pulse `idx_scan > 0` and re-measured `Execution Time` vs baseline recorded.

### Workstream D — Import pipeline batching

- [ ] Reachability settled and recorded: both `streaming-import.server.ts` (live via `SyncSheetDialog`) and `catalog-sync.server.ts` are reachable — the "delete it" option is falsified (already verified; see absorbed file §2).
- [ ] Consolidate-vs-port decision recorded **before** writing code (Open Question in absorbed file §13).
- [ ] Write phase converted to collect-then-batch for Clients, Projects, Tags, Departments.
- [ ] Archive loops replaced with one bounded `UPDATE ... WHERE id IN (...)` per entity; O(n²) `Array.find` lookups replaced with a prebuilt `Map`.
- [ ] Sheets write-back collapsed to one `values.batchUpdate` per entity; progress `emit` events preserved from resolved arrays.
- [ ] Duplicate `runInBatches` consolidated onto `src/lib/server/shared/import-utils.server.ts`.
- [ ] End-to-end import of a large sheet completes inside the 30 s budget.

### Workstream E — One open entry per member

- [ ] Duplicate open entries counted in production (this **blocks** the migration — the index cannot be created while duplicates exist) and triaged.
- [ ] Pre-migration cleanup runbook executed with human review (absorbed file §7.3).
- [ ] Partial unique index on open entries per `(workspace_id, workspace_member_id)` generated and applied.
- [ ] `startTimer` rewritten to insert-and-handle-conflict, mapping the violation to `'Stop your current timer before starting a new one.'`
- [ ] Two-tab concurrent-start regression test added.
- [ ] `updateActiveTimerSchema.startedAt` lower bound (decision recorded). The **upper bound** — rejecting a future start beyond a 60 s clock-skew tolerance — landed with `server-hygiene` at commit `b2b9786` (`CLOCK_SKEW_TOLERANCE_MS`, `schemas.ts:60-76`); only the lower clamp remains open. The absorbed file's Status predates that commit and claims more than what was true then — its "already landed" note is now accurate for the upper bound only.

## 1. Workstream A — Missing Indexes

**Goal.** Add the indexes the application's actual query shapes need but that neither `schema.ts` nor `drizzle/` declares, and reclaim a trigram index that migration 0005 dropped while its motivating queries still exist.

**The fixes** (full rationale per index in absorbed file §6):

- `sessions_user_id_idx` — `sessions` is unindexed on `user_id` while `accounts` has the equivalent; every sign-out-everywhere, password-reset purge, and cascading user delete sequentially scans what is normally the largest table in a Better Auth deployment.
- `project_tasks_workspace_name_idx` on `(workspace_id, name)` — the same fix `projects` got in migration 0004, for the identical `WHERE workspace_id = ? AND archived = false ORDER BY name` shape.
- `time_entries_ws_member_updated_idx` on `(workspace_id, workspace_member_id, updated_at)` — makes the pulse's `max(updated_at)` satisfiable by a backward index scan (feeds Workstream C).
- `time_entries_workspace_updated_idx` on `(workspace_id, updated_at)` — the workspace-scoped incremental-sync `updatedFilter`, not covered by the member-scoped variant.
- `time_entries_workspace_project_idx` on `(workspace_id, project_id)` — the catalog-stats filter; the existing single-column index only serves it with a heap re-check.
- Trigram rebuilds — `projects_name_trgm_idx` was created in migration 0004 and dropped in 0005, but every leading-wildcard `ILIKE '%term%'` it served still exists (six confirmed call sites in the absorbed file) and `pg_trgm` is still installed. Contingent on the Open Question (write cost vs search speed) in the absorbed file.
- Correct the false comment at `schema.ts:872-877` claiming a trigram index is unnecessary — that claim is what got the index dropped.

**Already excluded by the original (stay excluded):** no query rewriting here (that's Workstream B); no `pulse.server.ts` query change (Workstream C); no partial unique index for `startTimer` (Workstream E); keep `time_entries_project_id_idx` until `idx_scan` proves it dead; no server-setting tuning; no sessions retention job.

## 2. Workstream B — Bound Unbounded Query Result Sets

**Goal.** Stop four query classes from growing without bound as workspaces accumulate history — **without changing any reported number**.

- **WS-B1, the hard failure.** Two call sites (`gsheets/sync.server.ts:116-121`, `bulk-report.server.ts:399-410`) build `inArray` lists from unbounded fetches. Beyond 65,535 parameters PostgreSQL rejects the statement — a latent failure that fires precisely when a customer succeeds. Replace with a join against the parent predicate (preferred) or chunk at ~1,000; add a date bound to the sync fetch so the payload is bounded independently.
- **WS-B2, catalog stats.** `fetchClientStats` / `fetchProjectStats` / `fetchTagStats` re-aggregate the workspace's entire `time_entries` history on every pagination click. Add a default 12-month window, surface it in the UI, and source lifetime totals from `analytics_daily_member_metrics` only after verifying that rollup table is populated **and current**. _(Narrowed 2026-09-18: the daily-totals aggregate this workstream once covered was removed when overnight day-splitting landed — see `quick-fix/export-time-separation`, code-verified done — so the `AT TIME ZONE` GROUP-BY question now applies only to the remaining project/tag/department aggregates.)_
- **WS-B3, JS reduction → SQL.** Six sites select every matching row over the wire and reduce in JavaScript where `GROUP BY` suffices. Convert the pure-aggregate portions; **keep** bounded row fetches where interval merging is genuinely required (`summarizeWorkIntervals` produces tracked-vs-actual and overlap figures that are not expressible in SQL); narrow `performance.server.ts`'s one-year lookback to the 30-day window it actually uses; cap the user-selectable report range in the input schema.
- **WS-B4, bootstrap payloads.** `state.server.ts` / `state-lite.server.ts` fetch every catalog row with bare `select()` on every app page load. Move to explicit column lists (zero behavioural risk) and add caps or drive pickers from server-side search.

**Non-negotiable invariant.** Every change is number-preserving for the same inputs. If a rewrite would alter a total, it does not ship. The absorbed file's §10 "number-preservation check" is the gate.

## 3. Workstream C — Tracker Pulse Query Scaling

**Goal.** Make the cross-device change-detection pulse cheap and stable instead of degrading linearly and permanently. This is the app's most frequently executed server query (2 calls/minute/session) and it currently forces a full read of everything a member has ever recorded because no index contains `updated_at`.

- **Option A (recommended):** no query change — the Workstream A index `time_entries_ws_member_updated_idx` makes `max()` O(1), and correcting the misleading cost note at `pulse.server.ts:11-16` (which falsely asserts the query is cheap and is the reason nobody revisited it) is the only code edit. The decision hinges on the measured per-poll cost from Verify First; without production access, Option A is the safer default.
- **Option B (contingent):** a maintained `entriesVersion` counter on `workspace_members` bumped by all 14 `time_entries` write sites — including two bulk multi-member operations — with backfill in the same migration. Larger blast radius than it looks; only if Option A's measured cost is unacceptable.
- **Explicitly rejected shortcuts:** a date bound on the aggregate (breaks hard-delete detection), approximate counts, poll-interval changes, cross-tab leader election, SSE/WebSocket replacement. Rationale in the absorbed file §4.

## 4. Workstream D — Import Pipeline Performance

**Goal.** Make the catalog import finish inside the platform's 30 s limit. `src/lib/server/tracker/streaming-import.server.ts` issues one DB round trip (and later one Sheets round trip) **per row** in sequential loops — a 2,000-row import is 60–120 s of pure latency, gets killed mid-loop, and the UI reports success because the client's reader treats the killed stream as `done`.

- Convert the write phase to collect-then-batch for all four entities, porting the pattern that already exists and works in `gsheets/catalog-sync.server.ts` — not inventing a new one.
- Collapse archive loops to one bounded `UPDATE ... WHERE workspace_id = ? AND id IN (...)` per entity; build the lookup `Map` once instead of `Array.find` per iteration.
- Collapse Sheets write-back to one `values.batchUpdate` per entity; preserve the progress `emit` events from resolved arrays.
- Consolidate the duplicated `runInBatches` onto the shared helper.

**Interactions (not absorbed — coordinate, don't merge):** the CSRF bypass at `streaming-import.server.ts:91` is `import-stream-csrf-bypass`; `getRowIndexForRecord`'s swallowed errors are `gsheets-write-integrity`; the unawaited `void exportProject(...)` fan-out is `server-write-reliability` Part A — converge on the same batching technique and note it in the PR; the `pending_gsheets_syncs` cron is `fix-gsheets-cron-http-method` — note: that plan's folder was removed in the 2026-09-18 batch cleanup and the fix was **not** part of commit `b2b9786`; re-verify the handler's method before treating it as done. Do **not** add indexes speculatively for these predicates — none was identified as missing. The SSE backpressure gap (`controller.enqueue()` without `desiredSize` checks) is a real but separate finding with no owning plan yet.

## 5. Workstream E — Prevent Duplicate Active Timers

**Goal.** Make "at most one open time entry per workspace member" a database-enforced invariant. `startTimer` reads-then-inserts, so two concurrent requests can both pass the read; the client state machine cannot cover two browser tabs, the Chrome extension, or offline-queue replay.

- The migration is **blocked by existing data**: the partial unique index cannot be created while duplicate open entries exist, so counting and cleaning them (operator runbook with human review, absorbed file §7.3) is the first task, not an afterthought.
- Rewrite `startTimer` to insert and map the unique violation to the existing user-facing message; keep the pre-check only if it earns its place as a fast path (implementation choice, absorbed file §7.2).
- Add the two-tab concurrent-start regression test.
- Bound `updateActiveTimerSchema.startedAt` with the clamp symmetric to `startTimer`/`stopTimer` — see the Status note above: the "already landed" claim in the absorbed file is stale; current code has no bound.

**Explicitly avoided:** no `db.transaction()` anywhere (neon-http cannot support it — see `fix-neon-http-transaction-failure` for that defect in the billing layer); no auto-stop of abandoned timers (product/payroll decision); no client state-machine changes; no BroadcastChannel mutex.

## 6. Shared Verify First (production database access required)

Several checks across all five workstreams need production access and should run in **one session** before any code is written:

1. **Size every affected table** (`pg_stat_user_tables`): `time_entries`, `sessions`, `workspaces`, `workspace_members`, `projects`, `clients`, `tags`, `project_tasks`, `departments`. This frames whether Workstreams A and B are urgent or merely prudent, and gates every `CREATE INDEX` cost/benefit call.
2. **Count duplicate open entries** (Workstream E blocker — absorbed file §Verify First).
3. **Inventory existing indexes** from `pg_indexes` and diff against `schema.ts` (Workstream A — "missing" must be proven, not assumed).
4. **`EXPLAIN (ANALYZE, BUFFERS)` baselines**: the pulse aggregate, the project_tasks ordering query, the leading-wildcard ILIKE, the catalog-stats aggregate, a per-member range select, a bootstrap catalogue query, and the two `inArray` sites.
5. **Confirm `analytics_daily_member_metrics` is populated and current** before it is proposed as a totals source (WS-B2).
6. **Check whether any customer import has already been truncated** by the 30 s kill (Workstream D — absorbed file Verify First §4).

Full SQL for every item is in the absorbed files. Without production access, the honest framing is "real scaling cliffs, unverified severity" — not "slow today."

## 7. Related Plans (intentionally not absorbed)

| Plan                                | Why it stays separate                                                                                                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server-write-reliability`          | Part B covers redundant round-trip removal (overlapping files, different concern: write efficiency under serverless execution); Part A covers unawaited background writes.         |
| `fix-neon-http-transaction-failure` | Billing correctness/incident track. Both `db.transaction` call sites throw on the neon-http driver; end-to-end verification needs the Xendit sandbox. Never fold into a perf plan. |
| `gsheets-write-integrity`           | Write _integrity_ (swallowed read errors → duplicate rows), not performance. Shares files with Workstream D.                                                                       |
| `import-stream-csrf-bypass`         | Security. Touches the same stream route as Workstream D.                                                                                                                           |
| `fix-gsheets-cron-http-method`      | Ops fix (POST-only handler vs Vercel cron GET). **Folder removed 2026-09-18 in the batch cleanup; the fix was not in `b2b9786` — treat as open until re-verified.**                |
| `time-recording-performance`        | Render/client track under a no-database constraint; its coordination notes defer the pulse index and the unique-index migration to this plan.                                      |
| `quick-fix/server-hygiene`          | Hardening bundle — **landed** at commit `b2b9786`; it delivered Workstream E's upper `startedAt` bound (60 s clock-skew tolerance). The folder was removed in the same cleanup.    |

## 8. Shared Validation

> **Environment note:** `pnpm <script>` fails in this sandbox with an `EPERM` error writing to `~/Library/pnpm`. Use the direct binaries.

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> **Known pre-existing failure:** `src/lib/time-tracker/payroll-periods.test.ts` fails because it asserts a `closed: false` period for `2026-09` without injecting `now`, and the wall clock has passed 2026-09-15. Date-dependent and pre-existing — re-verified 2026-09-18. Treat the suite as green when this is the only failure.

Workstream-specific gates on top of the shared ones:

- **A:** migration reviewed by hand (never applied blind), applied to a non-production branch first, `db:push` reports "No schema changes", post-deploy `idx_scan > 0` on every new index.
- **B:** the number-preservation check (absorbed file §10) — no reported total changes.
- **C:** measured per-poll `Execution Time` before/after recorded in the PR.
- **D:** end-to-end import of a large sheet inside the 30 s budget; truncated-import check on production data.
- **E:** two-tab concurrent-start test; rollback path rehearsed (absorbed file §12) before the migration touches production.
