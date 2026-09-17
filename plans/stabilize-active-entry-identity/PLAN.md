# Stabilize `activeEntry` Identity to Stop Per-Keystroke Recomputation

> **Status:** 📋 Planned

## Status

- [ ] Confirmed `activeEntry` is rebuilt as a fresh object on every render while a synced timer is running (no `useMemo`).
- [ ] Confirmed the full list of downstream memos that key on `activeEntry`.
- [ ] Confirmed a single keystroke in the timer description box re-runs grouping + filter/sort.
- [ ] Captured a "before" React DevTools Profiler recording of one keystroke.
- [ ] Wrapped `activeEntry` in `useMemo` keyed on the underlying input fields.
- [ ] Re-keyed the grouping memo on `activeEntry.id` + `activeEntry.startedAt` rather than the object.
- [ ] Co-ordinated the scope split with `intl-formatter-and-timesheet-render-cost` — this plan removes the **re-runs**, that plan makes each run **cheaper**. Neither claims the other's win.
- [ ] Validation: typecheck, lint, tests, profiler re-measure, manual smoke test (typing, sorting, editing, keyboard shortcuts).

## Verify First (No Code Change)

Reproduce and quantify the problem before writing any code. Nothing here modifies a file.

### Static inspection (no app, no browser needed)

- [ ] **1. Confirm `activeEntry` is a fresh object literal every render.** Read `src/components/time-tracker/dashboard/hooks/useTimerCore.ts:206-217`:

  ```ts
  const activeEntry =
    activeEntryBase && lastSyncedEntryIdRef.current === activeEntryBase.id
      ? {
          ...activeEntryBase,
          description: timerDescription,
          projectId: timerProjectId,
          taskId: timerTaskId || null,
          tagIds: singleTagIds(timerTagIds),
          billable: timerBillable,
          ...(timerStartedAt ? { startedAt: timerStartedAt } : {}),
        }
      : activeEntryBase
  ```

  Confirm there is **no** `useMemo` wrapper. The guard only decides _whether_ to rebuild, never _whether the result is stable_ — so while a synced timer is running, the value is a new object on every single render of the hook.

- [ ] **2. Confirm the identity reaches memos that do not care about the object's contents.** Grep each consumer and read its dependency array:

  ```bash
  cd /Users/zafajardo/Documents/Development/Tickr
  grep -n "activeEntry" src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx | head -30
  grep -n "activeEntry" src/components/time-tracker/dashboard/AllEntriesSection.tsx
  grep -n "activeEntry" src/components/time-tracker/dashboard/DayGroupEntries.tsx
  grep -n "activeEntry" src/components/time-tracker/dashboard/hooks/useTimerKeyboard.ts
  ```

  Expected consumers, all keyed on the object identity:

  | Site                               | Memo / hook            | Dependency array                                                  |
  | ---------------------------------- | ---------------------- | ----------------------------------------------------------------- |
  | `TimeTrackerDashboard.tsx:438-456` | `visibleEntriesSource` | `[activeEntry, allEntries, entriesDateRange, pendingInRange]`     |
  | `TimeTrackerDashboard.tsx:542-627` | `inputSectionProps`    | includes `activeEntry`                                            |
  | `AllEntriesSection.tsx:102-112`    | `groups`               | `[activeEntry, entries]`                                          |
  | `DayGroupEntries.tsx:659-666`      | `pinnedGroupKey`       | `[activeEntry, groups]`                                           |
  | `hooks/useTimerKeyboard.ts:69`     | effect deps            | `[activeEntry, stopBlocked, startTimer, stopTimer, discardTimer]` |

  Note that `pinnedGroupKey` and the `AllEntriesSection` grouping only read `activeEntry.id` and `activeEntry.startedAt` — they get nothing from the merged `description`/`projectId`/`tagIds` fields that cause the new identity. That mismatch is the defect.

- [ ] **3. Confirm a single keystroke triggers the whole chain.** `changeTimerDescription` (`useTimerCore.ts:389-392`) calls `setTimerDescription(value)`:

  ```bash
  sed -n '388,400p' src/components/time-tracker/dashboard/hooks/useTimerCore.ts
  ```

  `timerDescription` is `useState` in the same hook (`:190`), so every keystroke re-renders the component that calls `useTimerCore` — i.e. `TimeTrackerDashboard` — which re-creates `activeEntry` and invalidates every memo in the table above. Confirm the wiring by reading how the dashboard consumes the hook's return value (`useTimerCore.ts:1004+`).

