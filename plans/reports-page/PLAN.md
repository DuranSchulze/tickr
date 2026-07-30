# Reports Page

> **Status:** ✅ Done

## Status

- [x] Plan created and reviewed against existing analytics infrastructure.
- [x] Server: Reports server function with new filters (department, task, status, description).
- [x] Route: `/app/reports` TanStack Start file route + search params + loader.
- [x] Frontend: ReportsScreen, ReportsFilterBar, ReportsCharts, ReportsEntriesTable.
- [x] Navigation: "Reports" item in the Analytics sidebar group.
- [x] Validation: typecheck, lint, manual smoke test.

## 1. Goal

Add a dedicated **Reports** page at `/app/reports` that provides filtered, exportable time-tracking reports distinct from the existing Analytics page. Reports focuses on the filtered-tabular-data + bar chart pattern, with broader filters (Department, Task, Status, Description) not present on the Analytics page today.

Key deliverables:

- **Time report** — a detailed table of entries with rich filters + a bar chart showing daily/hourly totals over the selected range.
- **Summary** — aggregate metrics (total hours, billable %, members, projects touched) above the charts.
- **Detailed weekly** — the same view but defaulting to a weekly date range (toggle-able alongside custom range).

## 2. Context Summary

### What exists today

| Capability                                                      | Location                                                       | Status  |
| --------------------------------------------------------------- | -------------------------------------------------------------- | ------- |
| Analytics page (scope-aware: personal/organization/department)  | `src/routes/app/analytics.tsx` → `AnalyticsScreen`             | ✅ Done |
| Analytics filter bar (Client, Project, Tags, Members, Billable) | `src/components/time-tracker/analytics/AnalyticsFilterBar.tsx` | ✅ Done |
| Draft filter pattern (staged changes → Search commits)          | `AnalyticsScreen.tsx` `handleFilterChange` / `handleSearch`    | ✅ Done |
| Recharts 3.8.1 with ClientOnly SSR guard                        | `AnalyticsCharts.tsx` (dynamic import)                         | ✅ Done |
| Analytics server function (permission-gated)                    | `src/lib/server/tracker/analytics.server.ts`                   | ✅ Done |
| Export (CSV)                                                    | `src/lib/server/tracker/export.server.ts`                      | ✅ Done |
| Tracker state lite (catalog data for filter options)            | `src/lib/server/tracker/state-lite.server.ts`                  | ✅ Done |
| Sidebar Analytics group with children                           | `AppShell.tsx` `analyticsChildren`                             | ✅ Done |
| Bar chart components (Recharts)                                 | `AnalyticsCharts.tsx`                                          | ✅ Done |

### What's missing today

- **Department filter** — not a filter option on analytics; departments exist in schema but only used for scope gating.
- **Task filter** — tasks exist in the schema and `ClientProjectPicker` but analytics doesn't filter by taskId.
- **Status filter** — not a field on time entries today (entries are either running or stopped). The user likely means a filter on entry state (completed / running / archived), or a workspace-member status (active / suspended).
- **Description text search** — free-text filter on entry description. Analytics doesn't have this.
- **Separate Reports route** — distinct from `/app/analytics` with its own URL, sidebar entry, and server function.
- **Weekly toggle** — quick-select for "this week / last week" alongside a custom date range.

## 3. Scope

### Included

- **New route:** `/app/reports` with search params (`startDate`, `endDate`, `departmentId`, `clientId`, `projectId`, `taskId`, `tagIds`, `memberIds`, `status`, `description`, `billable`, `page`, `pageSize`).
- **New server function:** `getReportsFn` (wraps `getReports` in `reports.server.ts`) — reuses the analytics query builder pattern but adds `departmentId`, `taskId`, `description` (ILIKE), and `status` filters.
- **ReportsFilterBar component:** extends the AnalyticsFilterBar pattern with:
  - Department dropdown (filtered by scope — OWNER/ADMIN see all, MANAGER sees own department)
  - Task dropdown (filtered by selected project, or all tasks if no project selected)
  - Status dropdown (All / Completed only / Running — filters on `endedAt IS NULL` vs `IS NOT NULL`)
  - Description text input (ILIKE `%search%`)
  - Existing filters carried over: Client/Project, Tags, Members, Billable
  - Search + Clear buttons (draft filter pattern)
