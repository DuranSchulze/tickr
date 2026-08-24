# Analytics vs Reports — Page Differentiation

> **Status:** 📋 Planned

## Status

- [x] Duration display unified to `DD:HH:MM:SS` via shared `formatDurationDdhms` (`store.ts`).
- [x] Reports summary cards + charts switched to the shared formatter (no visual regression).
- [x] Analytics summary cards, charts, heatmap, overview, and print table switched to the shared formatter.
- [ ] Analytics becomes the read-only insight surface: entries table, export buttons, and print section removed.
- [ ] Analytics gets a "Build a report from this view" cross-link that carries date range + filters to `/app/reports`.
- [ ] Reports becomes an on-demand report builder: section visibility toggles + summary/detailed layout control.
- [ ] Sidebar IA: labels/subtitles clarify Analytics = insights vs Reports = build & export.
- [ ] Validation: `pnpm typecheck`, `pnpm lint`, `pnpm test`, manual QA on both pages.

## 1. Goal

Make `/app/analytics` and `/app/reports` feel like two different products instead of two twins over the same data. Today both pages show the same skeleton — header with date range and export buttons, filter bar, summary cards, charts, entries table — and both query nearly identical server functions, so users (and the codebase) can't tell them apart.

The target mental model:

- **Analytics = the insight surface (read-only).** All the metrics: scope switching, summary cards, heatmap, trends, top tasks/tags/departments, period-over-period comparisons. It answers *"what is happening and why?"* It does **not** export, print, or list raw rows — those are Reports' job.
- **Reports = the on-demand builder.** The user decides what is displayed: which sections (summary, charts, member breakdown, entries), which entries (filters incl. running status, department, task, description), and what to produce (export, print, per-member drill-down with editing). It answers *"show me exactly this, right now."*

Secondary goal: **duration formatting is consistent everywhere in both pages** — `DD:HH:MM:SS` (`formatDurationDdhms`) — so the same 30-hour week reads `01:06:00:00` on both pages.

## 2. Context Summary

### What exists today

