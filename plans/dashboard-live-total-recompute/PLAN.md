# Stop `HeaderTotal` Re-Scanning 62 Days of Entries on Every Tick

> **Status:** 📋 Planned

## Status

- [ ] Confirmed `HeaderTotal` receives the full 62-day entry window, not the selected day's entries.
- [ ] Confirmed the tick rate is 50 ms for the centisecond format and 1000 ms otherwise (not 10–30 ms).
- [ ] Captured a "before" React DevTools Profiler recording and a main-thread scripting measurement.
- [ ] Split the total into a `useMemo`'d completed base (independent of `tick`) plus the running entry's live seconds.
- [ ] Confirmed the 20 Hz path is now O(1) and the displayed total is unchanged in every case (no running entry, running entry in range, running entry outside range).
- [ ] Co-ordinated the scope split with `intl-formatter-and-timesheet-render-cost` so neither plan claims the same win.
- [ ] Validation: typecheck, lint, tests, profiler re-measure, manual smoke test of the header total.

## Verify First (No Code Change)

Reproduce and quantify the problem before writing any code. Nothing here modifies a file.

### Static inspection (no app, no browser needed)

- [ ] **1. Confirm `HeaderTotal` is fed the whole 62-day window, not one day.** Read `src/components/time-tracker/dashboard/DashboardHeader.tsx:8-32` and confirm its `entries` prop is `summaryEntries`. Then trace `summaryEntries` to `state.entries`:

  ```bash
  cd /Users/zafajardo/Documents/Development/Tickr
  grep -n "summaryEntries" src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx
  sed -n '511,515p' src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx
  ```

  Expected: a `useMemo` that unions `state.entries` with `optimisticStoppedEntries` — i.e. everything the server sent, unchanged in size.

- [ ] **2. Confirm the server window really is 62 days.**

  ```bash
  grep -n "ENTRIES_WINDOW_DAYS" src/lib/server/tracker/state.server.ts
  ```

  Expected: `const ENTRIES_WINDOW_DAYS = 62` at line 27. This is what makes "the whole array" ≈ 1000 entries for an active member (roughly 16 entries/day × 62 days) rather than a handful.

- [ ] **3. Confirm the per-entry cost is two `Date` allocations.** Read `src/lib/time-tracker/store.ts:158-173`:

  ```ts
  export function getEntrySecondsInRange(entry, start, end, now = new Date()) {
    const entryStart = Math.max(
      new Date(entry.startedAt).getTime(),
      start.getTime(),
    )
    const entryEnd = Math.min(
      entry.endedAt ? new Date(entry.endedAt).getTime() : now.getTime(),
      end.getTime(),
    )
    return Math.max(0, (entryEnd - entryStart) / 1000)
  }
  ```

  Two `new Date(...)` per call. Multiplied by the entry count and the tick rate, that is the allocation pressure described in §2.

- [ ] **4. Confirm the tick constants — and correct the record if anyone described this as a 10–30 ms tick.**

  ```bash
  sed -n '30,40p' src/lib/time-tracker/time-format.ts
  sed -n '70,72p' src/lib/time-tracker/time-format.ts
  ```

  Expected: `DEFAULT_FORMAT = 'clock'` (line 32), `PRECISE_LIVE_TICK_MS = 50` (line 35), `DEFAULT_LIVE_TICK_MS = 1000` (line 36), and `getLiveTickMs` returning 50 **only** when `format === 'precise'`. So the worst case is **20 Hz, and only for users who chose `HH:MM:SS:CC`**; everyone else is 1 Hz and this finding is 20× smaller for them. State this accurately in the PR — do not generalise the 20 Hz figure to all users.

- [ ] **5. Confirm the correct pattern already exists twice in this codebase.** `LiveDuration` (`dashboard/EntryRow.tsx:55-69`) and `CardDuration` (`dashboard/EntryCard.tsx:16-52`) both exist specifically so the ticking text is isolated from the memoized row:

  ```bash
  sed -n '53,70p' src/components/time-tracker/dashboard/EntryRow.tsx
  sed -n '14,24p' src/components/time-tracker/dashboard/EntryCard.tsx
  ```

  Confirm the comments say so. `HeaderTotal` is the one place that pattern was not applied — this is a consistency fix as much as a performance fix.

- [ ] **6. Confirm the tick itself is already well-behaved**, so the fix is scoped to the _consumer_: `dashboard/hooks/useNowTick.ts:3-14` clears its interval, depends only on the primitive `intervalMs`, and stores an absolute `Date.now()` (so `setInterval` drift cannot accumulate). The hook is not the problem; where it is called is.