- [ ] **4. Confirm the second, slower trigger.** `useEntriesFilterSort.ts:19` calls `useNowTick(isDurationSort ? 5000 : null)`, and its `filteredEntries` memo (`:22-42`) depends on `tickForSort` — so when the sort is `longest`/`shortest` the same pipeline re-runs every 5 s from the hook's own state, independently of `activeEntry`. Note this as an adjacent trigger that the identity fix does **not** remove.

- [ ] **5. Confirm the measured per-run cost.** From the audit, a realistic 1000-entry window over 62 days costs:

  | Step                                   | Measured                                                                                              |
  | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
  | `groupEntriesByDay` (63 day groups)    | **2.7–3.2 ms**, of which ~100% is `formatDayLabel`'s `date.toLocaleDateString` (~43 µs/day × 63 days) |
  | `useEntriesFilterSort` sort (`newest`) | **0.51 ms** (0.10 ms if timestamps were precomputed → 5×)                                             |

  So one keystroke costs roughly **3.7 ms of synchronous main-thread work** before React reconciliation of the list itself. Read `entries-grouping.ts:66-84` and `useEntriesFilterSort.ts:22-42` to see why (a formatter constructed per day; `new Date(...)` inside the sort comparator).

- [ ] **6. Confirm the `useTimerKeyboard` symptom.** Read `hooks/useTimerKeyboard.ts:47-69`. Its dependency array includes `activeEntry` and the three action functions, all of which get new identities on every dashboard render. Correctness is **fine** — the re-subscription keeps the closure fresh, so there is no stale-closure bug — but it means an `removeEventListener`/`addEventListener` pair per keystroke. Record it as a symptom of the identity problem, not as an independent bug.

- [ ] **7. Confirm the two `InputSection` render sites.** `inputSectionProps` is spread into `InputSection` at `TimeTrackerDashboard.tsx:661` and again at `:783`, so an unstable `inputSectionProps` identity costs twice.

  ```bash
  grep -n "inputSectionProps" src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx
  ```

### Requires a running app / browser

- [ ] **8. Count renders per keystroke.** Start the dev server, open `/app/time-tracker`, start a timer (so a synced `activeEntry` exists), then record a React DevTools **Profiler** session while typing a 10-character description into the "What are you working on?" box. Expected before the fix: each keystroke re-renders the dashboard and its list subtree, with `groupEntriesByDay` / the sort appearing in the flamegraph for **every** keystroke — including keystrokes that change nothing about grouping or ordering.

- [ ] **9. Confirm the grouping output is byte-identical between keystrokes.** In the Profiler, inspect two consecutive commits' grouping work: the day labels ("Today", "Yesterday", "Mon, Sep 8") are recomputed identically. This is the strongest evidence that the work is wasted — capture it as a screenshot or flamegraph excerpt for the PR.

- [ ] **10. Measure the typing responsiveness baseline.** DevTools → Performance, record ~8 s of continuous typing, and note the **Scripting** time plus the longest long-task. This is the §10 baseline.

- [ ] **11. Reproduce the null case.** With **no** timer running, `lastSyncedEntryIdRef.current !== activeEntryBase.id` (or `activeEntryBase` is null), so `activeEntry` is the passthrough `activeEntryBase` and identity is stable. Confirm typing is materially smoother with no timer running — that difference is the bug's signature and makes the diagnosis unambiguous.

## 1. Goal

Stop the dashboard from recomputing its entry-grouping and filter/sort pipeline on every keystroke in the timer description box — and on every other render of `useTimerCore` — by giving `activeEntry` a stable identity.

`activeEntry` merges the server's running entry with the user's in-progress input. It is correctly rebuilt whenever an input changes. The defect is that it is rebuilt on **every render**, whether or not any input changed, and that fresh object identity invalidates five downstream memos that do not depend on the merged fields at all — only on _which_ entry is running.

The result is roughly **3.7 ms of synchronous main-thread work per keystroke** at a realistic 1000-entry window, plus the React reconciliation of the list that follows, for grouping and sorting output that is byte-identical to the previous keystroke's.

## 2. Context Summary

### The unstable value

