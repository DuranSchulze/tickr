# Tracker Pulse Query Scaling

> **Status:** 📋 Planned

## Status

- [ ] Verify First block executed; per-poll cost measured on production-shaped data.
- [ ] Decision recorded between Option A (composite index) and Option B (`entriesVersion` counter).
- [ ] Index from Option A landed (see plan `add-missing-database-indexes`) **or** counter machinery from Option B implemented.
- [ ] Misleading "cost note" comment at `pulse.server.ts:11-16` corrected to describe real behaviour.
- [ ] All 14 `time_entries` write sites enumerated and covered (required only if Option B is chosen).
- [ ] Validation commands in Section 10 all pass.
- [ ] Post-deploy: pulse `idx_scan > 0` and per-poll `Execution Time` recorded against the pre-change baseline.

## Verify First (No Code Change)

Run these **before choosing between Option A and Option B**. The decision hinges on measured cost, which cannot be determined by reading code. Items 1 and 3 need **production database access**; item 2 needs a browser. If you have neither, the honest position is that Option A is the safer default (see Section 13, Q1) rather than a claim that the current cost is unacceptable.

**1. Measure the aggregate the pulse actually runs today** — this is the single most important number in the plan:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT max(updated_at), count(*)
FROM time_entries
WHERE workspace_id = '<a real workspace id>'
  AND workspace_member_id = '<a real, long-tenured member id>';
```

Record `actual rows`, `Execution Time`, and the top plan node. Expected today: **no index scan can satisfy `max(updated_at)`** because `updated_at` appears in no index, so you will see either a full index scan over every entry for that member or a `Seq Scan`. The `actual rows` figure is effectively that member's lifetime entry count — that is the cost paid on every poll.

**2. Confirm the poll frequency and that it is truly per-open-tab:**

```bash
grep -n "PULSE_POLL_INTERVAL_MS" src/components/time-tracker/TaskSyncCoordinator.tsx
grep -n "pollPulse\|isTaskDataRoute\|isReady" src/components/time-tracker/TaskSyncCoordinator.tsx | head -20
```

Expected: `PULSE_POLL_INTERVAL_MS = 30_000` (line 54) and a `pollPulse` that early-returns unless the route is a task-data route, the document is visible, and the client is online. **Verify the guards actually gate the network call** — if they do, the cost is 2 polls/min only while a user has a task route open and visible, not 2/min for every session. This matters for sizing: if the guards work, the blast radius is "active users with the dashboard open", which is still the app's hot path but is far smaller than "every logged-in user".

**3. Verify the guards' claim that a hidden tab costs nothing:**

```bash
sed -n '150,215p' src/components/time-tracker/TaskSyncCoordinator.tsx
```

Purpose: confirm `pollPulse` returns before the DB call when `isReady()` is false, and that `setInterval` keeps firing regardless (it does — the _work_ is skipped, which is the design). If a hidden tab still reaches the server, the cost multiplies by every backgrounded tab and Option B becomes far more attractive.

**4. Confirm that no index already covers `updated_at`** (falsifies the premise if it does):

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'time_entries';
```

Expected: no index definition contains `updated_at`. Compare against the index list documented in plan `add-missing-database-indexes` §2. **If an index already includes `updated_at`, this plan's Option A is already satisfied and only the comment fix remains.**

**5. Confirm `entryCount` genuinely cannot be dropped** — the plan's two options differ precisely on this:

```bash
sed -n '20,52p' src/lib/time-tracker/tracker-pulse.ts
```

Expected: the field is documented as _"entryCount — catches hard deletes, which leave no row to stamp"_ and `isSameTrackerPulse` (lines 45-51) compares all four fields including `entryCount`. Because a hard delete leaves no surviving row, `max(updated_at)` alone cannot detect it — this is why the aggregate exists and why "just delete `count(*)`" is not a valid fix. Confirm no other consumer reads `entryCount` before considering any change to it:

```bash
grep -rn "entryCount" src/ --include=*.ts --include=*.tsx
```

**6. Confirm the "cost note" comment is wrong** (the plan asserts this, so verify it):

```bash
sed -n '1,20p' src/lib/server/tracker/pulse.server.ts
```

Expected: lines 11-16 claim _"two member-scoped aggregate queries per poll (index prefix workspace_id + workspace_member_id) … still roughly an order of magnitude cheaper than polling getTrackerState"_. The first half is misleading: `(workspace_id, workspace_member_id)` is only a **prefix** of the existing indexes, which bounds the _scan range_ to one member but does **not** make `max(updated_at)` cheap — the planner must still read every entry in that range because `updated_at` is not in the index order. Verify by reading the `schema.ts` index declarations for `time_entries`.

**7. Enumerate every `time_entries` write site** — required only if Option B is chosen, but cheap to run now and it determines Option B's risk:

```bash
grep -rn "insert(timeEntries)\|update(timeEntries)\|delete(timeEntries)" src/ scripts/ --include=*.ts
```