- **ReportsScreen component:** header (eyebrow + title), filter bar, summary cards, bar chart (daily totals), entries table with pagination.
- **Weekly toggle:** quick-select preset buttons ("This Week", "Last Week", "This Month", "Custom") that set `startDate`/`endDate` in the URL.
- **Navigation:** "Reports" item added to the Analytics sidebar group (between Analytics and My Performance).
- **Permission:** same as analytics — OWNER/ADMIN see workspace scope, MANAGER sees department, EMPLOYEE sees personal. All can access Reports.

### Design decisions

- **Department filter vs scope:** Reports drops the analytics "scope" concept (personal/organization/department toggle). Instead, scope is inferred from permission level (like analytics server does), and Department becomes a regular multi-select filter. This simplifies the UI — one less toggle, one more filter.
- **Status filter:** Maps to entry completion state: All / Completed (`endedAt IS NOT NULL`) / Running (`endedAt IS NULL`).
- **Description filter:** Simple ILIKE text search. No debounce needed — it's a draft filter committed on Search click.

## 4. Out of Scope

- No saved/custom report templates (future feature).
- No scheduled email delivery of reports (future feature).
- No PDF report generation specific to Reports (reuse existing `MemberExportButton` + `BulkExportButton`).
- No new database tables — purely query-side additions reading existing `timeEntries`, `workspaceMembers`, `departments`, `tasks` tables.
- No changes to the analytics page itself.
- No custom aggregation periods (daily only for bar chart; weekly/monthly rollups are a future feature).

## 5. Affected Files and Folders

```txt
src/
  lib/
    server/
      tracker/
        reports.server.ts                          (NEW: getReports server fn)
        shared/
          schemas.ts                               (MODIFY: add reportsRangeSchema)
      tracker.ts                                   (MODIFY: add getReportsFn export + server fn registration)
      tracker.server.ts                            (MODIFY: re-export reports)

    time-tracker/
      query-keys.ts                                (MODIFY: add trackerKeys.reports)

  components/
    time-tracker/
      reports/
        ReportsScreen.tsx                          (NEW: page-level component)
        ReportsFilterBar.tsx                       (NEW: filter bar with Department, Task, Status, Description)
        ReportsCharts.tsx                          (NEW: bar chart, dynamically imported for SSR)
        ReportsSummaryCards.tsx                    (NEW: aggregate metrics cards)
        ReportsEntriesTable.tsx                    (NEW: entries table with pagination)

  routes/
    app/
      reports.tsx                                  (NEW: /app/reports route)

  components/
    time-tracker/
      AppShell.tsx                                 (MODIFY: add Reports to analyticsChildren)
      MobileNav.tsx                                (MODIFY: add Reports link)
```

## 6. Database Design

**No new tables or migrations needed.** The new queries read from existing tables:

- `timeEntries` — filtered by status (`endedAt`), description (`ILIKE`), taskId
- `departments` — joined via `workspaceMembers.departmentId` for department filter
- `tasks` — joined via `timeEntries.taskId` for task filter

## 7. Backend Implementation

### 7.1 Zod Schema (`shared/schemas.ts`)

Add `reportsRangeSchema` extending the existing `analyticsRangeSchema` pattern:

```ts
export const reportsRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  departmentId: z.string().optional(),
  clientId: z.string().optional(),
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  tagIds: z.string().optional(), // comma-separated
  memberIds: z.string().optional(), // comma-separated
  status: z.enum(['all', 'completed', 'running']).optional().default('all'),
  description: z.string().optional(), // ILIKE search
  billable: z.enum(['true', 'false']).optional(),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(200).optional().default(50),
})
```

### 7.2 Reports Server Function (`reports.server.ts`)

New file `src/lib/server/tracker/reports.server.ts`:

```ts
export type ReportsPayload = {
  startDate: string
  endDate: string
  summary: {
    totalSeconds: number
    billableSeconds: number
    nonBillableSeconds: number
    entryCount: number
    activeMembers: number
    projectsTouched: number
    billableAmount: number | null
  }
  dailyTotals: Array<{ date: string; seconds: number }> // for bar chart
  entries: AnalyticsTimeEntryRow[] // reuse existing row type
  entriesTotal: number
  permissionLevel: string
  currency: string
  timezone: string
}

export async function getReports(
  data: z.infer<typeof reportsRangeSchema>,
): Promise<ReportsPayload> {
  // 1. requireWorkspaceAccess() — get workspace, timezone, permissionLevel
  // 2. Build WHERE conditions:
  //    - date range (same as analytics)
  //    - departmentId → filter workspaceMembers.departmentId
  //    - clientId → join projects → filter projects.clientId
  //    - projectId → filter timeEntries.projectId
  //    - taskId → filter timeEntries.taskId
  //    - tagIds → join timeEntryTags → filter
  //    - memberIds → filter timeEntries.workspaceMemberId
  //    - status: 'completed' → isNotNull(endedAt), 'running' → eq(isNull)
  //    - description → sql`${timeEntries.description} ILIKE ${'%' + desc + '%'}`
  //    - billable → filter
  // 3. Permission scope gating (same as analytics):
  //    - EMPLOYEE → personal scope (current member only)
  //    - MANAGER → department scope
  //    - OWNER/ADMIN → workspace scope
  // 4. Query: build daily totals (GROUP BY date), summary aggregates, paginated entries
  // 5. Resolve rates via resolveEntryRateMap (reuse analytics pattern)
  // 6. Return ReportsPayload
}
```

### 7.3 Server Function Registration (`tracker.ts`)

```ts
// Add to existing createServerFn registrations
import { reportsRangeSchema } from './tracker/shared/schemas'

export const getReportsFn = createServerFn({ method: 'GET' })
  .inputValidator((input) => reportsRangeSchema.parse(input))
  .handler(async ({ data }) => {
    const { getReports } = await import('./tracker.server')
    return getReports(data)
  })
```

### 7.4 Query Keys (`query-keys.ts`)

```ts
reports: (deps: unknown) => ['reports', deps] as const,
```

## 8. Frontend Implementation

### 8.1 Route (`routes/app/reports.tsx`)

Follows the exact pattern of `analytics.tsx`:

- **Search params:** `startDate`, `endDate`, `departmentId`, `clientId`, `projectId`, `taskId`, `tagIds`, `memberIds`, `status`, `description`, `billable`, `page`, `pageSize`
- **Loader:** fetches `getReportsFn` + `getTrackerStateLiteFn` in parallel (state lite provides catalogs for filter dropdowns)
- **Default date range:** same 30-day default as analytics
- **validateSearch:** parse all search params with fallback to defaults

### 8.2 ReportsScreen (`components/time-tracker/reports/ReportsScreen.tsx`)

```tsx
// Header section (reuse AnalyticsScreen pattern):
// - Eyebrow: "Reports" with FileText icon
// - Title: "Time reports"
// - Description: "Filter and export detailed time reports"
// - Date range: AnalyticsDateRange (reuse) + weekly presets toggle
// - Export buttons: MemberExportButton, BulkExportButton

// Weekly preset toggle:
// Segmented button: ["This Week", "Last Week", "This Month", "Custom"]
// Clicking "This Week" sets startDate=Monday, endDate=today
// "Custom" shows the AnalyticsDateRange picker

// Filter bar → ReportsFilterBar
// Summary cards → ReportsSummaryCards
// Bar chart → ClientReportsCharts (dynamic import wrapper)
// Entries table → ReportsEntriesTable (with pagination)

// Follows draft filter pattern from AnalyticsScreen:
// - useReducer for draftFilters
// - handleFilterChange updates draft only
// - handleSearch commits draft to URL
// - handleClear resets + applies immediately
```

### 8.3 ReportsFilterBar (`components/time-tracker/reports/ReportsFilterBar.tsx`)

New component extending `AnalyticsFilterBar` with additional filters:

```tsx
// Grid layout (same as AnalyticsFilterBar):
// Row 1: Description (text input) — full width on mobile
// Row 2: Department (select), Client/Project (combobox), Task (select)
// Row 3: Status (select), Tags (multi-select), Members (multi-select), Billable (select)
// Row 4: Clear + Search buttons (right-aligned)

export type ReportsFilters = {
  departmentId?: string
  clientId?: string
  projectId?: string
  taskId?: string
  tagIds?: string
  memberIds?: string
  status?: 'all' | 'completed' | 'running'
  description?: string
  billable?: 'true' | 'false'
  page?: number
  pageSize?: number
}

// Department dropdown:
// - OWNER/ADMIN: all departments in workspace
// - MANAGER: own department only (read-only, locked)
// - EMPLOYEE: hidden (personal scope, no department filter)

// Task dropdown:
// - If projectId is set: tasks for that project only
// - If no projectId: all tasks across all projects
// - Reuse task options from state.projectTasks

// Status dropdown:
// - "All entries" (default)
// - "Completed only"
// - "Running only"

// Description: text input with Search icon prefix
// - Committed only on Search click (draft pattern)
```

### 8.4 ReportsCharts (`components/time-tracker/reports/ReportsCharts.tsx`)

```tsx
// Dynamically imported (ClientOnly wrapper like AnalyticsCharts)
// Single bar chart: daily totals (date on X, hours on Y)
// Uses Recharts BarChart with:
// - X axis: formatChartDate (short dates)
// - Y axis: hours (toChartHours)
// - Bars: primary color fill, radius top corners
// - Tooltip: date + formatted duration
// Container: h-[300px], ResponsiveContainer

export function ReportsCharts({ reports }: { reports: ReportsPayload }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 sm:p-5">
      <h3 className="mb-1 text-sm font-bold text-foreground">Overall trend</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Daily tracked hours across the selected period
      </p>
      <div className="h-[260px] sm:h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tickFormatter={formatChartDate} ... />
            <YAxis tickFormatter={(h) => `${h}h`} ... />
            <Tooltip ... />
            <Bar dataKey="hours" fill="var(--color-primary)" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

### 8.5 ReportsSummaryCards (`components/time-tracker/reports/ReportsSummaryCards.tsx`)

Compact stat cards (reuse AnalyticsSummaryCards pattern):

```
┌─────────────┬─────────────┬──────────────┬─────────────┬────────────────┐
│ Total hours │ Billable %  │ Non-billable │ Entries     │ Active members │
│   142.5h    │    78%      │    31.3h     │    847      │      12        │
└─────────────┴─────────────┴──────────────┴─────────────┴────────────────┘
└────────────────────────────┬─────────────────────────────┘
                   Billable amount
                      $12,450.00
```

### 8.6 ReportsEntriesTable (`components/time-tracker/reports/ReportsEntriesTable.tsx`)

Reuses `AnalyticsEntriesTable` pattern:

- Desktop: full table (Date, Member, Project, Client, Task, Tags, Description, Duration, Billable, Rate, Amount)
- Mobile: stacked cards (<lg breakpoint)
- Pagination controls at bottom
- Same `AnalyticsTimeEntryRow` type from `analytics.server.ts`

### 8.7 Navigation

**AppShell.tsx** — add to `analyticsChildren`:

```tsx
const analyticsChildren = useMemo(() => {
  const items = []
  items.push({
    to: '/app/analytics' as const,
    label: 'Analytics',
    icon: BarChart3,
  })
  items.push({
    to: '/app/reports' as const,
    label: 'Reports',
    icon: FileText, // lucide-react
  })
  items.push({
    to: '/app/my-performance' as const,
    label: 'My Performance',
    icon: TrendingUp,
  })
  // ... rest unchanged
}, [isManagerOrAbove])
```

Add `reportsActive` to the group computation so `/app/reports` lights up the Analytics group:

```tsx
const reportsActive = pathname.startsWith('/app/reports')
const analyticsGroupActive =
  analyticsActive ||
  reportsActive ||
  performanceActive ||
  departmentAnalyticsActive ||
  activityActive
