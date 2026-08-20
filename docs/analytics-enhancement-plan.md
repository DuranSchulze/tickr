# Analytics Enhancement Plan

> Enhancement plan for deeper user-facing analytics and better analytics performance.
> Inputs: [analytics-competitor-reporting.md](./analytics-competitor-reporting.md) (Clockify/Toggl research, Aug 2026) and a code audit of the current analytics stack (server functions, rollups, screens, indexes).
> This is an **enhancement plan, not a rewrite**: existing pages and URLs stay; we add capability and swap internals, not redesign from scratch.

---

## 1. Where we stand today

Tickr already has a solid analytics base: a scoped Analytics screen (personal/org/department) with summary cards, charts, heatmap, and a detailed entries table; a rollup-backed Analytics Overview with period-over-period deltas; Reports with member breakdown and inline editing; a Department Dashboard; My Performance with heatmaps/badges and public share links; plus CSV/PDF exports.

### Capability gap vs Clockify / Toggl Track

| Capability                                                                                           | Clockify | Toggl         | Tickr today                                         | Gap                      |
| ---------------------------------------------------------------------------------------------------- | -------- | ------------- | --------------------------------------------------- | ------------------------ |
| Personal / team overview                                                                             | ✅       | ✅            | ✅ Analytics + Overview                             | —                        |
| Detailed entries report                                                                              | ✅       | ✅            | ✅                                                  | —                        |
| Multi-dimension **grouped** summary (client→project→task drill-down, group by member/tag/week/month) | ✅       | ✅            | ⚠️ flat "top 5" lists only                          | **Large**                |
| Configurable KPIs / saved views / shared reports                                                     | ✅       | ✅ My Reports | ❌                                                  | **Large**                |
| Workload / timesheet pivot (dates as columns)                                                        | ✅       | ✅            | ❌                                                  | **Large**                |
| Project performance (estimate vs tracked, budget, forecast)                                          | ✅       | ✅            | ❌ (no estimate/budget fields)                      | **Large**                |
| Profitability (cost, margin)                                                                         | ✅       | ✅            | ❌ (billable rates only, no cost rates)             | **Large**                |
| Utilization / adherence vs schedule                                                                  | ✅       | ✅            | ⚠️ single utilization % on dept dashboard           | Medium                   |
| Attendance-style report                                                                              | ✅       | ⚠️            | ❌ (rollup already stores first/last entry per day) | Medium                   |
| Data-quality audit (missing time, suspicious entries)                                                | ✅       | ✅            | ❌                                                  | Medium — cheap to build  |
| Period comparison (vs previous period)                                                               | ⚠️       | ✅            | ⚠️ Overview only                                    | Small                    |
| Scheduled email report delivery                                                                      | ✅       | ✅            | ❌ (manual CSV/PDF only)                            | Medium                   |
| Public share links                                                                                   | ✅       | ✅            | ⚠️ performance page only                            | Small                    |
| Expenses                                                                                             | ✅       | ❌            | ❌                                                  | Deferred (see non-goals) |

### Performance findings (from the code audit)

The stack is TanStack server functions + Drizzle on **Neon over HTTP**, so every SQL statement is a network round trip. The recurring anti-pattern is **"fetch all raw entries, aggregate in JavaScript"** — often several times in one request:

1. **`getMemberAnalytics` (Members page)** fetches **every completed entry in the workspace, all time, no date filter**, then aggregates in JS (`src/lib/server/tracker/members/member-analytics.server.ts:53-62`). Worst query in the codebase, runs on every Members page visit (30s staleTime).
2. **`getAnalytics` / `getReports`** fetch **every entry in range unbounded** for the summary (`analytics.server.ts:244-252`, `reports.server.ts:211-219`), then make **three JS passes** over all rows (interval merge, billable reduce, per-day timezone split) — on top of ~6 other queries hitting the same range. A 365-day org-scope view ships the whole year of entries over the wire.
3. **The rollup table is built but barely used.** `analytics_daily_member_metrics` is maintained synchronously on every entry write (indexed, per-member per-day, with seconds/billable/amount), yet **only the Analytics Overview reads it**. Analytics, Reports, Department, Performance, Members stats, and exports all recompute from raw `time_entries`.
4. **Department member detail defaults to a full-history scan** (`department-dashboard.server.ts:959-965`: epoch → max date when no range given) — and the Reports page triggers this exact path whenever a single member is filtered (`routes/app/reports.tsx:119-131`).
5. **Write-path tax:** every timer stop / entry edit runs ~5 extra sequential rollup operations inline (`analytics-rollups.server.ts:160-192`), while the `pending_analytics_rollups` queue designed for async draining has **no consumer** (`recomputeQueuedAnalyticsRollups` has zero callers).
6. **Rollup correctness gaps:** day keys use UTC, not the workspace timezone (Overview can disagree with Analytics by a day for non-UTC workspaces); CSV import and Google Sheets sync **don't refresh rollups** at all; the historical backfill predates client-level rates.
7. **Reporting correctness bugs:** Reports `summary.billableAmount` only sums the **current page** of entries (≤100 rows, `reports.server.ts:449-452`); the member breakdown uses **only the workspace default rate** (`reports.server.ts:463-468`), ignoring member/client overrides the entry table itself uses.
8. **Dead/wasted work:** `exportAnalyticsCsvFn` has no caller; the Department dashboard computes project/daily/tag widgets that no screen renders (`department-dashboard.server.ts:664-737`) — while the finished chart components (`DepartmentDailyChart`, `DepartmentTopTagsChart`, `DepartmentProjectBreakdown`) sit unused.
9. **Index gaps:** no partial index on `billable`, no `(workspaceId, workspaceMemberId, endedAt)` composite for "latest entry" queries, and Reports' `ILIKE '%description%'` search is unindexable without `pg_trgm`.
10. **Analytics Overview** fetches up to ~2 years of member×day rollup rows and computes the comparison windows in JS (`analytics-overview.server.ts:217-293`) instead of `GROUP BY` in SQL.

---

## 2. Track A — Deeper analytics (user-facing enhancements)

Direction per the competitor research: **combine Clockify's clear report categories with Toggl's configurable KPI experience.**

### A1. Grouped Summary report (biggest feature gap)

Upgrade the Analytics/Reports summary from flat "top 5" lists to a real grouped report:

- **Group-by selector**: client → project → task, or member, tag, department; plus time grouping (day/week/month).
- **Expandable drill-down rows** (client expands to projects, projects to tasks) with subtotals per level.
- Configurable columns (duration, billable %, amount, entries, active members).
- Foundation for everything else in this track — build the data layer once (see Track B rollups), reuse across screens.

### A2. Configurable KPI cards + saved views ("My Reports")

- Let users choose which KPI cards show on Analytics/Reports (hours, billable %, amount, profit, utilization…) — Toggl-style headline metrics.
- **Saved views**: persist a filter set + grouping + column config per user (`saved_reports` table: userId, name, config JSON, share scope). One-click re-run from a "My Reports" list.
- Public/internal share links for a saved view (reuse the existing performance share-token pattern at `/performance/$token`).

### A3. Workload / timesheet pivot view

- Pivot table: **dates as columns, people/projects/clients as expandable rows**, weekly navigation — the Clockify weekly report / Toggl workload pattern.
- Cells show hours (billable indicator via color/underline); row and column totals.
- Reads entirely from rollups → fast even for a year.

### A4. Period comparison everywhere

- Port the Overview's delta pattern (vs previous period, vs same weekday last week) to the main Analytics and Reports summaries as an optional toggle.
- Add a simple **trend/forecast line** to charts (linear projection from the trailing period) — Toggl's forecast is a differentiator worth copying cheaply.

### A5. Project performance: estimates & budgets

- Schema: `projects.estimatedSeconds` (or hours) + optional `budgetAmount` + `budgetType` (time/money).
- Project progress vs tracked (from rollups), remaining estimate, % consumed, **color-coded budget health** (the competitor "threshold" pattern), and forecast completion from the trailing trend.
- Surface on the Projects catalog (progress bar) and in the grouped summary (A1) as extra columns.

### A6. Profitability (revenue → cost → margin)

- Schema: `workspace_members.costRate` (optional, owner/admin-only visibility).
- Effective cost = cost rate precedence (member cost → department default → 0), mirroring the existing billable-rate chain in `computeBillableRate`.
- New columns/report: revenue (billable amount — already computed), cost, **profit, margin %** per member/project/client, with ranked bars.
- Permission-gated: profitability visible to owner/admin (and optionally managers) only.

### A7. Data-quality audit report (cheap, high trust win)

- Prebuilt checks over a chosen range: members with **no tracked time**, days with **missing time** vs working days, **suspicious entries** (< 1 min, > 10 hrs, overlapping), entries missing project/task/tags.
- Each finding links to the filtered detailed report for one-click cleanup. Both competitors have this; it's mostly SQL over existing data.

### A8. Attendance-lite & utilization

- From the existing rollup `firstEntryAt`/`lastEntryAt`: a simple attendance table (first/last activity per member per day, active hours span).
- Add `weeklyCapacitySeconds` to members → **utilization = billable or tracked ÷ capacity**, adherence vs schedule, overtime coloring. Generalizes the dept dashboard's lone utilization % into a first-class metric.

