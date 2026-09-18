# Hoist `Intl` Formatters and Fix the Timesheet Render Cost

> **Status:** 📋 Planned

> **Coordination — `plans/time-recording-performance/PLAN.md`:** same screen family, different cause. That plan fixes the record-a-task network/server latency; this plan makes each render cheaper (hoisted `Intl` formatters, day-label cache, tick isolation). Its Phase 5 render-path check coordinates with this plan's profiler baseline — neither plan claims the other's win.

> **Partially landed (2026-09-18).** The `Intl` formatter hoisting below was implemented for the **report/export paths** by `plans/quick-fix/export-time-separation.md`: `shared/dates.ts` (all five timezone formatters + the `shortOffset` formatter), `work-intervals.ts` (per-slice offset formatter), `bulk-report-export.ts` (the two formatters built 4× per row) and `timesheet-export.ts`. Measured 11–52× on the affected calls with byte-identical output. **Still open here:** the _render_ cost this plan is named for — `entries-grouping.ts:formatDayLabel`, `TimesheetScreen.tsx`, `ReportsEntriesTable.tsx`, the day-label cache, and the 1 Hz tick isolation.

## Status

- [ ] Confirmed the per-call `Intl` construction sites and counted the calls per render.
- [ ] Reproduced the formatter micro-benchmark (cached vs constructed).
- [ ] Confirmed `useNowTick` is called in the `TimesheetScreen` page root and that `nowMs` flows into the grid.
- [ ] Captured a "before" React DevTools Profiler recording of the timesheet and a main-thread baseline.
- [ ] Hoisted module-level `Intl.DateTimeFormat` instances (or a locale+options `Map`).
- [ ] Added a day-label cache for `formatDayLabel`.
- [ ] Extracted a leaf component that owns its own `useNowTick` so the timesheet grid stops re-rendering at 1 Hz.
- [ ] Co-ordinated the scope split with `time-recording-performance` (Phase 5 — absorbed `stabilize-active-entry-identity`) — that plan removes the **re-runs**, this plan makes each run **cheaper**.
- [ ] Validation: typecheck, lint, tests, profiler re-measure, manual smoke test (timesheet cells, day labels, report rows, formats).

## Verify First (No Code Change)

Reproduce and quantify the problem before writing any code. Nothing here modifies a file.

### Static inspection (no app, no browser needed)

- [ ] **1. Enumerate every per-call formatter construction in the affected render paths.**

  ```bash
  cd /Users/zafajardo/Documents/Development/Tickr
  grep -rn "new Intl.DateTimeFormat\|toLocaleTimeString\|toLocaleDateString" \
    src/components/time-tracker/dashboard/entries-grouping.ts \
    src/components/time-tracker/dashboard/DayGroupEntries.tsx \
    src/components/time-tracker/timesheet/TimesheetScreen.tsx \
    src/components/time-tracker/reports/ReportsEntriesTable.tsx
  ```

  Expected sites:

  | Site                                              | Constructs                                                  | Called                                                    |
  | ------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------- |
  | `entries-grouping.ts:66-84` `formatDayLabel`      | `toLocaleDateString(undefined, opts)` per call              | once per day group — 63 groups on a 62-day window         |
  | `DayGroupEntries.tsx:46-51` `formatTimeDisplay`   | `toLocaleTimeString([], …)` per call                        | `GroupTimeSummary:289-296`, `TaskGroupHeaderCard:473,477` |
  | `DayGroupEntries.tsx:53-58` `formatDtrTime`       | `toLocaleTimeString([], …)` per call                        | `:110`, `:111`                                            |
  | `DayGroupEntries.tsx:69+` `formatDtrDate`         | `toLocaleDateString(...)` per call                          | `:108`                                                    |
  | `TimesheetScreen.tsx:76-84` `formatTime`          | `new Intl.DateTimeFormat('en-US', …)` per call              | **twice per `DayCell`**                                   |
  | `ReportsEntriesTable.tsx:36-48` `formatTimeRange` | `toLocaleTimeString([], …)` **twice per row** (start + end) | per row, at `:147` and `:270`                             |

- [ ] **2. Confirm the twice-per-cell claim in the timesheet.** `formatTime` is invoked for both `timeIn` and `timeOut`:

  ```bash
  awk 'NR>=625 && NR<=690 && /formatTime\(/ {print NR": "$0}' src/components/time-tracker/timesheet/TimesheetScreen.tsx
  ```

  Expected: two hits (approximately lines 646 and 675). At `pageSize = 100` (see step 4) that is **100 members × 7 days × 2 = 1,400 formatter constructions per render pass**.

- [ ] **3. Confirm `formatTimeRange` builds two formatters per row.** Read `ReportsEntriesTable.tsx:36-48` — the inner `format` helper constructs a formatter on each invocation, and it is called twice (for `startedAt` and `endedAt`) inside one `formatTimeRange` call. With two render paths (`:147` desktop table, `:270` mobile cards) that is up to four constructions per entry.