`src/components/time-tracker/dashboard/hooks/useTimerCore.ts:206-217` builds a new object literal on every render:

```ts
const activeEntry =
  activeEntryBase && lastSyncedEntryIdRef.current === activeEntryBase.id
    ? {
        ...activeEntryBase,
        description: timerDescription,
        projectId: timerProjectId,
        taskId: timerTaskId || null,
        tagIds: singleTagIds(timerTagIds),
        billable: timerBillable,
        ...(timerStartedAt ? { startedAt: timerStartedAt } : {}),
      }
    : activeEntryBase
```

There is no `useMemo`. The conditional guard is about _correctness_ (only merge input overrides when the base entry is the one we last synced), not about identity stability. So whenever a synced timer is running, `activeEntry` is a different object on every render — including renders where nothing it contains has changed.

### Where the identity lands

| Consumer                | Line                               | Only cares about                          |
| ----------------------- | ---------------------------------- | ----------------------------------------- |
| `visibleEntriesSource`  | `TimeTrackerDashboard.tsx:438-456` | `activeEntry.id`, range overlap           |
| `inputSectionProps`     | `TimeTrackerDashboard.tsx:542-627` | the merged fields (legitimately)          |
| `groups`                | `AllEntriesSection.tsx:102-112`    | `activeEntry.id`, `activeEntry.startedAt` |
| `pinnedGroupKey`        | `DayGroupEntries.tsx:659-666`      | `activeEntry.id`, `activeEntry.startedAt` |
| `useTimerKeyboard` deps | `hooks/useTimerKeyboard.ts:69`     | `activeEntry` truthiness / identity       |

Three of the five read only the identity of the running entry and its start time. They are invalidated by changes to `description`, `projectId`, `taskId`, `tagIds`, and `billable` — fields they never look at.

### The trigger is cheap and constant

`changeTimerDescription` (`useTimerCore.ts:389-392`) calls `setTimerDescription(value)`, and `timerDescription` is `useState` in the same hook (`:190`). Every keystroke therefore re-renders the component that owns the hook, re-creating `activeEntry` and invalidating the memo chain. Also triggered by picking a description autocomplete suggestion (`applyDescriptionSuggestion`, `:394-399`).

A second, adjacent trigger exists that this fix does **not** address: `useEntriesFilterSort.ts:19` ticks every 5 s when the sort is `longest`/`shortest`, re-running the same pipeline from its own state.

### The measured cost of one wasted pass

At a realistic 1000-entry, 62-day window:

| Step                                   | Measured       | Dominated by                                                        |
| -------------------------------------- | -------------- | ------------------------------------------------------------------- |
| `groupEntriesByDay` (63 day groups)    | **2.7–3.2 ms** | `formatDayLabel`'s `date.toLocaleDateString` (~43 µs/day × 63)      |
| `useEntriesFilterSort` sort (`newest`) | **0.51 ms**    | `new Date(...)` inside the comparator (0.10 ms if precomputed → 5×) |
| **Total per wasted pass**              | **~3.7 ms**    | before React reconciliation of the list                             |

Both numbers come from the audit, measured on this machine. They should be re-confirmed in-browser (§10) — and note the important consequence for scope: **most of the 3.7 ms is a formatter cost, which is a different plan's problem.** See below.

### The scope split — state this explicitly

Two plans touch the same code path. They must not both claim the same win:

|                                        | This plan (`stabilize-active-entry-identity`)                                                                                | `intl-formatter-and-timesheet-render-cost`                                                   |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **What it changes**                    | How **often** the pipeline runs — removes the re-runs caused by an unstable object identity                                  | How **expensive** each run is — hoists `Intl.DateTimeFormat` instances and caches day labels |
| **Effect on a keystroke**              | Removes the 2–3 ms grouping pass and the 0.5 ms sort entirely for keystrokes that do not change the running entry's identity | Makes whatever passes remain ~85× cheaper per formatter call                                 |
| **Effect on `groupEntriesByDay` cost** | None — the function is untouched                                                                                             | The dominant share of the 2.7–3.2 ms                                                         |

Fixing the formatter makes this fix **less urgent in absolute milliseconds but does not make it optional**: the pipeline would still re-run needlessly on every keystroke, would still allocate a fresh 1000-element array and re-sort it, and would still thrash `useTimerKeyboard`'s listener. Conversely, this fix alone leaves each remaining run expensive. **Both are warranted. Claim the re-run elimination here, and the per-run cost reduction there.**

