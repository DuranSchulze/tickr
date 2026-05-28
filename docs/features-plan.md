# Feature Implementation Plan

> **Project:** Tickr — Time Tracking Application
> **Status:** Draft
> **Date:** 2026-05-28

---

## Overview

Three features to be implemented based on the current codebase state:

| #   | Feature                             | Priority | Effort            |
| --- | ----------------------------------- | -------- | ----------------- |
| 2   | Persistent Time Entries List        | High     | Medium (~8 files) |
| 4   | Manager Department Analytics        | High     | Large (~12 files) |
| 5   | Export with Calculated Bill Amounts | Medium   | Small (~7 files)  |

---

## Current State Assessment

| Area                         | Current State                                                                                                        | Gap                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Time Entries List (#2)**   | Day/week/month views; entries limited to selected period; pagination by 20 date groups                               | No "see all my entries" view, no infinite-scroll for past entries, no historical browsing without manually switching dates                                         |
| **Manager Analytics (#4)**   | Basic department scope exists in analytics; managers can filter to their department's entries                        | No departmental member-level breakdown, no per-member billing totals, no dedicated manager dashboard showing team KPIs                                             |
| **Export Bill Amounts (#5)** | CSV export already includes Rate/hr and Amount columns using `computeEffectiveRate`; EntryCard shows billable amount | Analytics entries table and dashboard time entries list don't show calculated bill amounts inline; CSV doesn't include per-entry bill amounts for personal exports |

---

## Feature #2 — Persistent Time Entries List

> **Goal:** Users can view a scrollable, persistent list of their time entries across multiple days/weeks without manually changing the date filter. Previous entries stay visible and can be browsed in the same view.

### 2.1 Backend: Paginated Entries API

**File:** `src/lib/server/tracker/entries-list.server.ts` **(new)**

Add a new server function `getPaginatedEntriesFn` that returns entries with cursor-based pagination:

- Filtered by workspace + member
- Ordered by `startedAt DESC`
- Includes `totalCount` for the member across all time (unfiltered by view)
- Accepts optional `before` cursor (the last entry's `startedAt`) for infinite scroll
- Accepts optional `after` cursor for jumping forward
- Accepts `limit` parameter (default 50)

```typescript
const paginatedEntriesSchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  direction: z.enum(['older', 'newer']).default('older'),
})
```

**Returns:** `{ entries: TimeEntry[], nextCursor: string | null, totalCount: number }`

**Why a new endpoint?** The current state endpoint loads everything into a single `TrackerState` for the view period. A separate paginated endpoint keeps the dashboard snappy for real-time use while providing historical browsing.

### 2.2 Frontend: "All Entries" View Mode

#### Type Changes

**File:** `src/lib/time-tracker/types.ts`

- Add `'all'` to the `ViewMode` union type

#### New Component: `AllEntriesSection`

**File:** `src/components/time-tracker/dashboard/AllEntriesSection.tsx` **(new)**

- Renders entries grouped by date (same pattern as `groupEntriesByDay` in `EntriesSection.tsx`)
- Supports "Load more" button at the bottom (simpler than IntersectionObserver)
- Uses the same `EntryCard` / `EntryRow` rendering components
- Supports existing filter/sort controls (project, tag, billable, sort)
- Each date group is collapsible (same pattern as current implementation)
- Shows running total at the top
- "Back to today" floating button when scrolled past today's entries

#### DashboardHeader Changes

**File:** `src/components/time-tracker/dashboard/DashboardHeader.tsx`

- Add a 4th view mode button: **"All"** with a `List` icon
- When in "all" mode, hide the date navigation arrows
- Show the total entry count across all time (passed as prop)

#### TimeTrackerDashboard Changes

**File:** `src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx`

- When `view === 'all'`:
  - Skip `useFilteredEntries` date-based filtering
  - Fetch paginated entries via `getPaginatedEntriesFn`
  - Replace `EntriesSection` with `AllEntriesSection`
- New state:
  ```typescript
  const [allEntries, setAllEntries] = useState<TimeEntry[]>([])
  const [allEntriesCursor, setAllEntriesCursor] = useState<string | null>(null)
  const [allEntriesLoading, setAllEntriesLoading] = useState(false)
  const [allEntriesHasMore, setAllEntriesHasMore] = useState(true)
  ```
- On initial load or switching to "all" view, reset and fetch first page
- "Load more" appends to existing list
- When a timer stops or a manual entry is added while in "all" view, prepend the new entry (optimistic update)

### 2.3 Route Changes

**File:** `src/routes/app/time-tracker/index.tsx`

- Add `'all'` to the `ViewMode` validation
- When view is `'all'`, `date` search param becomes optional

### 2.4 Mobile Support

- "All" button and infinite-scroll work identically on mobile
- EntryCard rendering is already responsive
- "Load more" button replaces auto-infinite-scroll for simplicity

### 2.5 Files Changed

| File                                                                    | Change                                  |
| ----------------------------------------------------------------------- | --------------------------------------- |
| `src/lib/time-tracker/types.ts`                                         | Add `'all'` to `ViewMode`               |
| `src/lib/server/tracker/entries-list.server.ts` **(new)**               | `getPaginatedEntriesFn` server function |
| `src/lib/server/tracker/tracker.ts`                                     | Export the new server function          |
| `src/lib/server/tracker/index.ts`                                       | Re-export                               |
| `src/routes/app/time-tracker/index.tsx`                                 | Allow `'all'` view in search validation |
| `src/components/time-tracker/dashboard/DashboardHeader.tsx`             | Add "All" view button                   |
| `src/components/time-tracker/dashboard/AllEntriesSection.tsx` **(new)** | Infinite-scroll all entries             |
| `src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx`        | Wire up "all" mode                      |

---

## Feature #4 — Manager Department Analytics Dashboard

> **Goal:** Managers get a dedicated department-level analytics view showing team member performance, department billing totals, member-level breakdowns, and a suite of KPIs for their department.

### 4.1 Access Control Updates

**File:** `src/lib/server/tracker/shared/role-gates.server.ts` **(modify)**

Add two new guard functions:

```typescript
export function assertManagerOrAbove(access: WorkspaceAccess) {
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  if (level === 'EMPLOYEE') {
    throw new Error('Manager or higher permission required.')
  }
}

export function assertDepartmentManager(
  access: WorkspaceAccess,
  targetDepartmentId: string,
) {
  assertManagerOrAbove(access)
  if (access.member.departmentId !== targetDepartmentId) {
    throw new Error('You can only manage members in your own department.')
  }
}
```

### 4.2 Backend: Department Dashboard API

**File:** `src/lib/server/tracker/analytics.server.ts`

Add a new function `getDepartmentDashboardFn`:

```typescript
export type DepartmentDashboard = {
  department: {
    id: string
    name: string
    color: string
    memberCount: number
    headMemberId: string | null
  }
  summary: {
    totalSeconds: number
    billableSeconds: number
    nonBillableSeconds: number
    entryCount: number
    totalBillableAmount: number
    currency: string
  }
  membersBreakdown: Array<{
    memberId: string
    name: string
    email: string
    totalSeconds: number
    billableSeconds: number
    entryCount: number
    billableAmount: number
    effectiveRate: number
    thisWeekSeconds: number
    thisMonthSeconds: number
  }>
  projectsBreakdown: Array<{
    projectId: string
    name: string
    color: string
    seconds: number
    billableSeconds: number
    billableAmount: number
    memberCount: number
  }>
  dailyTotals: Array<{ date: string; seconds: number }>
  topTasks: Array<{
    description: string
    seconds: number
    entryCount: number
    memberName: string
  }>
  topTags: Array<{
    tagId: string
    name: string
    color: string
    seconds: number
  }>
}
```

**Schema:**

```typescript
const departmentDashboardSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
})
```

**Query logic:**

- `requireWorkspaceAccess` ensures the user is a member
- Check `assertManagerOrAbove`
- Use `access.member.departmentId` to scope members
- Join with `workspaceMembers` to get the member list
- For each member, compute:
  - `totalSeconds` = SUM(durationSeconds)
  - `billableSeconds` = SUM(durationSeconds WHERE billable = true)
  - `entryCount` = COUNT(\*)
  - `effectiveRate` = `computeEffectiveRate(memberRate, defaultRate)`
  - `billableAmount` = `(billableSeconds / 3600) * effectiveRate`
- For projects breakdown, join with `projects` and aggregate
- Use the same `buildDateKeys` helper for daily totals

### 4.3 New Route: `/app/department-analytics`

**File:** `src/routes/app/department-analytics.tsx` **(new)**

```typescript
export const Route = createFileRoute('/app/department-analytics')({
  validateSearch: ...,
  beforeLoad: async ({ context }) => {
    const access = await context.queryClient.ensureQueryData(...)
    if (access.member.permissionLevel === 'EMPLOYEE') {
      throw redirect({ to: '/app/time-tracker' })
    }
    if (access.member.permissionLevel === 'MANAGER' && !hasDepartment) {
      throw redirect({ to: '/app/analytics' })
    }
  },
  loader: async () => {
    const [dashboard, state] = await Promise.all([
      getDepartmentDashboardFn({ data: range }),
      getTrackerStateLiteFn(),
    ])
    return { dashboard, state }
  },
  component: DepartmentAnalyticsRoute,
})
```

**Navbar/Sidebar changes** in `src/components/time-tracker/AppSidebar.tsx`:

- Show **"Department"** link only for MANAGER, ADMIN, OWNER
- Icon: `Building2` or `Users`

### 4.4 Frontend: Department Dashboard Components

**Directory:** `src/components/time-tracker/analytics/department/` **(new)**

#### `DepartmentDashboardScreen.tsx`

Main container component:

- Header: Department name, member count, selected date range
- Summary cards row:
  - Total hours tracked
  - Billable hours
  - **Billable amount** (formatted currency)
  - Active members this period
  - **Utilization rate** (billable hours / total hours × 100)

#### `MemberBreakdownTable.tsx`

Table showing each member's stats:

| Member     | Total Hours | Billable Hours | Non-Billable | Rate/hr | Billable Amount | This Week | This Month | Utilization |
| ---------- | ----------- | -------------- | ------------ | ------- | --------------- | --------- | ---------- | ----------- |
| John Doe   | 120h        | 100h           | 20h          | ₱500    | ₱50,000         | 25h       | 100h       | 83%         |
| Jane Smith | 80h         | 60h            | 20h          | ₱450    | ₱27,000         | 20h       | 60h        | 75%         |

- Click on a member row to navigate to their detail page (`/app/workspace/members/$memberId`)
- Sortable columns (click column header to sort)
- Paginated (10 per page)

#### `DepartmentProjectBreakdown.tsx`

Project-level breakdown for the department:

| Project          | Hours | Billable Hours | Amount  | Members |
| ---------------- | ----- | -------------- | ------- | ------- |
| Website Redesign | 80h   | 75h            | ₱37,500 | 3       |
| Mobile App       | 60h   | 50h            | ₱25,000 | 2       |

#### `DepartmentDailyChart.tsx`

Daily bar chart of total department hours using **Recharts** (already a project dependency).

#### `DepartmentHeatmap.tsx`

Enhanced heatmap showing all department members (rows) × days (columns) — visualizes who tracked time on which day.

### 4.5 Enhanced Existing Analytics Page

**File:** `src/components/time-tracker/analytics/AnalyticsScreen.tsx`

- Add a **"View Department Dashboard"** link/button when in department scope
- Enhanced scope selector:
  - "My Analytics" (personal)
  - "Department" (only for managers)
  - "Organization" (admin/owner only)
- When viewing department scope, show a member filter dropdown so managers can drill into individual team members

**File:** `src/routes/app/analytics.tsx`

- Add `page` and `memberIds` to search params for pagination
- Pass member list to the frontend for the member filter dropdown

### 4.6 Members Page — Manager Access

**File:** `src/lib/server/tracker/members/members.server.ts`

- Change authorization from `assertOwnerOrAdmin` to `assertManagerOrAbove` for read-only operations
- For write operations (role change, status change), keep `assertOwnerOrAdmin`
- Manager-scoped member listing: managers only see members in their own department
- Add a new optional `departmentId` filter parameter

**File:** `src/routes/app/workspace/members.tsx`

- Change `beforeLoad` to allow managers through (but scoped to their department)
- Pass `departmentId: access.member.departmentId` to query for scoping

**File:** `src/components/time-tracker/MembersScreen` (inside `WorkspaceScreens.tsx`)

- Show a banner: **"Showing members in [Department Name]"**
- Hide bulk actions non-applicable to managers
- Allow managers to edit rates, roles, and status of members **within their department only**

### 4.7 Files Changed

| File                                                                                        | Change                                                |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `src/lib/server/tracker/shared/role-gates.server.ts`                                        | Add `assertManagerOrAbove`, `assertDepartmentManager` |
| `src/lib/server/tracker/analytics.server.ts`                                                | Add `getDepartmentDashboardFn`                        |
| `src/lib/server/tracker/tracker.ts`                                                         | Export new function                                   |
| `src/lib/server/tracker/members/members.server.ts`                                          | Add manager-scoped member listing                     |
| `src/routes/app/department-analytics.tsx` **(new)**                                         | Route for department dashboard                        |
| `src/components/time-tracker/AppSidebar.tsx` / `Sidebar.tsx`                                | "Department" nav link for managers                    |
| `src/components/time-tracker/analytics/department/DepartmentDashboardScreen.tsx` **(new)**  | Main screen                                           |
| `src/components/time-tracker/analytics/department/MemberBreakdownTable.tsx` **(new)**       | Member stats table                                    |
| `src/components/time-tracker/analytics/department/DepartmentProjectBreakdown.tsx` **(new)** | Project stats chart                                   |
| `src/components/time-tracker/analytics/department/DepartmentDailyChart.tsx` **(new)**       | Daily bar chart                                       |
| `src/components/time-tracker/analytics/department/DepartmentHeatmap.tsx` **(new)**          | Member × day heatmap                                  |
| `src/components/time-tracker/analytics/AnalyticsScreen.tsx`                                 | Link to department dashboard                          |
| `src/components/time-tracker/analytics/AnalyticsFilterBar.tsx`                              | Member filter dropdown                                |
| `src/routes/app/workspace/members.tsx`                                                      | Allow managers with department scope                  |
| `src/components/time-tracker/MembersTable.tsx`                                              | Manager-aware rendering                               |

---

## Feature #5 — Export with Calculated Bill Amounts

> **Goal:** Display calculated billable amounts per entry inline in the UI for both the analytics table and the dashboard entries list. Enrich CSV export with per-entry bill calculation.

### 5.1 What Already Exists

- **`src/lib/time-tracker/billing.ts`** — `computeEffectiveRate()`, `formatCurrency()`, `toFiniteRate()` ✅
- **`src/lib/server/tracker/export.server.ts`** — `exportAnalyticsCsv` already has "Rate/hr" and "Amount" columns ✅
- **`src/components/time-tracker/dashboard/EntryCard.tsx`** — Already shows billable amount inline for billable entries ✅

### 5.2 Analytics Entries Table — Add Amount Column

**File:** `src/lib/server/tracker/analytics.server.ts`

Extend `AnalyticsTimeEntryRow` type:

```typescript
export type AnalyticsTimeEntryRow = {
  // ... existing fields
  billableAmount: number | null // new
  effectiveRate: number | null // new
}
```

**Query changes** in `getAnalytics()`:

- Join `workspaces` for `defaultBillableRate` and `billableCurrency`
- Join `workspaceMembers` for `billableRate` per member
- For each paginated entry row, compute:
  ```typescript
  const effectiveRate = computeEffectiveRate(memberRate, defaultRate)
  const hours = entry.durationSeconds / 3600
  const billableAmount = entry.billable ? hours * effectiveRate : null
  ```
- Return `billableAmount` and `effectiveRate` in each entry row

**File:** `src/components/time-tracker/analytics/AnalyticsEntriesTable.tsx`

- Add a new **Amount** column (right-aligned, between Duration and Billable)
- Show `formatCurrency(entry.billableAmount, currency)` for billable entries
- Show `—` for non-billable entries
- Add `currency` as a new prop

### 5.3 Print View Enhancement

**File:** `src/components/time-tracker/analytics/AnalyticsScreen.tsx`

The print-only table currently lacks the Amount column. Add:

```tsx
<th className="px-2 py-1.5 text-right font-bold">Rate/hr</th>
<th className="px-2 py-1.5 text-right font-bold">Amount</th>
```

And in each row:

```tsx
<td className="px-2 py-1.5 text-right tabular-nums">
  {entry.billable && entry.effectiveRate
    ? formatCurrency(entry.effectiveRate, currency)
    : '—'}
</td>
<td className="px-2 py-1.5 text-right tabular-nums">
  {entry.billable && entry.billableAmount
    ? formatCurrency(entry.billableAmount, currency)
    : '—'}
</td>
```

### 5.4 Dashboard Entry Row — Add Amount Column

**File:** `src/components/time-tracker/dashboard/EntryRow.tsx`

- Add a new column between the billable toggle and the actions column
- Show `formatCurrency((seconds / 3600) * rateLookup(entry.workspaceMemberId), currency)` for billable entries
- Show `—` for non-billable entries
- Already supported in `EntryCard.tsx` — ensure consistency

### 5.5 EntriesSection — Pass Rate Data to EntryRow

**File:** `src/components/time-tracker/dashboard/EntriesSection.tsx`

- `currency` and `rateLookup` are already passed as props to `EntriesSection`
- Pass them through to `EntryRow` rendering (currently only passed to `EntryCard`)
- In day-group headers (when collapsed), show total billable amount for that day's billable entries

### 5.6 Enhanced CSV Export

**File:** `src/lib/server/tracker/export.server.ts`

The existing `exportAnalyticsCsv` function already has complete Rate/hr and Amount columns. Verify:

- All entries include member-specific `billableRate` from `workspaceMembers`
- Fallback to workspace `defaultBillableRate` when member rate is null
- `computeEffectiveRate` is used consistently
- Currency is included
- Column headers: `Date`, `Member`, `Email`, `Project`, `Client`, `Tags`, `Description`, `Started`, `Ended`, `Hours`, `Billable`, `Rate/hr`, `Amount`, `Notes`

Add new export option: **"Export with billing"** — same as analytics CSV but explicitly labeled for billing purposes.

### 5.7 Files Changed

| File                                                              | Change                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/lib/server/tracker/analytics.server.ts`                      | Add `billableAmount`, `effectiveRate` to `AnalyticsTimeEntryRow` |
| `src/components/time-tracker/analytics/AnalyticsEntriesTable.tsx` | Add Amount column                                                |
| `src/components/time-tracker/analytics/AnalyticsScreen.tsx`       | Add Amount to print table                                        |
| `src/components/time-tracker/dashboard/EntryRow.tsx`              | Add Amount column                                                |
| `src/components/time-tracker/dashboard/EntriesSection.tsx`        | Pass `currency` + `rateLookup` to EntryRow; show day totals      |
| `src/lib/server/tracker/export.server.ts`                         | Verify/enhance per-entry bill amounts                            |
| `src/components/time-tracker/shared/ExportMenu.tsx`               | Add "Export with billing" option                                 |

---

## Implementation Order

| Phase       | Feature                                                      | Rationale                                                          |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| **Phase 1** | #5 Export — Add bill columns to analytics table & entry list | No dependencies; provides immediate value to all users             |
| **Phase 2** | #2 Time Entries List — New "All" view mode                   | Depends on Phase 1 for consistent bill amount display in entries   |
| **Phase 3** | #4 Manager Department Analytics                              | Depends on Phase 1 for billing display in analytics; largest scope |

---

## Risks & Mitigations

| Risk                                                     | Mitigation                                                                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Performance of "all entries" for users with 10k+ entries | Cursor-based pagination with `startedAt` indexed column; limit 50 per page                                 |
| Manager sees wrong department data                       | Use `access.member.departmentId` from server-side session, never from request params                       |
| Bill calculation uses stale member rates                 | Recalculate at query time using current workspace + member rates; no caching of calculated amounts         |
| No database schema changes required                      | All calculations are query-time; no migrations needed                                                      |
| Route conflicts                                          | New file-based route `/app/department-analytics` will auto-register via TanStack Router's file conventions |

---

## Validation Plan

| Feature                    | Test                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **#2 — All entries**       | Load dashboard with 200+ entries across 6 months; verify pagination, load more, filters, date grouping                                                                                                 |
| **#4 — Manager dashboard** | Create department with 3 members, 50 entries each; verify manager sees correct totals, member breakdown, amounts; verify employee gets redirected                                                      |
| **#4 — Members page**      | As manager, verify you see only your department's members; verify you can edit their rates/roles; verify you cannot access other departments                                                           |
| **#5 — Bill amounts**      | Create entries with/without billable flag; verify analytics table shows amount only for billable entries; verify CSV export has correct Rate/hr and Amount columns; verify print view includes amounts |
| **#5 — Cross-feature**     | Verify All Entries view and Department Dashboard both display correct billable amounts                                                                                                                 |
