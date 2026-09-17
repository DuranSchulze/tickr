# Add Missing Database Indexes

> **Status:** 📋 Planned

## Status

- [ ] Verify First block executed against production; current index inventory captured from `pg_stat_user_indexes`.
- [ ] Decision recorded on `CREATE INDEX CONCURRENTLY` vs. plain `CREATE INDEX` (Open Question 1).
- [ ] Decision recorded on the `time_entries.description` trigram index (Open Question 2) — write cost vs. search speed.
- [ ] `sessions.user_id`, `project_tasks (workspace_id, name)`, and both `time_entries.updated_at` variants added to `schema.ts`.
- [ ] `time_entries (workspace_id, project_id)` added to `schema.ts`.
- [ ] Trigram indexes added to `schema.ts` (or explicitly deferred with a recorded reason).
- [ ] False "trigram index is unnecessary" comment at `schema.ts:872-877` corrected.
- [ ] Migration generated via `db:generate`, reviewed by hand, and applied to a staging/preview branch first.
- [ ] `db:push` drift check confirms schema ↔ migration parity.
- [ ] Validation commands in Section 10 all pass.
- [ ] Index usage confirmed post-deploy via `pg_stat_user_indexes` (no `idx_scan = 0` on the new indexes after normal traffic).

## Verify First (No Code Change)

Run these **before writing any DDL**. Several of these indexes are only worth their write-amplification cost if the tables are actually large and the queries actually run; confirm that first. Items 1–2 and 8 need **production database access** — if you do not have it, say so and treat the affected indexes as "unverified benefit, low risk" rather than asserting they are needed.

**1. Confirm each index is genuinely absent from production (not just from `schema.ts`).** `db:push` exists as a script, so a schema-declared index could theoretically have been pushed without a migration — and conversely a hand-created index could exist in prod. Ground truth is `pg_indexes`:

```sql
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('sessions', 'project_tasks', 'time_entries', 'projects', 'clients', 'tags', 'audit_logs')
ORDER BY tablename, indexname;
```

Expected: no index named `sessions_user_id_idx`, `project_tasks_workspace_name_idx`, `time_entries_*_updated_idx`, `time_entries_workspace_project_idx`, or `*_trgm_idx`. **If any already exist, drop it from this plan's scope.**

**2. Confirm the `pg_trgm` extension is still installed** (migration 0004 added it; nothing removes it, but verify before depending on it):

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';
```

Expected: one row. If absent, the trigram portion of this plan must add `CREATE EXTENSION IF NOT EXISTS pg_trgm;` as the first statement of the migration.

**3. Size the tables, to judge lock duration and whether each index earns its keep:**

```sql
SELECT relname,
       n_live_tup                                   AS live_rows,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_stat_user_tables
WHERE relname IN ('sessions', 'project_tasks', 'time_entries', 'projects', 'clients', 'tags', 'audit_logs')
ORDER BY n_live_tup DESC;
```

Interpretation: `sessions` in the tens of thousands is normal and makes the missing index immediately painful (full scans on every logout-everywhere and every user delete). If `time_entries` is under ~50k rows, plain `CREATE INDEX` is near-instant and the `CONCURRENTLY` complication is not worth it.

**4. Prove the `project_tasks` ordering problem with a plan, not an assumption:**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM project_tasks
WHERE workspace_id = '<a real workspace id>' AND archived = false
ORDER BY name;
```

Expected today: a `Seq Scan` or an index scan plus an explicit `Sort` node — because `name` is the **third** column of `project_tasks_workspace_project_name_unique (workspace_id, project_id, name)`, so that index cannot supply the ordering. Note the `Sort` node's `actual rows` and `Sort Method: external merge` if it spills to disk — that is the concrete cost.

**5. Prove the `time_entries.updated_at` problem — this is the one behind plan `tracker-pulse-query-scaling`:**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT max(updated_at), count(*)
FROM time_entries
WHERE workspace_id = '<real id>' AND workspace_member_id = '<real id>';
```

Expected today: the planner cannot use any existing index to satisfy `max(updated_at)` because `updated_at` is in **no** index, so you will see either a full index scan over every entry for that member or a `Seq Scan`. Record the `actual rows` and `Execution Time` — that number is the per-poll cost, and `TaskSyncCoordinator.tsx:54` pays it every 30 s per open tab.

**6. Prove the leading-wildcard ILIKE cannot use an index:**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM time_entries
WHERE workspace_id = '<real id>' AND description ILIKE '%meeting%'
LIMIT 50;
```

Expected today: `Seq Scan` with a `Filter` on the `ILIKE`, scanning every row in range before `LIMIT` can apply. Confirm by comparing against the same query with a **prefix** wildcard (`description ILIKE 'meeting%'`) — if the prefix form is dramatically faster, the trigram index is worth it; if both are slow, the bottleneck is elsewhere and this index will not help.

**7. Confirm the `sessions` FK-delete behaviour:**

```sql
SELECT conname, confdeltype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'sessions'::regclass AND contype = 'f';
```

Expected: `confdeltype = 'c'` (cascade), matching `references(() => users.id, { onDelete: 'cascade' })` in `schema.ts`. PostgreSQL does not auto-index FK columns, so a cascade delete scans all of `sessions` — this is the mechanism the plan fixes.