Expected today: **14 sites across 5 files** (see Section 7.2 for the enumeration). Confirm the count before committing to Option B — if it were 2 or 3 sites, the counter approach would be low-risk; at 14 including two bulk multi-member operations, it is not.

**8. Measure the two bulk operations that make Option B hardest:**

```bash
sed -n '118,132p' src/lib/server/tracker/workspace-settings.server.ts
sed -n '446,456p' src/lib/server/tracker/manual-entries.server.ts
```

Purpose: the first is a **workspace-wide** location purge that sets `updatedAt: new Date()` on every entry in the workspace; the second deletes entries across `inArray(workspaceMemberId, visibleMemberIds)` — potentially several members in one statement. Any per-member counter must bump for **every affected member**, not just the actor. Confirm both shapes before judging Option B's implementability.

**9. Establish the realistic worst case for sizing:**

```sql
-- How many entries does the busiest member have?
SELECT workspace_member_id, count(*) AS entries
FROM time_entries
GROUP BY workspace_member_id
ORDER BY entries DESC
LIMIT 10;
```

```sql
-- Roughly how many members are active, to estimate aggregate load?
SELECT count(DISTINCT workspace_member_id) FROM time_entries;
```

Purpose: items 1 and 9 together give the defensible cost statement. Without them the plan can only say "this grows linearly" — which is true but not a number.

**What you cannot verify without extra access:** production row counts and live `Execution Time` (items 1, 9) require database credentials; item 2/3 requires observing browser behaviour with network tooling. **If you have no database access, do not claim the current implementation is a problem** — state that the index is unambiguously correct (it cannot hurt: `max()` becomes a backward index scan) and that the counter upgrade is deferred pending measurement.

---

## 1. Goal

Make the cross-device change-detection "pulse" cheap and stable as a workspace's history grows, instead of degrading linearly and permanently.

- **The problem:** `pulse.server.ts` runs `max(updated_at)` and `count(*)` over one member's entries with **no date bound**. Because no index contains `updated_at`, the planner cannot satisfy `max()` with a backward index scan — it must read every entry that member has ever recorded. `TaskSyncCoordinator.tsx:54` polls this every 30 seconds per open, visible, online tab. The file's own cost note (lines 11-16) asserts this is cheap; it is not, and it gets worse every day the product is used.
- **The secondary problem:** that cost note is load-bearing documentation. It is the reason nobody has revisited this query. Correcting it is part of the fix, because the next person to look at this file will otherwise reach the same wrong conclusion.
- **The deliverable:** either the index that makes `max()` O(1) (Option A), or a maintained per-member version counter that makes the whole pulse O(1) (Option B). This plan covers both, recommends one, and states plainly what each does and does not buy.

Who benefits: every user with the tracker open. This is the app's most frequently executed server query by a wide margin — 2 calls/minute/session, against a query whose cost grows without bound.

## 2. Context Summary

### The query under discussion

`src/lib/server/tracker/pulse.server.ts:26-49`:

```ts
export async function getTrackerPulse(): Promise<TrackerPulse> {
  const access = await requireWorkspaceAccess()
  const workspaceId = access.workspace.id
  const memberId = access.member.id

  const memberEntries = and(
    eq(timeEntries.workspaceId, workspaceId),
    eq(timeEntries.workspaceMemberId, memberId),
  )

  const [[activeRow], [aggregateRow]] = await Promise.all([
    db
      .select({ id: timeEntries.id, updatedAt: timeEntries.updatedAt })
      .from(timeEntries)
      .where(and(memberEntries, isNull(timeEntries.endedAt)))
      .limit(1),
    db
      .select({
        latestEntryUpdatedAt: sql<Date | null>`max(${timeEntries.updatedAt})`,
        entryCount: sql<number>`count(*)::int`,
      })
      .from(timeEntries)
      .where(memberEntries),
  ])

  const latest = aggregateRow?.latestEntryUpdatedAt

  return {
    activeEntryId: activeRow?.id ?? null,
    activeEntryUpdatedAt: activeRow?.updatedAt?.toISOString() ?? null,
    latestEntryUpdatedAt: latest ? new Date(latest).toISOString() : null,
    entryCount: aggregateRow?.entryCount ?? 0,
  }
}
```

Note there are **two** queries in the wave, and only the second is the problem:

| Query                          | Predicate                                                                   | Index situation                                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeRow` (running entry)    | `workspace_id = ? AND workspace_member_id = ? AND ended_at IS NULL LIMIT 1` | ✅ **Fine.** `time_entries_workspace_member_ended_idx (workspace_id, workspace_member_id, ended_at)` serves this exactly, and `LIMIT 1` stops early.                          |
| `aggregateRow` (`max`/`count`) | `workspace_id = ? AND workspace_member_id = ?`                              | ❌ **Unindexed for its purpose.** `(workspace_id, workspace_member_id)` is only a _prefix_ of existing indexes, which bounds the range but gives no ordering on `updated_at`. |

The distinction matters: the prefix does reduce the scan to one member's rows. It does **not** make `max(updated_at)` O(1). Only an index with `updated_at` in its ordered columns allows the planner to walk backward and stop at the first tuple.

### Why `count(*)` cannot simply be removed

`src/lib/time-tracker/tracker-pulse.ts:20-31` documents each field, and the reasoning is sound:

```
//   latestEntryUpdatedAt — max(updated_at) over the member's entries.
//     Covers manual entries, edits, and deletes that keep the count equal.
//   entryCount — catches hard deletes, which leave no row to stamp.
```

`isSameTrackerPulse` (lines 45-51) compares all four fields, `entryCount` included. A hard `DELETE` leaves no surviving row to carry an updated stamp, so without the count a deletion performed on one device would never be noticed on another. Verify First item 5 confirms this and checks for other consumers. **Any solution must preserve hard-delete detection** — that constraint is what rules out the tempting "just drop the aggregate" shortcut and is why this is a design question rather than a one-line fix.

### The polling caller and its guards

`src/components/time-tracker/TaskSyncCoordinator.tsx:54`:

```ts
const PULSE_POLL_INTERVAL_MS = 30_000
```

`pollPulse` (lines 160-183) is guarded — it returns early unless the route is a task-data route, the document is visible, and the client is online. This is well-built: a hidden tab skips the _work_ while the interval keeps firing. Verify First items 2 and 3 confirm the guards, because they determine whether the load is "every open dashboard" or "every logged-in user", which changes the sizing argument considerably.

The pulse is one of three sync legs the app uses, and `tracker-pulse.ts:4-18` documents the whole design. Leg 3 (this pulse) is the only one that reaches a page sitting open and idle on **another device** — `BroadcastChannel` is same-browser, and DOM activation events never fire on an untouched tab. So the pulse cannot simply be removed; its _cost_, not its existence, is the problem.

### The comment that must be corrected

`pulse.server.ts:11-16`:

```
// Cost note: two member-scoped aggregate queries per poll (index prefix
// workspace_id + workspace_member_id), served in one parallel wave as
// everywhere else on the Neon HTTP driver. Session/workspace resolution in
// requireWorkspaceAccess dominates the cost — still roughly an order of
// magnitude cheaper than polling getTrackerState, which ships the whole
// 62-day entry window.
```

Two claims are wrong or misleading:

1. _"index prefix workspace_id + workspace_member_id"_ — implies the aggregate is index-served. It bounds the range but does not order by `updated_at`, so `max()` reads every entry in that range. The prefix makes it **O(entries for this member)**, not O(1).
2. _"Session/workspace resolution in `requireWorkspaceAccess` dominates the cost"_ — true only while a member has few entries. Because the aggregate scales with history, this inverts as the product ages, and the comment becomes exactly backwards. (`requireWorkspaceAccess` is genuinely well-optimised — it is request-cached via a `WeakMap` on the `Request` — which is why the inversion is easy to miss.)

Leaving this comment in place is how the problem survived this long. Fix it in the same change.

### Assumptions and missing information

| Assumption                                                             | Default if unverified                                                                                          | How to resolve          |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------- |
| The aggregate's cost is material today                                 | **Do not assume it is.** Option A is still correct (an index cannot hurt) but the urgency claim needs a number | Verify First items 1, 9 |
| Poll guards mean only visible, online, task-route tabs pay             | Assume yes (the code reads that way)                                                                           | Verify First items 2, 3 |
| `entryCount` has no consumer beyond `isSameTrackerPulse`               | Assume the comparison is the only consumer                                                                     | Verify First item 5     |
| The number of `time_entries` write sites is 14 across 5 files          | Confirm before choosing Option B                                                                               | Verify First item 7     |
| Entry volume per member is in the thousands, not hundreds of thousands | 20 entries/day × 250 working days ≈ 5,000/year per active member                                               | Verify First item 9     |

## 3. Scope

### `[CHECK]` — verification only, no code change

- `[CHECK]` Measure `EXPLAIN (ANALYZE, BUFFERS)` for the exact aggregate the pulse runs, and record `actual rows` and `Execution Time` as the pre-change baseline (Verify First item 1).
- `[CHECK]` Confirm the poll interval, the visibility/online/route guards, and therefore whether hidden tabs truly skip the server call (Verify First items 2, 3).
- `[CHECK]` Confirm no existing index already covers `updated_at`, which would make Option A already satisfied (Verify First item 4).
- `[CHECK]` Confirm `entryCount` is required for hard-delete detection and has no other consumer (Verify First item 5).
- `[CHECK]` Read the `pulse.server.ts` cost note and confirm the specific claims that are wrong (Verify First item 6).
- `[CHECK]` Enumerate all `time_entries` write sites to size Option B's blast radius (Verify First item 7).
- `[CHECK]` Inspect the two bulk multi-member write operations to judge whether Option B can handle them correctly (Verify First item 8).
- `[CHECK]` Capture the busiest member's entry count and the number of distinct members, to produce a defensible cost statement (Verify First item 9).
- `[CHECK]` After deploy: confirm the new index records `idx_scan > 0` and re-measure `Execution Time` against the baseline.

### `[FIX]` — code changes

**Option A path (recommended primary):**

- `[FIX]` Add `time_entries_ws_member_updated_idx` on `(workspace_id, workspace_member_id, updated_at)` via migration — **the DDL itself belongs to plan `add-missing-database-indexes`**; this plan depends on it and does not duplicate it.
- `[FIX]` Correct the "cost note" comment at `pulse.server.ts:11-16` to describe the real cost and the real reason the index exists.

**Option B path (contingent on Open Question 1, and only if Option A proves insufficient):**

- `[FIX]` Add an `entriesVersion` (or equivalent monotonic counter) column to `workspace_members`, bumped by every `time_entries` mutation.
- `[FIX]` Bump the counter at all 14 write sites, including the two bulk operations that span multiple members.
- `[FIX]` Replace the `max(updated_at)` + `count(*)` aggregate in `getTrackerPulse` with a single indexed read of the counter.
- `[FIX]` Extend `TrackerPulse` and `isSameTrackerPulse` if the counter replaces a field, keeping hard-delete detection intact.
- `[FIX]` Backfill the counter in the migration so existing members have a correct initial value.

## 4. Out of Scope

- **The index DDL itself.** `time_entries_ws_member_updated_idx` is declared, generated, and applied by plan `add-missing-database-indexes`. This plan consumes it. Duplicating the migration here would create two competing definitions of the same index.
- **Removing the pulse or changing its semantics.** Leg 3 is the only mechanism that syncs an untouched tab on another device (`tracker-pulse.ts:4-18`). Replacing polling with SSE/WebSockets is a different architecture and a much larger project.
- **Changing the poll interval.** 30s is documented as matching the app's established rhythm (timesheet/activity screens poll at the same cadence). Adjusting it is a product decision about freshness, not a scaling fix — and it would trade correctness for cost.
- **Adding a date bound to the pulse aggregate.** Tempting, but it would break hard-delete detection for older entries (a delete outside the window would leave both `max(updated_at)` and `count(*)` unchanged). Listed here explicitly so it is not attempted as a shortcut.
- **Reducing the number of polls** by de-duplicating across tabs (e.g. leader election via `BroadcastChannel`).
- **`requireWorkspaceAccess` optimisation.** It is already request-cached and the audit found it clean.
- **The other unbounded aggregates** (`analytics`, `reports`, `leaderboard`, catalog stats). Those are plan `bound-unbounded-query-result-sets`; this plan is scoped to the pulse because it is the only one polled at high frequency.
- **`count(*)` tuning such as approximate counts via `pg_class.reltuples`.** Would break hard-delete detection the same way a date bound would.

## 5. Affected Files and Folders

```txt
Tickr/
├── src/
│   ├── lib/
│   │   ├── server/
│   │   │   └── tracker/
│   │   │       └── pulse.server.ts                 (MODIFY)
│   │   │             - Correct the misleading "cost note" comment
│   │   │               at L11-16 to state the real cost and reference
│   │   │               the index that fixes it.
│   │   │             - Option A: NO query change. The index alone
│   │   │               changes the plan; the SQL is already optimal.
│   │   │             - Option B only: replace the max()/count(*) aggregate
│   │   │               (L42-49) with a single indexed read of the new
│   │   │               counter, keeping the activeRow query (L37-41) as-is.
│   │   │
│   │   └── time-tracker/
│   │       └── tracker-pulse.ts                    (MODIFY — Option B only)
│   │             - Option A: NO change. Field set and comparison stay.
│   │             - Option B only: add/replace a field on TrackerPulse and
│   │               update isSameTrackerPulse (L45-51) accordingly, keeping
│   │               hard-delete detection semantics documented at L26.
│   │
│   └── db/
│       └── schema.ts                               (MODIFY — Option B only)
│             - Option A: NO change (the index is declared by plan
│               add-missing-database-indexes).
│             - Option B only: add an entriesVersion column to
│               workspace_members.
│
├── src/lib/server/tracker/                         (MODIFY — Option B only)
│   ├── timer.server.ts                             (4 write sites)
│   ├── manual-entries.server.ts                     (6 write sites)
│   ├── location-history.server.ts                   (2 write sites)
│   └── workspace-settings.server.ts                 (1 bulk write site)
│
├── drizzle/
│   └── 00NN_<generated>.sql                        (NEW — Option B only)
│         - Adds the entriesVersion column + backfill.
│         - Option A needs NO migration here; the index migration is owned
│           by plan add-missing-database-indexes.
│
└── plans/
    └── tracker-pulse-query-scaling/
        └── PLAN.md                                 (NEW)