- [ ] **4. Confirm the timesheet page size.** Read `TimesheetScreen.tsx:55`:

  ```bash
  sed -n '55p' src/components/time-tracker/timesheet/TimesheetScreen.tsx
  ```

  Expected: `const pageSizeOptions = [25, 50, 100] as const`. `100` is the figure that produces the ~700-cell / ~12,000-element grid below.

- [ ] **5. Confirm the tick lives in the page root, and that `nowMs` flows into the grid.** Read `TimesheetScreen.tsx:100-117`:

  ```bash
  sed -n '100,117p' src/components/time-tracker/timesheet/TimesheetScreen.tsx
  ```

  Expected: `hasRunning` computed over all members and days, `const tick = useNowTick(hasRunning ? 1000 : null)` in the **screen root**, `nowMs` derived from it, and a `liveDailyTotals` `useMemo` keyed on `[data.dates, data.members, nowMs]` — so it recomputes every second by construction.

  Then confirm the prop hand-off:

  ```bash
  sed -n '293,301p' src/components/time-tracker/timesheet/TimesheetScreen.tsx   # <TimesheetGrid data nowMs dailyTotals />
  grep -n "export function TimesheetGrid" src/components/time-tracker/timesheet/TimesheetScreen.tsx   # :488
  grep -n "function DayCell" src/components/time-tracker/timesheet/TimesheetScreen.tsx                # :625
  ```

  `TimesheetGrid` is a plain, un-memoized function, so a change to `nowMs` re-renders the whole `<tbody>`: every member × 7 days ≈ **700 `DayCell`s / ~12,000 DOM elements** at `pageSize = 100`, **every second**.

- [ ] **6. Confirm `useNowTick` itself is not the bug.** Read `src/components/time-tracker/dashboard/hooks/useNowTick.ts:3-14`:

  ```bash
  cat src/components/time-tracker/dashboard/hooks/useNowTick.ts
  ```

  Expected: cleanup present (`window.clearInterval`), dependency array limited to the primitive `intervalMs`, and `setTick(Date.now())` storing an **absolute** timestamp — so `setInterval` drift cannot accumulate. The hook is correct. **The defect is _where_ it is called, not what it does.** Do not change the hook.

- [ ] **7. Confirm the `tick` seed-of-`0` wart and who guards it.** `tick` starts at `0`, so the first commit computes with `new Date(0)`. `TimesheetScreen.tsx:104` handles this — `const nowMs = tick || new Date(data.snapshotAt).getTime()` — and confirm which other consumers do not:

  ```bash
  grep -rn "useNowTick(" src/components/time-tracker/ src/lib/ --include=*.ts --include=*.tsx
  ```

  Record the unguarded consumers as a separate, cosmetic follow-up (it makes the first paint show `00:00:00`). **Do not expand this plan to fix them all** — note it and move on.

- [ ] **8. Confirm the existing good pattern to copy.** `LiveDuration` (`dashboard/EntryRow.tsx:55-69`) and `CardDuration` (`dashboard/EntryCard.tsx:16-52`) exist precisely so ticking text is isolated in a leaf while the parent row stays memoized:

  ```bash
  sed -n '53,70p' src/components/time-tracker/dashboard/EntryRow.tsx
  sed -n '14,24p' src/components/time-tracker/dashboard/EntryCard.tsx
  ```

  Confirm the comments say so. This is the pattern to replicate for the timesheet cell.

### Requires a running app / browser

- [ ] **9. Reproduce the formatter micro-benchmark** to confirm the 85× gap on your machine before relying on it:

  ```bash
  node -e '
  const N = 20000;
  let t = process.hrtime.bigint();
  for (let i = 0; i < N; i++) new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date());
  const perCall = Number(process.hrtime.bigint() - t) / N / 1000;

  const cached = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  t = process.hrtime.bigint();
  for (let i = 0; i < N; i++) cached.format(new Date());
  const perFormat = Number(process.hrtime.bigint() - t) / N / 1000;

  console.log(`constructed: ${perCall.toFixed(2)} us   cached: ${perFormat.toFixed(2)} us   ratio: ${(perCall/perFormat).toFixed(0)}x`);
  '
  ```

  The audit measured **~79 µs constructed vs ~0.93 µs cached (85×)** on this machine, and **~56 µs** for `date.toLocaleTimeString([], {...})`. Record your own numbers — **Node `Intl` costs are not browser `Intl` costs**, so also confirm in-browser if the difference matters to the decision.

- [ ] **10. Profile the timesheet.** Start the dev server, open `/app/timesheet`, set `pageSize = 100`, ensure at least one member has a **running** timer (so `hasRunning` is true), and record 5 s in React DevTools → **Profiler**.

  Expected before the fix: roughly **5 commits**, each with `TimesheetScreen` and `TimesheetGrid` in the flamegraph and ~**700 `DayCell`s** re-rendered. Record the count of rendered components in one commit — that is the headline number for §10.

- [ ] **11. Measure main-thread scripting.** DevTools → Performance, record 10 s on `/app/timesheet` at `pageSize = 100` with a running timer. Note **Scripting** ms and the shape of the flame chart (expect a periodic spike at 1 Hz). This is the §10 baseline.

