# Bound Unbounded Query Result Sets

> **Status:** 📋 Planned

## Status

- [ ] Verify First block executed; production row counts and `EXPLAIN (ANALYZE, BUFFERS)` baselines captured.
- [ ] Decision recorded on the default reporting window length (Open Question 1).
- [ ] Decision recorded on whether catalog stats need true lifetime totals (Open Question 2).
- [ ] `inArray` id lists chunked or replaced with joins in both cited call sites.
- [ ] Catalog stats bounded by a default window, backed by the rollup table where lifetime totals are required.
- [ ] JS-reduction sites converted to `GROUP BY` where the aggregate is expressible in SQL; the genuinely non-expressible ones documented and bounded instead.
- [ ] Bootstrap catalog loads narrowed to explicit column lists and given caps.
- [ ] Validation commands in Section 10 all pass.
- [ ] Post-deploy: before/after `EXPLAIN` recorded in the PR; query latency compared on production-shaped data.

## Verify First (No Code Change)

Run these **before changing any query**. The severity of everything in this plan is a function of production row counts, and on a dev database with a few hundred rows every one of these queries is instant — so a dev measurement proves nothing. Items marked **[needs DB access]** are the ones that decide whether this plan is urgent or merely prudent. If you have no database access, the correct framing is "these are real scaling cliffs, unverified severity" — not "these are slow today".

**1. Size every affected table.** This single query frames the entire plan:

```sql
SELECT relname,
       n_live_tup                                    AS live_rows,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE relname IN ('time_entries', 'workspaces', 'workspace_members', 'projects',
                  'clients', 'tags', 'project_tasks', 'departments')
ORDER BY n_live_tup DESC;
```

**[needs DB access]** Interpretation: if `time_entries` is under ~50k rows, nothing here is painful yet and the plan should be scheduled rather than escalated. If it is in the hundreds of thousands, the catalog-stats workstream (item 4) is the top priority, since it re-aggregates the entire table on every pagination click.

**2. Find the worst-case member, because several aggregates are per-member:**

```sql
SELECT workspace_member_id, count(*) AS entries,
       max(updated_at) AS last_write
FROM time_entries
GROUP BY workspace_member_id
ORDER BY entries DESC
LIMIT 10;
```

**[needs DB access]** Purpose: establishes the realistic per-tenant worst case, which is the number that matters for a "load every row into Node" query. A tenant whose busiest member has 15,000 entries is paying for 15,000 rows per request on those paths.

**3. Confirm the bind-parameter ceiling is actually reachable.** The theoretical limit is 65,535 parameters per statement in PostgreSQL's wire protocol. Check how close the largest workspace is:

```sql
SELECT te.workspace_id, count(*) AS ended_entries
FROM time_entries te
WHERE te.ended_at IS NOT NULL
GROUP BY te.workspace_id
ORDER BY ended_entries DESC
LIMIT 10;
```

**[needs DB access]** Purpose: `gsheets/sync.server.ts:116-121` builds `entryIds` from exactly this predicate (`workspace_id = ? AND ended_at IS NOT NULL`, unbounded) and inlines it into `inArray`. If the top row exceeds ~65,535, that query **fails outright** today for that workspace — it is a live bug, not a scaling concern. If the top row is ~5,000, it is a latent cliff. **This is the single most important check in the plan**, because it decides whether workstream 1 is a bug fix or a hardening task.

**4. Measure the catalog-stats aggregate, which this plan claims is the most expensive per-page-load query in the catalog area:**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT te.project_id,
       COALESCE(sum(te.duration_seconds) FILTER (WHERE te.ended_at IS NOT NULL), 0)::int,
       count(DISTINCT te.workspace_member_id) FILTER (WHERE te.ended_at IS NOT NULL)::int
FROM time_entries te
INNER JOIN projects p ON p.id = te.project_id
INNER JOIN workspace_members wm ON wm.id = te.workspace_member_id
WHERE te.workspace_id = '<real id>'
  AND te.project_id IN ('<10 real project ids>')
GROUP BY te.project_id;
```

**[needs DB access]** Purpose: this mirrors `catalogs/paginated.server.ts:70-110`. The `WHERE` has **no date predicate**, so it aggregates the workspace's entire lifetime of entries to render columns for at most one page of rows. Record `actual rows` and `Execution Time` — that is the per-pagination-click cost.

**5. Prove the per-member JS-reduction paths fetch unbounded rows:**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT workspace_member_id, started_at, ended_at, billable
FROM time_entries
WHERE workspace_id = '<real id>'
  AND ended_at IS NOT NULL
  AND started_at < '<range end>'
  AND ended_at > '<range start>'
ORDER BY started_at;
```

**[needs DB access]** Purpose: mirrors `analytics.server.ts:244-253` and `reports.server.ts:242-251`. Note the `actual rows` figure — that is how many rows are serialised over the Neon HTTP driver, materialised as JS objects, and then reduced in Node. Multiply by 4 columns plus the later joins the same request performs. A user-selectable range with no bound means this figure is unbounded by construction.

**6. Measure the bootstrap catalog load — it runs on every app page:**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM projects WHERE workspace_id = '<real id>' AND archived = false ORDER BY name;
```

**[needs DB access]** Purpose: mirrors `state.server.ts:64-77`, which is one of nine parallel queries on every app page load. `SELECT *` on `projects` pulls every column for every active project. Run the equivalent for `project_tasks`, `clients`, `tags`, and `departments` and record the combined row count — that total is the per-navigation catalogue payload.

**7. Confirm the timezone grouping cannot use the existing index** (this determines whether the `GROUP BY` rewrite is a real win or an illusion):

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT (te.started_at AT TIME ZONE 'Asia/Manila')::date AS d,
       sum(te.duration_seconds)::int
FROM time_entries te
WHERE te.workspace_id = '<real id>'
  AND te.started_at >= '<range start>' AND te.started_at < '<range end>'
GROUP BY 1 ORDER BY 1;
```

**[needs DB access]** Purpose: **this is the check that keeps the plan honest.** An expression `GROUP BY` over a timezone conversion generally **cannot** use the plain btree index on `(workspace_id, started_at)`, so the rewrite reduces bytes-on-the-wire and JS work dramatically but may **not** reduce the underlying index/heap scan. Compare this plan against a plain `GROUP BY date_trunc(...)` variant, and compare both against the current "fetch all rows and reduce in JS" cost. **If the `AT TIME ZONE` plan shows the same scan volume, the win is payload and CPU, not I/O** — say so in the PR rather than claiming a query-plan improvement.

