# Pin Running Entry at Top of Entries List

> **Status:** 📋 Planned

## Status

- [ ] Plan created and reviewed against existing infrastructure.
- [ ] Open question resolved (pinned block style: `EntryCard` vs desktop row).
- [ ] Frontend implementation complete.
- [ ] Validation: typecheck, lint, manual smoke test.

## 1. Goal

Ensure the currently-running time entry is always visible at the top of the entries list — live-ticking and visually highlighted — regardless of the active date-range filter, the pagination page, or which day group its `startedAt` would normally fall under. Remove the running entry from the day-grouped list so it never renders twice.

## 2. Context Summary

The dashboard already has mature realtime ticking infrastructure: `RunningTimer` (timer bar), `LiveDuration` (desktop `EntryRow`), `CardDuration` (mobile `EntryCard`), `LiveGroupTotal` (day/task totals), and `HeaderTotal` (Today/Week total) all tick live via `useNowTick`. `EntryCard` already renders running entries with a pulsing "Running" badge and a `border-primary/40 ring-primary/20` highlight.

Today the running entry is surfaced in the list only indirectly:

- `TimeTrackerDashboard.tsx` builds `visibleEntriesSource` (lines 404–422) by merging `allEntries` (paginated page 1) + `pendingInRange` + `activeEntry` **only when it overlaps the active date range**.
- `AllEntriesSection.tsx` groups that list via `groupEntriesByDay()` (line 102), so the running entry lands under its own start day — and is hidden entirely when a date-range filter excludes its start date, or if it's been pushed off the paginated page.

Because the running entry is already merged into the filtered list when in range, it can currently render as an `EntryRow` (desktop) or `EntryCard` (mobile) inside the day groups — but it is not pinned, and it disappears under a date filter.

Assumptions:

- "Always show the ongoing entry" means the pinned block is independent of the project/tag/billable filters and the date-range filter (it is "ongoing" state, not historical data).
- The running entry is exposed to `AllEntriesSection` as the `activeEntry` returned by `useTimerCore` (already computed in `TimeTrackerDashboard.tsx` line 199).
- Stop/start actions remain in the timer bar and mobile FAB; the pinned block reuses the entry's existing Edit/Duplicate/Delete actions only.

## 3. Scope

- Add an `activeEntry` prop to `AllEntriesSection` and thread it from `TimeTrackerDashboard`.
- Render a pinned, highlighted running-entry block above the day groups (and above the empty state).
- Exclude the running entry from the day-grouped list to prevent double rendering.
- Guard the empty state so a lone running timer does not also show "No entries found".
- Reuse existing live-ticking leaf (`CardDuration` via `EntryCard`) — no new tick logic.

## 4. Out of Scope

- No changes to live-ticking infrastructure (`useNowTick`, `RunningTimer`, `LiveDuration`, `CardDuration`).
- No numbered pagination / pager redesign (existing cursor-based "Load more" stays).
- No cross-tab / cross-device realtime sync.
- No database or backend changes.
- No new Stop/Discard controls in the pinned block (they remain in the timer bar / FAB).
- No changes to `EntriesSection` (day/week/month views) — this targets the "All entries" view only.

## 5. Affected Files and Folders

```txt
src/
  components/
    time-tracker/
      dashboard/
        TimeTrackerDashboard.tsx   (MODIFY)
        AllEntriesSection.tsx      (MODIFY)
        EntryCard.tsx              (REFERENCE — reused, not modified)
plans/
  pin-running-entry-top/
    PLAN.md                        (NEW)
```

Important paths:

- `src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx:629` — `<AllEntriesSection>` call site; add `activeEntry={activeEntry}`.
- `src/components/time-tracker/dashboard/AllEntriesSection.tsx` — props (lines 32–57), `groups` memo (line 102), empty state (lines 218–224), `DayGroupsList` (lines 227–249).
- `src/components/time-tracker/dashboard/EntryCard.tsx` — already renders running entries with "Running" badge + live `CardDuration`; reused unchanged.

## 6. Database Design

N/A — no database changes.

## 7. Backend Implementation

N/A — no server function, schema, or endpoint changes.

## 8. Frontend Implementation

### 8.1 `TimeTrackerDashboard.tsx`

Pass the running entry into the entries section:

- Add `activeEntry={activeEntry}` to the existing `<AllEntriesSection>` call site (line 629). `activeEntry` is already destructured from `useTimerCore` at line 178.