| Capability | Location | Status |
| --- | --- | --- |
| Analytics route + screen (scope-aware: personal/organization/department) | `src/routes/app/analytics.tsx` → `src/components/time-tracker/analytics/AnalyticsScreen.tsx` | ✅ Done |
| Analytics Overview (rollups, period comparisons, "Simplified analytics") | `src/routes/app/analytics_.overview.tsx` → `AnalyticsOverviewScreen.tsx` | ✅ Done |
| Analytics server fn — completed entries only, scope gating, heatmap/top lists/entries | `src/lib/server/tracker/analytics.server.ts` | ✅ Done |
| Reports route + screen (workspace-wide, running entries, member drill-down + edit) | `src/routes/app/reports.tsx` → `src/components/time-tracker/reports/ReportsScreen.tsx` | ✅ Done |
| Reports server fn — extra filters (department, task, status, description), member breakdown, billable amounts | `src/lib/server/tracker/reports.server.ts` | ✅ Done |
| Shared date range picker | `src/components/time-tracker/analytics/AnalyticsDateRange.tsx` (imported by Reports) | ✅ Done |
| Shared analytics utils | `src/components/time-tracker/analytics/analytics.utils.ts` (`formatRange`, `toDateKey`, `formatChartDate`, `toChartHours`) | ✅ Done |
| Shared entries table (user's time-format preference via `useTimeFormat`) | `src/components/time-tracker/analytics/AnalyticsEntriesTable.tsx` (reused by Reports member detail) | ✅ Done |
| Sidebar "Analytics" group with both items as siblings | `src/components/time-tracker/AppShell.tsx` (`analyticsChildren`), `MobileNav.tsx` | ✅ Done |
| Shared `formatDurationDdhms` (DD:HH:MM:SS) | `src/lib/time-tracker/store.ts` | ✅ Done |

### Overlap problem (what this plan fixes)

| Aspect | Analytics today | Reports today | Overlap |
| --- | --- | --- | --- |
| Header | scope switcher + date range + **export buttons** | presets + date range + **export buttons** | Export on both |
| Body | summary cards, charts, heatmap, **entries table** | summary cards, charts, member breakdown, drill-down | Cards + charts on both |
| Server | completed-only, scope gating | includes running, filters | Same query pattern, ~40-line entry-row block copy-pasted |
| Nav | "Analytics" item | "Reports" item | Siblings with no stated difference |

### Already completed (this plan's Phase 0)

- `formatDurationDdhms` added to `src/lib/time-tracker/store.ts` (days roll past 24h, identical output to the old private `formatDdhms`).
- Reports side: `ReportsSummaryCards.tsx` (private copy deleted), `ReportsCharts.tsx`.
- Analytics side: `AnalyticsSummaryCards.tsx`, `AnalyticsCharts.tsx`, `AnalyticsHeatmap.tsx`, `AnalyticsOverviewScreen.tsx`, `AnalyticsScreen.tsx` (print table; local `formatDuration` deleted).
- Validated: `pnpm typecheck` and `pnpm lint` pass on all changed files.

## 3. Scope

### Included

- **Analytics becomes read-only insight surface:**
  - Remove the raw entries table (`AnalyticsEntriesTable`) from `AnalyticsScreen.tsx`.
  - Remove the export buttons (`MemberExportButton`, `BulkExportButton`) and the print-only entries section from `AnalyticsScreen.tsx`.
  - Keep: scope switcher, date range, heatmap, summary cards, charts, top tasks/tags/departments, notice, "Overview" link.
- **Cross-link Analytics → Reports:**
  - "Build a report from this view" button on `AnalyticsScreen` that navigates to `/app/reports` carrying the current `startDate`, `endDate`, and shared filters (`clientId`, `projectId`, `tagIds`, `memberIds`, `billable`).
- **Reports becomes an on-demand report builder (client-side):**
  - New builder bar: checkboxes to show/hide **Summary cards**, **Charts**, **Member breakdown**, **Entries table**.
  - Layout toggle: **Summary only** vs **Detailed** (summary-only hides charts/breakdown/table).
  - State is component-local (`useState`/`useReducer`), display-only — does not re-trigger the server query. (Optional later: persist in URL search params.)
- **Sidebar IA (cheap):**
  - Add a clarifying subtitle or updated label so the group reads "Analytics — insights" and "Reports — build & export".
- **Duration consistency (already done, held as the baseline):** all fixed displays in both pages use `formatDurationDdhms`.

### Design decisions

- **Where data lives:** no new tables, no schema changes, no new server endpoints required for the core plan. The builder toggles are purely presentational — `ReportsPayload` already contains every section's data.
- **Cross-link semantics:** Analytics scopes map to Reports as follows — personal scope → Reports `memberIds` = current member; organization → no member restriction; department (manager) → Reports' server-side department gating already applies, so nothing extra is passed. Date range and shared filters always pass through.
- **Entries table duration:** stays on the user's global time-format preference (`useTimeFormat`); that is itself a "display when the user wanted" feature and is consistent between both pages because both reuse `AnalyticsEntriesTable`. Optionally add `DD:HH:MM:SS` as a new option in `time-format.ts` (see Open Questions).

## 4. Out of Scope

- No server-side query changes (no new endpoints, no group-by aggregation) — group-by is listed as a future option in Sequencing, not committed.
- No saved/custom report templates, no scheduled/delivered reports.
- No PDF generation changes (reuse `MemberExportButton` / `BulkExportButton` as-is on Reports).
- No changes to the department analytics screens' `HH:MM:SS` format (listed as an optional follow-up, not part of this plan's acceptance).
- No permission model changes — both pages keep existing role-based scope gating.
- No changes to `AnalyticsFilterBar` / `ReportsFilterBar` filter logic itself (only their host screens change).
- No removal of Reports' editing/drill-down capability.

## 5. Affected Files and Folders

```txt
src/
  lib/
    time-tracker/
      store.ts                                   (MODIFY ✅ DONE: add formatDurationDdhms)

  components/
    time-tracker/
      analytics/
        AnalyticsScreen.tsx                      (MODIFY: remove entries table + export buttons +
                                                          print section; add "Build a report" link)
        AnalyticsSummaryCards.tsx                (MODIFY ✅ DONE: formatDurationDdhms)
        AnalyticsCharts.tsx                      (MODIFY ✅ DONE: formatDurationDdhms)
        AnalyticsHeatmap.tsx                     (MODIFY ✅ DONE: formatDurationDdhms)
        AnalyticsOverviewScreen.tsx              (MODIFY ✅ DONE: formatDurationDdhms)
      reports/
        ReportsScreen.tsx                        (MODIFY: render builder bar; gate sections by
                                                          builder state)
        ReportsBuilderBar.tsx                    (NEW: section-visibility toggles + layout toggle)
        ReportsSummaryCards.tsx                  (MODIFY ✅ DONE: use shared formatDurationDdhms)
        ReportsCharts.tsx                        (MODIFY ✅ DONE: use shared formatDurationDdhms)
      AppShell.tsx                               (MODIFY: nav subtitle/label for Analytics + Reports)
      MobileNav.tsx                              (MODIFY: same subtitle/label change)
```