### Requires a running app / browser

- [ ] **7. Count how many times `HeaderTotal` actually re-renders.** Start the dev server, open `/app/time-tracker`, set the time format to **HH:MM:SS:CC** (precise), start a timer, and record 5 seconds in React DevTools → **Profiler**. Expected: roughly **100 commits** of `HeaderTotal` over 5 s (20 Hz), each running the full `reduce`.

- [ ] **8. Measure the cost per commit.** In the Profiler flamegraph, select `HeaderTotal` and read its self/total render time. Cross-check against the profiling figure in §2 — note that the audit's 1.43 ms figure was measured in **Node on this machine with a synthetic 1000-entry array**, not in-browser. If your in-browser number differs materially, record the real one; the browser number is the one that matters and the plan's target is "O(1) per tick", not a specific millisecond count.

- [ ] **9. Establish the realistic entry count** for an active member in a real workspace. Note that the number of entries in the 62-day window is what drives the cost — if a typical member has ~150 entries rather than ~1000, the absolute impact is proportionally smaller (though still O(n) per tick, and still the wrong shape).

- [ ] **10. Capture a "before" main-thread measurement.** DevTools → Performance, record ~10 s with the timer running in precise format, and note **Scripting** time and any GC sawtooth in the memory track. This is the baseline for §10.

## 1. Goal

Make the dashboard header's live total cost **O(1) per tick** instead of O(62 days of entries).

`HeaderTotal` currently computes a **single day's** total by scanning **every entry in the 62-day window** — about 1000 entries — and it does this on every tick. The tick is 50 ms (20 Hz) for users on the centisecond format and 1000 ms otherwise. At the audit's measured cost this is roughly **1.43 ms per call → ~28.6 ms/sec of main thread, plus ~40,000 `Date` allocations/sec** in the worst case, all to keep one number correct.

The fix is to split the total into (a) a memoized **completed** base that does not depend on the clock and (b) the **running** entry's live seconds. The per-tick path then touches one entry instead of a thousand.

## 2. Context Summary

### The code

`src/components/time-tracker/dashboard/DashboardHeader.tsx:8-32`:

```tsx
function HeaderTotal({
  entries,
  formatTime,
}: {
  entries: TimeEntry[]
  formatTime: (seconds: number) => string
}) {
  const hasRunningEntry = entries.some((entry) => !entry.endedAt)
  const tick = useNowTick(
    hasRunningEntry ? getFormatterLiveTickMs(formatTime) : null,
  )
  const now = new Date(tick)
  const range = getViewRange('day', now)
  const selectedTotalSeconds = entries.reduce(
    (total, entry) =>
      total + getEntrySecondsInRange(entry, range.start, range.end, now),
    0,
  )
  return (
    <p className="m-0 mt-1 text-2xl font-bold text-foreground">
      {formatTime(selectedTotalSeconds)}
    </p>
  )
}
```

### Why `entries` is ~1000 rows

`HeaderTotal`'s `entries` prop is `summaryEntries` (`TimeTrackerDashboard.tsx:511-515`), a union of `state.entries` and `optimisticStoppedEntries`. `state.entries` is the server's **62-day window** — `src/lib/server/tracker/state.server.ts:27` sets `const ENTRIES_WINDOW_DAYS = 62`.

So to display the total for **one day**, the component walks the **entire 62-day window** on every tick. Every day's entries are re-scanned and re-summed 20×/sec even though exactly one entry is changing.

### The tick rate, stated precisely

| Format                              | Tick               | Source                                                                          |
| ----------------------------------- | ------------------ | ------------------------------------------------------------------------------- |
| `precise` (`HH:MM:SS:CC`)           | **50 ms (20 Hz)**  | `lib/time-tracker/time-format.ts:35` `PRECISE_LIVE_TICK_MS = 50`                |
| everything else (default `'clock'`) | **1000 ms (1 Hz)** | `time-format.ts:36` `DEFAULT_LIVE_TICK_MS = 1000`; default is `'clock'` (`:32`) |

This is **not** a 10–30 ms tick. The 20 Hz worst case applies only to users who explicitly selected the centisecond format; for everyone else the same code runs at 1 Hz and the absolute cost is 20× lower. Both figures should appear in any write-up.

### The measured cost

