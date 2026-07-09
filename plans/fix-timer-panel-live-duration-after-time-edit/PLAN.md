# Fix Timer Panel Live Duration After Time Edit

> **Status:** ✅ Done

## 1. Goal

Fix the TimerPanel running-entry edit flow so changing the start time of an ongoing task immediately displays an accurate live timer and accurate live total everywhere on the dashboard, including the running panel, entry list/card duration, document title/extension state, and Today/Week header totals.

## 2. Context Summary

The user reported that editing and saving the time in the TimerPanel entry input section for an ongoing task makes the live timer and live duration inaccurate or not update correctly. The app is a React 19, TanStack Router/Start, TanStack Query, Drizzle, Vite project using `pnpm`.

Confirmed repository facts:

- The running TimerPanel display is rendered through `src/components/time-tracker/dashboard/TimerPanel.tsx` and `RunningTimer.tsx`.
- Running duration is derived from `startedAt` by `getEntrySeconds()` / `getEntrySecondsPrecise()` in `src/lib/time-tracker/store.ts`.
- Header totals use `getEntrySecondsInRange()` in `src/components/time-tracker/dashboard/DashboardHeader.tsx`.
- Timer input state and active-entry composition live in `src/components/time-tracker/dashboard/hooks/useTimerCore.ts`.
- The TimerPanel start-time edit calls `persistActiveTimerStartedAt`, which sets local `timerStartedAt` and calls `mutations.updateActiveTimer` without invalidating.
- Server-side `updateActiveTimer` accepts optional `startedAt` and updates the running entry in `src/lib/server/tracker/timer.server.ts`.
- Server-side `stopTimer` calculates final `durationSeconds` from the persisted DB `startedAt`, so final saved duration should be correct if the start-time update reaches the server before stop.

Likely root cause:

- The TimerPanel start-time edit updates only local overlay state (`timerStartedAt`) and fires an async server mutation, but it does not patch the tracker-state query cache with the edited running entry. Any derived UI reading `state.entries`, `summaryEntries`, `visibleEntriesSource`, or refs built before the overlay propagates can keep using the stale `startedAt` until another invalidation/refetch or active-entry sync occurs.
- There is also a potential race when a user edits the running start time and immediately stops the timer: `stopTimer()` clears pending description autosaves, but `persistActiveTimerStartedAt()` is an independent in-flight mutation. The stop call can calculate final duration against the old server `startedAt` if the start-time mutation has not completed first.

Assumptions and missing information:

- The reported "display accurate live total" refers primarily to the TimerPanel running timer and DashboardHeader Today/Week total.
- The intended behavior is that a running timer edited from 09:00 to 08:30 immediately shows 30 extra minutes in all live displays.
- The start-time edit intentionally edits time-of-day on the same date as the current running entry; date editing for running timers is out of scope unless already supported elsewhere.

## 3. Scope

- Trace and fix the running timer start-time edit path in TimerPanel.
- Ensure the optimistic active entry and React Query tracker-state cache agree immediately after editing start time.
- Ensure live duration displays derive from the same updated `startedAt`.
- Ensure stopping immediately after a start-time edit saves the correct duration.
- Add focused regression coverage for live duration/range calculations and the running timer start-time update behavior where practical.
- Run typecheck and lint after implementation.
- Provide manual smoke test steps for desktop and mobile timer flows.

## 4. Out of Scope

- Redesigning TimerPanel or the dashboard layout.
- Changing manual-entry duration logic.
- Changing analytics rollup logic unrelated to active timers.
- Adding new database columns or migrations.
- Reworking offline queue architecture beyond preserving existing behavior.
- Adding multi-day running timer editing unless needed to fix the current same-day time edit.

## 5. Affected Files and Folders

```txt
src/
  components/
    time-tracker/
      dashboard/
        TimerPanel.tsx
        RunningTimer.tsx
        DashboardHeader.tsx
        TimeTrackerDashboard.tsx
        hooks/
          useTimerCore.ts
          useNowTick.ts
  lib/
    time-tracker/
      store.ts
      query-keys.ts
      __tests__/
  lib/
    server/
      tracker/
        timer.server.ts
        shared/
          schemas.ts
      __tests__/
plans/
  fix-timer-panel-live-duration-after-time-edit/
    PLAN.md
```

Important paths:

- `src/components/time-tracker/dashboard/TimerPanel.tsx`: owns the "Started at" edit input and calls `onUpdateStartedAt`.
- `src/components/time-tracker/dashboard/hooks/useTimerCore.ts`: owns `activeEntry`, `timerStartedAt`, optimistic active state, start/stop logic, and `persistActiveTimerStartedAt`.
- `src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx`: builds `summaryEntries`, `visibleEntriesSource`, active-entry refs, and passes live state into header/list/input components.
- `src/components/time-tracker/dashboard/DashboardHeader.tsx`: calculates Today/Week live totals from the entries array.
- `src/components/time-tracker/dashboard/RunningTimer.tsx`: renders the live running timer.
- `src/lib/time-tracker/store.ts`: contains duration/range helpers that should remain the single source for calculating live seconds.
- `src/lib/time-tracker/query-keys.ts`: provides `upsertTrackerStateEntry`, likely needed to patch the running entry cache after a start-time edit.
- `src/lib/server/tracker/timer.server.ts`: confirms backend update/stop behavior; only edit if race handling requires server support.