**8. Confirm the rollup table exists and is populated, before proposing to read from it:**

```sql
SELECT count(*) AS rollup_rows,
       min(date) AS oldest,
       max(date) AS newest
FROM analytics_daily_member_metrics;
```

```sql
-- Is the rollup actually current, or has it drifted from the source table?
SELECT count(*) AS pending_rows FROM pending_analytics_rollups;
```

**[needs DB access]** Purpose: `analytics_daily_member_metrics` is the natural home for bounded lifetime totals (see plan `remove-redundant-database-round-trips`). But if `pending_analytics_rollups` is non-empty, the rollup is **stale** and reading from it would return wrong numbers — which is a worse outcome than a slow query. Confirm currency before proposing it as a source of truth.

**9. Verify the JS-reduction sites still exist at the cited locations:**

```bash
grep -n "from(timeEntries)" src/lib/server/tracker/analytics.server.ts src/lib/server/tracker/reports.server.ts | head
grep -n "inArray\|\.limit(" src/lib/server/tracker/leadership.server.ts 2>/dev/null
grep -n "from(timeEntries)" src/lib/server/tracker/department-dashboard.server.ts | head
grep -n "from(timeEntries)" src/lib/server/tracker/member-report.server.ts src/lib/server/tracker/performance.server.ts src/lib/server/tracker/leaderboard.server.ts | head
```

**`[CHECK]` only** — if a site has since gained a `.limit()` or been rewritten, remove it from scope. Also confirm none of these has an existing bound that the audit missed:

```bash
grep -n "\.limit(" src/lib/server/tracker/performance.server.ts src/lib/server/tracker/leaderboard.server.ts src/lib/server/tracker/member-report.server.ts
```

**10. Confirm the `summarizeWorkIntervals` constraint** — this determines which aggregates can become `GROUP BY` and which cannot:

```bash
grep -rn "summarizeWorkIntervals" src/lib/ --include=*.ts
sed -n '1,60p' src/lib/time-tracker/work-intervals.ts
```

Purpose: interval **merging** (overlapping tracked intervals collapsed into a union) is not expressible in plain SQL. Verify which of the six sites genuinely need it, because those must keep a bounded row fetch rather than being converted to `GROUP BY`. Getting this wrong would silently change reported hours — the worst possible outcome in a billing system.

**What you cannot verify without extra access:** every `EXPLAIN` and every row count above needs production database credentials. Without them this plan cannot state measured impact, only structural risk. **Do not claim a performance improvement you have not measured** — in a time-billing product, a subtly wrong aggregate is far worse than a slow one.

---

## 1. Goal

Stop four classes of query from growing without bound as a workspace accumulates history, and replace them with bounded, paginated, or SQL-aggregated equivalents — **without changing any reported number**.

- **Prevent a hard failure:** two call sites build `inArray` lists from unbounded entry fetches and inline them into a single `IN (...)` predicate. Beyond 65,535 parameters PostgreSQL rejects the statement, so this is a latent hard failure that triggers precisely when a customer becomes successful.
- **Remove O(all history) work from interactive paths:** the catalog stats aggregates have **no date predicate** and re-aggregate the workspace's entire lifetime of entries on every pagination click.
- **Move aggregation out of Node:** six sites select every matching row over the wire and reduce in JavaScript, where a `GROUP BY` would do — and where the row count is unbounded because the date range is user-selectable.
- **Shrink the per-navigation payload:** the bootstrap loaders fetch every catalog row with bare `select()` (all columns) on every app page load.
- **Correct the record where the rewrite does not help:** the timezone-conversion grouping reduces payload and CPU but may not reduce the underlying scan. This plan states that plainly rather than overselling it.

Who benefits: managers and owners browsing catalogs, running reports, and opening analytics on mature workspaces — and the infrastructure bill, since several of these queries currently scale linearly with total tenant history.

## 2. Context Summary

### 2.1 The bind-parameter ceiling (workstream 1)

`src/lib/server/gsheets/sync.server.ts:90-121` fetches every completed entry the workspace has ever recorded, then feeds all ids into one `IN`:

```ts
    db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspace.id),
          isNotNull(timeEntries.endedAt),
        ),
      )
      .orderBy(timeEntries.startedAt),
  ])

  const entryIds = entryRows.map((e) => e.id)
  // ...
      entryIds.length > 0
        ? db
            .select()
            .from(timeEntryTags)
            .where(inArray(timeEntryTags.timeEntryId, entryIds))
        : Promise.resolve([]),
```

No date bound, no `.limit()`. `inArray` expands to `WHERE time_entry_id IN ($1, $2, … $n)`, and PostgreSQL's wire protocol caps a statement at **65,535 bind parameters**. So past ~65k entries this query does not merely run slowly — it **fails**. Well before that, a 20,000-element `IN` list produces a pathological plan and a multi-megabyte statement.

The same construction appears in `src/lib/server/tracker/bulk-report.server.ts:394-410`:

```ts
    .orderBy(asc(timeEntries.startedAt), asc(timeEntries.id))

  const entryIds = rawEntries.map((e) => e.id)
  const tagRows = entryIds.length > 0
    ? await db.select({ ... }).from(timeEntryTags).innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
        .where(inArray(timeEntryTags.timeEntryId, entryIds))
    : []
```

There the unbounded fetch is arguably by design (it is an export), but the id list it produces still hits the ceiling.

### 2.2 Catalog stats with no date bound (workstream 2)

`src/lib/server/tracker/catalogs/paginated.server.ts:70-110` (`fetchProjectStats`) — `fetchClientStats` (`:28-68`) and `fetchTagStats` (`:112-129`) are the same shape:

```ts
return db
  .select({
    projectId: timeEntries.projectId,
    totalSeconds: sql<number>`coalesce(sum(${timeEntries.durationSeconds}) filter (where ${timeEntries.endedAt} is not null), 0)::int`,
    billableAmount: sql<number>`coalesce(sum(case when ${timeEntries.billable} = true and ${timeEntries.endedAt} is not null then ${timeEntries.durationSeconds}::numeric / 3600.0 * coalesce(${memberClientBillableRates.billableRate}::numeric, ${clients.defaultBillableRate}::numeric, ${workspaceMembers.billableRate}::numeric, ${defaultRate}) else 0 end), 0)::float8`,
    activeMembersCount: sql<number>`count(distinct ${timeEntries.workspaceMemberId}) filter (where ${timeEntries.endedAt} is not null)::int`,
  })
  .from(timeEntries)
  .innerJoin(projects, eq(projects.id, timeEntries.projectId))
  .leftJoin(clients, eq(clients.id, projects.clientId))
  .innerJoin(
    workspaceMembers,
    eq(workspaceMembers.id, timeEntries.workspaceMemberId),
  )
  .leftJoin(memberClientBillableRates /* 5-condition effective-rate join */)
  .where(
    and(
      eq(timeEntries.workspaceId, workspaceId),
      inArray(timeEntries.projectId, projectIds),
    ),
  )
  .groupBy(timeEntries.projectId)
```

The `WHERE` filters on workspace and project only — **no date predicate**. Every pagination click on the Projects, Clients, or Tags page re-aggregates the workspace's entire lifetime of entries through a four-to-five table join, purely to render "total seconds" and "billable amount" columns for ≤ one page of rows. The paginated queries _themselves_ are correctly bounded (`.limit(pageSize).offset(...)`), which makes the unbounded stats query the clear bottleneck on that page.

### 2.3 Counting is not the problem here

Unlike plan `tracker-pulse-query-scaling`, these queries must return **correct exact totals** for billing. Approximation (`reltuples`), sampling, or dropping the total is not available — the totals are the product feature. That constraint is why the fix is a **window plus a rollup**, not a cheaper estimate.

### 2.4 Load-every-row-then-reduce-in-JS (workstream 3)

Six sites share one shape: select every matching row, then reduce in JavaScript.

| Site                                       | Shape                                                                                                                     | Candidate for `GROUP BY`?                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `analytics.server.ts:244-253`              | 4-column select over the range, then `summarizeWorkIntervals` + reduces + day-splitting                                   | **Partly.** Daily and per-project totals are pure `GROUP BY`; the interval union is not. |
| `reports.server.ts:242-251`                | Identical 4-column select, then `summarizeWorkIntervals` (`:369-377`), a reduce (`:379-393`), a day-splitter (`:404-427`) | **Partly**, same split.                                                                  |
| `department-dashboard.server.ts:446-467`   | All entries for **all active members** in range                                                                           | **Partly.**                                                                              |
| `department-dashboard.server.ts:1091-1098` | `summaryRows` — one member, unpaginated range                                                                             | **Yes**, mostly.                                                                         |
| `member-report.server.ts:231-258`          | Range select, then JS aggregation                                                                                         | **Yes**, mostly.                                                                         |
| `performance.server.ts:314-338`            | Its own comment states the scale: _"Load full year of completed entries (1 year lookback) for heatmap + KPI history"_     | **Partly** — and the fetch can be narrowed regardless (see below).                       |
| `leaderboard.server.ts:91-111`             | Whole workspace, one month, then JS bucketing at `:123-131`                                                               | **Yes** — a clean `GROUP BY workspace_member_id, date`.                                  |

**The honest constraint.** Some of these numbers cannot be expressed in plain SQL:

- `totalSeconds`, `actualSeconds`, and `overlapSeconds` require **merging overlapping intervals** (tracked vs. actual time). Interval union is not expressible in a `GROUP BY`, so `summarizeWorkIntervals` must keep a row fetch. Converting these to `GROUP BY sum(duration_seconds)` would produce a **different number** whenever entries overlap — a silent billing error, which is strictly worse than a slow query.
- **Daily totals and per-project totals are pure aggregates** and are the ones currently re-derived in JS. Those are safe to convert.

Concrete gain for `performance.server.ts`: it fetches a **year** of rows and then discards everything older than 30 days in JS (`const activityStartDate = addDateKeyDays(todayKey, -29)`). The raw-row fetch for the KPI history can be narrowed to the 30-day window while the heatmap comes from a `GROUP BY`.

### 2.5 Bootstrap catalogue loads (workstream 4)

`src/lib/server/tracker/state.server.ts:64-189` and `state-lite.server.ts:56-158` load **every** project, client, tag, project task, department, cohort, workspace role and member row for the workspace, with bare `select()` (all columns) and no limit, e.g.:

```ts
    db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(projects.archived, false),
        ),
      )
      .orderBy(asc(projects.name)),
```

**The architecture is deliberate and documented** — `state.server.ts:51-53` explains it is one parallel wave on purpose, and `pulse.server.ts:11-16` contrasts itself against `getTrackerState`'s "whole 62-day entry window". So this is not a design flaw to overturn. The finding is the absence of **any** cap and the `select()` over-fetch: at 5,000 active projects and 20,000 active tasks, every single app page load ships 25k+ fully-populated rows. `state.server.ts:152-156` also uses `select()` on the wide `time_entries` table, pulling `description`, `notes`, `ip_address`, `location`, and `user_agent` text columns for a 62-day window.

Note the window itself is bounded and reasonable: `ENTRIES_WINDOW_DAYS = 62` (`state.server.ts:27`).

### 2.6 Assumptions and missing information

| Assumption                                                              | Default if unverified                                                                 | How to resolve      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------- |
| Any workspace is near the 65,535 bind-parameter limit                   | **Do not assume.** Treat workstream 1 as hardening, not an active bug, until measured | Verify First item 3 |
| The catalog stats aggregate is the worst interactive path               | Assume yes (it has no date bound at all)                                              | Verify First item 4 |
| `analytics_daily_member_metrics` is current enough to serve totals from | Assume **not** until `pending_analytics_rollups` is empty                             | Verify First item 8 |
| A 12-month default window is acceptable to stakeholders                 | Assume yes, but this is a product decision that changes displayed numbers             | Open Question 1     |
| Product needs true lifetime totals on catalog pages                     | Unknown — this decides whether a rollup is mandatory                                  | Open Question 2     |
| The `AT TIME ZONE` grouping reduces scan volume                         | **Assume it does not.** It reduces payload and CPU                                    | Verify First item 7 |

## 3. Scope

### `[CHECK]` — verification only, no code change