## 6. Database Design

**N/A** — no new tables, columns, enums, or migrations. All sections the builder toggles already exist in `ReportsPayload`; the analytics removals touch only the UI layer.

## 7. Backend Implementation

**No backend changes in this plan.** `analytics.server.ts` and `reports.server.ts` stay exactly as they are — the differentiation is achieved by *what the screens render*, not by new queries.

Rationale: Analytics already computes everything it needs (heatmap, top lists, comparisons, entries); Reports already returns summary, dailyTotals, memberBreakdown, entries, and billable amounts. Removing the entries table from Analytics does not require the server to stop returning `entries` — the component simply stops rendering it (the route/loader can stay, or drop `entries` from the query later as a small optimization if desired).

*(Future, out of scope: if group-by is pursued, `reports.server.ts` would add a `groupBy` param and a corresponding aggregate query — flagged in Sequencing.)*

## 8. Frontend Implementation

### 8.1 AnalyticsScreen — read-only insight surface

- Delete the `AnalyticsEntriesTable` render block and `PrintEntriesTable` usage from `AnalyticsScreen.tsx`.
- Remove `MemberExportButton` and `BulkExportButton` from the header action row; keep `AnalyticsDateRange`, the scope switcher, and the "Overview" link.
- Add a primary "Build a report from this view" button (outline style, `FileText` icon) that calls `onChangeQuery`-style navigation to `/app/reports` with search params:
  - `startDate`, `endDate` (current range),
  - `clientId`, `projectId`, `tagIds`, `memberIds`, `billable` (current filters),
  - personal scope → `memberIds = access.member.id`.
- The page copy (eyebrow/title/description in `copyByScope`) stays; optionally reworded toward "insights" (e.g., description: "Explore trends and top work across your workspace.").

### 8.2 ReportsScreen — on-demand builder

- New local state (e.g., `useReducer`) holding `{ showSummary: true, showCharts: true, showMemberBreakdown: true, showEntries: true, layout: 'detailed' | 'summary' }`.
- Render a new `ReportsBuilderBar` between the header and `ReportsFilterBar` (or above the filter bar in a compact, muted panel) with:
  - Section checkboxes: **Summary · Charts · Members · Entries**.
  - Layout segmented control: **Summary only** | **Detailed**.
- Gate the render blocks:
  - `ReportsSummaryCards` → shown if `showSummary` (always shown in summary-only layout).
  - `ClientReportsCharts` → shown if `showCharts && layout === 'detailed'`.
  - `ReportsMemberBreakdownTable` → shown if `showMemberBreakdown && layout === 'detailed'`.
  - (Entries table lives inside the member-detail view and is unaffected.)
- Builder state is client-only: it must NOT write to the URL search params or re-run the loader, so toggling is instant and does not refetch.
- Export buttons stay on Reports (that is its job).

### 8.3 ReportsBuilderBar (NEW)

Small presentational component:

```tsx
export type ReportsBuilderState = {
  showSummary: boolean
  showCharts: boolean
  showMemberBreakdown: boolean
  showEntries: boolean
  layout: 'summary' | 'detailed'
}

export function ReportsBuilderBar({
  state,
  onChange,
}: {
  state: ReportsBuilderState
  onChange: (updates: Partial<ReportsBuilderState>) => void
}) { /* checkbox row + layout segmented control */ }
```

Styling follows the existing card pattern (rounded-lg border bg-card), compact `h-8` controls matching `ReportsFilterBar`'s buttons.

### 8.4 Navigation (AppShell / MobileNav)

- In `AppShell.tsx` `analyticsChildren`, add a subtitle to the Analytics and Reports items if the nav renderer supports it; otherwise update labels to "Analytics" and "Reports" and rely on the page-level copy. Simplest robust option: keep labels, and add the clarification on the pages themselves (headers already differ: "Organization activity" vs "Time reports").
- `MobileNav.tsx` mirrors whatever label change is made.

### 8.5 Duration consistency (baseline, already done)

- All fixed displays on both pages use `formatDurationDdhms` from `src/lib/time-tracker/store.ts`. Do not reintroduce ad-hoc `formatDuration` calls in these screens.

## 9. Access Control

No changes. Both pages keep their existing role-based behavior:

| Role | Analytics scope | Reports scope |
| --- | --- | --- |
| **OWNER / ADMIN** | organization (workspace) | workspace-wide |
| **MANAGER** | own department | own department (locked) |
| **EMPLOYEE** | personal | personal |