```

**Phase 1 (Option A) touches exactly one file: `pulse.server.ts`, comment only.** That is the whole reason it is the recommended path.

## 6. Database Design

### 6.1 Option A — no schema change in this plan

The required index is:

```sql
CREATE INDEX "time_entries_ws_member_updated_idx"
  ON "time_entries" USING btree ("workspace_id","workspace_member_id","updated_at");
```

It is declared in `schema.ts` and generated into a migration by plan `add-missing-database-indexes`. **This plan does not re-declare it.** The reason it fixes `max(updated_at)` is that `updated_at` is the third ordered column, so PostgreSQL can walk the index backward, read the first tuple, and stop — O(1) instead of O(entries).

**What Option A does not fix:** `count(*)` still visits every index entry for that member, even as an index-only scan. This is much cheaper than a heap scan but is still O(entries). Verified honestly: Option A is a **large** win, not a complete one. See Open Question 1 for whether that is sufficient.

### 6.2 Option B — an `entriesVersion` counter on `workspace_members`

Only if Open Question 1 resolves to "Option A is not enough".

`schema.ts`, `workspaceMembers` table — add one column:

```ts
    // Monotonic counter bumped by every time_entries mutation for this member.
    // Lets the cross-device pulse detect any change (including hard deletes,
    // which leave no row to stamp) with one indexed read instead of an
    // unbounded max(updated_at) + count(*) aggregate.
    entriesVersion: integer('entries_version').notNull().default(0),