- `[CHECK]` Capture `pg_stat_user_tables` row counts and sizes for every affected table (Verify First item 1) — this frames whether the plan is urgent or merely prudent.
- `[CHECK]` Identify the busiest member per tenant to establish the realistic per-request row count (Verify First item 2).
- `[CHECK]` **Measure whether any workspace is near the 65,535 bind-parameter ceiling** — the check that decides whether workstream 1 is a bug fix or hardening (Verify First item 3).
- `[CHECK]` Record `EXPLAIN (ANALYZE, BUFFERS)` baselines for the catalog stats aggregate, a per-member range select, and a bootstrap catalogue query (Verify First items 4, 5, 6).
- `[CHECK]` Determine whether the `AT TIME ZONE` `GROUP BY` rewrite actually reduces scan volume, or only payload and CPU (Verify First item 7). **Report this honestly either way.**
- `[CHECK]` Confirm `analytics_daily_member_metrics` is populated **and current** (`pending_analytics_rollups` empty) before proposing it as a source of totals (Verify First item 8).
- `[CHECK]` Re-confirm the cited sites still lack bounds, and check for any existing `.limit()` the audit may have missed (Verify First item 9).
- `[CHECK]` Determine which of the named aggregates genuinely require interval merging and therefore cannot become `GROUP BY` (Verify First item 10). **This prevents a silent billing-number change.**
- `[CHECK]` After deploy: re-run every baseline `EXPLAIN` and compare; verify no reported total changed.

### `[FIX]` — code changes

**Workstream 1 — bind-parameter ceiling:**

- `[FIX]` Replace the unbounded `inArray(timeEntryTags.timeEntryId, entryIds)` in `gsheets/sync.server.ts:116-121` with a join against the parent predicate, eliminating the id list entirely (preferred), or chunk it at ~1,000 ids.
- `[FIX]` Apply the same treatment to `bulk-report.server.ts:399-410`.
- `[FIX]` Add a date bound to the `gsheets/sync.server.ts` entry fetch so the payload is bounded independently of the id-list fix.

**Workstream 2 — catalog stats:**

- `[FIX]` Add a default date window (recommended: 12 months) to `fetchClientStats`, `fetchProjectStats`, and `fetchTagStats` in `catalogs/paginated.server.ts`.
- `[FIX]` Surface the window in the UI so the displayed totals are self-describing rather than silently partial.
- `[FIX]` If lifetime totals are required (Open Question 2), source them from `analytics_daily_member_metrics` rather than raw `time_entries` — gated on that table being current.

**Workstream 3 — JS reduction → SQL aggregation:**

- `[FIX]` Convert the **pure-aggregate** portions (daily totals, per-project totals, leaderboard bucketing) to `GROUP BY` at the six cited sites.
- `[FIX]` **Keep** a bounded row fetch where interval merging is required, and reduce that fetch's window instead of its semantics.
- `[FIX]` Narrow `performance.server.ts`'s raw-row fetch from a one-year lookback to the 30-day window it actually uses, sourcing the heatmap from a `GROUP BY`.
- `[FIX]` Add an upper bound on the user-selectable report range (enforced in the input schema) so "unbounded" becomes "bounded but large".

**Workstream 4 — bootstrap payload:**

- `[FIX]` Replace bare `select()` with explicit column lists on the wide tables in `state.server.ts` and `state-lite.server.ts` — zero behavioural risk.
- `[FIX]` Add caps to the catalog loads in the bootstrap path, or drive the entry-form pickers from server-side search (the catalogs pages already do this via `getPaginatedProjects`).

## 4. Out of Scope

- **Rewriting the interval-merge algorithm.** `summarizeWorkIntervals` produces tracked-vs-actual and overlap figures that are not expressible in SQL. It stays; only its input window is bounded.
- **Changing any reported number.** Every change here must be number-preserving for the same inputs. If a rewrite would alter a total, it does not ship — see the risk table.
- **Approximate or sampled totals.** `reltuples`, sampling, and "estimate" strategies are rejected because these totals are billing-visible.
- **Indexes.** The `(workspace_id, project_id)` and `updated_at` indexes that these queries benefit from are owned by plan `add-missing-database-indexes`. This plan does not declare any index.
- **The pulse query and its `entriesVersion` counter.** Covered by plan `tracker-pulse-query-scaling`.
- **Round-trip and concurrency reductions** (redundant `count(*)`, duplicate predicate scans, the rollup write churn, the `enqueueTimeEntry` fan-out). Covered by plan `remove-redundant-database-round-trips` — even though several of those sites appear in the same files.
- **The leading-wildcard `ILIKE` searches** and the trigram indexes that would serve them. Covered by plan `add-missing-database-indexes`.
- **Pagination UI changes** beyond surfacing the new date window (no virtualized tables, no infinite scroll).
- **`requireWorkspaceAccess` or session/workspace resolution** — already request-cached and clean.
- **`db:push` / migration workflow.** No schema change is proposed here.
- **Backfilling the rollup table.** If it is stale, repairing it is a prerequisite task, not part of this plan (see Open Question 3).

## 5. Affected Files and Folders

```txt
Tickr/
├── src/
│   └── lib/
│       └── server/
│           ├── gsheets/
│           │   └── sync.server.ts                     (MODIFY)
│           │         - L90-121: add a date bound to the entry fetch; replace
│           │           the unbounded inArray(timeEntryTags.timeEntryId, ...)
│           │           with a join (preferred) or ~1,000-id chunks.
│           │
│           └── tracker/
│               ├── catalogs/
│               │   └── paginated.server.ts             (MODIFY)
│               │         - fetchClientStats (L28-68), fetchProjectStats
│               │           (L70-110), fetchTagStats (L112-129): add a default
│               │           date window; source lifetime totals from the
│               │           rollup table if OQ2 requires them.
│               │
│               ├── analytics.server.ts                 (MODIFY)
│               │         - L244-253: convert daily/per-project totals to
│               │           GROUP BY; keep the bounded row fetch for
│               │           summarizeWorkIntervals. L256-271: add a LIMIT to
│               │           projectSqlRows (returned verbatim as projectTotals).
│               │
│               ├── reports.server.ts                   (MODIFY)
│               │         - L242-251: as above (shares the 4-column shape).
│               │
│               ├── department-dashboard.server.ts      (MODIFY)
│               │         - L446-467: convert expressible aggregates; L1091-1098
│               │           (summaryRows) bounded/paginated.
│               │
│               ├── member-report.server.ts             (MODIFY)
│               │         - L231-258: convert to GROUP BY where expressible.
│               │
│               ├── performance.server.ts               (MODIFY)
│               │         - L314-338: narrow the raw fetch from a 1-year
│               │           lookback to the 30-day window actually used;
│               │           heatmap from GROUP BY.
│               │
│               ├── leaderboard.server.ts               (MODIFY)
│               │         - L91-111 / L123-131: replace JS bucketing with
│               │           GROUP BY workspace_member_id, date.
│               │
│               ├── state.server.ts                     (MODIFY)
│               │         - Explicit column lists instead of bare select()
│               │           on projects/clients/tags/project_tasks/departments
│               │           and on the wide time_entries select (L152-156).
│               │         - Caps on catalog loads, or server-side search for
│               │           the entry-form pickers.
│               │
│               ├── state-lite.server.ts                (MODIFY)
│               │         - Same treatment. Note the likely bug at L145-157:
│               │           memberClientBillableRates is filtered by BOTH
│               │           inArray(workspaceMemberId, visibleMemberIds) AND
│               │           eq(workspaceMemberId, memberId), making the
│               │           inArray dead weight — flag, do not silently change.
│               │
│               └── shared/
│                   └── schemas.ts                      (MODIFY)
│                         - Add a maximum on the report/analytics date range
│                           so "unbounded" becomes "bounded but large".
│
├── src/routes/api/                                     (MODIFY — only if the
│                                                         v1 API shares these
│                                                         helpers; verify first)
│
└── plans/
    └── bound-unbounded-query-result-sets/
        └── PLAN.md                                     (NEW)
```

