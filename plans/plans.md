# Flow Track — Performance Improvement Plans

> Based on performance audit conducted 2026-05-20.
> Target: support 100–300 users on a single workspace.

---

## Priority 1 — Critical (must fix before scaling)

### 1.1 Fix GSheets sync queue reliability ✅ DONE

**Files changed:**

- `src/db/schema.ts` — added `pending_gsheets_syncs` table
- `src/lib/server/gsheets/sync-queue.ts` — replaced in-memory queue with DB insert
- `src/lib/server/tracker/timer.server.ts` — await enqueue calls
- `src/lib/server/tracker/manual-entries.server.ts` — await enqueue calls
- `src/routes/api/cron/sync-gsheets.ts` — process pending workspaces, delete row on success (retry on failure)
- `vercel.json` — cron schedule changed from daily (`0 15 * * *`) to every 5 min (`*/5 * * * *`)
- `drizzle/0002_heavy_revanche.sql` — migration applied

**How it works now:**

1. `enqueueTimeEntry()` inserts a row into `pending_gsheets_syncs` (workspace_id PK — idempotent)
2. Cron fires every 5 minutes, finds all pending workspaces with a sheet URL, runs a full sync, then deletes the row
3. On sync failure the row stays — it will be retried on the next cron tick
4. The entire in-memory queue (`setTimeout`, retries, `Map`) has been removed

---

### 1.2 Switch DB driver to Neon Serverless ✅ DONE

**Files changed:**

- `src/db.ts` — replaced `pg.Pool` + `drizzle-orm/node-postgres` with `neon()` + `drizzle-orm/neon-http`
- `package.json` — added `@neondatabase/serverless`

**How it works now:**

- Each DB call is an HTTP request — zero persistent connections, zero connection pool exhaustion
- `globalThis.__db` dev hack removed (not needed with stateless HTTP driver)
- `drizzle.config.ts` uses `DIRECT_URL` for migrations and is unchanged

---

## Priority 2 — High (will degrade under real usage)

### 2.1 Move analytics aggregation to SQL ✅ DONE

**Files changed:**

- `src/lib/server/tracker/analytics.server.ts` — full rewrite of aggregation layer

**Problem solved:** `aggRows` was fetching every time entry in the date range (up to 30k rows) into JS memory, then running a second `inArray` with all those entry IDs to fetch tags.

**How it works now:** 9 queries run in parallel via `Promise.all`:

1. **Summary totals** — single aggregate row (`SUM`, `CASE WHEN billable`)
2. **Daily totals** — `GROUP BY DATE(started_at)` → backfill zeros in JS for empty dates
3. **Project totals** — `GROUP BY project_id` with LEFT JOIN to projects
4. **Top tags** — `GROUP BY tag_id` with INNER JOIN through `time_entry_tags` + `LIMIT 5`
5. **Department totals** — `GROUP BY department_id` with `COUNT(DISTINCT member_id)` + `LIMIT 5` (skipped for personal scope)
6. **Top tasks** — `GROUP BY description` with `CASE WHEN TRIM = ''` + `LIMIT 8` (personal scope only)
7. **Paginated entries** — unchanged (50/page with tag fetch for those 50 IDs only)
8. **Count** — unchanged
9. **Active member count** — unchanged

Zero unbounded row fetches. The largest query now returns at most a few hundred aggregate rows regardless of workspace size.

---

### 2.2 Add composite index for org-wide analytics ✅ DONE

**Files changed:**

- `src/db/schema.ts` — added `time_entries_workspace_started_idx`
- `drizzle/0003_chunky_captain_flint.sql` — migration applied

**Index added:** `(workspace_id, started_at)` on `time_entries`

Org-scope analytics filters on `workspaceId + startedAt range` without a `workspaceMemberId`. The existing `(workspaceId, workspaceMemberId, startedAt)` index still applies via prefix, but the new index is a tighter fit and reduces I/O for the new SQL GROUP BY queries.

---

## Priority 3 — Medium (nice to have, reduces DB load)

### 3.1 Slim down `requireWorkspaceAccess` payload

**File:** `src/lib/server/workspace-access.server.ts` — `fetchMembersWithRelations` (line 62)

**Problem:** Every server function call loads employee profiles + government IDs via 5 parallel queries. Almost no route needs this data in the auth context.

**Fix:**

- [ ] Split into two functions: `requireWorkspaceAccess()` (lightweight — no employee data) and `requireWorkspaceAccessWithProfile()` (full payload for profile/HR screens)
- [ ] Only call the heavy version in routes that actually need it

---

### 3.2 Add explicit staleTime to TanStack Query

**File:** `src/integrations/tanstack-query/root-provider.tsx` and individual query hooks

**Problem:** Without explicit `staleTime`, TanStack Query refetches on every window focus. For slow queries (analytics), this triggers unnecessary round trips.

**Fix:**

- [ ] Set a global default `staleTime: 30_000` (30s) in the QueryClient config
- [ ] Override with shorter staleTime for the live timer state query

---

---

## Summary Table

| #   | Item                             | File(s)                      | Effort | Impact |
| --- | -------------------------------- | ---------------------------- | ------ | ------ | ------- |
| 1.1 | GSheets sync queue reliability   | `gsheets/sync-queue.ts`      | Medium | High   | ✅ Done |
| 1.2 | Switch to Neon serverless driver | `src/db.ts`                  | Low    | High   | ✅ Done |
| 2.1 | Analytics SQL aggregation        | `analytics.server.ts`        | High   | High   | ✅ Done |
| 2.2 | Add org-analytics index          | `schema.ts`                  | Low    | Medium | ✅ Done |
| 3.1 | Slim workspace access payload    | `workspace-access.server.ts` | Medium | Medium |
| 3.2 | TanStack Query staleTime         | `root-provider.tsx` + hooks  | Low    | Low    |