- [ ] **12. Confirm the day-label recomputation.** On `/app/time-tracker`, profile a single re-render and confirm `formatDayLabel` appears **63 times** (one per day group on a 62-day window), producing byte-identical labels to the previous pass. Capture the flamegraph as evidence that the work is wasted.

## 1. Goal

Remove two compounding costs from the timesheet and dashboard render paths:

1. **`Intl` formatters are constructed per call instead of per locale+options.** Every `new Intl.DateTimeFormat(...)`, `toLocaleTimeString(...)`, and `toLocaleDateString(...)` call builds a formatter from scratch. Measured at **~79 µs constructed vs ~0.93 µs reused (85×)** — and at `pageSize = 100` the timesheet constructs **~1,400 formatters per render pass**, one second apart.

2. **`TimesheetScreen` ticks in the page root.** A single `useNowTick(hasRunning ? 1000 : null)` in the screen component drives `nowMs` into an un-memoized grid, so roughly **700 `DayCell`s / ~12,000 DOM elements** are reconciled **every second** while any member has a running timer.

Combined, at `pageSize = 100` this is **~1,400 formatter allocations per second plus a ~12,000-element reconcile per second**. Both are fixable with local, low-risk changes — and one of them has a proven precedent in this codebase that the timesheet simply did not follow.

## 2. Context Summary

### The measured formatter cost

From the audit, measured on this machine:

| Operation                                | Per call                       |
| ---------------------------------------- | ------------------------------ |
| `new Intl.DateTimeFormat(...)`           | **~79 µs**                     |
| Reusing a cached formatter's `.format()` | **~0.93 µs** (**85× cheaper**) |
| `date.toLocaleTimeString([], {...})`     | **~56 µs**                     |

Both the constructor **and** the `toLocale*` convenience methods pay this cost; the convenience methods just hide the construction. Note that `formatDayLabel` additionally builds an options object per call and conditions one key on the current year, which is state that belongs to the cache key, not to the call.

### The construction sites

| Site                                                      | What it constructs                                          | Call frequency                                                    |
| --------------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `dashboard/entries-grouping.ts:66-84` `formatDayLabel`    | `toLocaleDateString(undefined, opts)`                       | **once per day group — 63 groups** on a 62-day window; ~43 µs/day |
| `dashboard/DayGroupEntries.tsx:46-51` `formatTimeDisplay` | `toLocaleTimeString([], …)`                                 | `GroupTimeSummary:289-296`; `TaskGroupHeaderCard:473,477`         |
| `dashboard/DayGroupEntries.tsx:53-58` `formatDtrTime`     | `toLocaleTimeString([], …)`                                 | `:110`, `:111` (DTR row)                                          |
| `dashboard/DayGroupEntries.tsx:69+` `formatDtrDate`       | `toLocaleDateString(...)`                                   | `:108`                                                            |
| `timesheet/TimesheetScreen.tsx:76-84` `formatTime`        | `new Intl.DateTimeFormat('en-US', …)`                       | **twice per `DayCell`** (lines ~646 and ~675)                     |
| `reports/ReportsEntriesTable.tsx:36-48` `formatTimeRange` | `toLocaleTimeString([], …)` **twice per row** (start + end) | per row, at `:147` and `:270`                                     |

The worst case by volume is unambiguous: `pageSize = 100` (`TimesheetScreen.tsx:55` offers `[25, 50, 100]`) × 7 days × 2 calls = **1,400 constructions per render pass**.

`formatDayLabel` is the worst case for _waste_: day labels are pure functions of a date key plus "today", so the 63 labels are **byte-identical** between consecutive renders — yet regenerated on every pass, each costing ~43 µs.

### The timesheet render cost

`src/components/time-tracker/timesheet/TimesheetScreen.tsx:100-117`:

```tsx
const hasRunning = data.members.some((member) =>
  member.days.some((day) => day.status === 'RUNNING'),
)
const tick = useNowTick(hasRunning ? 1000 : null)
const nowMs = tick || new Date(data.snapshotAt).getTime()

const liveDailyTotals = useMemo(
  () =>
    data.dates.map((_, dayIndex) =>
      data.members.reduce(
        (sum, member) => sum + getLiveCellSeconds(member.days[dayIndex], nowMs),
        0,
      ),
    ),
  [data.dates, data.members, nowMs],
)
```

`tick` is state on the **screen component**, so it re-renders the screen root every second. `nowMs` is passed to `<TimesheetGrid data={data} nowMs={nowMs} dailyTotals={liveDailyTotals} />` (`:295-299`). `TimesheetGrid` (`:488`) is a **plain, un-memoized function** that returns `<tbody>` rows for every member × 7 days (`:540-590`, with `DayCell` at `:625-682`).