### What is already good

The dashboard's tick architecture is sound and is not implicated: `EntryRow`, `EntryCard`, `LiveDuration`, and `DurationCell` are all `memo`'d, and `useStableCallback` (`DayGroupEntries.tsx:650-654`) is used to keep handler identities stable. The list-rendering work itself is well isolated; the problem is upstream, in the derived state that feeds it.

## 3. Scope

Every item is labelled `[CHECK]` (verification only, no code change) or `[FIX]` (requires a code change).

### [CHECK] — can be done today, no code change

- [ ] `[CHECK]` Confirm `activeEntry` is rebuilt per render with no `useMemo` (`useTimerCore.ts:206-217`) — Verify First step 1.
- [ ] `[CHECK]` Enumerate the five downstream consumers and their dependency arrays (step 2), and confirm three of them read only `id` + `startedAt`.
- [ ] `[CHECK]` Confirm the keystroke → `setTimerDescription` → re-render wiring (step 3).
- [ ] `[CHECK]` Confirm the adjacent 5 s trigger in `useEntriesFilterSort.ts:19` (step 4).
- [ ] `[CHECK]` Read the measured per-run costs and confirm which portions belong to which plan (step 5).
- [ ] `[CHECK]` Confirm the `useTimerKeyboard` re-subscription is a symptom, not a separate bug — no stale closure (step 6).
- [ ] `[CHECK]` Count renders per keystroke in the Profiler and capture proof that consecutive keystrokes produce byte-identical grouping output (steps 8–9).
- [ ] `[CHECK]` Capture the no-timer baseline to demonstrate the bug's signature (step 11).

### [FIX] — requires code change

- [ ] `[FIX]` Wrap `activeEntry` in a `useMemo` whose dependencies are **the actual input fields** — `activeEntryBase`, `timerDescription`, `timerProjectId`, `timerTaskId`, `timerTagIds`, `timerBillable`, `timerStartedAt` — so the object identity changes only when a field it contains actually changes.
- [ ] `[FIX]` Re-key the grouping memos on primitives rather than the object: `AllEntriesSection.tsx:102-112` and `DayGroupEntries.tsx:659-666` should depend on `activeEntry?.id` and `activeEntry?.startedAt`, not on `activeEntry`.
- [ ] `[FIX]` Review `visibleEntriesSource` (`TimeTrackerDashboard.tsx:438-456`): it reads `activeEntry.id` and range-clips the entry, so the entry's `startedAt`/`endedAt` matter — depend on those plus `id` rather than the whole object.
- [ ] `[FIX]` Verify `inputSectionProps` (`:542-627`) legitimately needs the merged fields. If it does, its invalidation on a real field change is **correct** and should be left alone — only the spurious per-render invalidation is being removed. Do not blanket-memoize it away.
- [ ] `[FIX]` Stabilize the three action functions returned by `useTimerCore` (`startTimer`, `stopTimer`, `discardTimer`) with `useCallback` so `useTimerKeyboard`'s listener is not torn down and re-added on every render. If that requires restructuring closures around refs, keep the behaviour identical — the listener content must stay current.
- [ ] `[FIX]` After the change, re-profile one keystroke and confirm the grouping/sort work no longer appears for keystrokes that do not change the running entry's identity.

## 4. Out of Scope