The Analytics → Reports cross-link is available to all roles; the resulting Reports view is scoped by the same server-side rules, so a personal analytics view produces a personal report.

## 10. Validation

### Automated

```bash
pnpm typecheck          # Zero TS errors
pnpm lint               # ESLint passes (--max-warnings 0)
pnpm test               # Existing tests pass (AnalyticsFilterBar.test.ts, etc.)
```

### Manual QA

1. `/app/analytics` — entries table, export buttons, and print-only table are gone; heatmap, summary cards, charts, top lists, scope switcher still render.
2. `/app/analytics` → "Build a report from this view" → lands on `/app/reports` with the same date range and filters applied (verify URL search params and loaded data).
3. `/app/reports` — builder toggles hide/show Summary, Charts, Members, Entries instantly without a loader refetch (check network tab: no new request on toggle).
4. `/app/reports` — "Summary only" layout shows only the summary cards; switching back to Detailed restores sections.
5. Duration format: same entry set on both pages shows identical `DD:HH:MM:SS` strings in summary cards, chart tooltips, heatmap tooltips, and (analytics) overview comparisons.
6. Reports member drill-down still works (edit/delete entries), entries table still respects the user's time-format preference.
7. Mobile: builder bar wraps cleanly; nav changes render correctly in `MobileNav`.

## 11. Sequencing

1. **Phase 0 — Duration baseline** ✅ *Done.* Shared `formatDurationDdhms` + all fixed displays on both pages.
2. **Phase 1 — Analytics slims down.** Remove entries table / export / print from `AnalyticsScreen.tsx`. Shippable alone: analytics becomes a pure insight page.
3. **Phase 2 — Cross-link.** Add "Build a report from this view" navigation with carried search params. Shippable alone; makes the two pages complementary.
4. **Phase 3 — Reports builder.** `ReportsBuilderBar.tsx` + section gating in `ReportsScreen.tsx`. Shippable alone; users gain "display when I want" control.
5. **Phase 4 — IA polish.** AppShell/MobileNav label or subtitle clarification. Shippable alone.
6. **Phase 5 — Validation.** Full typecheck, lint, tests, manual QA from Section 10; update status badge to ✅ Done.
7. **Optional follow-ups (not committed):** group-by aggregation in `reports.server.ts`; `DD:HH:MM:SS` as a user-selectable option in `time-format.ts`; department analytics screens switched to `formatDurationDdhms`.

## 12. Risks & Considerations

| Risk | Mitigation |
| --- | --- |
| **Removing the entries table/export from Analytics surprises existing users** | The "Build a report from this view" cross-link gives a one-click path to the same data with export; announce via the page description ("Export & raw entries live in Reports"). |
| **Builder toggles cause accidental loader refetch if wired into URL** | Keep builder state component-local; explicitly do not write it to search params in this iteration. |
| **"Summary only" hides everything if all sections unchecked** | In summary-only layout, always render Summary cards regardless of `showSummary`; guard against an empty page. |
| **`DD:HH:MM:SS` is verbose for sub-day durations (e.g., `00:01:30:00`)** | Accepted for consistency per requirement; if noise becomes an issue, switch to "show days only when > 0" as a one-line follow-up (see Open Questions). |
| **Reports already has the entries table only in member-detail view** | The "Entries" toggle currently controls a table that only appears in drill-down; if the main view should also list rows, add the shared `AnalyticsEntriesTable` to the main Reports view behind the same toggle (small addition, flagged as an open question). |
| **Cross-link drops analytics-only scope nuance** | Map documented in Section 3: personal → memberIds, organization → unrestricted, department → server-side gating already handles it. |

## 13. Open Questions

- [ ] **Should `DD:HH:MM:SS` always show two-digit days (current) or hide the day segment when it is 0?** Plan keeps the current strict format for consistency; hiding `00:` when days are zero is a one-line follow-up.
- [ ] **Should `DD:HH:MM:SS` be added as a user-selectable option in the time-format preferences (`time-format.ts`)?** Currently the entries table uses the user's preference (clock/decimal/human/precise) while fixed displays force `DD:HH:MM:SS`.
- [ ] **Should the main Reports view render the entries table too** (behind the "Entries" toggle), or keep it only in the member drill-down as today? Plan assumes the latter.
- [ ] **Nav clarification:** does the AppShell nav item renderer support a subtitle, or should clarification live only in page headers? Plan defaults to page-header copy if the nav renderer is fixed-shape.
- [ ] **Group-by** (day/week/member/project) — desired? Requires server changes in `reports.server.ts`; deliberately out of scope unless requested.