At `pageSize = 100` that is ~700 `DayCell`s and roughly **12,000 DOM elements reconciled every second** — while at most a handful of cells actually contain a changing value (the running members' today cell).

Note the `liveDailyTotals` memo is keyed on `nowMs`, so it _must_ recompute every second. That part is inherent to showing live totals. What is not inherent is re-rendering 700 cells to display them.

### `useNowTick` is not the bug

Verified correct (`dashboard/hooks/useNowTick.ts:3-14`): it clears its interval, depends only on the primitive `intervalMs`, and stores an **absolute** `Date.now()` rather than accumulating a counter, so `setInterval` drift cannot compound. There is no leak.

The defect is **where it is called**. The same hook is used well elsewhere — `LiveDuration` (`EntryRow.tsx:55-69`) and `CardDuration` (`EntryCard.tsx:16-52`) exist specifically so ticking text lives in a leaf while the parent row stays memoized — and the timesheet root is the one place it was placed at the top of a large tree instead of the bottom.

One cosmetic wart to record but not fix here: `tick` starts at `0`, so the first commit computes with `new Date(0)`. `TimesheetScreen.tsx:104` guards it (`tick || new Date(data.snapshotAt).getTime()`); other consumers do not and briefly show `00:00:00`.

### The scope split with `time-recording-performance` (Phase 5 — absorbed `stabilize-active-entry-identity`)

Both plans touch `groupEntriesByDay`'s cost, and they must not double-count it:

|                                                | This plan (`intl-formatter-and-timesheet-render-cost`)                              | `time-recording-performance` (Phase 5 — absorbed `stabilize-active-entry-identity`) |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **What it changes**                            | How expensive each run is — hoisted formatters, cached day labels                   | How often the pipeline runs — removes re-runs from an unstable object identity      |
| **Effect on `groupEntriesByDay` (2.7–3.2 ms)** | The dominant share: ~100% of that figure is `formatDayLabel`'s `toLocaleDateString` | None directly — but removes the _wasted_ runs                                       |
| **Effect on keystroke cost**                   | Makes each pass cheaper                                                             | Removes the pass for keystrokes that do not change the running entry                |

The audit's **~3.7 ms per wasted keystroke pass** figure is therefore split between the two plans. **This plan reduces the per-run cost; that plan removes the re-runs.** Whichever lands first will make the other's measured win smaller — measure after each, not cumulatively, and say so in both PR descriptions.

## 3. Scope

Every item is labelled `[CHECK]` (verification only, no code change) or `[FIX]` (requires a code change).

### [CHECK] — can be done today, no code change

- [ ] `[CHECK]` Enumerate every per-call formatter construction in the four affected files — Verify First step 1.
- [ ] `[CHECK]` Confirm `formatTime` is called twice per `DayCell` and `formatTimeRange` twice per row (steps 2–3).
- [ ] `[CHECK]` Confirm `pageSizeOptions` includes `100` (step 4).
- [ ] `[CHECK]` Confirm the tick is in the screen root, `nowMs` flows into `TimesheetGrid`, and the grid is un-memoized (step 5).
- [ ] `[CHECK]` Confirm `useNowTick` is correct and record that the hook is **not** to be modified (step 6).
- [ ] `[CHECK]` Record the `tick`-seed-of-`0` wart and which consumers guard it — as a note, not a task in this plan (step 7).
- [ ] `[CHECK]` Confirm `LiveDuration` / `CardDuration` are the precedent pattern to copy (step 8).
- [ ] `[CHECK]` Reproduce the formatter micro-benchmark locally and record the numbers, noting that Node `Intl` costs differ from browser ones (step 9).
- [ ] `[CHECK]` Capture the before-Profiler recording of the timesheet at `pageSize = 100` with a running timer, and the main-thread scripting baseline (steps 10–11).
- [ ] `[CHECK]` Confirm the ~63 identical `formatDayLabel` calls per dashboard render (step 12).

### [FIX] — requires code change

- [ ] `[FIX]` **Hoist `Intl.DateTimeFormat` instances to module level** (or into a `Map` keyed by locale + options) in all four affected files, replacing per-call construction. Note the options-object variation in `formatDayLabel` (the year key is conditional) — resolve that either by two cached formatters or by including the variant in the cache key.
- [ ] `[FIX]` **Cache day labels.** `formatDayLabel` is a pure function of `(dateKey, today's dateKey)`, so a `Map<string, string>` invalidated when the day changes collapses 63 constructions to at most 63 per _day_ rather than per render.
- [ ] `[FIX]` **Add a formatter cache for the timezone-parameterised sites.** `formatTime(value, timezone)` and `formatTimeRange(entry, timezone)` take a `timeZone` option that varies at runtime, so a `Map` keyed by `timeZone` (plus format variant) is the right shape — a single module-level instance will not work for these two.
- [ ] `[FIX]` **Extract a leaf component that owns its own `useNowTick`** for the timesheet cell (e.g. a `LiveCellSeconds` equivalent), so the 1 Hz tick re-renders only the cells that are actually running, not the whole grid. Remove `useNowTick` from the `TimesheetScreen` root once the leaf owns it.
- [ ] `[FIX]` **Also isolate the daily/week totals**, since `liveDailyTotals` currently forces a per-second recompute of the whole screen. If the totals remain computed in the screen root, the root still re-renders every second — so either move the totals into small ticking leaves, or `memo` `TimesheetGrid` and pass a narrower prop (a `runningMemberIds: Set<string>` plus stable aggregates) so a `nowMs` change no longer reconciles the full `<tbody>`.
- [ ] `[FIX]` Confirm the two approaches do not conflict: a leaf-owned tick for cells **and** a memoized grid is the target; a leaf-owned tick with a still-`nowMs`-keyed root will not deliver the win.
- [ ] `[FIX]` Re-measure and confirm the timesheet commit count drops to the number of running cells, and that `formatTime` constructions per second drop by roughly three orders of magnitude at `pageSize = 100`.

## 4. Out of Scope

- **Modifying `useNowTick` itself.** It is correct — cleanup present, absolute timestamps, no drift. Only its call sites change.
- **Fixing the `tick` seed-of-`0` wart across all consumers.** `TimesheetScreen.tsx:104` already guards it; the other consumers flash `00:00:00` on first commit. Worth a small separate follow-up; folding it in widens this diff into unrelated components.
- **Removing the re-run of `groupEntriesByDay` per keystroke.** That is `time-recording-performance` (Phase 5 — absorbed `stabilize-active-entry-identity`). This plan makes each run cheaper; that one removes runs. Do not claim both.
- **`HeaderTotal`'s O(62-days) per-tick scan.** That is `time-recording-performance` (Phase 6 — absorbed `dashboard-live-total-recompute`) — its cost is arithmetic and `Date` allocation in `getEntrySecondsInRange` (`store.ts:158-173`) with **no `Intl` involved**, so nothing in this plan helps it.
- **Precomputing `startedAt` timestamps in `useEntriesFilterSort`'s comparator** (measured 0.51 ms → 0.10 ms, 5×). It is adjacent and cheap, but it is a sort-internals change, not a formatter or tick-placement change. See §13 for where to assign it — **do not do it in both plans**.
- **Adding virtualization to the timesheet or any other table.** The audit found virtualization correctly unnecessary on the paginated tables (reports, analytics, timesheet, member detail) because they page server-side. Only the dashboard "all" view is unbounded, and it is not this plan's subject.
- **Redesigning the timesheet grid, its layout, columns, or DTR computation.**
- **Changing the 1 s tick interval or the "running timer" semantics.**
- **Sentry/observability instrumentation for render cost.**

## 5. Affected Files and Folders

```txt
plans/
└── intl-formatter-and-timesheet-render-cost/
    └── PLAN.md                                          (NEW)

src/
└── components/
    └── time-tracker/
        ├── dashboard/
        │   ├── entries-grouping.ts                      (MODIFY)
        │   │     - formatDayLabel (:66-84): hoist the formatter(s) to module
        │   │       level and cache labels by dateKey
        │   └── DayGroupEntries.tsx                      (MODIFY)
        │         - formatTimeDisplay (:46-51), formatDtrTime (:53-58),
        │           formatDtrDate (:69+): hoist to module-level instances
        ├── timesheet/
        │   └── TimesheetScreen.tsx                      (MODIFY)
        │         - formatTime (:76-84): replace per-call Intl with a cache
        │           keyed by timeZone
        │         - remove useNowTick from the screen root (:103)
        │         - extract a leaf that owns its own useNowTick per cell
        │         - memo TimesheetGrid (:488) and/or narrow its props so a
        │           nowMs change does not reconcile the whole <tbody>
        │           (:540-590, DayCell :625-682)
        └── reports/
            └── ReportsEntriesTable.tsx                  (MODIFY)
                  - formatTimeRange (:36-48): hoist; it currently constructs
                    two formatters per row (call sites :147, :270)

            rows are paginated (pageSizeOptions), so no virtualization needed

Reference only (read to copy the pattern, do NOT edit):
    src/components/time-tracker/dashboard/EntryRow.tsx   (LiveDuration, :55-69)
    src/components/time-tracker/dashboard/EntryCard.tsx  (CardDuration, :16-52)
    src/components/time-tracker/dashboard/hooks/useNowTick.ts  (correct as-is)
```

## 6. Database Design

**N/A** — no schema, migration, or query change. The timesheet payload (`getTimesheetFn`) is unchanged; this plan only reduces client-side formatting and reconciliation work on the payload already delivered.

## 7. Backend Implementation

**N/A** — no server function, route handler, or Zod schema change. `staleTime: 30_000` on the timesheet query (`TimesheetScreen.tsx:95`) already matches `refetchInterval: 30_000` and is correct — the refetch-storm problem is confined to the activity screens and is handled in `workspace-authorization-refetch-storm`.

## 8. Frontend Implementation

### Part 1 — Hoisting the formatters

There are two distinct shapes here, and conflating them will produce a broken fix:

1. **Fixed-options sites** — `formatDtrTime`, `formatDtrDate`, and the day-label path have options known at module load. A single module-level `Intl.DateTimeFormat` instance each is sufficient.
2. **Runtime-varying sites** — `formatTime(value, timezone)` and `formatTimeRange(entry, timezone)` take a `timeZone` option that varies per workspace (the app defaults to `Asia/Manila` but supports any IANA zone). A single instance cannot serve these; use a `Map` keyed by the timezone (and by format variant if there is more than one).

For `formatDayLabel` specifically, the options object varies: a `year: 'numeric'` key is added when the date is not in the current year. Either cache two formatters (with and without the year) or include that flag in the cache key. Getting this wrong would change the rendered label for dates outside the current year — a visible, if minor, regression.

Because `formatDayLabel` is a pure function of `(dateKey, today)`, a `Map<string, string>` cache keyed by date key — cleared when the day changes — removes 63 constructions per render entirely. Note the cache must be invalidated at midnight, or "Today" will be wrong the next morning. Keying the cache by the pair `(dateKey, todayKey)` handles that without an explicit timer.

For `formatTimeRange`, note that it currently constructs **two** formatters per call because the inner helper is invoked for both endpoints. Hoisting fixes both at once.

### Part 2 — The timesheet tick

The target shape is: **the tick lives in a leaf, and the grid does not re-render when the tick changes.**

1. Extract a small leaf component (`LiveCellSeconds` or similar, mirroring `LiveDuration`) that takes the cell's data and owns its own `useNowTick`. Only running cells tick, so only running cells re-render.
2. Remove `useNowTick` from the `TimesheetScreen` root (`:103`).
3. Deal with the daily/week totals. These are the awkward part: `liveDailyTotals` (`:106-117`) currently recomputes on every `nowMs` change and is passed to `TimesheetGrid`. If the totals stay in the root, the root still re-renders at 1 Hz. Either move them into small ticking leaves too, or `memo` `TimesheetGrid` and pass narrower props so a root-level tick no longer invalidates it.

Option 3 is where this fix succeeds or fails. A half-done version — leaf-owned cell tick with a root that still re-renders — leaves the 12,000-element reconcile in place and delivers only the formatter win. Verify with the Profiler that a tick produces commits in the running cells **and nowhere else**.

`hasRunning` (`:100-102`) is computed over all members and days; keep it, since it decides whether the tick is armed at all. It is a cheap scan of the payload compared to the render it currently triggers.

### Preserving behaviour

Everything about _what_ is displayed must be identical:

- Same formatting output for every cell, row, day label, and total — byte-for-byte. This is the acceptance criterion for Part 1, and it is checkable: compare rendered text before and after for a fixture payload.
- Same 1 Hz update cadence for running cells.
- Same live daily/week totals (they must still update every second — the fix changes _which components_ re-render, not _whether_ the numbers move).
- Same behaviour when nothing is running (`hasRunning === false` → no tick at all).
- Same behaviour when the running cell's day is not visible / the member is on another page.

## 9. Access Control

**N/A** — no permission, role, or tenant logic is involved. The timesheet payload is already scoped server-side (`timesheet.server.ts` applies `memberScopeCondition`), and this plan changes only how the delivered rows are formatted and re-rendered. Confirm during review that the leaf component receives only the cell data it needs and does not widen any prop beyond what the grid already held — a leaf that accidentally accepted the whole member list would be a (non-security) prop-drilling smell worth catching in review.

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
- [ ] `npx eslint src --ext .ts,.tsx --max-warnings 0` — clean.
- [ ] `./node_modules/.bin/vitest run` — stays at 374 passing / 1 pre-existing failure. The existing `TimesheetScreen.test.tsx` and the dashboard grouping tests are the relevant regression signal; note that this suite measures behaviour, **not** render counts.
- [ ] **Add output-equivalence tests for the hoisted formatters.** Because the whole point is that the output must not change, a focused test that feeds fixture timestamps through each formatter (both the module-level instance and the timezone-keyed cache path) and asserts exact strings is the cheapest guard against an options-object mistake — particularly the conditional `year` in `formatDayLabel` and the `timeZone` handling in `formatTime`/`formatTimeRange`.

### Performance measurement — the acceptance criteria

Part 1 (formatters):

| Metric                                                              | Before                           | After (target)                    |
| ------------------------------------------------------------------- | -------------------------------- | --------------------------------- |
| `formatTime` constructions per timesheet render at `pageSize = 100` | **1,400** (100 × 7 × 2)          | ~0 (a handful of cache misses)    |
| `formatTimeRange` constructions per report page                     | 2 per row × up to 2 render paths | ~0                                |
| `formatDayLabel` constructions per dashboard render                 | **63**                           | ~0 after the first render per day |
| Formatter constructions per second while a timer runs               | **~1,400**                       | ~0                                |

Part 2 (timesheet tick):

| Metric                                                      | Before           | After (target)                                                            |
| ----------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------- |
| Commits per second on `/app/timesheet` with a running timer | **1** (the root) | 1 — but scoped to leaves                                                  |
| `DayCell`s re-rendered per tick at `pageSize = 100`         | **~700**         | only the running cells                                                    |
| DOM elements reconciled per tick                            | **~12,000**      | a handful                                                                 |
| Main-thread **Scripting** ms over a 10 s recording          | record (step 11) | materially lower, with the periodic 1 Hz spike removed or sharply reduced |

The decisive check for Part 2: record the Profiler during a tick and confirm commits appear in the running cells **and not in `TimesheetGrid`'s `<tbody>`**. If the grid still commits at 1 Hz, step 3 of Part 2 is incomplete.

### Manual QA — no visual or interaction regression

- [ ] **Timesheet cell text is unchanged.** With a representative week (time-in, time-out, missing values, a running cell, a sub-day cell, a multi-day cell), compare every rendered string against a screenshot from before the change. The `—` placeholder for null values and the running-cell formatting must be identical.
- [ ] **Timezones still format correctly.** Change the workspace timezone to a non-default IANA zone (e.g. `America/New_York`), reload the timesheet and the reports table, and confirm all times shift as they did before. This is the specific risk of using a single module-level formatter instead of a timezone-keyed cache.
- [ ] **Day labels are still correct, including the year variant.** On the dashboard, verify "Today", "Yesterday", and a weekday label render as before — and check a date from a **different year** if the fixture allows, since that is the conditional-options path.
- [ ] **Day labels roll over correctly at midnight.** Leave the dashboard open across a date boundary (or set the system clock forward a day). Confirm "Today"/"Yesterday" update rather than serving a cached label from the previous day. This is the cache-invalidation risk.
- [ ] **Live cells still tick.** Start a timer and confirm the running cell's seconds increment at 1 Hz, and that the daily and week totals still update every second.
- [ ] **Totals are still correct.** With two members running timers, confirm the daily and weekly totals sum both, and match the per-cell values.
- [ ] **Nothing ticks when nothing is running.** With no running timers anywhere, confirm no 1 Hz work occurs (expect a flat Profiler timeline and no recurring commits).
- [ ] **Reports rows format identically**, including the `Now` label for entries without an `endedAt` (the `entry.endedAt ? … : 'Now'` branch in `formatTimeRange`).
- [ ] **Pagination and member paging still work** at `pageSize` 25/50/100, with no layout shift or missing cells after the grid change.
- [ ] **CSV/Excel export is unaffected.** The timesheet export path builds its own labels (`timesheet-export.ts` dynamically imports `exceljs`); confirm the exported file's time column is unchanged, since export code sometimes shares formatting helpers.
- [ ] **No console errors or hydration warnings** on the timesheet or dashboard load.

## 11. Sequencing

Each phase is independently shippable — and deliberately so, because the two parts have different risk profiles.

- [ ] **Phase 1 — Verification only.** Complete every `[CHECK]` item in §3. Reproduce the micro-benchmark and capture the Profiler/main-thread baselines. **If the timesheet does not commit at 1 Hz with a running timer, stop and re-scope Part 2** — the premise may not hold in the current build.
- [ ] **Phase 2 — Hoist the formatters (Part 1).** Lowest risk, mechanical, and the output-equivalence tests make it verifiable. Do the fixed-options sites first, then the two timezone-keyed sites. Ship and measure.
- [ ] **Phase 3 — Add the day-label cache.** Separately from the hoist, because the cache introduces an invalidation concern (midnight rollover) that the hoist does not.
- [ ] **Phase 4 — Extract the ticking leaf for timesheet cells.** Introduce the leaf and verify with the Profiler that only running cells commit.
- [ ] **Phase 5 — Resolve the root-level totals.** Either move the totals into ticking leaves or memoize `TimesheetGrid` with narrowed props. **This phase carries the Part 2 win** — without it, the grid still reconciles at 1 Hz.
- [ ] **Phase 6 — Final validation.** Full §10 pass, including the timezone and midnight-rollover items, plus the export smoke test.
- [ ] **Phase 7 — Reconcile the scope split.** Confirm the PR description for this plan claims only the per-run cost reduction, and that `time-recording-performance` (Phase 5 — absorbed `stabilize-active-entry-identity`)'s PR claims the re-run removal. Do not publish a cumulative "3.7 ms saved" number attributed to either plan alone.

## 12. Risks & Considerations

| Risk                                                                                                                 | Why it matters                                                                                                                                                                                                 | Mitigation                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A single module-level formatter breaks the timezone-variant sites**                                                | `formatTime(value, timezone)` and `formatTimeRange(entry, timezone)` take a runtime `timeZone`. One shared instance would silently format every workspace's times in whatever zone was first used.             | Use a `Map` keyed by `timeZone` (plus format variant) for these two. Explicitly test by switching the workspace timezone to a non-default IANA zone and confirming all times shift (§10).                                                                    |
| **The `formatDayLabel` conditional `year` option is lost**                                                           | Dropping `year: 'numeric'` for out-of-year dates changes rendered labels for older entries — a visible regression in a history view.                                                                           | Either cache two formatters or include the flag in the cache key. Cover it with an output-equivalence test using a date from a previous year.                                                                                                                |
| **The day-label cache goes stale at midnight**                                                                       | "Today"/"Yesterday" would be wrong the next morning — a bug that only appears for users who leave the tab open, which in a time-tracking app is normal.                                                        | Key the cache by `(dateKey, todayKey)` so the pair changes at midnight, or otherwise invalidate on day change. Test by advancing the system clock a day with the page open.                                                                                  |
| **Half-completing Part 2 leaves the 12,000-element reconcile in place**                                              | Extracting the cell leaf but leaving `nowMs` consumed by the root means the root still re-renders every second and the headline win does not materialise — while the diff looks like it addressed the problem. | Phase 5 exists specifically for this. The acceptance check is a Profiler recording during a tick showing commits in running cells **and not in `TimesheetGrid`'s `<tbody>`**.                                                                                |
| **`liveDailyTotals` still forces a per-second root recompute**                                                       | Its memo is keyed on `nowMs`, so it recomputes by construction. That is inherent to live totals — the fix is to move the _rendering_ of the totals into leaves, not to stop the recompute.                     | Decide explicitly in Phase 5: either small ticking total leaves, or a memoized grid with narrowed props. Do not leave the totals in the root and declare victory.                                                                                            |
| **Mono-repo-wide `Intl` state assumed to be pure**                                                                   | Module-level `Intl` instances are effectively immutable and safe to share; the only variation is the options used to build them.                                                                               | Keep a distinct instance (or cache key) per options variant. Do not try to mutate one instance's options.                                                                                                                                                    |
| **Browser `Intl` cost differs from the Node measurement**                                                            | Both the audit's numbers and the local reproduction are Node figures; browsers historically cache and cost differently. Optimising against the wrong baseline could mis-prioritise this work.                  | Re-measure in-browser (Profiler) as well as in Node, and treat the in-browser number as authoritative for the go/no-go decision. The structural argument (per-call construction at 1,400 calls/render is wrong regardless of the constant) holds either way. |
| **Grid memoization breaks a live-update path**                                                                       | `memo`-ing `TimesheetGrid` with narrowed props risks dropping a prop that a cell genuinely needed, silently freezing part of the grid.                                                                         | Pass `runningMemberIds: Set<string>` (stable when unchanged) plus the aggregates, and verify with the manual QA items that every column still updates — particularly the running cell and the totals.                                                        |
| **Export shares a formatting helper**                                                                                | The exported CSV/XLSX may use the same time formatting; a change here could alter exported files.                                                                                                              | Check `timesheet-export.ts` for shared helpers and smoke-test an export (§10).                                                                                                                                                                               |
| **Double-claiming the win with `time-recording-performance` (Phase 5 — absorbed `stabilize-active-entry-identity`)** | The ~2.7–3.2 ms `groupEntriesByDay` figure is ~100% `formatDayLabel`, which this plan fixes — while that plan removes the _frequency_. Publishing both as "3.7 ms saved" would double-count.                   | The scope-split table in §2 is the contract. Each PR claims only its own share, and each re-measures after the other has landed rather than summing.                                                                                                         |
| **Pre-existing failing test mistaken for a regression**                                                              | `payroll-periods.test.ts` fails today.                                                                                                                                                                         | Record the 374/1 baseline in the PR description before starting.                                                                                                                                                                                             |

## 13. Open Questions

- [ ] **Where does the `useEntriesFilterSort` comparator precompute (0.51 ms → 0.10 ms, 5×) belong?** It is the same pipeline as `time-recording-performance` (Phase 5 — absorbed `stabilize-active-entry-identity`) but the same "make each run cheaper" theme as this plan. Assign to **exactly one** plan. Default: assign to `time-recording-performance` (Phase 5 — absorbed `stabilize-active-entry-identity`) (same file and pipeline), leaving this plan focused on `Intl` and tick placement. Owner: _unassigned_.
- [ ] **For the timesheet, leaf-owned ticking vs memoized grid with narrowed props — or both?** Both is the target, but if only one is affordable, the leaf gets the bigger win (only running cells re-render) while the narrowed-props memo protects against the root tick. Decision: _undecided_. Recommended: do both, in Phases 4 and 5 as written.
- [ ] **`Map` cache for timezone-keyed formatters — bounded or unbounded?** The number of distinct workspace timezones in play is small, but an unbounded module-level `Map` keyed on user-influenced input is a (minor) growth vector. Add a small cap and eviction, or accept it given timezones are IANA identifiers from a fixed set? Default: accept, with a comment; the key space is a closed IANA list of a few hundred at most. Owner: _unassigned_.
- [ ] **Should the `tick` seed-of-`0` wart be fixed globally?** `TimesheetScreen.tsx:104` guards it; other `useNowTick` consumers briefly render `00:00:00` on first commit. It is cosmetic but it is a real inconsistency. Owner: _unassigned_. Default: separate small follow-up; keep it out of this diff.
- [ ] **Does `hasRunning` scanning every member × day on every render matter at larger page sizes?** It is a cheap scan next to the render it guards, but if `pageSize` ever grows this becomes a per-render O(members × days) scan. Decision: _leave as-is_; revisit only if `pageSize` changes. Owner: _unassigned_.
- [ ] **Should a render-count or formatter-count regression guard be added to CI?** The suite measures behaviour, not render cost, so this class of regression can return unnoticed. A lightweight guard (e.g. asserting a hoisted formatter is not re-constructed, or a togglable render counter) is possible but non-standard for this codebase. Out of scope; noted as a follow-up idea. Owner: _unassigned_.