**8. Confirm no index currently exists that already covers these predicates** (avoid duplicate indexes — they cost writes and confuse the planner):

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'time_entries';
```

Cross-check the output against this plan's proposed indexes for a leading-column overlap. A `(workspace_id, workspace_member_id, updated_at)` index **does not** cover `(workspace_id, project_id)`, so both are needed — but confirm no stray index already provides one.

**9. Check whether `drizzle/` and the live DB have drifted** (relevant because of `db:push`):

```bash
ls -1 drizzle/*.sql | tail -5
```

```sql
SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5;
```

Purpose: decide whether generating a migration is safe or whether the baseline is already inconsistent. If they disagree, **stop** and reconcile before adding indexes — otherwise `db:generate` will emit DDL for other people's un-migrated changes too.

**10. Confirm the audit report's line references before briefing an implementer:**

```bash
grep -n "ILIKE\|ilike(" src/lib/server/tracker/reports.server.ts | sed -n '1,5p'
grep -n "ilike" src/lib/server/tracker/department-dashboard.server.ts | sed -n '1,5p'
grep -n "ilike" src/lib/server/tracker/audit/audit-logger.server.ts | sed -n '1,5p'
grep -n "ilike" src/lib/server/tracker/catalogs/paginated.server.ts | sed -n '1,5p'
grep -rn "ilike" src/lib/server/integrations/external-api-data.server.ts | sed -n '1,5p'
```

Purpose: confirm the leading-wildcard call sites still exist at the cited locations before building indexes to serve them. **`[CHECK]` only** — if any call site has since changed to a prefix search, drop its index from the plan.

**What you cannot verify without extra access:** production row counts and live query latency (items 1–3, 5) require database credentials; the pre/post planner output in items 4–6 requires production-shaped data to be meaningful. On a dev database with 200 rows, every query is fast and every index looks unnecessary — do not draw conclusions from a dev-sized dataset. If you have no database access, this plan's benefit is **unverified but low-risk** (indexes on columns used by real `WHERE`/`ORDER BY` clauses); say so in the PR rather than claiming measured improvement.

---

## 1. Goal

Add the indexes that the application's actual query shapes need but that neither `src/db/schema.ts` nor any file in `drizzle/` currently declares, and restore one index that was created and then dropped while its motivating query shape remained.

- **Correctness-adjacent performance:** `sessions` has no index on `user_id` even though `accounts` has the equivalent. PostgreSQL does not auto-index foreign keys, so every "sign out everywhere", password-reset session purge, and `ON DELETE cascade` user delete sequentially scans what is normally the largest table in a Better Auth deployment.
- **Query-shape mismatches:** `project_tasks` lacks the `(workspace_id, name)` index that `projects` was given in migration 0004 for the identical `WHERE workspace_id = ? AND archived = false ORDER BY name` pattern — the ordering column is the third column of the existing unique index, so it cannot serve the sort.
- **Unindexed filter columns:** `time_entries.updated_at` appears in no index, which breaks `pulse.server.ts`'s `max(updated_at)` (see plan `tracker-pulse-query-scaling`) and the incremental-sync API's `updatedFilter`; `time_entries` also lacks a `(workspace_id, project_id)` composite that the catalog stats aggregates filter on.
- **Reclaim a dropped index:** migration 0004 created `projects_name_trgm_idx` with a comment correctly explaining that a btree cannot serve a leading-wildcard `ILIKE`; migration 0005 dropped it. Every leading-wildcard `ILIKE '%term%'` search it was built for still exists, and the `pg_trgm` extension is still installed.
- **Fix a lie in the source:** `schema.ts:872-877` asserts that a separate trigram index is unnecessary. That claim is false for the queries the code actually issues and should be corrected in the same change, so the next reader is not misled the way the previous one was.

Who benefits: users hitting slow member-management, catalog, and search paths as their workspace's `time_entries` and `sessions` tables grow — and the infrastructure bill, since several of these queries currently degrade linearly with history.

## 2. Context Summary

### The index conventions in this repo

Indexes are declared in Drizzle's table-callback form in `src/db/schema.ts`, and migrations are generated by `drizzle-kit` into `drizzle/`. Convention example (`projects`, `schema.ts`):

```ts
    index('projects_client_id_idx').on(table.clientId),
    // Supports the catalog page query: WHERE workspace_id = ? ORDER BY name.
    // Without this, listing projects (5k+ rows) does a full seq scan + sort on
    // every page load. With it, pagination is a bounded, pre-sorted index scan.
    // This index also serves name-ordered search, so a separate trigram index
    // is unnecessary — the planner prefers this one given ORDER BY name LIMIT.
    index('projects_workspace_name_idx').on(table.workspaceId, table.name),
```

Two things about that block matter for this plan.

**First, the final sentence is wrong**, and it is exactly the reasoning that led to the trigram index being dropped. It is only true if search is prefix-anchored (`name ILIKE 'term%'`, which a btree can serve). Every actual search path uses a leading wildcard (`name ILIKE '%term%'`), which a btree categorically cannot serve. `drizzle/0004_purple_tyrannus.sql` had it right:

```sql
-- pg_trgm powers substring (ILIKE '%term%') search via the GIN index below.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_workspace_name_idx" ON "projects" USING btree ("workspace_id","name");--> statement-breakpoint
-- Substring search on project names (a btree cannot serve a leading-wildcard ILIKE).
CREATE INDEX IF NOT EXISTS "projects_name_trgm_idx" ON "projects" USING gin ("name" gin_trgm_ops);
```

and `drizzle/0005_mature_lila_cheney.sql` then did:

```sql
DROP INDEX "projects_name_trgm_idx";
```

leaving the extension installed and the comment above the btree index asserting the opposite of what 0004 documented.

**Second, the naming convention** is `<table>_<columns>_idx`, with `_unique` for unique indexes. This plan follows it so the new names sort predictably next to their neighbours.

### Migration mechanics

- `package.json` scripts: `db:generate` (drizzle-kit generate), `db:migrate`, `db:push`, `db:studio`. **`db:push` exists**, which means schema and migration history can drift — this plan requires a parity check (Verify First item 9) rather than assuming `drizzle/` is the full story.
- Next migration number is **0024** (`drizzle/` currently ends at `0023_cold_typhoid_mary.sql`). `drizzle-kit` names it `0024_<generated_name>.sql`; do not hand-name it.
- Migration 0008 is the precedent for a hand-written migration that does more than `drizzle-kit` would generate (it includes a data backfill `INSERT ... SELECT`). This plan's trigram statements and any `CONCURRENTLY` edits follow that precedent.
- `drizzle/0008` also shows the `--> statement-breakpoint` separator convention used between statements.

### What already exists (so nothing is duplicated)

`time_entries` currently carries (from `schema.ts` and migrations 0004/0018):

| Index                                         | Columns                                           | Serves                                   |
| --------------------------------------------- | ------------------------------------------------- | ---------------------------------------- |
| `time_entries_workspace_member_started_idx`   | `(workspace_id, workspace_member_id, started_at)` | Date-range entry lists                   |
| `time_entries_workspace_started_idx`          | `(workspace_id, started_at)`                      | Workspace-wide range scans               |
| `time_entries_workspace_ended_idx`            | `(workspace_id, ended_at)`                        | `ended_at IS NULL` running-timer lookups |
| `time_entries_workspace_member_ended_idx`     | `(workspace_id, workspace_member_id, ended_at)`   | Added in 0018                            |
| `time_entries_workspace_started_billable_idx` | `(workspace_id, started_at) WHERE billable`       | Partial, billable-only scans             |
| `time_entries_project_id_idx`                 | `(project_id)`                                    | Single-column; **not** workspace-scoped  |
| `time_entries_task_id_idx`                    | `(task_id)`                                       | Single-column                            |

**No index contains `updated_at`.** That is the gap behind the pulse and the incremental-sync API.

`sessions` currently carries **only** its primary key (`id`) and `sessions_token_unique (token)`. Contrast `accounts`, which got `accounts_user_id_idx` in migration 0000:

```sql
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");
```

`sessions` was simply missed — the same shape of oversight, on the sibling table.

`project_tasks` currently carries:

```ts
    uniqueIndex('project_tasks_workspace_project_name_unique').on(
      table.workspaceId,
      table.projectId,
      table.name,
    ),
    index('project_tasks_project_id_idx').on(table.projectId),
```

The unique index's column order is `(workspace_id, project_id, name)`. The bootstrap query is `WHERE workspace_id = ? AND archived = false ORDER BY name` — which does not constrain `project_id`, so the unique index cannot supply the ordering across projects. `projects` solved the identical problem with `projects_workspace_name_idx`.

### Assumptions and missing information

| Assumption                                                                                  | Default if unverified                                                                                                            | How to resolve                   |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Production row counts are large enough for these indexes to matter                          | Assume yes for `sessions` and `time_entries` (both grow monotonically); treat the trigram indexes as "verify with EXPLAIN first" | Verify First items 3, 6          |
| `pg_trgm` is still installed in production                                                  | Assume yes (0004 added it, nothing removes it)                                                                                   | Verify First item 2              |
| `drizzle/` is in sync with the live database                                                | Assume yes, but **check before generating**                                                                                      | Verify First item 9              |
| Current `time_entries` volume is small enough that plain `CREATE INDEX` locks are tolerable | Assume yes; if `time_entries` exceeds ~500k rows, switch to `CONCURRENTLY`                                                       | Verify First items 3, 5          |
| No workspace stores a payroll cutoff > 28                                                   | Irrelevant to this plan — noted only because plan `fix-payroll-period-test-time-bomb` depends on it                              | That plan's Verify First item 5b |

## 3. Scope

### `[CHECK]` — verification only, no code change

- `[CHECK]` Dump the live index inventory for all seven affected tables from `pg_indexes` and diff it against `schema.ts`, so "missing" is proven rather than assumed (Verify First item 1).
- `[CHECK]` Confirm `pg_trgm` is installed and record its version (Verify First item 2).
- `[CHECK]` Capture `EXPLAIN (ANALYZE, BUFFERS)` **before** output for the four representative queries — the `project_tasks` ordering query, the pulse aggregate, the leading-wildcard ILIKE, and the catalog stats aggregate (Verify First items 4, 5, 6).
- `[CHECK]` Measure `pg_stat_user_tables.n_live_tup` for each affected table to gauge both lock duration and whether each index earns its write cost (Verify First item 3).
- `[CHECK]` Verify the `sessions → users` FK is `ON DELETE cascade` and therefore scan-prone without an index (Verify First item 7).
- `[CHECK]` Check for existing indexes that already lead with the same columns, to avoid duplicate indexes (Verify First item 8).
- `[CHECK]` Verify `drizzle/` is in sync with `drizzle.__drizzle_migrations` before generating anything (Verify First item 9).
- `[CHECK]` Re-confirm the leading-wildcard `ILIKE` call sites still exist at the cited paths (`reports.server.ts:192-195`, `department-dashboard.server.ts:1055`, `external-api-data.server.ts:509`, `audit-logger.server.ts:171-172`, `catalogs/paginated.server.ts:262`).
- `[CHECK]` After deploy: confirm each new index records `idx_scan > 0` under normal traffic; an index with `idx_scan = 0` is pure write overhead and should be dropped.

### `[FIX]` — code changes

- `[FIX]` Add `sessions_user_id_idx` on `sessions (user_id)` — declared in `schema.ts` and generated into migration 0024.
- `[FIX]` Add `project_tasks_workspace_name_idx` on `project_tasks (workspace_id, name)`.
- `[FIX]` Add `time_entries_ws_member_updated_idx` on `time_entries (workspace_id, workspace_member_id, updated_at)`.
- `[FIX]` Add `time_entries_workspace_updated_idx` on `time_entries (workspace_id, updated_at)` — for the workspace-scoped incremental-sync filter, which is not covered by the member-scoped variant.
- `[FIX]` Add `time_entries_workspace_project_idx` on `time_entries (workspace_id, project_id)` — the catalog stats filter is `workspace_id = ? AND project_id IN (...)`, which the existing single-column `time_entries_project_id_idx` serves only with a heap re-check.
- `[FIX]` Add the trigram indexes (contingent on Open Question 2): `projects_name_trgm_idx`, `time_entries_description_trgm_idx`, `audit_logs_actor_email_trgm_idx`, plus `clients_name_trgm_idx` and `tags_name_trgm_idx` if their search paths are confirmed leading-wildcard.
- `[FIX]` Correct the false comment at `schema.ts:872-877` so it no longer claims a trigram index is unnecessary, and explain the prefix-vs-leading-wildcard distinction that makes it true or false.
- `[FIX]` Ensure the migration adds `CREATE EXTENSION IF NOT EXISTS pg_trgm;` if Verify First item 2 shows it missing from any environment (dev, preview, or prod).

## 4. Out of Scope

- **Any query rewriting.** This plan adds indexes only. Rewriting the leading-wildcard searches to prefix searches, replacing `count(*)` with window functions, adding date bounds to aggregates, and removing redundant round-trips all belong to plan `bound-unbounded-query-result-sets` and plan `remove-redundant-database-round-trips`.
- **The `pulse.server.ts` query change itself.** This plan provides the index the pulse needs; changing the pulse's query shape or introducing an `entriesVersion` counter is plan `tracker-pulse-query-scaling`.
- **Replacing `time_entries_project_id_idx` with the new composite.** The single-column index may still serve other plans; drop it only after checking `idx_scan` and confirming nothing else relies on it. Recorded as Open Question 4.
- **Adding an index to back the `startTimer` no-active-timer check** (a partial unique index `WHERE ended_at IS NULL`). That is a correctness fix with behavioural consequences (it would reject rather than race) and needs its own plan.
- **Changing `schema.ts` beyond the four index blocks and the one comment.** No column, type, enum, or FK changes.
- **Tuning `work_mem`, `random_page_cost`, autovacuum, or any database server setting.**
- **Adding a `sessions` retention/cleanup job** — related (the table grows), but a separate concern.
- **Backfilling or repairing any data.**

## 5. Affected Files and Folders

```txt
Tickr/
├── src/
│   └── db/
│       └── schema.ts                              (MODIFY)
│             - sessions (L114-130): add a table-callback block declaring
│               index('sessions_user_id_idx').on(table.userId).
│               NOTE: sessions currently has NO second-argument callback,
│               so the whole `(table) => [...]` block must be added.
│             - project_tasks (L881-911): add
│               index('project_tasks_workspace_name_idx')
│                 .on(table.workspaceId, table.name)
│               alongside the existing unique + project_id indexes.
│             - time_entries (L1003-1072): add three indexes to the existing
│               callback array — the two updated_at variants and the
│               (workspace_id, project_id) composite.
│             - projects (L842-879): CORRECT the false comment at L872-877
│               ("a separate trigram index is unnecessary"). Replace with an
│               accurate statement about prefix vs leading-wildcard ILIKE.
│             - clients / tags / audit_logs: add *_trgm_idx GinIndex
│               declarations IF Open Question 2 resolves to yes.
│
├── drizzle/
│   ├── 0024_<generated_name>.sql                  (NEW)
│   │     - Generated by `db:generate`, then HAND-REVIEWED and possibly
│   │       hand-edited to add:
│   │         * CREATE EXTENSION IF NOT EXISTS pg_trgm;  (if needed)
│   │         * CREATE INDEX CONCURRENTLY ...            (if OQ1 = yes)
│   │       Following the 0008 precedent for a hand-touched migration.
│   │
│   └── meta/
│       └── 0024_snapshot.json                     (NEW — generated)
│
├── package.json                                   (no change)
│       - db:generate / db:migrate / db:push already exist; no new script
│         is required. Listed here because the workflow depends on them.
│
└── plans/
    └── add-missing-database-indexes/
        └── PLAN.md                                (NEW)
```

No application code, component, route, or server function is modified. No dependencies change.

## 6. Database Design

All statements below are what migration 0024 must ultimately contain. Drizzle declarations are given alongside each so `schema.ts` and the migration stay in lockstep — which matters because `db:push` exists and can otherwise apply a schema-declared index with no migration record.

### 6.1 `sessions.user_id` — the missed sibling of `accounts_user_id_idx`

Drizzle (`schema.ts` — add a new table callback; `sessions` currently has none):

```ts
export const sessions = pgTable(
  'sessions',
  {
    // ...existing columns unchanged...
    userId: varchar('user_id', { length: 30 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    // Every "sign out everywhere" / password-reset purge filters on user_id, and
    // the ON DELETE cascade from users must find referencing sessions rows.
    // PostgreSQL does not auto-index foreign keys. Mirrors accounts_user_id_idx.
    index('sessions_user_id_idx').on(table.userId),
  ],
)
```

SQL:

```sql
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");
```

### 6.2 `project_tasks (workspace_id, name)` — the same fix `projects` already got

Drizzle (`project_tasks`, add to the existing callback array):

```ts
    // Supports the bootstrap query: WHERE workspace_id = ? AND archived = false
    // ORDER BY name. The (workspace_id, project_id, name) unique index cannot
    // serve this ordering because project_id is unconstrained in that query.
    // Mirrors projects_workspace_name_idx from migration 0004.
    index('project_tasks_workspace_name_idx').on(table.workspaceId, table.name),
```

SQL:

```sql
CREATE INDEX "project_tasks_workspace_name_idx" ON "project_tasks" USING btree ("workspace_id","name");
```

### 6.3 `time_entries` — the two `updated_at` variants

Both are needed and neither substitutes for the other: the pulse query is member-scoped, while the incremental-sync API is workspace-scoped.

Drizzle (`time_entries`, add to the existing callback array):

```ts
    // Supports max(updated_at) / count(*) over one member's entries
    // (pulse.server.ts). Without updated_at in the index the planner cannot do
    // a backward index scan, so max() reads every entry for that member.
    // Bumps on every entry write via updatedAt's $onUpdate.
    index('time_entries_ws_member_updated_idx').on(
      table.workspaceId,
      table.workspaceMemberId,
      table.updatedAt,
    ),
    // Supports the workspace-wide incremental-sync filter
    // (external-api-data.server.ts: gte(updatedAt, since)).
    index('time_entries_workspace_updated_idx').on(
      table.workspaceId,
      table.updatedAt,
    ),
```

SQL:

```sql
CREATE INDEX "time_entries_ws_member_updated_idx" ON "time_entries" USING btree ("workspace_id","workspace_member_id","updated_at");--> statement-breakpoint
CREATE INDEX "time_entries_workspace_updated_idx" ON "time_entries" USING btree ("workspace_id","updated_at");
```

### 6.4 `time_entries (workspace_id, project_id)` — for the catalog stats aggregates

The catalog stats queries filter on `workspace_id = ? AND project_id IN (...)` and `GROUP BY project_id` (`catalogs/paginated.server.ts:28-68`, `:70-110`). The existing `time_entries_project_id_idx` is single-column, so using it means an index scan on `project_id` followed by a heap filter on `workspace_id`.

Drizzle:

```ts
    // Catalog stats filter on workspace_id AND project_id together
    // (catalogs/paginated.server.ts). The single-column project_id index
    // forces a heap re-check on workspace_id.
    index('time_entries_workspace_project_idx').on(
      table.workspaceId,
      table.projectId,
    ),
```

SQL:

```sql
CREATE INDEX "time_entries_workspace_project_idx" ON "time_entries" USING btree ("workspace_id","project_id");
```

### 6.5 Trigram indexes for leading-wildcard `ILIKE` (contingent on Open Question 2)

`drizzle-kit` will not generate these from a plain `index()` call — they need the `using('gin', ...)` form with a raw `sql` operator class, verified against `drizzle-orm/pg-core/indexes.d.ts` (`using(method: PgIndexMethod, ...columns)`).

Drizzle:

```ts
import { sql } from 'drizzle-orm'

// projects — reclaim what migration 0005 dropped:
    index('projects_name_trgm_idx').using('gin', sql`${table.name} gin_trgm_ops`),

// time_entries — the widest, highest-payoff target:
    index('time_entries_description_trgm_idx').using(
      'gin',
      sql`${table.description} gin_trgm_ops`,
    ),

// audit_logs:
    index('audit_logs_actor_email_trgm_idx').using(
      'gin',
      sql`${table.actorEmail} gin_trgm_ops`,
    ),
```

SQL:

```sql
CREATE EXTENSION IF NOT EXISTS "pg_trgm";--> statement-breakpoint
CREATE INDEX "projects_name_trgm_idx" ON "projects" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "time_entries_description_trgm_idx" ON "time_entries" USING gin ("description" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "audit_logs_actor_email_trgm_idx" ON "audit_logs" USING gin ("actor_email" gin_trgm_ops);
```

The `CREATE EXTENSION` line is required if Verify First item 2 shows `pg_trgm` missing in any target environment; it is idempotent, so it is safe to include unconditionally. Note it **cannot** run inside a transaction in some managed environments — if `db:migrate` rejects it, move it into a separate migration or apply it manually before running 0024.

Optionally, `clients (name)` and `tags (name)` if their search paths are confirmed leading-wildcard in Verify First item 10.

### 6.6 The comment that must be corrected

`schema.ts`, inside the `projects` callback — currently reads:

```ts
// This index also serves name-ordered search, so a separate trigram index
// is unnecessary — the planner prefers this one given ORDER BY name LIMIT.
```

This is false. It is true only for a **prefix** search (`name ILIKE 'term%'`), which a btree can serve; every actual search path is a **leading wildcard** (`name ILIKE '%term%'`), which no btree can serve. Replace with something like:

```ts
// This index serves name-ordered listing and PREFIX search
// (name ILIKE 'term%'). It cannot serve a leading-wildcard search
// (name ILIKE '%term%'), which is what the catalog search actually issues —
// see projects_name_trgm_idx and migration 0004's original rationale.
```

Correcting this in the same change is not cosmetic: it is the reasoning that caused the index to be dropped in 0005, and leaving it in place invites the same removal again.

### 6.7 Seed data

**N/A.** No new tables or columns, so no seed changes. `drizzle/0008_analytics_daily_rollups.sql` is the precedent for a backfill-bearing migration, but nothing here needs one — indexes are built from existing rows automatically.

## 7. Backend Implementation

**N/A for server functions and API routes.** No endpoint, Zod schema, or service function changes. This plan is schema + migration only. Two backend-adjacent notes nonetheless apply.

### 7.1 Nothing needs to reference the new indexes by name

Drizzle's query builder lets PostgreSQL choose indexes; no application code names them. This means the change is invisible to every caller — which is what makes it low-risk and also why its benefit must be measured with `EXPLAIN` rather than observed in a feature.

### 7.2 Concurrency and lock behaviour (the one operational decision)

Plain `CREATE INDEX` takes an `ACCESS EXCLUSIVE` lock on the table for the duration of the build, blocking reads **and** writes. `drizzle-kit` generates the plain form. Options:

- **Plain `CREATE INDEX`** (default). At small table sizes this is milliseconds and the lock is irrelevant.
- **`CREATE INDEX CONCURRENTLY`**, hand-edited into the migration. Builds without blocking writes, but **cannot run inside a transaction**, and if it fails it leaves an `INVALID` index that must be dropped and retried. Verify First item 3 decides which is appropriate.

If `CONCURRENTLY` is chosen, the implementer must confirm whether `db:migrate` wraps statements in a transaction for this project; if it does, the concurrent statements must be applied out-of-band (or the migration split) rather than silently failing. **This is Open Question 1 and must be answered before writing DDL.**

## 8. Frontend Implementation

**N/A.** No component, route, hook, or style changes. The indexes are invisible to the client. The only user-visible effect is latency on existing screens (member management, catalogs, audit logs, search) and it should be measured rather than assumed — see Section 10.

## 9. Access Control

**N/A.** No permission, role, endpoint, or tenant-scoping logic changes. Every index here is a performance artifact over columns that queries _already_ filter by within their existing workspace scoping; adding an index cannot widen or narrow what any role can read. Section 9 is included for template completeness.

For the record, the indexes serve these already-scoped paths: catalog listing (`catalogs.manage` / read paths), audit logs (`activity.view`), session management (Better Auth internal), and the pulse (`requireWorkspaceAccess`, self-scoped). No matrix is needed because no authorization decision changes.

## 10. Validation

> **Environment note:** `pnpm <script>` fails in this sandbox with `EPERM: operation not permitted, mkdir '~/Library/pnpm/.tools/...'`. Use the direct binaries below, and drive drizzle-kit via `npx` with the dotenv wrapper spelled out.

### Pre-change baseline (capture before generating anything)

```bash
# Record the current planner output for the four representative queries.
# Paste the EXPLAIN (ANALYZE, BUFFERS) results from Verify First items 4, 5, 6
# into the PR description so the after-state has something to compare against.
```

```bash
# Confirm the schema is internally consistent before touching it.
./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

### Generate and review the migration

```bash
# db:generate via the direct binary + dotenv, since `pnpm` is unusable here.
npx dotenv -e .env.local -- npx drizzle-kit generate

# Review the generated SQL by hand — do NOT apply it blind.
ls -1t drizzle/*.sql | head -1 | xargs cat
```

Review checklist for the generated file:

- [ ] Exactly the intended `CREATE INDEX` statements appear; no unrelated DDL from pre-existing schema drift.
- [ ] `--> statement-breakpoint` separators are present between statements.
- [ ] If OQ2 = yes, the trigram statements use `USING gin (... gin_trgm_ops)` and the `CREATE EXTENSION` line is present if needed.
- [ ] If OQ1 = yes, the statements read `CREATE INDEX CONCURRENTLY` and the file is confirmed not to be wrapped in a transaction.

### Apply to a non-production branch first

```bash
# Apply against the preview/branch database, never production first.
npx dotenv -e .env.local -- npx drizzle-kit migrate
```

Then re-run the Verify First `EXPLAIN (ANALYZE, BUFFERS)` queries against that branch **with production-shaped data** and compare:

- [ ] `project_tasks` ordering query: the `Sort` node is gone, and `Sort Method: external merge` no longer appears.
- [ ] Pulse aggregate query: `max(updated_at)` uses a backward index scan; `actual rows` no longer equals the member's lifetime entry count.
- [ ] Leading-wildcard ILIKE: the `Seq Scan` is replaced by a `Bitmap Index Scan` on the trigram index.
- [ ] Catalog stats aggregate: `time_entries_workspace_project_idx` is chosen over the single-column index.

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

> ⚠️ **Pre-existing failure warning.** `./node_modules/.bin/vitest run` currently reports **one** failure: the first test in `src/lib/time-tracker/payroll-periods.test.ts`, which is a date-dependent time bomb unrelated to this plan (see plan `fix-payroll-period-test-time-bomb`). Expect **374 passed, 1 failed** on a clean checkout. That failure is **not** caused by adding indexes. Do not "fix" it here — it is tracked separately and its fix is a one-line test change.

### Schema ↔ migration parity (required, because `db:push` exists)

```bash
# Confirm drizzle-kit sees no pending diff after the migration is applied.
# A clean run reports "No schema changes, nothing to migrate".
npx dotenv -e .env.local -- npx drizzle-kit generate
```

If it emits a second migration, `schema.ts` and `drizzle/` have diverged — investigate before merging.

```sql
-- Confirm every new index physically exists.
SELECT tablename, indexname
FROM pg_indexes
WHERE indexname IN (
  'sessions_user_id_idx',
  'project_tasks_workspace_name_idx',
  'time_entries_ws_member_updated_idx',
  'time_entries_workspace_updated_idx',
  'time_entries_workspace_project_idx',
  'projects_name_trgm_idx',
  'time_entries_description_trgm_idx',
  'audit_logs_actor_email_trgm_idx'
)
ORDER BY tablename, indexname;
```

```sql
-- Confirm none of them is INVALID (the failure mode of a failed CONCURRENTLY build).
SELECT c.relname AS index_name, i.indisvalid, i.indisready
FROM pg_index i
JOIN pg_class c ON c.oid = i.indexrelid
WHERE c.relname LIKE '%_trgm_idx'
   OR c.relname IN ('sessions_user_id_idx','project_tasks_workspace_name_idx',
                    'time_entries_ws_member_updated_idx',
                    'time_entries_workspace_updated_idx',
                    'time_entries_workspace_project_idx');
```

Expected: `indisvalid = true` and `indisready = true` for every row.

### Post-deploy verification (the step that proves the indexes are actually used)

```sql
-- After a day of normal traffic, check that nothing landed unused.
-- idx_scan = 0 on a new index means pure write overhead.
SELECT relname AS table_name, indexrelname AS index_name, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE indexrelname IN (
  'sessions_user_id_idx',
  'project_tasks_workspace_name_idx',
  'time_entries_ws_member_updated_idx',
  'time_entries_workspace_updated_idx',
  'time_entries_workspace_project_idx',
  'projects_name_trgm_idx',
  'time_entries_description_trgm_idx',
  'audit_logs_actor_email_trgm_idx'
)
ORDER BY idx_scan ASC;
```

Decision rule: any index still at `idx_scan = 0` after a full traffic cycle should be **dropped in a follow-up migration** rather than left in place. `time_entries_workspace_updated_idx` and the audit trigram index are the most likely candidates if their features are rarely exercised — that is a finding, not a failure.

### Definition of done

- [ ] Migration 0024 applied to production with all indexes `indisvalid`.
- [ ] `drizzle-kit generate` reports no pending diff (parity restored).
- [ ] The four `EXPLAIN` comparisons show the intended plan changes.
- [ ] `tsc`, `eslint`, `vite build` all exit 0; test suite shows only the known pre-existing payroll failure (or zero failures if that plan has landed).
- [ ] `pg_stat_user_indexes` shows non-zero `idx_scan` for each index, or a follow-up drop is filed.

## 11. Sequencing

Four phases, ordered so the highest-value/lowest-risk indexes land first and the contingent work stays separable.

- [ ] **Phase 0 — Verify (no code).** Run the entire Verify First block. Record row counts, the four `EXPLAIN` baselines, and the `pg_trgm`/parity checks. **Answer Open Questions 1 and 2 here** — do not proceed to Phase 2 without them. Exit criteria: a filled-in index inventory and a recorded lock strategy.
- [ ] **Phase 1 — Uncontroversial indexes (ship independently).** `sessions_user_id_idx`, `project_tasks_workspace_name_idx`, `time_entries_ws_member_updated_idx`, `time_entries_workspace_updated_idx`, `time_entries_workspace_project_idx`. These are pure additions on columns already used by existing `WHERE`/`ORDER BY` clauses, with no behavioural coupling. Add to `schema.ts`, generate 0024, review, apply to a branch, verify plans, merge. This phase alone delivers most of the value.
- [ ] **Phase 2 — Comment correction (ship with Phase 1 or immediately after).** Fix the false trigram comment at `schema.ts:872-877`. Zero runtime effect; prevents the bad reasoning from causing another drop. Deliberately separate so that if a reviewer disputes the trigram decision, the comment fix is not held hostage to it.
- [ ] **Phase 3 — Trigram indexes (contingent on Open Question 2).** Only if Verify First item 6 shows a real win for the leading-wildcard form. Introduce `projects_name_trgm_idx` first (reclaiming a previously-justified index, so the decision is already argued in 0004), measure, then extend to `time_entries.description` and `audit_logs.actor_email` if the write-cost tradeoff is acceptable.
- [ ] **Phase 4 — Post-deploy audit.** Re-run the `pg_stat_user_indexes` check after a traffic cycle; drop anything at `idx_scan = 0`; record the results back into this plan's Status checklist.

Phase 1 is the recommended minimum shippable unit. Phases 0 and 1 together are a single focused PR.

## 12. Risks & Considerations

| Risk                                                                                                                                                                              | Likelihood                                    | Impact                                                  | Mitigation                                                                                                                                                                                                                                                                                       | Rollback                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CREATE INDEX` takes an `ACCESS EXCLUSIVE` lock on a large `time_entries`, blocking reads and writes for the build duration.                                                      | Medium on a mature tenant                     | High — user-visible outage during the build             | Verify First item 3 to size the tables first. If `time_entries` is large (> ~500k rows), use `CREATE INDEX CONCURRENTLY` (Open Question 1) and apply outside peak hours. Test the migration on a branch restored from production-sized data.                                                     | **Database:** `DROP INDEX "index_name";` for each new index — instant and non-destructive, since indexes hold no data. No data repair is needed. **Code:** revert `schema.ts` and delete migration 0024; then `drizzle-kit generate` to confirm parity.                              |
| `CREATE INDEX CONCURRENTLY` fails partway, leaving an `INVALID` index that the planner ignores while still costing every write.                                                   | Medium if `CONCURRENTLY` is used              | Medium — silent write overhead, no query benefit        | Run the `indisvalid`/`indisready` check in Section 10 immediately after applying. If any index is invalid: `DROP INDEX CONCURRENTLY "name";` and retry. Never leave an invalid index in place.                                                                                                   | Same as above — drop and retry, or drop and abandon.                                                                                                                                                                                                                                 |
| The trigram GIN index on `time_entries.description` adds write amplification to the **hottest write table** in the app (every timer start/stop/update).                           | Medium                                        | Medium — slower entry writes to speed up rarer searches | Gate on Verify First item 6 (does the trigram index actually change the plan for the real query?). If the gain is marginal, **ship without it** — the other five indexes are the bulk of the value. Never add all trigram indexes at once; introduce `projects_name_trgm_idx` first and measure. | `DROP INDEX "time_entries_description_trgm_idx";` — instant, no data impact. The broader fallback is to switch the searches to prefix-anchored `ILIKE 'term%'` and rely on the existing btree indexes, which is a code change belonging to plan `bound-unbounded-query-result-sets`. |
| `CREATE EXTENSION IF NOT EXISTS pg_trgm` fails inside `db:migrate` because the managed environment disallows extensions in a transaction, or the role lacks rights.               | Low (extension is already installed per 0004) | Medium — whole migration aborts                         | Verify First item 2 confirms it is present, making the statement a no-op. If it must run, apply it out-of-band before migration 0024.                                                                                                                                                            | Remove the `CREATE EXTENSION` line from 0024; apply manually. No index is affected.                                                                                                                                                                                                  |
| `db:push` has already created one of these indexes in production, so the migration fails with "already exists".                                                                   | Low                                           | Low — migration aborts, no damage                       | Verify First item 1 dumps `pg_indexes` first and removes any existing index from scope. Use `CREATE INDEX IF NOT EXISTS` in the hand-edited migration if uncertainty remains.                                                                                                                    | Drop the duplicate index and re-run, or make the migration idempotent with `IF NOT EXISTS`.                                                                                                                                                                                          |
| `schema.ts` and `drizzle/` have drifted, so `db:generate` emits DDL for unrelated changes.                                                                                        | Low–Medium (because `db:push` exists)         | Medium — surprising, hard-to-review migration           | Verify First item 9 checks parity _before_ generating. Read the generated file line by line; if unrelated DDL appears, stop and reconcile the baseline first.                                                                                                                                    | Delete the generated migration and meta snapshot; investigate the drift; do not apply.                                                                                                                                                                                               |
| An index lands unused (`idx_scan = 0`), costing write throughput for nothing.                                                                                                     | Medium for the marginal ones                  | Low — wasted write budget, easily reversed              | Post-deploy `pg_stat_user_indexes` check in Section 10, with an explicit follow-up drop rather than leaving it.                                                                                                                                                                                  | Follow-up `DROP INDEX` migration. Cheap because indexes are derived data.                                                                                                                                                                                                            |
| **No money or user data is modified by this plan**, so the blast radius is bounded: indexes are derived structures that can be created and dropped without touching a single row. | —                                             | —                                                       | This is the reason the plan is attractive as an early win — and also why the _only_ serious risk is the build-time lock, not correctness.                                                                                                                                                        | See the row above; every rollback path is `DROP INDEX` plus a code revert.                                                                                                                                                                                                           |

## 13. Open Questions

- [ ] **Q1 — Plain `CREATE INDEX` or `CREATE INDEX CONCURRENTLY`?** Plain is simpler, is what `drizzle-kit` generates, and is fine on small tables; `CONCURRENTLY` avoids blocking writes but cannot run inside a transaction and leaves `INVALID` indexes on failure. **Blocked on:** Verify First item 3 (row counts) — if `time_entries` is under ~100k rows, plain is clearly correct and this question is moot. **Also blocked on:** whether `db:migrate` wraps statements in a transaction for this project, which determines whether `CONCURRENTLY` is even usable through the normal workflow.
- [ ] **Q2 — Are the trigram indexes worth the write cost, especially on `time_entries`?** The leading-wildcard `ILIKE` call sites are real, and `projects_name_trgm_idx` was justified in writing in migration 0004 before being dropped in 0005. But `time_entries.description` is the app's hottest write column, and a GIN index there taxes every timer start/stop. **Options:** (a) all five trigram indexes; (b) `projects_name_trgm_idx` only, as a reclaim; (c) none, and instead convert the searches to prefix-anchored `ILIKE 'term%'` to reuse the existing btree indexes. **Blocked on:** Verify First item 6 — if the prefix form is not meaningfully faster than the leading-wildcard form on production-sized data, the bottleneck is elsewhere and none of these help.
- [ ] **Q3 — Should `time_entries_project_id_idx` be dropped now that `time_entries_workspace_project_idx` exists?** The composite has the single-column index as a prefix, so the single-column index becomes largely redundant and costs write throughput. **Recommendation:** check `idx_scan` on the old index first; do not drop it in the same migration that adds the new one, so a rollback stays trivial. **Blocked on:** post-deploy `pg_stat_user_indexes` data.
- [ ] **Q4 — Does anything need a `(workspace_id, workspace_member_id, updated_at)` index _without_ the member column, or vice versa?** Both variants are proposed because the pulse is member-scoped and the incremental-sync API is workspace-scoped. If the incremental-sync endpoint turns out to be unused, `time_entries_workspace_updated_idx` is dead weight. **Blocked on:** confirming which of the two features is actually exercised in production (Verify First item 10 covers the search paths; this needs a usage check on `/api/v1` traffic).
- [ ] **Q5 — Should the `sessions` table get a retention/cleanup job as well?** The missing index makes `user_id` filters scan; a growing table makes _every_ scan slower regardless. These are complementary and the audit surfaced the index gap only. **Recommendation:** out of scope here, but file it — the index buys headroom, not immunity. **Blocked on:** whether session rows are currently accumulating unbounded (a `SELECT count(*) FROM sessions` grouped by age would answer it).
- [ ] **Q6 — Should `db:push` be removed from `package.json`?** It exists alongside a fully-migrated `drizzle/` history, and its presence is why Verify First item 9 and the parity check are required at all. Removing it would make schema ↔ migration drift structurally impossible. **Recommendation:** worth a decision, but it is a workflow change affecting every developer, not a database change — out of scope for this plan. **Blocked on:** team agreement.
