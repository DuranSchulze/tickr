# Time Tracker Entries Table — Redesign Plan

## Motivation

The current entries table is dense and overwhelming. Each row contains inline ProjectPicker, TagPicker, BillableToggle, inline time editing, description editing, and action buttons. The nested collapsible day groups and task groups create two layers of toggling. The `SearchableCreatePopover` dropdowns cause cells to visually shift/resize when opened because the absolutely-positioned dropdown is mounted inside the `<td>`.

Goal: A clean, simple table using shadcn `Table` primitives, with a single day as the default view, preserved task grouping, and zero cell-resizing when interacting with inline controls.

---

## Part 1 — Default View: Day

### Current behavior

- The `DashboardHeader` has Day / Week / Month toggle, defaulting to `week`
- `TimeTrackerDashboard` receives `view` from URL search params, defaults to `'week'`
- `EntriesSection` always groups entries by day, even in week/month view
- The day-group collapse/expand adds visual complexity

### Proposed change

1. **Change the default view from `'week'` to `'day'`** in `TimeTrackerDashboard`
2. **Keep the Day/Week/Month toggle** in `DashboardHeader` — user can still switch
3. **Simplify `EntriesSection` when view is `'day'`:**
   - Only 1 day group is shown (today or the selected date)
   - Remove the day-group collapse/expand toggle (it's just one day)
   - Remove the "Collapse all" / "Expand all" button (irrelevant for single day)
   - Remove the "Show N more days" pagination (irrelevant for single day)
4. **When view is `'week'` or `'month'`, keep day-group headers** but simpler (no separate entry count per day — just date label + total)

### Files affected

- `TimeTrackerDashboard.tsx` — change default view
- `EntriesSection.tsx` — conditionally render day-group toggles based on view mode

---

## Part 2 — Simplified Table Layout

### Current structure

```
┌─────────┬──────────┬────────┬────────────┬──────────────┬──────────┐
│  Task   │ Project  │  Tags  │  Billable  │   Duration   │ Actions  │
│  (desc  │ (picker  │ (picker│ (toggle    │  (inline     │ (resume, │
│  +date) │ dropdown)│ popover│  button)   │  time edit)  │  ...,del)│
├─────────┼──────────┼────────┼────────────┼──────────────┼──────────┤
│  entry1 │          │        │            │              │          │
│  entry2 │          │        │            │              │          │
└─────────┴──────────┴────────┴────────────┴──────────────┴──────────┘
```

Each row has too many interactive controls, making the table feel heavy.

### Proposed structure

```
┌──────────────────────────┬───────────────────┬───────────┬──────────┐
│         Task             │     Project       │  Duration │          │
│  (description + tags     │  (color badge +   │  (time +  │ Actions  │
│   + billable badge)      │   name, click to  │  earnings)│  (menu)  │
│                          │   change)         │           │          │
├──────────────────────────┼───────────────────┼───────────┼──────────┤
│  entry1                  │                   │           │          │
│  entry2                  │                   │           │          │
└──────────────────────────┴───────────────────┴───────────┴──────────┘
```

**Columns reduced from 6 to 4:**
| Column | Content |
|---|---|
| **Task** | Description (inline editable on click), small tag chips, billable badge. No separate Tags or Billable columns. |
| **Project** | Color dot + project name. Clicking opens a **popover** (not an inline dropdown that shifts the cell). The popover is rendered at the document root via portal so it never affects cell sizing. |
| **Duration** | Formatted time. Start → end time below (inline editable). Revenue below if billable. |
| **Actions** | A single `...` dropdown menu with: Edit date/time, Duplicate, Delete. Resume button shown inline when entry is ended. |

### Why this is better

- **3 data columns + 1 action column** vs current 5 + 1
- Tags and billable are **chips inside the Task cell** — no separate columns, no extra pickers
- Project picker uses a **popover/portal** — no cell resizing
- The `SearchableCreatePopover` dropdown issue is eliminated from the table entirely

### Files affected

- `EntryRow.tsx` — complete rewrite to use shadcn `Table` components and simplified columns
- New inline project popover component (or reuse `ClientProjectPicker` with portal)
- `TaskGroupHeaderRow` — simplify to match new column structure

---

## Part 3 — Task Grouping (Preserved)

### Current behavior

- Entries with the same description + project + tags + billable are grouped
- `TaskGroupHeaderRow` shows a collapsible header row with description, project, tags, billable, total duration, and a resume button
- Sub-entries show only time range and compact actions

### Proposed behavior

- **Keep grouping logic** (`groupEntriesByTask` function unchanged)
- **Group header row** becomes simpler — shows description, project, total duration, and a count badge. No separate tags/billable display (those appear on sub-entries).
- **Sub-entries** when expanded show the same simplified row format, but with a left indent and time-only in the Task cell
- The collapsible toggle uses a chevron icon at the start of the row

### Files affected

- `TaskGroupHeaderRow` — simplify columns to match new 4-column layout
- `EntryRow` — sub-entry (`isSubEntry`) path simplified

---

## Part 4 — Fix "Cell Expands When Dropdown Activated" Bug

### Root cause

The `SearchableCreatePopover` component renders its dropdown as an absolutely-positioned `<div>` mounted **inside** the relative parent `<div>` which sits inside the `<td>`. Even though the dropdown is `position: absolute`, the `<td>` still recalculates its size because:

- The trigger button's content changes when selected state changes
- Some table rendering engines (especially with `table-layout: auto`) measure all child content

### Fix

Replace the inline `SearchableCreatePopover` in the table rows with a **portal-based popover**:

- Use shadcn's `Popover` component which renders into `document.body` via portal
- The popover trigger is just the project name (text button), not a full picker button
- When clicked, the popover appears at the trigger's position, completely detached from the table cell DOM
- This guarantees zero cell resizing

For **tag selection** in the table: tags are displayed as chips. Clicking a "+" or "edit" icon opens a popover with tag checkboxes (also portal-based).

For **billable toggling**: use a simple muted/colored text indicator or a small inline icon that toggles on click.

### Files affected

- `EntryRow.tsx` — replace `ProjectPicker` + `TagPicker` + `BillableToggleButton` with simple text triggers + portal popovers
- New `InlineProjectPopover.tsx` — small popover component for changing project from table row
- New `InlineTagPopover.tsx` — small popover for adding/removing tags from table row

---

## Part 5 — Use shadcn `Table` Primitives

### Current

Raw `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>` elements with manual styling.

### Proposed

Wrap the entries table with shadcn `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` from `src/components/ui/table.tsx`.

Benefits:

- Consistent styling with the rest of the app (MembersTable already uses these)
- Built-in `overflow-x-auto` wrapper for responsive horizontal scroll
- Standardized padding, hover states, border behavior
- Removes the need for manual `w-* min-w-*` width management

### Implementation

```tsx
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '#/components/ui/table'

<Table>
  <TableHeader>
    <TableRow>
      <TableHead className="w-[55%]">Task</TableHead>
      <TableHead className="w-[20%]">Project</TableHead>
      <TableHead className="w-[15%]">Duration</TableHead>
      <TableHead className="w-[10%]"></TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {rows.map(...)}
  </TableBody>
</Table>
```

---

## Implementation Status — ✅ Complete

| Step | What                                                                                           | Status  |
| ---- | ---------------------------------------------------------------------------------------------- | ------- |
| 1    | Change default view to `'day'`                                                                 | ✅ Done |
| 2    | Build `InlineProjectPopover` (portal-based)                                                    | ✅ Done |
| 3    | Build `InlineTagPopover` (portal-based)                                                        | ✅ Done |
| 4    | Rewrite `EntryRow.tsx` — 4 columns, shadcn Table, inline popovers                              | ✅ Done |
| 5    | Simplify `TaskGroupHeaderRow` — match new columns                                              | ✅ Done |
| 6    | Conditionally hide day-group controls in day view                                              | ✅ Done |
| 7    | Clean up unused code (removed `ProjectPicker`, `TagPicker`, `BillableToggleButton` from table) | ✅ Done |

---

## What Stays the Same

- All server functions (`stopTimerFn`, `updateEntryFn`, etc.)
- All hook logic (`useTimerCore`, `useDraftAndEdit`, `useTrackerMutations`)
- `EntryCard` (mobile) — already clean, no changes needed
- `EntriesFilters` — unchanged
- `EditEntryDrawer` — unchanged
- Grouping logic (`groupEntriesByTask`, `groupEntriesByDay`, `taskGroupKey`)
- Props interface of `EntriesSection`

---

## Visual Mock (Text)

```
Day view: Mon, Jan 15 — 4 entries

┌─────────────────────────────────────────────────────────────┐
│  Task                              Project    Duration  ⚙️  │
├─────────────────────────────────────────────────────────────┤
│  🞃 Design landing page (×3)       🟣 Design   3h 12m   ▶️  │
│    ↳ 9:00 AM → 10:30 AM                                              │
│    ↳ 10:30 AM → 11:45 AM                                             │
│    ↳ 1:00 PM → 2:15 PM                                               │
├─────────────────────────────────────────────────────────────┤
│  📝 Write API docs                🔵 Backend   1h 30m   ▶️  │
│  $ 💰 Billable                    [9:00→10:30]                      │
├─────────────────────────────────────────────────────────────┤
│  🐛 Fix login bug                 🔵 Backend   45m      ▶️  │
│  🏷️ bug, urgent  $ 💰 Billable   [10:30→11:15]                    │
└─────────────────────────────────────────────────────────────┘
```

Notes:

- Grouped tasks show a chevron + count badge, expandable inline
- Single tasks show full detail in one row
- Tags and billable are chips inside the Task cell
- Project is a simple colored badge, clickable to change
- All popovers use portals (no cell resizing)