### 8.2 `AllEntriesSection.tsx`

1. **Props** — add `activeEntry: TimeEntry | undefined` to the destructured params and its type. Import `EntryCard` from `./EntryCard` (currently only imported transitively via `DayGroupEntries`).
2. **Exclude from day groups** — change the `groups` memo so the running entry is filtered out before grouping:
   ```ts
   const groups = useMemo(
     () =>
       groupEntriesByDay(
         activeEntry ? entries.filter((e) => e.id !== activeEntry.id) : entries,
       ),
     [entries, activeEntry],
   )
   ```
3. **Pinned block** — render immediately after the section header (before the empty state and `DayGroupsList`), shown whenever `activeEntry` exists:
   - A small "Running now" label row (pulsing dot + heading).
   - An `EntryCard` for `activeEntry`, passing through the props already available in `AllEntriesSection`: `projects`, `tags`, `currency`, `rateLookup`, `pending`, `isPending={pendingEntryIds?.has(activeEntry.id)}`, `isDeleting={deletingEntryId === activeEntry.id}`, `formatTime`, `onStartEdit`, `onResume`, `onDuplicate`, `onDelete`.
4. **Empty-state guard** — change the empty-state condition from `groups.length === 0` to `groups.length === 0 && !activeEntry` so a lone running timer shows the pinned block, not "No entries found."

Behavior notes:

- The pinned block ignores project/tag/billable filters and the date-range filter (intentional — it is "ongoing" state).
- `CardDuration` keeps the pinned block live-ticking with no extra work; the `EntryCard` "Running" badge and `border-primary/40` highlight provide the visual emphasis.
- `totalCount` (the "N total entries" label) is unchanged; the running entry is already counted server-side.

## 9. Access Control

N/A — no permission changes. The entry still resolves through existing workspace/member checks.

## 10. Validation

- `pnpm run typecheck` — passes (new prop threads cleanly; `EntryCard` props are already satisfied by `AllEntriesSection`'s existing props).
- `pnpm run lint` — passes (respect `import/consistent-type-specifier-style` when importing `EntryCard`).
- Manual smoke test on `http://localhost:3000/app/time-tracker`:
  1. Start a timer → pinned "Running now" card appears at top with live seconds; entry is absent from the day groups below.
  2. Set a "Today" date filter while a timer started yesterday → pinned card still visible.
  3. Apply a project/tag/billable filter that would exclude the running entry → pinned card still visible.
  4. Create enough entries to push past page 1 (limit 50) → pinned card still visible after "Load more".
  5. Stop the timer → pinned card disappears and the entry reappears in its correct day group.

## 11. Sequencing

Single phase, two-file change — no ordering dependencies beyond `TimeTrackerDashboard` prop first, then `AllEntriesSection`.

- [ ] Thread `activeEntry` prop in `TimeTrackerDashboard.tsx`.
- [ ] Implement pinned block + filter + empty-state guard in `AllEntriesSection.tsx`.
- [ ] Run typecheck + lint + manual smoke test.

## 12. Risks & Considerations

| Risk                                                                              | Mitigation                                                                                                                                                                             |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Running entry renders twice (pinned + day group)                                  | Filter `activeEntry.id` out of `groupEntriesByDay` input.                                                                                                                              |
| Lone running timer shows both pinned card and "No entries found"                  | Guard empty state with `!activeEntry`.                                                                                                                                                 |
| `activeEntry` object identity changes every render (recomputed in `useTimerCore`) | `EntryCard` is `memo`-wrapped; its `entry` prop identity is stable across unrelated re-renders, so the pinned card still skips work. The live tick happens only inside `CardDuration`. |
| `totalCount` may not include the running entry when a date filter excludes it     | Accepted: the running entry is "ongoing" and intentionally shown outside the filtered count. Flagging, not blocking.                                                                   |
| Desktop table vs mobile card visual consistency                                   | The pinned block uses `EntryCard` at all breakpoints (see Open Questions).                                                                                                             |

## 13. Open Questions

- [ ] **Pinned block style** — default is to reuse `EntryCard` (mobile card layout) at every breakpoint for simplicity and the built-in "Running" badge. Alternative: mirror the desktop `EntryRow` (table row) via the existing `useIsDesktop` switch for a table-consistent look on desktop.