From the audit: measured in **Node 24 on this machine with a 1000-entry array**, `HeaderTotal`'s reduce body costs **~1.43 ms per call**. At 20 Hz that is **~28.6 ms/sec (~3% of a core)**, plus **two `new Date(...)` allocations per entry per tick ≈ 40,000 `Date` allocations/sec** and the associated GC churn.

Two caveats to state honestly whenever this number is quoted:

1. It was measured in **Node**, not in a browser. Browser numbers should be re-measured (§10).
2. It assumes ~1000 entries in the window. A member with fewer entries pays proportionally less in absolute terms — but the cost is still **linear in history length on every tick**, which is the structural problem, and it grows as the workspace ages.

### The good news: the tick architecture is already right

The tick is **not** a systemic problem in this codebase. It is React state living in **leaf** components, and the audit measured the worst case at **4–5 leaf components re-rendering per tick** (roughly **80–100 component renders/sec**) — the dashboard root, the entry list, and the other N−1 rows do **not** re-render per tick.

`LiveDuration` (`EntryRow.tsx:55-69`) and `CardDuration` (`EntryCard.tsx:16-52`) exist precisely to isolate ticking text from memoized rows, and both work. `HeaderTotal` is the single place that pattern was not applied. This plan is therefore narrow: make one component consistent with the two that already do it correctly.

### Relationship to other plans

- **`intl-formatter-and-timesheet-render-cost` does not fix this.** `HeaderTotal`'s cost is the `reduce` over `getEntrySecondsInRange` (`store.ts:158-173`) — arithmetic and `Date` allocation, with **no `Intl` formatter involved**. Hoisting `Intl.DateTimeFormat` instances does nothing here. Do not attribute this win to that plan.
- **`stabilize-active-entry-identity` is adjacent but distinct.** That plan reduces how _often_ the dashboard's memos re-run (per keystroke, per identity change); this plan reduces the _cost of the per-tick path specifically_. The two touch different triggers and different arrays. Neither subsumes the other.

## 3. Scope

Every item is labelled `[CHECK]` (verification only, no code change) or `[FIX]` (requires a code change).

### [CHECK] — can be done today, no code change

- [ ] `[CHECK]` Trace `HeaderTotal`'s `entries` prop to `state.entries` and confirm the 62-day window size (`state.server.ts:27`) — Verify First steps 1–2.
- [ ] `[CHECK]` Confirm the two `new Date(...)` allocations per entry inside `getEntrySecondsInRange` (`store.ts:158-173`) — step 3.
- [ ] `[CHECK]` Confirm the tick constants and the fact that 20 Hz is opt-in (`time-format.ts:32,35,36,70-72`) — step 4. **Do not describe this as a 10–30 ms tick.**
- [ ] `[CHECK]` Confirm `LiveDuration` / `CardDuration` are the established pattern for this problem — step 5.
- [ ] `[CHECK]` Confirm `useNowTick` itself is correct and is not the defect — step 6.
- [ ] `[CHECK]` Capture before/after React DevTools Profiler commit counts for `HeaderTotal` at 20 Hz — step 7.
- [ ] `[CHECK]` Measure the realistic entry count for an active member in the window — step 9. This determines whether the impact is "3% of a core" or "0.5% of a core" for your population.

### [FIX] — requires code change

- [ ] `[FIX]` Inside `HeaderTotal`, memoize a **completed** base: the sum over entries that have `endedAt`, clipped to the view range. This memo must depend on `entries` and the range bounds — **not** on `tick`.
- [ ] `[FIX]` Compute the **running** entry's live seconds separately from `tick` (one entry, one call to `getEntrySecondsInRange` or the equivalent), and display `completed + running`.
- [ ] `[FIX]` Ensure the range bounds are derived from a stable, coarser source than `tick` where possible — the day range only changes at midnight, so the memo should not invalidate 20×/sec. Depending on `start.getTime()`/`end.getTime()` (or a day key) rather than the `Date` objects is the point.
- [ ] `[FIX]` Verify every display case is unchanged: no running entry; running entry inside the selected day; running entry that started on a previous day; `formatTime` variants (`clock`, `precise`, `hours-minutes`, `decimal`, `human`) — the last two do not depend on live seconds in the same way, so confirm the behaviour is preserved rather than assumed.
- [ ] `[FIX]` If `hasRunningEntry` still requires a scan to decide whether to tick at all, keep it cheap — it is an `Array.prototype.some` over the same array, which is far cheaper than the reduce but still O(n) per render. Consider deriving it once per data change rather than per render.

## 4. Out of Scope