```

SQL:

```sql
ALTER TABLE "workspace_members"
  ADD COLUMN "entries_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
```

**Backfill in the same migration** so existing rows are correct rather than defaulting to a meaningless zero. A per-member checksum derived from real data is needed, because a constant default would make every member look unchanged until their next write:

```sql
-- Illustrative shape. The value only needs to be a stable, change-sensitive
-- stamp per member — not a true count. Combine max(updated_at) with count(*)
-- so it changes on both edits and hard deletes.
UPDATE "workspace_members" wm
SET "entries_version" = COALESCE(sub.stamp, 0)
FROM (
  SELECT workspace_member_id,
         (COALESCE(EXTRACT(EPOCH FROM max(updated_at)), 0)::bigint * 1000000
          + count(*))::int AS stamp
  FROM "time_entries"
  GROUP BY workspace_member_id
) AS sub
WHERE wm.id = sub.workspace_member_id;
```

The exact stamp formula is an implementation choice; what matters is that (a) it changes on insert, update, and delete, and (b) it is stored per member so the pulse reads one row. Note the `::int` cast — a bigint epoch-microseconds value will overflow `integer`; the implementer must either widen the column type (`bigint`/`numeric`) or use a cheaper formula such as `count(*)` combined with a `max(updated_at)` timestamp column. **This is flagged as Open Question 3** and must be settled before writing the migration.

### 6.3 Seed data

**N/A for Option A** (no new columns). For Option B, the backfill above is the only data work; no application seed changes are needed because `drizzle`'s `.default(0)` covers new rows created after the migration.

## 7. Backend Implementation

### 7.1 Option A — the recommended change is a comment

No query modification is required. The existing SQL in `pulse.server.ts:36-49` is already the right shape; it is the _plan_ that changes once the index exists. The only code edit is the misleading cost note.

Replace `pulse.server.ts:11-16` with something that will not mislead the next reader — for example:

> Cost note: the aggregate query below runs `max(updated_at)` + `count(*)` over every entry this member has ever recorded. Both are served by `time_entries_ws_member_updated_idx (workspace_id, workspace_member_id, updated_at)`: `max()` becomes a backward index scan that stops at the first tuple, and `count(*)` becomes an index-only scan. Without that index `max()` must read every entry for the member, and the cost grows linearly with history — which is why the index is not optional. `requireWorkspaceAccess` is request-cached, so it is not the dominant cost once a member has meaningful history.

### 7.2 Option B — the counter, and why its blast radius is larger than it looks

The pulse becomes a single indexed read, e.g. selecting `entriesVersion` from `workspace_members` by id. `max(updated_at)` and `count(*)` both disappear, and the active-entry query stays unchanged.

The cost is in keeping the counter true. All 14 `time_entries` write sites must bump it:

| File                                                  | Sites                                                           | Notes                                                                                                                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/tracker/timer.server.ts`              | L117 (insert), L188, L311, L363 (updates), L404 (insert)        | The hot path — `startTimer`, `updateActiveTimer`, `stopTimer`, `duplicateEntry`. Single-member per call.                                                                                           |
| `src/lib/server/tracker/manual-entries.server.ts`     | L103 (insert), L184, L276 (updates), L336, L380, L448 (deletes) | **L448 is a bulk delete** filtered by `inArray(workspaceMemberId, visibleMemberIds)` — spans multiple members.                                                                                     |
| `src/lib/server/tracker/location-history.server.ts`   | L100, L243 (updates)                                            | Location backfill/enrichment paths.                                                                                                                                                                |
| `src/lib/server/tracker/workspace-settings.server.ts` | L120                                                            | **Workspace-wide bulk update** — the owner-only location purge, which sets `updatedAt: new Date()` on potentially every entry in the workspace and therefore must bump **every** member's counter. |
| `scripts/backfill-time-entry-source.ts`               | (via script)                                                    | Any offline maintenance script that writes entries must bump too, or it silently desyncs the pulse.                                                                                                |

Two of these (`manual-entries.server.ts:448`, `workspace-settings.server.ts:120`) affect **multiple members in a single statement**, which means the bump cannot be a simple `+1` on the acting member. They must either update all affected members' counters or fall back to the aggregate for that rare case.