No schema or migration changes. No new dependencies.

## 6. Database Design

**N/A — no schema change.** This plan deliberately relies on structures that already exist:

- **`analytics_daily_member_metrics`** (created in `drizzle/0008_analytics_daily_rollups.sql`) is the pre-existing rollup table and the intended home for bounded lifetime totals. Its schema is already correct for this purpose:

```sql
CREATE TABLE "analytics_daily_member_metrics" (
	"workspace_id" varchar(30) NOT NULL,
	"workspace_member_id" varchar(30) NOT NULL,
	"date" date NOT NULL,
	"department_id" varchar(30),
	"entry_count" integer DEFAULT 0 NOT NULL,
	"total_seconds" integer DEFAULT 0 NOT NULL,
	"billable_seconds" integer DEFAULT 0 NOT NULL,
	"non_billable_seconds" integer DEFAULT 0 NOT NULL,
	"billable_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	...
	PRIMARY KEY("workspace_id","workspace_member_id","date")
);
```

with supporting indexes `analytics_daily_workspace_date_idx`, `analytics_daily_workspace_member_date_idx`, and `analytics_daily_workspace_department_date_idx` — all created in the same migration. Reading lifetime totals as `SUM(total_seconds) GROUP BY project` requires joining this table to `projects`, which is not directly modelled (the rollup is keyed by member and date, not project). **That gap is Open Question 2's real cost** and may require either a new project-keyed rollup or a bounded window instead.

- **The index this plan benefits from most** — `time_entries (workspace_id, project_id)` — is declared by plan `add-missing-database-indexes`. Workstream 2 is materially cheaper once it exists.

No new table, column, enum, index, or seed data is proposed. If Open Question 2 resolves to "yes, we need project-level lifetime totals", a project-keyed rollup table would be needed and this section becomes a real schema change — that contingency is why Q2 is a blocking question rather than a preference.

## 7. Backend Implementation

### 7.1 Workstream 1 — eliminate or chunk the id lists

**Preferred fix: no id list at all.** The tag query exists only to decorate entries that the parent query already selected. A join against the parent predicate removes the round trip _and_ the parameter ceiling:

```ts
// Instead of: fetch entries → build entryIds → inArray(entryIds)
const tagsByEntry = await db
  .select({ timeEntryId: timeEntryTags.timeEntryId, tagName: tags.name })
  .from(timeEntryTags)
  .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
  .innerJoin(timeEntries, eq(timeEntryTags.timeEntryId, timeEntries.id))
  .where(
    and(
      eq(timeEntries.workspaceId, workspace.id),
      isNotNull(timeEntries.endedAt),
    ),
  )
```

This is one query instead of two and has no parameter-count dependency.

**Fallback if a join is not workable: chunk at ~1,000.** The merge pattern is a `Map` the call site already builds:

```ts
for (let i = 0; i < entryIds.length; i += 1000) {
  const chunk = await db.select(...).from(timeEntryTags)
    .where(inArray(timeEntryTags.timeEntryId, entryIds.slice(i, i + 1000)))
  // merge chunk into the existing Map
}
```

Chunking is strictly worse (N round trips instead of 1) but bounded and safe. **Recommendation: prefer the join.** Also add a date bound to `gsheets/sync.server.ts`'s entry fetch, since the whole payload — not just the id list — is currently unbounded.

### 7.2 Workstream 2 — window the catalog stats

Add a `gte(timeEntries.startedAt, <windowStart>)` predicate to all three stats functions, and surface the window in the UI so the number is self-describing. A bounded `GROUP BY` that uses the `(workspace_id, project_id)` index is the target shape.

**Product-visible consequence to flag:** a windowed total is a _different number_ from the current lifetime total. Users comparing "total hours for this project" before and after the change will see it drop. That must be a deliberate, communicated decision — hence Open Question 1 — and the UI must label the window. This is the one place in the plan where correctness-of-presentation matters as much as correctness-of-query.

If lifetime totals are required, read from `analytics_daily_member_metrics` **only after confirming it is current** (Verify First item 8). Serving a stale rollup would return a confidently wrong number, which is worse than a slow correct one.

### 7.3 Workstream 3 — split each site into "expressible" and "not expressible"

For each of the six sites, classify every number before rewriting anything:

| Number                             | Expressible in SQL?                              | Action                     |
| ---------------------------------- | ------------------------------------------------ | -------------------------- |
| Daily totals                       | ✅ `GROUP BY (started_at AT TIME ZONE tz)::date` | Convert                    |
| Per-project totals                 | ✅ `GROUP BY project_id`                         | Convert                    |
| Per-member totals                  | ✅ `GROUP BY workspace_member_id`                | Convert                    |
| Leaderboard buckets                | ✅ `GROUP BY workspace_member_id, date`          | Convert                    |
| Heatmap cells                      | ✅ `GROUP BY member, date`                       | Convert                    |
| **Tracked total (interval union)** | ❌ Requires merging overlapping intervals        | **Keep bounded row fetch** |
| **Actual/overlap seconds**         | ❌ Same                                          | **Keep bounded row fetch** |
| **Effective rate cascade**         | ❌ Multi-source COALESCE join, already in SQL    | Leave as-is                |