- The `Intl.DateTimeFormat` construction sites and their cost — that is `intl-formatter-and-timesheet-render-cost`.
- The `activeEntry` object-identity problem and the keystroke-triggered memo invalidation — that is `stabilize-active-entry-identity`.
- Changing `ENTRIES_WINDOW_DAYS = 62` or the server's tracker-state payload. Narrowing the window is a product decision with its own trade-offs (history availability) and is not part of making one component's tick cheap.
- Adding virtualization to the dashboard list.
- Changing the tick rate, the time-format options, or `useNowTick` itself. The hook is correct; the plan explicitly does not touch it.
- Any other live-ticking component (`LiveGroupTotal`, `TaskGroupHeaderRow`, `TaskGroupHeaderCard`, `GroupTimeSummary`, `RunningTimer`, `TimesheetScreen`'s tick). Those operate on per-day or per-group data and were assessed as appropriately scoped. `TimesheetScreen`'s tick is handled in `intl-formatter-and-timesheet-render-cost`.
- The `tick` seed-of-`0` wart in `useNowTick` (first commit shows `00:00:00`). `TimesheetScreen.tsx:104` already guards it; other consumers do not. Worth a follow-up, but it is a display nit, not this cost.
- Migrating the entry list or totals to a server-side aggregate.

## 5. Affected Files and Folders

```txt
plans/
└── dashboard-live-total-recompute/
    └── PLAN.md                                          (NEW)

src/
└── components/
    └── time-tracker/
        └── dashboard/
            ├── DashboardHeader.tsx                      (MODIFY)
            │     - HeaderTotal (:8-32): split into a memoized completed
            │       base + running-entry live seconds
            └── hooks/
                └── useNowTick.ts                        (unchanged)
                      - Confirmed correct; explicitly not modified

Reference only (read to match the pattern, do NOT edit):
    src/components/time-tracker/dashboard/EntryRow.tsx   (LiveDuration, :55-69)
    src/components/time-tracker/dashboard/EntryCard.tsx  (CardDuration, :16-52)
    src/lib/time-tracker/store.ts                        (getEntrySecondsInRange, :158-173)
    src/lib/time-tracker/time-format.ts                  (tick constants, :32,35,36,70-72)
    src/lib/server/tracker/state.server.ts               (ENTRIES_WINDOW_DAYS, :27)
    src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx (summaryEntries, :511-515)
```

## 6. Database Design

**N/A** — no schema, migration, or query change. The 62-day window is a server query parameter (`ENTRIES_WINDOW_DAYS`); this plan reduces client-side work on the already-delivered payload and deliberately does not alter what the server sends.

## 7. Backend Implementation

**N/A** — no server function, route handler, or Zod schema changes. `getTrackerStateFn` continues to return the same payload.

_Noted for the record:_ one alternative would be to compute the day total server-side, but that would require a round trip per tick or a websocket-style push, which is strictly worse than a cheap client-side memo for a value that changes by one second per second. Rejected.

## 8. Frontend Implementation

### The shape of the fix

The total for the selected day is a sum of two disjoint parts:

1. **Completed entries** in range — their contribution is fixed until data changes or midnight passes. It does **not** depend on `tick`.
2. **The running entry** (if any) — its contribution depends on `now`. Exactly one entry, at most.

Memoize (1) against `[entries, rangeStartMs, rangeEndMs]` and compute (2) inline per tick. Illustrative shape only — not the implementation:

```tsx
const completed = useMemo(
  () =>
    entries.reduce(
      (total, e) =>
        total + (e.endedAt ? getEntrySecondsInRange(e, start, end) : 0),
      0,
    ),
  [entries, start.getTime(), end.getTime()],
)
const running = runningEntry
  ? getEntrySecondsInRange(runningEntry, start, end, now)
  : 0
const selectedTotalSeconds = completed + running
```

Important detail: the memo's dependencies must be **primitive timestamps or a day key**, not the `Date` objects, or the memo will invalidate on every render and the fix is defeated. The day range only changes at midnight, so deriving it from a coarse source (a day key, or `tick` snapped to the start of day) is the intended design.

### Behaviour that must be preserved exactly

- No running entry → identical total.
- Running entry started **today** → total grows by one second per second.
- Running entry started **yesterday and still running** → its contribution is clipped to the selected day's range (`getEntrySecondsInRange` already does this via `Math.max(entryStart, start)`), so the header must not count the pre-midnight portion. This is the case most likely to regress — test it explicitly.
- Running entry belonging to a **different** day than the selected one → contributes 0 today.
- Non-live formats (`decimal`, `human`, `hours-minutes`) → unchanged; confirm whether they tick at all under the current `getFormatterLiveTickMs` behaviour before changing anything, because `hasRunningEntry` currently gates the tick for all formats.

### `hasRunningEntry`

The current implementation calls `entries.some(e => !e.endedAt)` on every render — O(n) but with no allocation, and roughly two orders of magnitude cheaper than the reduce it guards. Leaving it is acceptable. If it is moved into the memo for tidiness, keep the semantics identical (it decides whether the tick is armed at all), because getting it wrong means the header stops updating live.

## 9. Access Control

**N/A** — no permission, role, or tenant logic is involved. The header renders data the current user has already been authorized to receive; this plan changes only how that data is summed locally.

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

Known baseline: `vitest run` reports **374 passing, 1 failing (375 total)**. The failure is **pre-existing and unrelated** — `src/lib/time-tracker/payroll-periods.test.ts:6` is date-dependent and has been failing since 2026-09-15. Do not report it as a regression.

### Automated

- [ ] `./node_modules/.bin/tsc --noEmit -p tsconfig.json` — clean.
- [ ] `npx eslint src --ext .ts,.tsx --max-warnings 0` — clean. Watch specifically for `react-hooks/exhaustive-deps` on the new memo: if the lint rule demands `tick` in the dependency array, the fix has been written incorrectly (the memo is meant not to depend on it). Resolve by restructuring, not by suppressing.
- [ ] `./node_modules/.bin/vitest run` — stays at 374 passing / 1 pre-existing failure.

### New test coverage (recommended)

A pure unit test is cheap here because the logic is arithmetic, not rendering. Extract the total computation into a helper if needed and cover:

- [ ] No running entry in range → equals the sum of completed durations.
- [ ] Running entry inside the day → equals completed + elapsed-so-far.
- [ ] Running entry started **before** the day range → the pre-range portion is excluded.
- [ ] Running entry after the day range → contributes 0.
- [ ] Empty `entries` → 0.
- [ ] Completed entries outside the range → excluded (this preserves today's `getEntrySecondsInRange` clipping).

### Performance measurement — the acceptance criterion

| Metric                                                                              | Before                                                                              | After (target)                            |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------- |
| `HeaderTotal` commits over 5 s at 20 Hz                                             | ~100 (measure in step 7)                                                            | ~100 — **unchanged, and that is correct** |
| Per-commit `HeaderTotal` render time (Profiler)                                     | ~1.43 ms for ~1000 entries (Node measurement from the audit; re-measure in-browser) | **O(1) — independent of entry count**     |
| Main-thread **Scripting** ms over a 10 s recording, timer running in precise format | record (step 10)                                                                    | materially lower                          |
| `Date` allocations per tick                                                         | ~2 × entry count (≈2,000 at 1000 entries)                                           | ~2–4 regardless of entry count            |
| GC activity during the recording                                                    | record                                                                              | visibly reduced sawtooth                  |

The decisive check is **scaling, not the absolute number**: double the entries in the window (e.g. by extending the test window or picking a longer-tenured member) and confirm the per-commit render time does **not** roughly double. Before the fix it will; after the fix it should not.

### Manual QA — no visual or interaction regression

- [ ] **Header total is correct with no timer running.** Compare against a hand-summed day before and after the change — identical value.
- [ ] **Header total increments live with a running timer**, at the expected cadence for the selected format (1 s for `clock`, 0.01 s for `precise`).
- [ ] **Start a timer, leave it running past midnight** (or simulate by setting the system clock / seeding an entry whose `startedAt` is yesterday and `endedAt` is null). Confirm the header for "today" does **not** include the pre-midnight hours, and that the total updates correctly as the new day accumulates.
- [ ] **Switch between day/week/month views** and confirm the header total tracks the selected view's range with no stale value from a previous day. Navigating dates must still refresh the total immediately.
- [ ] **Change the time format** through all five options and confirm the displayed total is formatted correctly and still live-updates where it did before.
- [ ] **Stop the timer** and confirm the header settles to a static, correct value (the tick should disarm).
- [ ] **Edit a completed entry** and confirm the header total reflects the new duration (this exercises the memo's non-`tick` dependencies — the case most likely to break if the memo is over-scoped).

## 11. Sequencing

Each phase is independently shippable.

- [ ] **Phase 1 — Verification only.** Complete every `[CHECK]` item in §3. In particular, confirm in-browser that `HeaderTotal` really does commit ~100 times in 5 s at 20 Hz, and record the per-commit render time for ~1000 entries. **If the per-commit cost is negligible in-browser for your real entry counts, stop and re-prioritise** — the finding is real but may not be worth the change for your population.
- [ ] **Phase 2 — Extract and unit-test the total computation.** Pure-function extraction plus the six cases in §10. This makes the behaviour contract explicit before any rendering changes.
- [ ] **Phase 3 — Split the memo in `HeaderTotal`.** Completed base memoized on primitives; running entry computed per tick. Handle the named-export / prop-type implications.
- [ ] **Phase 4 — Validate.** Full §10 pass, including the midnight-crossing case and the scaling check.
- [ ] **Phase 5 — Confirm the cross-plan scope split.** Verify that `stabilize-active-entry-identity` and `intl-formatter-and-timesheet-render-cost` are not claiming this same win in their PR descriptions, and that this plan does not claim theirs.

## 12. Risks & Considerations

| Risk                                                                        | Why it matters                                                                                                                                                             | Mitigation                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Memo over-scoped — `tick` ends up in the dependency array**               | The memo then invalidates every tick and the fix does nothing while _looking_ correct in a diff.                                                                           | The acceptance criterion is explicitly **scaling**, not absolute ms: double the entry count and confirm per-commit render time does not roughly double. Also watch `react-hooks/exhaustive-deps` — if lint demands `tick`, restructure rather than suppress. |
| **Running entry crossing midnight is summed incorrectly**                   | The pre-midnight portion would be wrongly attributed to today, inflating one day's total and deflating the previous day's — a billing-accuracy bug in a time-tracking app. | `getEntrySecondsInRange` already clips correctly; test the case explicitly (both the unit test and the manual QA item). Do not reimplement the clipping.                                                                                                     |
| **`hasRunningEntry` semantics change and the header stops updating live**   | It arms the tick. Getting it wrong makes the header freeze, which is worse than being slow.                                                                                | Keep it as-is unless moved deliberately, and verify the "start a timer → header increments" manual test after the change.                                                                                                                                    |
| **Non-live formats regress**                                                | `decimal`, `human`, `hours-minutes` may not need (or may not currently get) a live tick.                                                                                   | Read `getFormatterLiveTickMs` behaviour and confirm all five formats in manual QA before and after.                                                                                                                                                          |
| **Correct total, but a visual flicker from a re-created range object**      | Deriving `range` from `new Date(tick)` each render can change object identity downstream even when the value is stable.                                                    | Derive the range from primitives / a day key and pass stable values down; confirm with the Profiler that `HeaderTotal`'s children (if any) do not newly re-render.                                                                                           |
| **The finding is real but the absolute impact is small for this user base** | Most users are on the default 1 Hz format, where the same code is 20× cheaper. Optimising the wrong thing wastes effort and adds risk to a working component.              | Phase 1 includes an explicit stop condition: measure in-browser at realistic entry counts first. It is a legitimate outcome to record the finding, defer the fix, and note the scaling cliff for future large workspaces.                                    |
| **Pre-existing failing test mistaken for a regression**                     | `payroll-periods.test.ts` fails today.                                                                                                                                     | Record the 374/1 baseline in the PR description before starting.                                                                                                                                                                                             |

## 13. Open Questions

- [ ] **Is the ~1.43 ms/call figure representative of real entry counts?** The audit measured 1000 entries in Node; a typical member may hold far fewer in the 62-day window. Confirm in-browser (§10) and decide whether the fix is worth landing now or should be recorded as a scaling cliff. Owner: _unassigned_. Default if unresolved: land the fix anyway — it is small, makes the component consistent with `LiveDuration`/`CardDuration`, and removes a history-dependent cost.
- [ ] **Should `hasRunningEntry` be memoized as well?** It is O(n) per render but allocation-free and cheap next to the reduce. Decision: _leave as-is by default_; revisit only if the Profiler shows it mattering.
- [ ] **Should `HeaderTotal`'s total be extracted into a shared helper used by other totals in the dashboard?** Several places sum range-clipped seconds. A shared, tested helper would reduce the risk of divergence — but it is a broader refactor than this finding requires. Owner: _unassigned_. Default: extract only as far as needed for the unit tests in §10.
- [ ] **Should the `useNowTick` seed-of-`0` wart be fixed here?** The first commit shows `00:00:00`; `TimesheetScreen.tsx:104` guards it and other consumers do not. Out of scope for this plan, but it is a genuine (if cosmetic) inconsistency worth a follow-up. Owner: _unassigned_.