- **The `Intl.DateTimeFormat` / `toLocaleDateString` cost inside `formatDayLabel`** — that is `intl-formatter-and-timesheet-render-cost`. This plan removes the _re-runs_; that plan makes each run cheaper. Do not include a formatter hoist here.
- **The 5 s duration-sort tick** (`useEntriesFilterSort.ts:19`). It is a genuine re-run trigger, but it is driven by the sort mode's need for live durations, not by identity instability, and removing it would change sort correctness. Recorded here as a known remaining trigger.
- **The `TimesheetScreen` page-root tick** — `intl-formatter-and-timesheet-render-cost`.
- **`HeaderTotal`'s O(62-days) per-tick scan** — `dashboard-live-total-recompute`. Different component, different array, different trigger (the tick rather than an identity change).
- **The `optimisticStoppedEntries.length` dependency issue** in `useTimerCore.ts:260-279` (the body reads the whole array while the dep watches only its length; `upsertOptimisticStoppedEntry` at `:163-169` preserves length while changing content). This is a separate, self-healing correctness nit — a stale `localStorage` row can survive one session. It touches `useTimerCore` but is not the identity problem. Worth a follow-up plan; **do not fold it in here.**
- **`DayGroupsList`'s four inline lambda props** (`AllEntriesSection.tsx:250-253`) and memoizing `DayGroupsList`. It is not currently memoized, so the inline props cost nothing today — and adding `memo` without first stabilizing those props would silently break row memoization. Separate concern.
- **Precomputing `startedAt` timestamps to make the sort comparator 5× cheaper.** It is in the audit's measurements, but it is a change to `useEntriesFilterSort`'s internals rather than to identity. Record as a follow-up or fold into the formatter plan; not here.
- **The autosave debounce timers** (`useTimerCore.ts:311,341,371`). Verified as correctly cleared; not touched.

## 5. Affected Files and Folders

```txt
plans/
└── stabilize-active-entry-identity/
    └── PLAN.md                                          (NEW)

src/
└── components/
    └── time-tracker/
        └── dashboard/
            ├── hooks/
            │   ├── useTimerCore.ts                      (MODIFY)
            │   │     - activeEntry (:206-217): wrap in useMemo keyed on the
            │   │       underlying input fields
            │   │     - startTimer / stopTimer / discardTimer: stabilize with
            │   │       useCallback so listener deps stop churning
            │   └── useTimerKeyboard.ts                  (unchanged)
            │         - Fix is upstream: its deps (:69) become stable once
            │           activeEntry and the actions are stable. No edit
            │           expected; verify and only edit if the profiler
            │           still shows re-subscription.
            ├── TimeTrackerDashboard.tsx                 (MODIFY)
            │     - visibleEntriesSource (:438-456): depend on activeEntry.id
            │       + start/end rather than the object
            │     - inputSectionProps (:542-627): verify only; leave as-is if
            │       it genuinely consumes the merged fields
            └── AllEntriesSection.tsx                    (MODIFY)
                  - groups memo (:102-112): depend on activeEntry?.id and
                    activeEntry?.startedAt instead of the object

            DayGroupEntries.tsx                          (MODIFY)
                  - pinnedGroupKey (:659-666): depend on activeEntry?.id and
                    activeEntry?.startedAt instead of the object

Reference only (read to understand the cost being avoided, do NOT edit here):
    src/components/time-tracker/dashboard/entries-grouping.ts   (formatDayLabel, :66-84)
    src/components/time-tracker/dashboard/hooks/useEntriesFilterSort.ts (:19, :22-42)
    src/components/time-tracker/dashboard/hooks/useStableCallback.ts    (existing pattern)
```

## 6. Database Design

**N/A** — no schema, migration, or query change. This is purely client-side derived-state identity in a React hook.

## 7. Backend Implementation

**N/A** — no server function, route handler, or Zod schema change. The mutation payloads built from `timerDescription` and friends (`useTimerCore.ts:440,459,473,488,502,532`) are unaffected: the memoized `activeEntry` holds exactly the same values, just with a stable container.

## 8. Frontend Implementation

### Memoizing `activeEntry`

The merged object is a pure function of `activeEntryBase` plus six input fields, so `useMemo` is a direct fit. The dependency list must name each field the object actually reads — omitting one means the merged view goes stale, which is a correctness regression, not just a performance one. Pay particular attention to `timerStartedAt`: it is applied conditionally (`...(timerStartedAt ? { startedAt: timerStartedAt } : {})`), so it must be a dependency or an edited start time will not reach the UI.

This is the one change in the plan where an incorrect dependency array produces a **user-visible bug** (a stale description, project, or start time in the timer input) rather than merely a slow render. Treat the dependency list as the highest-risk line in the diff.

### Re-keying the grouping memos

For `AllEntriesSection.tsx:102-112` and `DayGroupEntries.tsx:659-666`, the fix is to stop passing the object into the memo's dependency array:

```tsx
// Before: [activeEntry, entries]
// After:  [activeEntryId, activeEntryStartedAt, entries]
const activeEntryId = activeEntry?.id
const activeEntryStartedAt = activeEntry?.startedAt
```