## 6. Step-by-Step Implementation Plan

1. Reproduce the affected path in code and, if possible, browser.

   What to do: Start a timer, note the running duration and Today total, edit "Started at" in TimerPanel to an earlier time, blur/Enter, then observe TimerPanel, header total, row/card duration, browser title, and stop result.

   Why it is needed: Confirms whether the stale value is limited to one component or affects shared dashboard state.

   Files or folders affected: No edits; inspect `TimerPanel.tsx`, `useTimerCore.ts`, `DashboardHeader.tsx`, `RunningTimer.tsx`.

   Dependencies: Run before code changes.

2. Introduce a single local helper in `useTimerCore.ts` to build the updated running entry after a start-time edit.

   What to do: In the `persistActiveTimerStartedAt` path, create an updated entry from `activeEntryBase` plus the current timer form fields and the new `startedAt`. Preserve `endedAt: null` and existing `durationSeconds`.

   Why it is needed: All optimistic and cached consumers need the same entry shape immediately.

   Files or folders affected: `src/components/time-tracker/dashboard/hooks/useTimerCore.ts`.

   Dependencies: Must use existing `singleTagIds` conventions and avoid changing unrelated timer state.

3. Patch all relevant local state immediately when start time changes.

   What to do: After validating the new ISO value, update `timerStartedAt`, update `optimisticActiveEntry` when applicable, and call `upsertTrackerStateEntry(queryClient, updatedEntry)`. Then call `router.invalidate()` without forcing a full stale refetch unless needed.

   Why it is needed: `activeEntry`, `state.entries`, `summaryEntries`, `visibleEntriesSource`, and list/card displays should all see the same `startedAt` without waiting for the server.

   Files or folders affected: `useTimerCore.ts`, possibly `query-keys.ts` only if a more specific cache helper is needed.

   Dependencies: Should be done before changing stop behavior so UI and cache are consistent.

4. Prevent immediate stop from racing with the start-time update.

   What to do: Track the in-flight `updateActiveTimer` promise or pending edited `startedAt` in `useTimerCore.ts`. When `stopTimer()` is called, ensure the latest edited `startedAt` has either been persisted before stop or is included in a safe server-supported stop path.

   Why it is needed: The server currently calculates stop duration from DB `startedAt`; if stop wins the race, the saved duration can be wrong even though the UI looked correct.

   Files or folders affected: Primarily `useTimerCore.ts`; candidate backend edit in `src/lib/server/tracker/shared/schemas.ts` and `src/lib/server/tracker/timer.server.ts` only if stop must accept a `startedAt` override atomically.

   Dependencies: Choose the smallest safe approach after checking mutation return behavior. Prefer awaiting/serializing the active-timer update in the client if it is reliable.

5. Add validation guardrails for running start-time edits.

   What to do: Keep rejecting invalid times and future start times. Add or preserve user feedback if a start-time edit is ignored. Ensure no `NaN` date is passed to mutation/cache. Preserve the same-date behavior in `TimerPanel.tsx`.

   Why it is needed: Prevents incorrect negative or future live durations.

   Files or folders affected: `TimerPanel.tsx`, `useTimerCore.ts`.

   Dependencies: Should not relax existing validation.

6. Add focused regression tests for duration helpers and update flow.

   What to do: Add tests under `src/lib/time-tracker/__tests__/` for `getEntrySeconds`, `getEntrySecondsPrecise`, and `getEntrySecondsInRange` using a running entry whose `startedAt` changes. If a pure helper is introduced for building the updated active entry, test it directly.

   Why it is needed: The broken behavior is a time-calculation regression; pure helper tests make it cheap to lock down.

   Files or folders affected: `src/lib/time-tracker/__tests__/` or an existing nearby test file.

   Dependencies: If no pure helper is introduced, keep tests limited to existing pure functions and manual/browser validation for React state.

7. Run automated checks.

   What to do: Run `pnpm typecheck`, `pnpm lint`, and the focused test command. Run broader `pnpm test` if the focused change touches shared helpers.

   Why it is needed: The fix touches dashboard state and shared duration helpers, so type and lint confidence matters.

   Files or folders affected: No source edits beyond fixes revealed by checks.

   Dependencies: Run after implementation.

8. Manual smoke test the end-to-end flow.

   What to do: On `http://localhost:3000/app/time-tracker`, start a timer, edit start time earlier and later, verify TimerPanel live timer and Today/Week totals update immediately, verify row/card duration updates, stop the timer, and verify the saved duration matches the displayed live duration. Repeat once from the mobile dialog.

   Why it is needed: The bug is UI/state timing-sensitive and should be validated in the browser.

   Files or folders affected: No edits unless smoke test reveals issues.

   Dependencies: Requires local dev server and authenticated test workspace.

