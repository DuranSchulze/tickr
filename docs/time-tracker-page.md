# Time Tracker Page

## Purpose

This document maps the current `/app/time-tracker` page so future work can
quickly understand the page structure, timer lifecycle, entries table behavior,
server functions, and performance guardrails.

The page is an operational workspace for one member's time tracking. It supports
live timers, manual entries, inline entry edits, grouped task history, date and
attribute filters, offline queuing, export, and Google Sheet sync metadata.

## Route and loading path

- Main route: `src/routes/app/time-tracker/index.tsx`
- URL: `/app/time-tracker`
- Search params:
  - `view`: `day`, `week`, `month`, or `all`
  - `date`: optional `YYYY-MM-DD`
- Route loader:
  - Calls `getTrackerStateFn()`
  - Stores the result under `trackerKeys.state`
  - Uses `staleTime: 60_000`
- Main component:
  - Renders `TimeTrackerDashboard`
  - Passes the route-loaded `TrackerState`

Normal page state is intentionally bounded. `getTrackerState()` loads catalog
data plus a recent entry window for the current member, including any active
timer. Older history is loaded separately by the paginated All Entries flow.

## Visible page sections

- Dashboard header:
  - Shows workspace/member context, summary totals, and the member export action.
  - Summary data merges server entries with optimistic stopped entries so totals
    update before a full route refresh completes.
- Timer and manual entry input:
  - Desktop shows the input section inline.
  - Mobile uses a floating action button and full-screen dialog.
  - Supports live timer fields, presets, manual entry creation, catalog creation,
    started-at edits, and description suggestions.
- Entries section:
  - Shows all loaded entries with date range, project, tag, billable, and sort
    filters.
  - Uses desktop table rows and mobile cards.
  - Supports inline updates, edit drawer, duplicate, delete, and one-click resume.
- Edit drawer:
  - Opens for full entry edits and can create catalog items when the member has
    permission.
- Offline banner:
  - Appears when the browser is offline.
  - Explains that actions are queued and synced on reconnect.

## Current logic

1. The route loader fetches tracker state and caches it in TanStack Query.
2. `TimeTrackerDashboard` initializes the paginated All Entries list with
   `getPaginatedEntriesFn({ limit: 50 })`.
3. `useTimerCore` owns live timer state, active timer edits, optimistic entries,
   start/stop/discard/resume actions, and timer keyboard actions.
4. `useDraftAndEdit` owns manual entry drafts, edit drawer state, inline edits,
   and offline manual-entry creation.
5. `useEntriesFilterSort` filters and sorts the visible entries source.
6. The visible entries source merges paginated entries, optimistic stopped
   entries, and the active entry so the table updates immediately after timer
   actions.
7. When reconnecting, the dashboard drains the offline queue and replays queued
   starts, stops, manual creates, and deletes in order.
8. The active timer updates the browser title and posts
   `TRACKLY_TIMER_STATE` to a parent frame once per second without forcing the
   dashboard to re-render every second.

## Timer behavior

- Starting a timer creates an optimistic active entry immediately.
- Stopping a timer creates an optimistic stopped entry immediately and clears the
  timer form so the next task feels ready.
- Discarding hides the active timer immediately and deletes or queues the delete.
- Active timer field changes autosave through `updateActiveTimerFn`.
- Stop sends the final field values with `stopTimerFn`, avoiding a race between
  debounced autosave and stop.
- One-click resume from an entry play button:
  - If no timer is running, it starts a new timer using that entry's task data.
  - If a timer is running, it validates required fields, confirms overlap when
    online, stops the current timer, patches the cache with the stopped row, and
    then starts the selected task.
  - Offline one-click switching is blocked because the current timer must be
    stopped before the next one starts.

## Overlap confirmation and session errors

Several save/stop flows call `confirmTimeEntryOverlap()` before mutating time
entries:

- Stopping a timer
- One-click switching from one timer task to another
- Creating a manual entry
- Updating an entry
- Editing a member entry from department analytics

`confirmTimeEntryOverlap()` calls `checkTimeEntryOverlapFn()` and either allows
the action, shows the overlap confirmation dialog, or cancels the action. If the
server overlap check fails, for example because the auth session or local
database connection is unavailable, the helper now catches that error, shows a
`Could not check time overlap` toast, and returns `false`.