The conversion template for an expressible aggregate:

```ts
db.select({
  date: sql<string>`(${timeEntries.startedAt} AT TIME ZONE ${timezone})::date`,
  seconds: sql<number>`coalesce(sum(${clippedSecondsSql}), 0)::int`,
  billableSeconds: sql<number>`coalesce(sum(case when ${timeEntries.billable} then ${clippedSecondsSql} else 0 end), 0)::int`,
})
  .from(timeEntries)
  .where(whereClause)
  .groupBy(sql`(${timeEntries.startedAt} AT TIME ZONE ${timezone})::date`)
  .orderBy(sql`1`)
```

For the interval-union numbers, bound the **window** rather than changing the algorithm — that preserves the numbers exactly while capping the row count.

`analytics.server.ts:256-271` (`projectSqlRows`) additionally has **no `LIMIT`** and is returned verbatim as `projectTotals` and rendered, so a workspace with 5,000 projects ships 5,000 rows to the client on every analytics page load. Add `.limit(20)` for a "top projects" chart, or paginate it.

### 7.4 Workstream 4 — narrow the bootstrap payload

Two changes, in priority order:

1. **Explicit column lists** replacing bare `select()` on `projects`, `clients`, `tags`, `projectTasks`, `departments`, and the wide `time_entries` select (`state.server.ts:152-156`). Mechanical, zero behavioural risk, and the single cheapest win in the plan because `time_entries` is the widest table in the schema (25 columns, 7 of them unbounded text/double precision).
2. **Caps or server-side search** for the catalog loads. The tracker only needs recently-used projects and tasks for the entry form, so a `.limit(500)` ordered by recency — or driving the pickers from `getPaginatedProjects`, which the catalogs pages already use — is sufficient.

### 7.5 Zod schema bound

Add a maximum to the report/analytics date-range input so the range cannot be unbounded by construction. This is the cheapest structural guarantee in the plan: it converts "the user can request all history" into "the user can request a large but bounded range", which bounds every query that consumes the schema.

## 8. Frontend Implementation

**Minimal, and one piece of it is mandatory.** No component tree changes, no new state management, no virtualization.

- **Mandatory:** wherever the catalog stats window is introduced, the UI must **state the window** (e.g. "Totals for the last 12 months"). Without this the change silently alters displayed totals, and a user comparing against a previously-noted figure has no way to understand the difference. This is the only user-visible surface the plan requires.
- **Optional, if the report range gains a maximum:** the date pickers should prevent or clearly message an over-long range rather than letting a request fail server-side. The existing `ExportDateRangePicker` and report filter bars are the places to check.
- **Not in scope:** virtualized tables (the paginated tables correctly do not need them), infinite scroll, loading-state redesign, or any change to chart rendering.

## 9. Access Control

**N/A — no authorization change.** Every query in this plan is already scoped, and the scoping is untouched:

- Catalog stats filter on `workspace_id` derived from `requireWorkspaceAccess()`.
- Reports/analytics/department endpoints apply the existing `memberScopeCondition` gating (self / department / workspace), which the audit confirmed is correct.
- The bootstrap loaders are self-scoped to the session's workspace.
- `bulk-report.server.ts` and `gsheets/sync.server.ts` are permission-gated at their call sites.

Adding a date window or a `GROUP BY` cannot widen what a role can read; the predicates are preserved verbatim in every rewrite. One thing to preserve deliberately: the effective-rate cascade join has five conditions including `workspaceId` equality — the rewrites in §7.3 must carry it across, or billing amounts will silently change. Section 9 is included for template completeness.

## 10. Validation

> **Environment note:** `pnpm <script>` fails in this sandbox with `EPERM: operation not permitted, mkdir '~/Library/pnpm/.tools/...'`. Use the direct binaries below.

### Pre-change baselines (capture before editing anything)

Record all four `EXPLAIN (ANALYZE, BUFFERS)` outputs from Verify First items 4, 5, 6, and 7, plus the row counts from items 1 and 2, directly into the PR description. Without these there is no way to demonstrate improvement, and the plan's own honesty clause (item 7) requires a before/after comparison for the timezone grouping.

**Also capture the current displayed totals** for a known workspace — project hours, client hours, tag hours, leaderboard standings, and a report's summary line — so the number-preservation check below has something to compare against. This is the most important pre-change artifact: without it, a subtly changed total is undetectable.

### The number-preservation check (the critical test)

This plan's greatest risk is changing a reported figure. Verify explicitly:

```bash
# Unit tests covering the aggregation logic.
./node_modules/.bin/vitest run src/lib/time-tracker/
```

```bash
# Find the tests that already cover interval merging and billing maths.
ls src/lib/time-tracker/*.test.ts src/components/time-tracker/*.test.ts 2>/dev/null
grep -rln "summarizeWorkIntervals\|overlapSeconds\|actualSeconds" src/ --include=*.test.ts
```

Then, for each rewritten site, compare the pre-change and post-change output for **the same inputs**:

| Check                    | Method                                                                                       | Pass criterion                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Tracked vs. actual hours | Compare `totalSeconds`/`actualSeconds` for an overlapping-entry range before and after       | Identical to the second                                           |
| Billable amount          | Compare `billableAmount` for a workspace with `memberClientBillableRates` rows in play       | Identical to the cent                                             |
| Catalog totals           | Compare project/client/tag totals — **expect a deliberate difference** if a window was added | Difference explained solely by the window, and labelled in the UI |
| Leaderboard              | Compare standings for a fixed month                                                          | Identical order and values                                        |
| Heatmap                  | Compare cell values for a fixed 30-day window                                                | Identical                                                         |

**Any unexplained difference is a stop-ship**, not a rounding quirk. In a billing system a wrong total is worse than a slow query — that is the guiding constraint of this entire plan.

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

> ⚠️ **Pre-existing failure warning.** `./node_modules/.bin/vitest run` currently reports **one** failure: the first test in `src/lib/time-tracker/payroll-periods.test.ts`, a date-dependent time bomb unrelated to this plan (see plan `fix-payroll-period-test-time-bomb`). Expect **374 passed, 1 failed** on a clean checkout. If you see exactly that one failure, you have not caused a regression. If you see any _other_ failure — especially in the aggregation tests — investigate immediately, because this plan touches billing maths.

### Post-change plan verification