### A9. Scheduled report delivery

- Schedule a saved view (A2) as weekly/monthly email with CSV/PDF attached (Resend infrastructure already exists; PDF generation must move server-side — today it's client-side from JSON).
- Start with "every Monday 8am workspace-timezone" granularity; per-user opt-in.

### A10. Department dashboard: ship the hidden widgets

- `DepartmentDailyChart`, `DepartmentTopTagsChart`, `DepartmentProjectBreakdown` are already built and imported by nothing, while the server already computes their data. Render them (or a subset) — a near-free depth win. Then delete whatever stays unused.

---

## 3. Track B — Performance & correctness enhancements

### Guiding architecture change: make the rollup layer the primary read source

The single highest-leverage move: **everything aggregate reads from rollups; only the detailed entries table touches raw `time_entries`.** The infra already exists and is kept fresh on writes — it just has one consumer.

**B1. Extend the rollup schema** (migration):

- Fix the day key to the **workspace timezone** (today it's UTC — `analytics-rollups.server.ts:27-37`), with a one-time backfill recompute.
- Add `actualSeconds` (overlap-merged) computed at write time — removes the JS interval-merge pass from every read.
- Add a second grain: `analytics_daily_member_project_metrics` (member × project × day, with billable split and amount) — powers project totals, grouped summaries (A1), workload pivot (A3), and project budgets (A5) without raw scans.
- Optional third dimension (tag × day) only if A1 needs tag grouping from rollups; otherwise keep tags on SQL `GROUP BY`.

**B2. Cover all write paths:** ~~CSV import and Google Sheets sync currently skip rollup refresh~~ **verified non-issue (Aug 2026):** the only code paths that insert `time_entries` are the timer and manual-entry servers, and both already refresh rollups; `streaming-import.server.ts` imports clients/projects from Google Sheets, not time entries.

**B3. Move rollup maintenance off the synchronous write path:**

- Keep the existing `pending_analytics_rollups` queue, add a **drainer**: Vercel cron every 5–15 min (pattern already exists — `/api/cron/sync-gsheets`).
- Reads that need freshness (Overview) trigger an on-demand drain of stale queue rows before serving.
- Result: timer stops stop paying ~5 sequential rollup queries, and Overview stays near-real-time. _(Fallback if cron is undesirable: keep synchronous refresh but collapse it to a single upsert statement.)_

**B4. Rewrite the heavy read paths onto rollups/SQL:**

- `getMemberAnalytics` (Members page) → straight rollup reads; eliminates the all-time full scan.
- `getAnalytics` / `getReports` summaries → rollup reads for cards, daily totals, heatmap, member breakdown; keep raw entries only for the paginated detail table and top-tasks list (SQL `GROUP BY`).
- Bulk/member exports → totals from rollups; line items from raw entries.
- Overview → `GROUP BY date` windows in SQL instead of shipping ~2 years of member×day rows to JS.

**B5. Fix the silent full-history scans:** default `getDepartmentMemberDetail` to last 30 days when no range is passed (`department-dashboard.server.ts:959-965`) — this also fixes the Reports single-member filter path.

**B6. Correctness fixes (ship with or before B4):**

- Reports `summary.billableAmount` must cover the whole range, not the current page.
- Member breakdown must use the full rate precedence chain (member-client → client → member → workspace), consistent with entry-level amounts.

**B7. Indexes (migration, cheap):**

- Partial index `ON time_entries (workspaceId, startedAt) WHERE billable` for billable-only views.
- Composite `(workspaceId, workspaceMemberId, endedAt DESC)` for latest-entry/activity queries.
- `pg_trgm` GIN index on `time_entries.description` if ILIKE search stays (or switch to prefix-anchored search).

**B8. Retire dead weight:** remove `exportAnalyticsCsvFn` (uncalled) and any dept-dashboard computation that A10 doesn't turn back on.

**B9. Request-level economics (smaller, still worth it):**

- Cache `requireWorkspaceAccess` results per request (it runs 5–7 queries inside every analytics call).
- Debounce already-staged filter commits; consider raising analytics staleTime to 2–5 min once reads are rollup-backed (data only changes on write, and writes invalidate).
- Keep the entries detail table on cursor pagination if row IDs allow; offset is fine ≤100/page otherwise.

---

## 4. Phased roadmap

| Phase                                 | Contents                                                                                                                           | Outcome                                                                           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **0 — Quick wins** (small, no design) | B5 default ranges, B6 correctness fixes, B4 for `getMemberAnalytics` only, B7 indexes, B8 dead code, A10 render hidden dept charts | Members page stops full-scanning; totals become trustworthy; zero UX change       |
| **1 — Rollup-centric reads**          | B1 schema + backfill, B2 import/sheets coverage, B3 async drain, B4 rewrites (Analytics/Reports/Overview/exports)                  | Analytics p95 materially faster and flat-ish as history grows; write path lighter |
| **2 — Reporting depth**               | A1 grouped summary, A2 KPI config + saved views + share links, A3 workload pivot, A4 comparisons/forecast                          | Closes the two largest feature gaps vs both competitors                           |
| **3 — Financial & operational**       | A5 project budgets, A6 profitability, A8 utilization/attendance, A7 audit report, A9 scheduled emails                              | Matches Clockify's operational reporting breadth                                  |

Phases 0 and 1 are pure enhancement of internals (no visible UX change except speed and corrected totals); Phase 2+ is where user-visible depth lands. Each phase is independently shippable.

## 5. Success metrics

- Analytics/Reports p95 server time for a 30-day org-scope view **< 500 ms** (today: dominated by raw-entry shipping; grows with org size).
- Members page p95 **< 300 ms** regardless of workspace age.
- Billable amount totals consistent across Overview, Analytics, Reports, and exports (same range ⇒ same number).
- Rollup freshness lag after any entry write **≤ 15 min** (cron) or immediate on Overview read (on-demand drain).
- Feature parity checklist: grouped summary, saved views, workload pivot shipped (Phase 2 exit).

## 6. Risks & trade-offs

- **Timezone day-key migration** (B1) changes rollup history; needs a guarded backfill job and a feature check comparing old vs new totals before cutover.
- **Async rollup drain** trades instant freshness for write speed; mitigated by on-demand drain on Overview. If unacceptable, keep synchronous single-statement refresh.
- **Cost rates & profitability** touch sensitive HR data — permission model must be explicit before shipping A6.
- **Project × day rollup grain** multiplies write-path work (one upsert per project touched per day). Bounded (few projects per entry) but should be measured in Phase 1.
- PDF generation moving server-side (A9) adds a server dependency; alternative is a headless render service or keeping A9 CSV-only initially.

## 7. Non-goals (for now)

- **Expenses module** — Clockify-only feature, no product pull yet.
- **Invoicing** — already covered by its own plan (`plans/invoicing-template-creation-payment/`).
- **Rewriting existing screens** — enhancement, not revision; current URLs and layouts stay.
- **Real-time streaming analytics** — Team Activity polling covers the live use case adequately.

## 8. Implementation status (2026-08-20)

**Phase 0 is complete**, plus one plan correction:

- ✅ **B5** — `getDepartmentMemberDetail` now defaults to the trailing 30 days (workspace timezone) instead of epoch→max bounds, eliminating the silent full-history scans on the member drill-down page and the Reports single-member filter path. The screen's date picker now always shows the active range.
- ✅ **B6** — Reports `summary.billableAmount` is now a full-range SQL aggregate with the effective-rate cascade (member-client rate → client default → member rate → workspace default, effective-dated), instead of summing the current page. The member breakdown uses the same cascade for amounts and seconds clipped to the range, and shows the blended effective rate actually earned. The old default-rate-only math is gone.
- ✅ **B4 (Members page)** — `getMemberAnalytics` now reads totals/this-week/this-month from `analytics_daily_member_metrics` (one GROUP BY) and computes top projects with a single SQL GROUP BY (member × project), instead of fetching and aggregating every raw entry in the workspace.
- ✅ **B7** — new indexes on `time_entries`: `(workspace_id, started_at) WHERE billable` (partial) and `(workspace_id, workspace_member_id, ended_at)`. Migration generated as `drizzle/0018_time_entries_analytics_indexes.sql` — **not yet applied**; run `pnpm db:migrate` to apply (if `time_entries` is large, consider running the two `CREATE INDEX` statements with `CONCURRENTLY` manually during low traffic first).
- ✅ **B8** — removed the dead `exportAnalyticsCsvFn` server function and `tracker/export.server.ts`.
- ✅ **A10** — the Department Dashboard now renders the previously orphaned widgets: Daily Hours (billable vs non-billable), Top Tags, and the paginated Project Breakdown, with project pagination wired through the URL (`projectPage` search param).
- ✅ **B2** — dropped as a non-issue after verification (see correction above).

**Remaining (in priority order):** B1 timezone day-keys + backfill (needs an applied migration and old-vs-new total verification), B3 async rollup drain via cron, B4 full rewrites (Analytics/Reports summaries, Overview SQL windows, exports), then Phase 2–3 features.