```

**MobileNav.tsx** — add Reports link in the same group pattern.

## 9. Access Control

| Role         | Scope          | Department Filter        | Members Filter         |
| ------------ | -------------- | ------------------------ | ---------------------- |
| **OWNER**    | Workspace-wide | All departments          | All members            |
| **ADMIN**    | Workspace-wide | All departments          | All members            |
| **MANAGER**  | Own department | Locked to own department | Own department members |
| **EMPLOYEE** | Personal only  | Hidden                   | Hidden (own data only) |

Reports access: all roles can access `/app/reports` (same as analytics — no redirect, server-side scope enforcement).

## 10. Validation

### Automated

```bash
pnpm typecheck          # Zero TS errors
pnpm lint               # ESLint passes
pnpm test               # Vitest passes (add ReportsFilterBar.test.ts)
```

### Manual QA

1. Navigate to `/app/reports` — page loads with 30-day default range
2. Weekly preset toggle: click "This Week" → date range updates, data refreshes
3. Filters: select Department, Client, Project, Task, Status, type Description → data stays unchanged until "Search" clicked
4. Click "Search" → URL updates, loader re-fetches, chart + table refresh
5. "Clear filters" → all filters reset, data refreshes
6. Bar chart renders with correct daily totals
7. Pagination: change page, verify entries table updates
8. Mobile: cards display correctly, filter bar stacks vertically
9. Export button works (pulls entries filtered by current reports query)
10. EMPLOYEE user: only sees own data, department filter hidden
11. MANAGER user: sees department data, department filter locked to own department

## 11. Sequencing

1. **Phase 1: Server** — `reports.server.ts`, schema update, server fn registration, query keys. Test: call `getReportsFn` directly, verify data.
2. **Phase 2: Route** — `/app/reports.tsx` file route with search params, loader, validateSearch. Test: navigate, verify loader returns data.
3. **Phase 3: Components** — ReportsScreen, ReportsFilterBar, ReportsSummaryCards, ReportsCharts, ReportsEntriesTable. Test: full page render.
4. **Phase 4: Navigation** — AppShell sidebar entry, MobileNav entry. Test: click sidebar items, verify active states.
5. **Phase 5: Polish** — Weekly presets toggle, export integration, mobile card layout.

Each phase should be independently shippable (the route can render "Coming soon" until components are built).

## 12. Risks & Considerations

| Risk                                                         | Mitigation                                                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ILIKE description search is slow on large datasets**       | Add a trigram index (`pg_trgm`) on `timeEntries.description` if needed. Start without; the 30-day default range keeps result sets small.                           |
| **Task dropdown has many options**                           | Follow `ClientProjectFilter` pattern: searchable combobox with `MAX_VISIBLE` cap.                                                                                  |
| **Department filter duplicates analytics scope concept**     | Reports drops the scope toggle entirely — department is just another filter. Permission-level scope gating still applies server-side.                              |
| **Recharts SSR hydration mismatch**                          | Wrap charts in `ClientOnly` guard (same pattern as `AnalyticsCharts.tsx`).                                                                                         |
| **Filter bar grows too wide**                                | Use the same `lg:flex lg:flex-wrap` responsive grid as `AnalyticsFilterBar`.                                                                                       |
| **Status "Running" filter: running entries have no endedAt** | Duration for running entries is computed as `now - startedAt`. This differs from analytics (which only shows completed entries). Document this behavior in the UI. |

## 13. Open Questions

- [ ] **Status filter: Active vs Suspended members, or Running vs Completed entries?** Plan assumes the latter (entry completion state). If the user meant member status (Active/Suspended), that's already covered by the Member filter which only shows `status='ACTIVE'` members.
- [ ] **Should Reports include billable amount in the bar chart?** Plan assumes hours-only bar chart (simpler). Can add a toggle later for hours vs amount.
- [ ] **Should Reports reuse the Analytics "Overview" page concept?** Plan assumes no — Reports is self-contained with summary cards on the same page. An Overview sub-route could be added later.
- [ ] **Weekly preset: "This Week" = Monday-Sunday or Sunday-Saturday?** Plan defaults to Monday-Sunday to match the workspace timezone's week start. Configurable later.