```sql
-- Re-run the Verify First item 4 baseline. Expect the catalog stats aggregate
-- to scan only the window rather than all history: "actual rows" should drop
-- from lifetime entry count to windowed entry count.
EXPLAIN (ANALYZE, BUFFERS)
SELECT te.project_id, COALESCE(sum(te.duration_seconds) FILTER (WHERE te.ended_at IS NOT NULL), 0)::int
FROM time_entries te
INNER JOIN projects p ON p.id = te.project_id
WHERE te.workspace_id = '<real id>'
  AND te.project_id IN ('<10 real project ids>')
  AND te.started_at >= now() - interval '12 months'
GROUP BY te.project_id;
```

```sql
-- Confirm no statement can still exceed the 65,535 bind-parameter ceiling.
-- The rewritten queries should not build id lists at all; this query shows the
-- scale that used to determine the parameter count.
SELECT workspace_id, count(*) AS entries_in_scope
FROM time_entries
WHERE ended_at IS NOT NULL
GROUP BY workspace_id
ORDER BY entries_in_scope DESC
LIMIT 5;
```

```sql
-- If the rollup is used for lifetime totals, confirm it is CURRENT.
-- A non-zero count here means serving from the rollup would return stale numbers.
SELECT count(*) AS pending_rollups FROM pending_analytics_rollups;
```

Expected: `0` before any rollup-backed total is displayed.

### Definition of done

> ⚠️ **Honest reporting requirement.** Verify First item 7 may show that the `AT TIME ZONE` `GROUP BY` does **not** reduce scan volume, only payload and CPU. If so, record that in the PR rather than claiming a query-plan win — the plan's value on those sites is real but different from a scan reduction, and misreporting it would mislead the next optimisation effort.

- [ ] No `inArray` call in the two cited sites can exceed the parameter ceiling (verified by inspection and by the scale query above).
- [ ] Catalog stats read only a bounded window, and the window is visible in the UI.
- [ ] Every reported number is unchanged for the same inputs, or its change is fully explained by an intentional window and labelled.
- [ ] The interval-union aggregates still use a bounded row fetch and produce identical results.
- [ ] Bootstrap loaders use explicit column lists; the payload is measurably smaller.
- [ ] Before/after `EXPLAIN` recorded, with the timezone-grouping outcome stated honestly.
- [ ] `tsc`, `eslint`, `vite build` exit 0; the test suite shows only the known pre-existing payroll failure.

## 11. Sequencing

Five phases, ordered so each is independently shippable and each is verifiable on its own. Workstream order reflects risk, not size: the safest, most mechanical wins come first.

- [ ] **Phase 0 — Verify (no code).** Run the entire Verify First block. Capture row counts, four `EXPLAIN` baselines, the rollup currency check, and — critically — **the current displayed totals** for a known workspace. Answer Open Questions 1 and 2. Exit criteria: baselines recorded and both questions answered. **Nothing proceeds without this.**
- [ ] **Phase 1 — Workstream 4 (bootstrap column lists).** Replace bare `select()` with explicit column lists in `state.server.ts` and `state-lite.server.ts`. Purely mechanical, zero behavioural risk, and it touches the highest-frequency path in the app. Ship independently. Defer the catalog _caps_ to Phase 4, since capping changes what the entry-form pickers can see.
- [ ] **Phase 2 — Workstream 1 (bind-parameter ceiling).** Replace both `inArray` id lists with joins; add a date bound to the `gsheets/sync.server.ts` entry fetch. Self-contained, no dependency on any product decision, and it removes a latent hard failure. Ship independently. Depends on plan `add-missing-database-indexes` Phase 1 for the `(workspace_id, project_id)` index to make the join cheap, but is correct without it.
- [ ] **Phase 3 — Workstream 3 (SQL aggregation).** Convert the expressible aggregates site by site, running the number-preservation check after **each** site rather than batching. Narrow `performance.server.ts`'s fetch to 30 days. This is the highest-risk phase because it touches billing maths — keep the per-site verification granular so a regression is attributable.
- [ ] **Phase 4 — Workstream 2 (catalog stats window) + the bootstrap caps.** Depends on Open Questions 1 and 2 being answered, because it changes a displayed number. Add the window, label it in the UI, and — only if the rollup is confirmed current — wire lifetime totals through `analytics_daily_member_metrics`. Also apply the bootstrap catalog caps here.
- [ ] **Phase 5 — Post-deploy verification.** Re-run every baseline `EXPLAIN`, confirm the totals table in Section 10 still matches, and verify no query builds an id list near the ceiling. Record results in the Status checklist.

Phases 1 and 2 are the recommended minimum shippable unit: both are behaviour-preserving, both are independently safe, and together they remove the latent hard failure and shrink the hottest payload. Phases 3 and 4 should each be their own PR.

## 12. Risks & Considerations