The memo bodies must then read `activeEntry` from a ref (or be restructured so the current entry is passed in at render time) rather than closing over the object — otherwise the memo captures a stale value while claiming not to depend on it. `DayGroupEntries.tsx` already uses a ref pattern elsewhere in the file; follow the existing convention rather than inventing a new one.

Note the semantics being preserved: `pinnedGroupKey` needs the running entry's **date** (to find its day group) and falls back to the newest visible group. `groups` needs the running entry's `id` and `startedAt` to exclude-and-re-prepend it. Neither needs the description or tags.

### `visibleEntriesSource`

This one genuinely uses more: it range-clips `activeEntry` against `entriesDateRange`. Its natural primitives are `activeEntry?.id`, `activeEntry?.startedAt`, and `activeEntry?.endedAt`. Depending on those three rather than the object is correct and keeps the memo stable across keystrokes.

### Stabilizing the actions for `useTimerKeyboard`

`startTimer`, `stopTimer`, and `discardTimer` are plain function declarations returned from `useTimerCore`, so they are new on every render and `useTimerKeyboard.ts:69` re-subscribes a global `keydown` listener each time. Correctness is currently fine — the fresh closure is why there is no stale-closure bug — so the change must preserve that property. The standard approach is refs: keep the handlers reading the latest state through refs and expose a `useCallback(..., [])`-stable identity. Verify explicitly that pressing `Escape` (discard) and the start/stop shortcut still act on the current timer state after the change, since a naive `useCallback` with a stale closure would break exactly that.

### `inputSectionProps` — verify, do not assume

`inputSectionProps` (`:542-627`) is consumed at `:661` and `:783`, so its identity matters twice. But unlike the grouping memos, it legitimately needs the merged fields — the timer input must show what the user typed. Its invalidation on a real field change is **correct behaviour**. The only win here is removing invalidation on renders where no field changed, which memoizing `activeEntry` already achieves. So: leave it as-is unless the profiler shows it still invalidating spuriously.

## 9. Access Control

**N/A** — no permission, role, or tenant logic is involved. `activeEntry` is the current user's own running timer, already scoped by the server-side access checks that produced `state.entries`; this plan changes only when a client-side object is recreated.

## 10. Validation

### Environment note

`pnpm <script>` **fails in this sandbox** with `EPERM: operation not permitted, mkdir '/Users/<user>/Library/pnpm/.tools/pnpm/...'`. Use the direct binaries:

```bash
cd /Users/zafajardo/Documents/Development/Tickr

./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

Known baseline: `vitest run` reports **374 passing, 1 failing (375 total)**. The failure is **pre-existing and unrelated** — `src/lib/time-tracker/payroll-periods.test.ts:6` is date-dependent and has been failing since 2026-09-15. Do not mistake it for a regression caused by this change.

### Automated

- [ ] `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — clean.
- [ ] `npx eslint src --ext .ts,.tsx --max-warnings 0` — clean. The `react-hooks/exhaustive-deps` rule is the primary safety net for the `activeEntry` memo: if it reports a missing dependency, that is a real staleness risk. **Fix the dependency list; do not suppress the warning.**
- [ ] `./node_modules/.bin/vitest run` — stays at 374 passing / 1 pre-existing failure. Note that the existing dashboard tests (`EntryCard.test.tsx`, `EntryRow.test.tsx`, `AllEntriesSection.test.tsx`) exercise the affected components and should be a useful signal that nothing structural broke.

### Performance measurement — the acceptance criterion

| Metric                                                        | Before                                         | After (target)                                                                        |
| ------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| Commits of the dashboard subtree per keystroke (Profiler)     | one full pass per keystroke                    | unchanged — the input must still re-render to show the typed character                |
| `groupEntriesByDay` appearing in the flamegraph per keystroke | **every keystroke**                            | only on the first keystroke after the running entry changes / on data change          |
| Filter/sort pass per keystroke (Profiler)                     | **every keystroke** (~0.51 ms at 1000 entries) | eliminated for keystrokes that do not change `id`/`startedAt`/range                   |
| Synchronous main-thread work per keystroke                    | **~3.7 ms**                                    | materially lower — the removed share is the grouping + sort, roughly 3.2–3.7 ms of it |
| Longest long-task during an 8 s typing recording              | record (step 10)                               | reduced                                                                               |
| `useTimerKeyboard` listener re-subscriptions during typing    | 1 per keystroke                                | ~0                                                                                    |