## 7. Database Changes

No database changes required.

## 8. Backend Changes

The current backend already supports `updateActiveTimerSchema.startedAt` and persists it in `updateActiveTimer`. `stopTimer` calculates `durationSeconds` from the database `startedAt` and the final `endedAt`.

Backend edits are not expected unless client-side serialization cannot reliably prevent the edit/stop race. If backend support is needed, the smallest change would be to allow `stopTimerSchema` to accept an optional `startedAt`, validate it is a valid datetime before `endedAt` and not in the future, persist it together with `endedAt`, and calculate `durationSeconds` from that effective start time. This would make stop atomic when the latest start edit is still in flight.

No routes, middleware, jobs, permissions, or policies should change.

## 9. Frontend Changes

- `TimerPanel.tsx`: Keep the existing start-time input UX. Ensure invalid or future edits are not silently confusing; either retain the old displayed value or surface existing toast/error behavior through the parent if needed.
- `useTimerCore.ts`: Make `persistActiveTimerStartedAt` update all local active-entry sources immediately: overlay state, optimistic active entry, tracker-state cache, and router-derived consumers.
- `useTimerCore.ts`: Serialize or otherwise coordinate start-time update with `stopTimer()` so the final saved duration matches the displayed live timer.
- `TimeTrackerDashboard.tsx`: Review whether `summaryEntries` and `visibleEntriesSource` receive the patched entry from cache/activeEntry without duplicate IDs or stale entries.
- `DashboardHeader.tsx`: No algorithm change expected; it should become correct once its entries contain the edited `startedAt`.
- `RunningTimer.tsx`: No algorithm change expected; it already derives live seconds from `entry.startedAt`.

Loading/error states:

- Keep stop/start pending behavior unchanged.
- If the start-time mutation fails, roll back the optimistic start time to the previous entry and show an error toast consistent with existing timer mutation failures.

Responsive behavior:

- Verify desktop inline TimerPanel and mobile full-screen dialog both use the same `onUpdateStartedAt` path.

## 10. Validation Rules

- Running timer start-time edit must parse to a valid date.
- Edited start time must be earlier than the current time.
- Edited start time must preserve the running entry as ongoing (`endedAt` remains `null`).
- Live duration must never display negative time; existing `Math.max(0, ...)` helpers should remain.
- Stop must require non-empty description, client/project, and at least one tag as currently enforced.
- If backend stop accepts a `startedAt` override, it must validate `startedAt < endedAt <= now`.
- Same-day time editing should preserve the date of the existing running entry unless a separate date-picker flow is introduced later.

## 11. Security Considerations

- Authentication and workspace membership should continue to be enforced by existing server functions.
- Users must only update active timers belonging to their own workspace member; existing `updateActiveTimer` and `stopTimer` checks should remain.
- Client-provided timestamps are untrusted. The server should continue rejecting or clamping future timestamps.
- No sensitive data, upload, rate-limit, or tenant-boundary changes are required.
- If stop receives a `startedAt` override, backend validation must prevent creating negative or implausibly future durations.

## 12. Testing Plan

- Happy path: Start a timer, edit start time earlier, live timer increases immediately, header Today total increases immediately, stop saves the same duration.
- Happy path: Edit start time later but still in the past, live timer decreases immediately and never goes negative.
- Error case: Enter a future start time; the edit is rejected and the timer keeps the prior start time.
- Error case: Server updateActiveTimer fails after optimistic start-time edit; UI rolls back to previous start time.
- Edge case: Running timer crosses Today/Week boundaries; `getEntrySecondsInRange` counts only the in-range segment after `startedAt` changes.
- Edge case: Duration formatting modes still tick at the correct interval through `getFormatterLiveTickMs`.
- Permission case: Backend continues to reject editing another user's active timer through existing membership filters.
- Regression coverage: Add pure tests for running entry duration after changing `startedAt` and range-total calculations.
- Manual smoke: Verify desktop and mobile TimerPanel flows at `http://localhost:3000/app/time-tracker`.
- Required checks: `pnpm typecheck`, `pnpm lint`, focused `pnpm test` command, and broader `pnpm test` if shared helper changes are non-trivial.

## 13. Rollback Plan

Revert the frontend changes in `useTimerCore.ts`, `TimerPanel.tsx`, and any related dashboard files. Revert any added tests. If no backend changes are made, rollback is code-only with no data work. If backend stop schema support is added, revert the schema/server changes together with the client call-site change; no migration rollback is required because no database schema changes are planned.

Existing saved time entries remain valid. If a bad deployment saved incorrect durations during testing, correct those rows manually through the app's edit-entry flow or a controlled database update after identifying affected entry IDs.

## 14. Final Checklist

- [x] Plan reviewed
- [x] Files identified
- [x] Database changes checked
- [x] Backend changes checked
- [x] Frontend changes checked
- [x] Validation rules checked
- [x] Security considerations checked
- [x] Tests planned
- [x] Rollback plan reviewed
- [ ] Assumptions and open questions resolved