| Risk                                                                                                                                                                                                                                    | Likelihood                                           | Impact                                                                                    | Mitigation                                                                                                                                                                                                                                                                                                     | Rollback                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A rewrite silently changes a reported total** — the single worst outcome, because these numbers are billed. Most likely at the interval-union boundaries if `summarizeWorkIntervals` is replaced rather than bounded.                 | Medium                                               | **Critical** — wrong invoices, lost trust, and undetectable without a pre-change snapshot | Verify First item 10 establishes which aggregates genuinely require interval merging. §7.3 forbids converting those. Capture current displayed totals **before** changing anything (Section 10) and diff after **each** site, not at the end. Never replace `summarizeWorkIntervals` with `GROUP BY sum(...)`. | Revert the individual site's commit. The pre-change totals captured in Phase 0 allow immediate detection. No data is migrated, so rollback is a pure code revert. |
| Adding a date window to catalog stats changes displayed totals, and users interpret the drop as data loss.                                                                                                                              | **High** — this is a certain consequence, not a risk | Medium — support burden and lost confidence                                               | Make it a deliberate, communicated decision (Open Question 1) and **label the window in the UI** (Section 8, mandatory). Prefer a generous default (12 months) and consider an explicit "all time" toggle for users who need it.                                                                               | Remove the `gte(...)` predicate to restore lifetime totals instantly — a one-line revert. No data impact.                                                         |
| Serving lifetime totals from `analytics_daily_member_metrics` while the rollup is stale returns confidently wrong numbers.                                                                                                              | Medium                                               | **High** — a wrong total is worse than a slow one                                         | Gate on Verify First item 8: `pending_analytics_rollups` **must be 0** before the rollup is used as a source. If it is non-empty, do not wire it up — ship the windowed query instead and repair the rollup separately (Open Question 3).                                                                      | Stop reading from the rollup; revert to the windowed raw query. The rollup is untouched by this plan, so nothing to repair on rollback.                           |
| The `AT TIME ZONE` `GROUP BY` rewrite reduces payload and CPU but **not** scan volume, so the expected speedup does not materialise.                                                                                                    | **Medium–High** — likely, per Verify First item 7    | Low–Medium — an improvement that falls short of the claim                                 | State the limitation upfront (§7.3) and verify it in Phase 0 **before** investing in the rewrite. Report the true outcome honestly rather than claiming a plan improvement. Where the win is only payload, the rewrite is still worthwhile — just described accurately.                                        | Keep whichever version measures faster; both produce identical numbers. This is a pure optimisation with no correctness coupling.                                 |
| Chunking instead of joining multiplies round trips (N chunks instead of 1) and makes the path _slower_ for small workspaces.                                                                                                            | Medium if the fallback is used                       | Low                                                                                       | Prefer the join (§7.1) — it is one query and has no parameter dependency. Only chunk where a join is genuinely unworkable, and size chunks large (~1,000) to keep N small.                                                                                                                                     | Revert to the original unbounded query — but only for workspaces known to be small, which defeats the purpose. Prefer fixing forward.                             |
| Bootstrap catalog caps hide projects/tasks a user legitimately needs to select in the entry form.                                                                                                                                       | Medium                                               | Medium — a functional regression in the primary workflow                                  | Order by recency so the common case is unaffected, set the cap generously (≥ 500), and prefer driving the pickers from server-side search (`getPaginatedProjects`) which the catalogs pages already use. **Do not cap without a search fallback.**                                                             | Raise or remove the cap — a one-line revert.                                                                                                                      |
| Report range bounds break an existing export workflow that legitimately needs full history.                                                                                                                                             | Medium                                               | Medium — a broken export is a visible failure                                             | Add the bound **after** workstreams 1–4, and surface the limit in the UI as an actionable message rather than a server error. Confirm with stakeholders whether a full-history export is a real requirement (Open Question 4).                                                                                 | Raise or remove the schema maximum — a one-line revert.                                                                                                           |
| Concurrent changes to the same files (`analytics-rollups.server.ts`, `reports.server.ts`, `department-dashboard.server.ts` are also touched by plan `remove-redundant-database-round-trips`) create merge conflicts or duplicated work. | Medium                                               | Low–Medium — wasted effort, not breakage                                                  | Keep the boundary explicit: **this plan changes what is aggregated; that plan changes how many round trips it takes.** Do not fix `count(*)` redundancy here. Sequence the two plans rather than running them in parallel on the same files.                                                                   | N/A — process risk, mitigated by sequencing.                                                                                                                      |
| **No destructive migration and no external service is involved.** Every change is a query-shape change over existing tables.                                                                                                            | —                                                    | —                                                                                         | The only irreversible artifact would be a schema change, and this plan proposes none.                                                                                                                                                                                                                          | Every rollback path is a code revert; no data repair, no migration reversal, no money movement.                                                                   |

## 13. Open Questions

- [ ] **Q1 — What default window should catalog stats use, and may the displayed totals change?** Options: **(a) 12 months** _(recommended)_ — generous enough to cover a typical reporting cycle while bounding the scan; **(b) 3 months** — much cheaper, but excludes annual comparisons; **(c) no window, but read from the rollup** — preserves lifetime totals at the cost of depending on rollup currency. **Blocked on:** Verify First items 1 and 4 (how large is the table and how expensive is the query today — if it is cheap, the window may not be worth the user-visible change), plus stakeholder acceptance that a displayed total will change.
- [ ] **Q2 — Does the product actually need true lifetime totals on the catalog pages?** This is the question that decides whether a rollup is mandatory or a window suffices. Note that the existing `analytics_daily_member_metrics` rollup is keyed by **member and date**, not project — so project-level lifetime totals would need a **new project-keyed rollup table**, which turns this plan into a schema change and should be split into its own plan. **Blocked on:** product input. **Recommendation:** if a 12-month window is acceptable, take it and avoid the rollup dependency entirely.
- [ ] **Q3 — Is `analytics_daily_member_metrics` currently correct and current?** Verify First item 8 answers whether it is populated and whether `pending_analytics_rollups` is empty. Note that `recomputeQueuedAnalyticsRollups` is exported but **never called** — so the rollup may be maintained only by the synchronous path in `refreshAnalyticsRollups`, and any gaps would be permanent. **Recommendation:** treat repairing and correctly scheduling the rollup as a prerequisite task owned by plan `remove-redundant-database-round-trips`; do not depend on the rollup here until it is proven current. **Blocked on:** the two queries in Verify First item 8.
- [ ] **Q4 — Is a full-history report export a real requirement, or can the range be bounded?** A maximum on the date-range schema is the cheapest structural guarantee in the plan (it bounds every downstream query), but it would break any workflow that legitimately exports all history. **Blocked on:** confirming whether the Excel/PDF export paths (`timesheet-export.ts`, `bulk-report-export.ts`) are used for full-history extracts. **Note:** the `bulk-report.server.ts` id-list fix (workstream 1) is required regardless, since an unbounded export is exactly what pushes the parameter count toward the ceiling.
- [ ] **Q5 — Should the entry-form project/task pickers be server-searched rather than loading the full catalog?** The bootstrap loaders currently ship every active project and task so the picker works client-side. Server-side search (as the catalogs pages already do) removes that payload entirely but changes picker behaviour — offline/optimistic selection, perceived latency, and the "recently used" ordering. **Recommendation:** make only the column-list change (Phase 1) now, and treat server-side search as a separate follow-up with its own UX consideration. **Blocked on:** whether picker responsiveness offline is a requirement (`pending-entries.ts` and the offline queue suggest it may be).
- [ ] **Q6 — Should `leaderboard.server.ts` and `member-report.server.ts` be included, or are they low-traffic enough to leave?** Both are clearly convertible to `GROUP BY`, but if they are rarely used the payoff is small relative to the verification burden. **Recommendation:** include them in Phase 3 only if the Phase 0 baselines show they are non-trivial; otherwise file them as a cleanup and keep Phase 3 focused on `analytics` and `reports`, which are the high-traffic paths. **Blocked on:** the Verify First item 5 baselines, plus any available request-frequency data.