**Scaling check (the decisive one):** repeat the profiler measurement with a member who has substantially more entries in the 62-day window. Before the fix the per-keystroke cost grows with the entry count; after the fix, the _removed_ portion should scale with entry count (i.e. the improvement gets larger), confirming the work was proportional to the list rather than constant.

### Manual QA — no visual or interaction regression

- [ ] **Typing still works, and the input is current.** Type a description, then assert the timer input shows exactly what was typed — no lag, no dropped characters, no revert. This is the primary regression risk of memoizing `activeEntry` with a wrong dependency.
- [ ] **Every merged field still updates the input live.** Change project, task, tags, billable, and the start time one at a time and confirm each is reflected immediately in the running timer UI. Pay specific attention to **editing the start time** (`timerStartedAt` is applied conditionally, so a missing dependency shows up here first).
- [ ] **Autocomplete suggestions still apply.** Pick a description suggestion (`applyDescriptionSuggestion`, `useTimerCore.ts:394-399`) and confirm the description, project, task, and tags all update.
- [ ] **The running entry still appears in the entry list.** Start a timer on a day that has other entries. Confirm the running entry is still pinned to the top of its day group (`pinnedGroupKey`) and still excluded-then-re-prepended by `groups` — i.e. it appears exactly once, in the right place.
- [ ] **Date-range filtering still includes the running entry.** Set a date range that excludes the running entry's day and confirm it correctly disappears; set one that includes it and confirm it reappears. This exercises `visibleEntriesSource`.
- [ ] **Keyboard shortcuts still act on current state.** Press the start/stop shortcut and `Escape` (discard) at various points — with a timer running, with no timer, mid-edit. The discard timer must be the one currently running (this is the stale-closure risk from stabilizing the actions).
- [ ] **Sort modes still live-update.** Set the sort to longest/shortest and confirm the order still refreshes as durations grow (this must remain working — the 5 s tick is deliberately retained).
- [ ] **Preset application still works.** Apply a saved timer preset and confirm the input reflects it (`isApplyingPresetRef` participates in this path).
- [ ] **No new re-render loops.** With the Profiler recording, leave the page idle with a timer running: commit count should be stable and low (the live-ticking leaves only), not growing.

## 11. Sequencing

Each phase is independently shippable, but phases 2 and 3 should land together — memoizing `activeEntry` without re-keying the grouping memos leaves most of the win on the table, and re-keying without the memo is not possible.

- [ ] **Phase 1 — Verification only.** Complete every `[CHECK]` item in §3. Capture the before-Profiler recording and the no-timer comparison. **If typing does not measurably re-run grouping/sorting, stop and re-scope** — the finding is real but may not be worth touching a working input path.
- [ ] **Phase 2 — Memoize `activeEntry`.** Smallest, highest-risk change. Get the dependency list right; let `react-hooks/exhaustive-deps` and the manual QA items in §10 validate it.
- [ ] **Phase 3 — Re-key the grouping memos.** `AllEntriesSection.tsx:102-112`, `DayGroupEntries.tsx:659-666`, and review `visibleEntriesSource`. Confirm the memo bodies read from a ref rather than a stale closure.
- [ ] **Phase 4 — Stabilize the actions (optional, but included).** `startTimer` / `stopTimer` / `discardTimer` via `useCallback` + refs, removing the per-render `keydown` re-subscription. This is the part most likely to introduce a stale-closure bug — test the shortcuts explicitly.
- [ ] **Phase 5 — Validate.** Full §10 pass, and confirm the scope split with `intl-formatter-and-timesheet-render-cost` is reflected in both PR descriptions.

## 12. Risks & Considerations