**The correctness risk is asymmetric and this is the crux of the recommendation.** If a bump is missed:

- The pulse returns unchanged for that member.
- Cross-device sync silently stops working for them — a **user-visible functional regression** with no error, no log, and no obvious causal link to the change.
- It surfaces only when someone notices their timer is stale on a second device, which is hard to attribute and easy to dismiss as a networking fluke.

Contrast Option A: if the index is wrong, the query is merely slow — the worst case is the status quo. **Option A fails safe; Option B fails silently.** That asymmetry, not raw performance, is why Option A is recommended as the primary path.

### 7.3 A middle path worth considering (Open Question 2)

If `count(*)`'s residual O(entries) cost proves material after Option A lands, the cheaper targeted change is to keep the aggregate but make hard-delete detection cheaper — for example a periodic (not per-write) reconciliation, or detecting deletes via a separate lightweight signal. This avoids touching 14 write sites while removing the unbounded scan. It is recorded as an option rather than specified, because it should only be considered with post-Option-A measurements in hand.

## 8. Frontend Implementation

**N/A.** No component, route, hook, style, or client-state change.

Specifically: `TaskSyncCoordinator.tsx`'s polling loop, its 30s interval, its visibility/online/route guards, and its `isSameTrackerPulse` comparison are all **unchanged** by this plan. Option A changes only the server's query plan. Option B changes what the server computes but not the `TrackerPulse` field _semantics_ visible to the client (assuming hard-delete detection is preserved) — so the coordinator's comparison logic continues to work. If Option B were to change the field set, `tracker-pulse.ts` would need a matching update, which is why that file is listed as `(MODIFY — Option B only)` in Section 5.

## 9. Access Control

**N/A.** No permission, role, endpoint, or tenant-scoping change.

The pulse is deliberately **self-scoped**: `getTrackerPulse` derives `workspaceId` and `memberId` from `requireWorkspaceAccess()` and exposes no parameter for either, so a caller cannot query another member's pulse. `tracker-pulse.ts:16-18` documents this as intentional (_"It is intentionally scoped to the CURRENT member … team screens that need cross-member liveness already run their own refetchInterval polling"_).

Both options preserve this exactly: Option A is an index and cannot affect scoping; Option B reads a counter keyed to the same member id already derived from the session. Neither introduces a new data path. Section 9 is included for template completeness.

## 10. Validation

> **Environment note:** `pnpm <script>` fails in this sandbox with `EPERM: operation not permitted, mkdir '~/Library/pnpm/.tools/...'`. Use the direct binaries below.

### Pre-change baseline (capture first — this plan's premise depends on it)

```bash
# Confirm the poll cadence and guards are as documented.
grep -n "PULSE_POLL_INTERVAL_MS" src/components/time-tracker/TaskSyncCoordinator.tsx
```

```sql
-- THE baseline number. Record actual rows + Execution Time in the PR.
EXPLAIN (ANALYZE, BUFFERS)
SELECT max(updated_at), count(*)
FROM time_entries
WHERE workspace_id = '<real id>' AND workspace_member_id = '<real id>';
```

### After Option A lands

```sql
-- Same query, same parameters. Expect:
--   * a backward Index Scan (or Index Only Scan) on
--     time_entries_ws_member_updated_idx for the max()
--   * Execution Time materially lower than the baseline
--   * "actual rows" no longer equal to the member's lifetime entry count
EXPLAIN (ANALYZE, BUFFERS)
SELECT max(updated_at), count(*)
FROM time_entries
WHERE workspace_id = '<real id>' AND workspace_member_id = '<real id>';
```

```sql
-- Confirm the index exists, is valid, and is being used.
SELECT indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE indexrelname = 'time_entries_ws_member_updated_idx';
```

Expected: `idx_scan > 0` after normal traffic (each poll increments it).

### After Option B lands (if chosen)

```sql
-- Hard-delete detection is the behaviour most likely to break. Verify it
-- explicitly: note the counter, delete one entry, confirm the counter moved.
SELECT id, entries_version FROM workspace_members WHERE id = '<real member id>';
-- Delete a test entry for that member (in a non-production environment).
SELECT id, entries_version FROM workspace_members WHERE id = '<real member id>';
-- Expect: entries_version differs between the two reads.
```

```sql
-- Verify the backfill populated real values, not just the default 0.
-- A large number of rows at exactly 0 after the migration means the backfill
-- did not run or did not match.
SELECT entries_version, count(*) FROM workspace_members GROUP BY 1 ORDER BY 2 DESC LIMIT 10;
```

```sql
-- Verify the two bulk paths bump every affected member, not just one.
-- Compare the count of members whose counter changed against the count of
-- members who own the affected entries.
```

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

> ⚠️ **Pre-existing failure warning.** `./node_modules/.bin/vitest run` currently reports **one** failure: the first test in `src/lib/time-tracker/payroll-periods.test.ts`, a date-dependent time bomb unrelated to this plan (see plan `fix-payroll-period-test-time-bomb`). Expect **374 passed, 1 failed** on a clean checkout. This plan does not affect it — do not attempt to fix it here.