Returning `false` is intentional. It prevents the caller from saving or stopping
when the overlap safety check could not be completed, and it avoids an unhandled
promise rejection from bubbling into Sentry as `Failed to get session`.

## Entries and grouping

Entries are grouped by day first, then by task identity.

Task group identity is:

- Normalized description
- Project id
- Sorted tag ids
- Billable value

Grouped tasks use a parent row/card when two or more entries share the same task
identity. The parent is intentionally not a normal editable entry row.

- Parent group row:
  - Shows the grouped description, count, project, tag count, billable marker,
    time bounds, and live total duration.
  - Owns the single play button for resuming that grouped task.
  - Shows a visual label: `Grouped task · one-click resume`.
- Child rows:
  - Render inside the expanded group.
  - Are visually nested with `isSubEntry`.
  - Keep entry-level edit, duplicate, delete, and overflow actions.
- Live duration:
  - Day totals and task group totals tick only when a running entry is present.
  - Group parent duration combines completed seconds with the active running
    entry's live elapsed time.

This separation is important for usability: users should see that repeated task
descriptions are grouped, but they should resume the task from the parent rather
than choosing between duplicate child play buttons.

## Data guardrails

- `getTrackerState()` runs one parallel read wave for workspace catalogs,
  members, project tasks, recent entries, entry tags, roles, cohorts, and related
  lookup data.
- The normal dashboard state only loads a recent entry window, currently
  62 days, so page load cost does not grow with the user's full history.
- The All Entries list uses `getPaginatedEntries()` with a clamped limit up to 100. The dashboard requests 50 rows at a time.
- Date range filtering in All Entries is server-backed and reloads the paginated
  list from the first page.
- Overlap checks fail closed: if `checkTimeEntryOverlapFn()` fails,
  `confirmTimeEntryOverlap()` shows a toast and cancels the attempted mutation.
- Timer start validates that the member has no existing active timer before
  inserting a new running entry.
- Timer stop validates description, project, tags, task/catalog ownership, and
  accepted timestamps before finalizing duration.
- Catalog ids are validated server-side with workspace access checks.
- Returned timer rows are patched into `trackerKeys.state` when possible so the
  UI does not need to refetch the entire dashboard after every timer action.
- Optimistic stopped entries are persisted locally until the server reports the
  same entry as stopped.

## Operational notes

- The route cache stale time is 60 seconds. If a mutation needs fresh route
  state, call `invalidateTrackerState(queryClient)` before `router.invalidate()`
  so the loader does not reuse still-fresh cached state.
- All Entries is local component state, not route-loader state. Mutations that
  affect the paginated list should call the dashboard's `refreshAllEntries()`.
- When adding timer behavior, preserve the one-running-timer invariant. The
  client may switch quickly, but the server still stops the current timer before
  starting the next.
- When changing grouped rows, keep the parent as the resume action owner and
  keep child rows visibly nested. This avoids confusing duplicate task actions.
- Local development can fail before the page loads if the auth/database
  connection is unavailable. That is separate from the time tracker UI logic.

## Related files

- `src/routes/app/time-tracker/index.tsx`
- `src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx`
- `src/components/time-tracker/dashboard/InputSection.tsx`
- `src/components/time-tracker/dashboard/AllEntriesSection.tsx`
- `src/components/time-tracker/dashboard/DayGroupEntries.tsx`
- `src/components/time-tracker/dashboard/EntryRow.tsx`
- `src/components/time-tracker/dashboard/EntryCard.tsx`
- `src/components/time-tracker/dashboard/EditEntryDrawer.tsx`
- `src/components/time-tracker/dashboard/hooks/useTimerCore.ts`
- `src/components/time-tracker/dashboard/hooks/useDraftAndEdit.ts`
- `src/components/time-tracker/dashboard/hooks/useEntriesFilterSort.ts`
- `src/lib/time-tracker/query-keys.ts`
- `src/lib/time-tracker/overlap-confirmation.tsx`
- `src/lib/time-tracker/offline-queue.ts`
- `src/lib/time-tracker/pending-entries.ts`
- `src/lib/server/tracker/state.server.ts`
- `src/lib/server/tracker/timer.server.ts`
- `src/lib/server/tracker/manual-entries.server.ts`
- `src/lib/server/tracker/entries-list.server.ts`
- `src/lib/server/tracker/shared/schemas.ts`