| Risk                                                                 | Why it matters                                                                                                                                                                                                    | Mitigation                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Missing dependency on the `activeEntry` memo → stale timer input** | The single highest-risk change in the plan. A missing `timerStartedAt`, `timerProjectId`, etc. means the running-timer UI silently shows an old value — a correctness regression introduced by a performance fix. | Let `react-hooks/exhaustive-deps` drive the list and fix every warning rather than suppressing it. Manually change each merged field one at a time (§10) — especially the start time, which is applied conditionally.                                     |
| **Stale closure after stabilizing the actions**                      | `useTimerKeyboard` currently relies on fresh closures for correctness. A naive `useCallback(..., [])` would freeze `Escape`/start/stop against the state at first render.                                         | Keep the handlers reading current state through refs, and explicitly test each shortcut with a running timer, no timer, and mid-edit. If this proves fiddly, **drop Phase 4** — the listener churn is the smallest part of the win.                       |
| **Memo body captures the object while the deps watch primitives**    | Re-keying to `activeEntry?.id` while the body still closes over `activeEntry` produces a memo that returns a stale result and never recomputes. This looks correct and is not.                                    | Pass the current entry in at render time or read it from a ref inside the memo, following the ref pattern already used in `DayGroupEntries.tsx`. Verify by changing the running entry's description and confirming grouping still reorders appropriately. |
| **Over-memoizing `inputSectionProps`**                               | It legitimately consumes the merged fields; forcing it stable would freeze the input.                                                                                                                             | Leave it as-is unless the profiler shows spurious invalidation. Stabilizing `activeEntry` already removes the spurious case.                                                                                                                              |
| **Sort-by-duration regression**                                      | The 5 s tick in `useEntriesFilterSort.ts:19` is deliberately retained; removing it would stop live reordering.                                                                                                    | Explicitly keep it and test that the order still refreshes while a timer runs.                                                                                                                                                                            |
| **Working input path touched for a modest win**                      | Typing into the timer box is a high-traffic interaction; the absolute saving depends on entry count and is partly attributed to the formatter plan.                                                               | Phase 1 has a stop condition. If in-browser numbers are small for realistic entry counts, record the finding, land only Phase 2+3 (low risk), and leave Phase 4 out.                                                                                      |
| **Double-claiming the win with the formatter plan**                  | The ~2.7–3.2 ms grouping cost is mostly `formatDayLabel`'s `toLocaleDateString`, which the formatter plan addresses. Two plans each claiming to remove the full 3.7 ms would overstate both.                      | The scope-split table in §2 is the contract: this plan removes the **re-runs**; the formatter plan reduces **per-run cost**. Both PR descriptions must say so.                                                                                            |
| **Pre-existing failing test mistaken for a regression**              | `payroll-periods.test.ts` fails today.                                                                                                                                                                            | Record the 374/1 baseline in the PR description before starting.                                                                                                                                                                                          |

## 13. Open Questions

- [ ] **Is `activeEntry` needed in object form at all, or should the merged view be split?** A narrower design would expose `activeEntryIdentity` (id + startedAt + endedAt) for grouping/pinning and `activeEntryDraft` (the merged input fields) for the form. That is cleaner than memoizing one object and asking five consumers to look past its fields — but it is a wider refactor touching the hook's return shape and every consumer. Decision: _memoize in place first_; revisit only if consumers keep mis-keying on it. Owner: _unassigned_.
- [ ] **Include Phase 4 (stabilize the action functions)?** It removes a per-keystroke `keydown` re-subscription, which is real but the smallest share of the win, and it is the change most likely to introduce a stale-closure bug. Default: **include only if Phase 1's profiler shows the listener churn is measurable**; otherwise drop it and leave `useTimerKeyboard` as the documented symptom it currently is.
- [ ] **Should `useEntriesFilterSort`'s sort comparator precompute timestamps?** The audit measured 0.51 ms → 0.10 ms (5×) from precomputing instead of calling `new Date(...)` per comparison. That is a cheap, independent win inside the same pipeline. Decision: assign to `intl-formatter-and-timesheet-render-cost` (same "make each run cheaper" theme), or to this plan (same pipeline)? Owner: _unassigned_. **Do not do it in both.**
- [ ] **Should the `optimisticStoppedEntries.length` dependency issue (`useTimerCore.ts:260-279`) get its own plan?** It is a genuine, self-healing correctness nit in the same file — a content change that preserves array length can skip the effect and leave a stale `localStorage` row for one session. Owner: _unassigned_. Default: separate small plan; keep it out of this diff so this PR stays reviewable as a pure identity change.
- [ ] **Should `DayGroupsList` be memoized?** Only meaningful after its four inline lambda props (`AllEntriesSection.tsx:250-253`) are stabilized; doing one without the other would silently break the row-level memoization it is meant to protect. Owner: _unassigned_. Out of scope here.