### Manual smoke test (Option A branch, in a browser)

This is the acceptance test that the pulse still _works_, which matters more than it being fast:

1. Open the tracker dashboard on one device/browser and leave it visible.
2. Start a timer from a second device/browser on the same account.
3. Expect: within ~30 seconds the first device reflects the running timer without a manual refresh. This proves leg 3 still functions.
4. Stop the timer on the second device; expect the first device to follow within ~30 seconds.
5. **Hard-delete** an entry on the second device; expect the first device to drop it within ~30 seconds. This is the `entryCount` behaviour that must survive.
6. Background the first tab, repeat step 2, and confirm via server logs or network tooling that no pulse request fires while hidden (Verify First item 3's claim, confirmed in practice).

### Definition of done

- [ ] The `EXPLAIN` comparison shows the intended plan change and a lower `Execution Time`.
- [ ] `time_entries_ws_member_updated_idx` shows `idx_scan > 0` under normal traffic.
- [ ] Manual smoke test steps 3–6 all pass, **including hard-delete detection**.
- [ ] The `pulse.server.ts` cost note is corrected and reads accurately.
- [ ] `tsc`, `eslint`, `vite build` exit 0; the test suite shows only the known pre-existing payroll failure.

## 11. Sequencing

- [ ] **Phase 0 — Verify and decide (no code).** Run the entire Verify First block. Record the `EXPLAIN` baseline, confirm the poll guards, confirm `entryCount`'s role, and count the write sites. **Answer Open Question 1 here** — the answer determines whether Phases 2 and 3 exist at all. Exit criteria: a recorded baseline number and a chosen option.
- [ ] **Phase 1 — Land the index (depends on plan `add-missing-database-indexes`).** This is not work in _this_ plan; it is a dependency. Track it here so the ordering is explicit: the index must exist in production before the pulse benefits. If `add-missing-database-indexes` Phase 1 ships, this is satisfied.
- [ ] **Phase 2 — Correct the comment (ship independently, zero risk).** Fix `pulse.server.ts:11-16`. This can ship immediately and does not depend on the index being applied — an accurate comment is correct either way. It also prevents the next reader from repeating the mistake.
- [ ] **Phase 3 — Re-measure and decide on Option B.** Against production-shaped data, re-run the `EXPLAIN` from Section 10. If `count(*)`'s residual cost is acceptable, **stop here and close the plan** — Option A was sufficient. If not, proceed to Phase 4 with a measured justification rather than a theoretical one.
- [ ] **Phase 4 — Option B, only if Phase 3 demands it.** Add the counter column, backfill, update all 14 write sites including the two bulk multi-member paths, swap the pulse query, and run the hard-delete verification. Given the silent-failure risk described in §7.2, this phase should be its own PR with its own review, and should include a test that asserts the counter moves on insert, update, and delete.

Phases 2 is the recommended minimum shippable unit, and it is the only phase with no dependency and no risk. Phase 1 is a dependency on another plan, not work here.

## 12. Risks & Considerations

| Risk                                                                                                                                                                                                                                       | Likelihood                                                           | Impact                                                                                                          | Mitigation                                                                                                                                                                                                                                                                                                                     | Rollback                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Option A:** the index is added but the aggregate remains slower than expected, because `count(*)` still visits every index entry for the member.                                                                                         | High (this is the expected residual)                                 | Low–Medium — an improvement that falls short of "O(1)"                                                          | State this limitation upfront (§6.1) rather than promising O(1). Re-measure in Phase 3 and decide on Option B with data. `max()` — the expensive part — genuinely does become O(1).                                                                                                                                            | None needed; the index is beneficial on its own.                                                                                                                                                                                                                                                |
| **Option B:** a missed counter bump silently stops cross-device sync for an affected member.                                                                                                                                               | **Medium–High** — 14 write sites including 2 bulk multi-member paths | **High** — a user-visible functional regression with no error, no log, and no obvious causal link to the change | This single risk is why Option A is recommended. If Option B proceeds: enumerate all write sites (Verify First item 7), keep the counter update in the _same_ transaction or statement as the entry write, add a test asserting the counter moves on insert/update/delete, and run the hard-delete verification in Section 10. | **Database:** the `entries_version` column can stay (harmless) while the server reverts to the `max`/`count` aggregate — a code-only revert. Do **not** drop the column in a hurry; the aggregate query still works with it present. No data repair needed because the counter is derived data. |
| **Option B:** the backfill formula overflows `integer` or produces a stamp that does not change on hard delete.                                                                                                                            | Medium (the epoch-microseconds formula in §6.2 will overflow)        | Medium — the counter either errors or silently fails to detect deletes                                          | Settle the formula before writing the migration (Open Question 3). Widen the column to `bigint` if an epoch-based stamp is used, or combine `count(*)` with a separate `max(updated_at)` timestamp column so each part fits its type. Verify with the backfill-distribution query in Section 10.                               | Re-run a corrected backfill migration; the column is derived data and can be recomputed at any time.                                                                                                                                                                                            |
| **Option B:** the workspace-wide location purge (`workspace-settings.server.ts:120`) bumps no counters, so a purge performed on one device is invisible on another.                                                                        | Medium                                                               | Low–Medium — a rare owner-only operation with a delayed visual effect                                           | Handle both bulk paths explicitly (§7.2). Consider falling back to the aggregate for operations affecting more than one member, accepting the cost on that rare path rather than risking a missed bump.                                                                                                                        | Same as above — code revert with the column left in place.                                                                                                                                                                                                                                      |
| **Both:** reducing per-poll cost causes a real-time sync regression that is diagnosed as "the pulse is flaky" rather than traced to this change.                                                                                           | Medium                                                               | Medium — debugging time disproportionate to the change                                                          | The manual smoke test in Section 10 exercises all four change kinds (start, stop, edit, hard delete) across two devices. Run it before merging, not after.                                                                                                                                                                     | Revert the change; the previous behaviour is restored because the index (Option A) is additive and the comment is inert.                                                                                                                                                                        |
| The corrected comment is treated as documentation-only and the underlying issue is closed without a measurement.                                                                                                                           | Medium                                                               | Low — the problem simply recurs later                                                                           | Section 10 requires recording the before/after `Execution Time`. Phase 3 exists specifically to force a measurement pass.                                                                                                                                                                                                      | N/A — process risk.                                                                                                                                                                                                                                                                             |
| **This plan touches no money path and modifies no user data** (Option A). Option B adds a derived column that can be recomputed from `time_entries` at any time, so the worst-case rollback is a code revert plus an optional column drop. | —                                                                    | —                                                                                                               | Derived data, no destructive migration, no external service involved.                                                                                                                                                                                                                                                          | See the Option B rows — all rollbacks are code reverts; the column may remain indefinitely without harm.                                                                                                                                                                                        |

## 13. Open Questions

- [ ] **Q1 — Option A or Option B?** Option A is a one-line index (owned by plan `add-missing-database-indexes`) plus a comment fix, fails safe, and makes `max()` genuinely O(1) — but `count(*)` remains O(entries) as an index-only scan. Option B makes the whole read O(1) but requires bumping a counter at **14 write sites**, two of which span multiple members in one statement, and a missed bump fails **silently** as a cross-device sync regression. **Recommendation: Option A first.** It is a strict improvement with no correctness risk; re-measure afterwards and adopt Option B only if the residual `count(*)` cost is demonstrably material. **Blocked on:** Verify First items 1 and 9 (the baseline measurement) — without a number, neither option can be justified over the other.
- [ ] **Q2 — If Option A's residual `count(*)` cost is material, is there a middle path that avoids touching 14 write sites?** Candidates: reconcile hard deletes on a slower cadence rather than every poll; add a lightweight tombstone signal; or bump a _workspace_-level counter (far fewer write sites, at the cost of more cross-member invalidation). **Recommendation:** decide this only after Phase 3 measurements exist. **Blocked on:** Q1's outcome and a post-Option-A measurement.
- [ ] **Q3 — If Option B is chosen, what exactly is the counter and what type is it?** An epoch-microsecond stamp overflows `integer`, so either the column becomes `bigint`/`numeric` (wider index, larger row) or the stamp is composed differently — for example a `count(*)` integer plus a separate `max(updated_at)` timestamptz, which keeps each part in its natural type at the cost of two reads. **Recommendation:** the two-column variant; it avoids overflow entirely and keeps the comparison logic obvious. **Blocked on:** Q1.
- [ ] **Q4 — Should the poll be de-duplicated across multiple open tabs on the same device?** Today each visible tab polls independently, so one user with three tabs open costs 6 polls/minute instead of 2. A `BroadcastChannel` leader election could reduce this, and the app already uses `BroadcastChannel` for same-browser sync (`task-sync.ts`), so the primitive exists. **Recommendation:** out of scope here — filed because it multiplies whatever cost this plan reduces, and it is a client-only change with no correctness risk. **Blocked on:** confirming whether multi-tab usage is common (analytics on concurrent sessions per user would answer it).
- [ ] **Q5 — Is 30 seconds the right cadence now that the query is cheap?** If Option A makes each poll genuinely cheap, the interval could be shortened for a snappier cross-device experience, or lengthened to cut load further. This is a product judgement about freshness, not a scaling fix. **Recommendation:** leave it at 30s in this plan; revisit separately once the post-change cost is known. **Blocked on:** a product decision about acceptable cross-device staleness.
- [ ] **Q6 — Should the pulse's cost note be replaced by something that cannot rot?** The comment was wrong for as long as the code existed, and it actively discouraged investigation. One option is to reference the `EXPLAIN` expectation directly in the comment so any future change to the query that invalidates it is obvious. **Recommendation:** do this as part of Phase 2 — it is free and directly addresses the root cause of the oversight. **Blocked on:** nothing; can proceed with Phase 2.
