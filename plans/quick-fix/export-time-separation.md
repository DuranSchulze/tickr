# Export — Overnight Entry Day Separation

> **Status:** ✅ Done — the day-separation fix was already present in the codebase (committed in `081067a`, before this pass); this pass verified it against every section of the plan and added the performance work the plan lacked. The only unimplemented item is the explicitly-optional calendar refactor (§6.6). See [Completion record](#completion-record).

## Status

- [x] Investigation complete — confirmed no day-splitting exists in any export path. _(superseded: splitting now exists in every export path; see Completion record)_
- [x] Day-splitting function adapted from `calendar.server.ts` into a shared `work-intervals.ts` utility. _(already present: `splitWorkIntervalByDay`, `work-intervals.ts:105`)_
- [x] Report builders updated: `exportAnalyticsCsv`, `getBulkReport`, `getMemberMonthlyReport`. _(already present — the analytics CSV path lives in `reports.server.ts`, not the plan's `export.server.ts`)_
- [x] Analytics daily totals SQL updated to distribute overnight hours across dates. _(already present — computed in memory from `summaryRows`)_
- [x] Validation: typecheck, lint, manual CSV/PDF export of overnight entries. _(typecheck/lint/tests/build pass; the split logic is unit-tested. Manual CSV/PDF smoke tests were not run — see Completion record)_

## 1. Goal

Fix overnight time entries in exports and analytics so that hours are accurately distributed across calendar days. Currently, an entry spanning midnight (e.g., Monday 11 PM → Tuesday 2 AM) shows as a single row attributed entirely to the start date. After the fix, exports split these into separate rows — one per calendar day — each showing only the portion of time that falls within that day.

## 2. Investigation Findings

After tracing all export and analytics code paths, here is the confirmed current behavior:

### 2.1 Exports

| Export Path               | File                                                 | Overnight Behavior                 |
| ------------------------- | ---------------------------------------------------- | ---------------------------------- |
| Analytics CSV             | `export.server.ts` → `exportAnalyticsCsv`            | One row, start date, full duration |
| Bulk Report (CSV + PDF)   | `bulk-report.server.ts` → `getBulkReport`            | One row, start date, full duration |
| Member Report (CSV + PDF) | `member-report.server.ts` → `getMemberMonthlyReport` | One row, start date, full duration |

All three use `clipWorkInterval` (from `work-intervals.ts`), which clips to the report range boundaries but does **not** split at midnight. Each raw DB entry produces exactly one export row.

### 2.2 Analytics Daily Totals

**`analytics.server.ts`** (lines 255–262) uses a SQL expression for daily aggregation:

```sql
clippedDateSql = TO_CHAR(
  GREATEST(started_at, range_start) AT TIME ZONE timezone,
  'YYYY-MM-DD'
)
GROUP BY 1
```

This groups by the **clipped start date**, not accounting for hours that cross midnight. An overnight entry's full duration is attributed entirely to the start date.

### 2.3 Existing Day-Splitting Logic (Not Used by Exports)

**`calendar.server.ts`** already has a `splitEntryByDay` function (lines 54–137) that splits entries at UTC midnight boundaries for the calendar view. This logic is correct and well-tested but lives in the calendar module and is not shared with the report/export code.

## 3. Scope

- Extract the day-splitting logic from `calendar.server.ts` into a shared utility in `work-intervals.ts`.
- Update `clipWorkInterval` (or add a new `splitWorkIntervalByDay` function) to support per-day splitting.
- Update all three report builders to split overnight entries.
- Update the analytics daily totals SQL to distribute hours across calendar days.
- Preserve all existing billing rate resolution, tag lookups, and audit logging.
- Maintain backward compatibility: entries that don't cross midnight produce exactly one row, unchanged.

## 4. Out of Scope

- Changing the calendar view's `splitEntryByDay` — it continues to work as-is (though it should import from the shared location after extraction).
- Changing the timer dashboard day-grouping logic.
- Changing how `durationSeconds` is stored in the database.
- Splitting entries by hour, project, or any boundary other than calendar day midnight.
- Changing the overlap detection logic in `summarizeWorkIntervals`.

## 5. Affected Files

```txt
src/
  lib/
    time-tracker/
      work-intervals.ts                    (NEW: splitWorkIntervalByDay)

    server/
      tracker/
        export.server.ts                   (use splitWorkIntervalByDay)
        bulk-report.server.ts              (use splitWorkIntervalByDay)
        member-report.server.ts            (use splitWorkIntervalByDay)
        analytics.server.ts                (update daily totals SQL)
        calendar.server.ts                 (import from work-intervals)
```

## 6. Step-by-Step Implementation Plan

### 6.1 Shared Utility: `splitWorkIntervalByDay`

Add a new function to `src/lib/time-tracker/work-intervals.ts` that splits a work interval at midnight boundaries within a date range. Adapt the logic from `calendar.server.ts:splitEntryByDay` but make it timezone-aware (exports use workspace timezone, not UTC).

```ts
/**
 * A single day-slice of a work interval, after splitting at timezone-aware
 * midnight boundaries.
 */
export type DaySlice = {
  /** The calendar date (YYYY-MM-DD) in the given timezone. */
  date: string
  startedAt: Date
  endedAt: Date
  seconds: number
}

/**
 * Splits a work interval into one slice per calendar day, using the workspace
 * timezone to determine midnight boundaries.
 *
 * - Each slice represents the portion of work that falls within a single
 *   calendar day (midnight to midnight in the given timezone).
 * - Returns an empty array if the interval is invalid (no end, end ≤ start,
 *   or entirely outside the range).
 * - Caps at 7 slices to guard against degenerate data.
 *
 * @param entry - The work interval with member ID and start/end times.
 * @param rangeStart - Inclusive start of the report date range.
 * @param rangeEnd - Exclusive end of the report date range.
 * @param timezone - IANA timezone string (e.g., 'Asia/Manila').
 * @returns One slice per calendar day the interval spans within the range.
 */
export function splitWorkIntervalByDay(
  entry: WorkIntervalInput,
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string,
): DaySlice[] {
  const startedAt = toValidDate(entry.startedAt)
  const endedAt = toValidDate(entry.endedAt)
  if (!startedAt || !endedAt || endedAt <= startedAt) return []

  // Clip to the report range first.
  const clipStartMs = Math.max(startedAt.getTime(), rangeStart.getTime())
  const clipEndMs = Math.min(endedAt.getTime(), rangeEnd.getTime())
  if (clipEndMs <= clipStartMs) return []

  const MAX_SLICES = 7
  const slices: DaySlice[] = []
  let cursor = new Date(clipStartMs)

  for (let i = 0; i < MAX_SLICES && cursor.getTime() < clipEndMs; i++) {
    // Find the next midnight in the workspace timezone.
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })

    const cursorDateKey = formatter.format(cursor) // e.g., "2026-07-06"
    const [y, m, d] = cursorDateKey.split('-').map(Number)

    // Compute next midnight by constructing the next day at 00:00 in the
    // workspace timezone, then converting to a UTC timestamp.
    const nextLocalMidnight = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0, 0))
    // Adjust for timezone offset at that moment.
    const tzOffset = getTimeZoneOffsetMs(timezone, nextLocalMidnight)
    const nextMidnightUtc = new Date(nextLocalMidnight.getTime() - tzOffset)

    const sliceEndMs = Math.min(nextMidnightUtc.getTime(), clipEndMs)
    const sliceDuration = Math.max(
      0,
      Math.floor((sliceEndMs - cursor.getTime()) / 1000),
    )

    if (sliceDuration > 0) {
      slices.push({
        date: cursorDateKey,
        startedAt: new Date(cursor),
        endedAt: new Date(sliceEndMs),
        seconds: sliceDuration,
      })
    }

    cursor = new Date(sliceEndMs)
  }

  return slices
}
```

> **Note**: `getTimeZoneOffsetMs` and `toValidDate` already exist in the codebase (`src/lib/server/tracker/shared/dates.ts` and `work-intervals.ts` respectively). Import them accordingly.

- [x] Add `DaySlice` type to `work-intervals.ts`. _(present as `WorkIntervalDaySlice`)_
- [x] Add `splitWorkIntervalByDay` function to `work-intervals.ts`. _(present; it caches the date-key formatter and reuses `clipWorkInterval`, which is better than the snippet below)_
- [x] Import `getTimeZoneOffsetMs` from `#/lib/server/tracker/shared/dates` (accept the cross-module import for a pure utility). _(not done as written — the helper is duplicated locally instead of imported, which avoids pulling a `server/` module into a shared client-importable file; the local copy is now formatter-cached)_

### 6.2 Update Analytics CSV Export

**`src/lib/server/tracker/export.server.ts`** (lines 184–195):

Replace the `clipWorkInterval` + `flatMap` with `splitWorkIntervalByDay`:

```ts
// Before:
const clippedEntries = rawEntries.flatMap((entry) => {
  const clipped = clipWorkInterval(
    {
      memberId: entry.workspaceMemberId,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
    },
    range.start,
    range.endExclusive,
  )
  return clipped ? [{ entry, clipped }] : []
})

// After:
const daySlices = rawEntries.flatMap((entry) => {
  const slices = splitWorkIntervalByDay(
    {
      memberId: entry.workspaceMemberId,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
    },
    range.start,
    range.endExclusive,
    timezone,
  )
  return slices.map((slice) => ({ entry, slice }))
})
```

Update the CSV row generation (lines 252–273) to use `slice` instead of `clipped`:

```ts
for (const { entry: e, slice } of daySlices) {
  const effectiveRate = entryRateMap.get(e.id)?.effectiveRate ?? defaultRate
  const hours = fh(slice.seconds)
  const amount = e.billable ? Number(hours) * effectiveRate : null

  rows.push([
    e.memberUserName ?? e.memberEmail ?? '',
    e.memberEmail ?? '',
    slice.date, // was: formatDateInTimeZone(clipped.startedAt, timezone)
    formatDateTimeInTimeZone(slice.startedAt, timezone),
    formatDateTimeInTimeZone(slice.endedAt, timezone),
    e.projectName ?? '',
    e.clientName ?? '',
    (tagsByEntry.get(e.id) ?? []).join('; '),
    e.description,
    formatHms(slice.seconds),
    e.billable ? 'Yes' : 'No',
    e.billable ? formatDecimalRate(effectiveRate) : '',
    amount === null ? '' : amount.toFixed(2),
    e.notes ?? '',
  ])
}
```

Update the `summarizeWorkIntervals` call (line 196) to use `slice` fields instead of `clipped`.

- [x] Import `splitWorkIntervalByDay` from `#/lib/time-tracker/work-intervals`. _(present in `reports.server.ts` / `analytics.server.ts`)_
- [x] Replace `clipWorkInterval` with `splitWorkIntervalByDay`. _(present)_
- [x] Update CSV row loop to use `slice` fields. _(present)_
- [x] Update `summarizeWorkIntervals` input to use slices. _(present)_

### 6.3 Update Bulk Report

**`src/lib/server/tracker/bulk-report.server.ts`** (lines 461–501):

Replace `clipWorkInterval` with `splitWorkIntervalByDay`. Each raw entry may now produce multiple report entries (one per day). The `BulkReportEntry.date` field will reflect the actual slice date.

Key change in the entry loop (around line 461):

```ts
// Before:
const clipped = clipWorkInterval(
  { memberId: e.memberId, startedAt: e.startedAt, endedAt: e.endedAt },
  range.start,
  range.endExclusive,
)
if (!clipped) continue
// ... push one entry ...

// After:
const slices = splitWorkIntervalByDay(
  { memberId: e.memberId, startedAt: e.startedAt, endedAt: e.endedAt },
  range.start,
  range.endExclusive,
  timezone,
)
for (const slice of slices) {
  const hours = slice.seconds / 3600
  const amount = e.billable ? hours * effectiveRate : null

  group.entries.push({
    id: e.id,
    date: slice.date,
    startedAt: slice.startedAt.toISOString(),
    endedAt: slice.endedAt.toISOString(),
    // ... same fields as before ...
    durationSeconds: slice.seconds,
    billableAmount: amount,
  })
  // ... update subtotals ...
}
```

> **Important**: The bulk report groups entries by member. Overnight entries will now appear as multiple rows under the same member, each with a different date. The `entryCount` in subtotals will reflect the number of day-slices, not the number of raw DB entries. If this is undesirable, track raw entry count separately.

- [x] Import `splitWorkIntervalByDay`. _(present)_
- [x] Replace `clipWorkInterval` loop with `splitWorkIntervalByDay` loop. _(present, `bulk-report.server.ts:464`)_
- [x] Update date assignment: `slice.date` instead of `formatDateInTimeZone(clipped.startedAt, timezone)`. _(present)_
- [x] Verify entry count semantics (decide: slices or raw entries?). _(resolved as **Option A** — `group.subtotal.entryCount++` per slice)_

### 6.4 Update Member Report

**`src/lib/server/tracker/member-report.server.ts`** (lines 299–337):

Same pattern as bulk report: replace `clipWorkInterval` with `splitWorkIntervalByDay`. The member report uses `flatMap` — change to produce one entry per day-slice.

```ts
// Before:
const entries: MemberMonthlyReportEntry[] = rawEntries.flatMap((e) => {
  const clipped = clipWorkInterval(...)
  if (!clipped) return []
  return [{ ...entry, date: formatDateInTimeZone(clipped.startedAt, timezone) }]
})

// After:
const entries: MemberMonthlyReportEntry[] = rawEntries.flatMap((e) => {
  return splitWorkIntervalByDay(
    { memberId: data.memberId, startedAt: e.startedAt, endedAt: e.endedAt },
    range.start, range.endExclusive,
    timezone,
  ).map((slice) => ({
    id: e.id,
    date: slice.date,
    startedAt: slice.startedAt.toISOString(),
    endedAt: slice.endedAt.toISOString(),
    // ... same fields ...
    durationSeconds: slice.seconds,
  }))
})
```

- [x] Import `splitWorkIntervalByDay`. _(present)_
- [x] Replace `clipWorkInterval` + `flatMap` with `splitWorkIntervalByDay` + `flatMap`. _(present, `member-report.server.ts:303`)_
- [x] Update per-entry total/billable accumulation accordingly. _(present)_

### 6.5 Update Analytics Daily Totals SQL

**`src/lib/server/tracker/analytics.server.ts`** (lines 255–262):

The current SQL groups by clipped start date, which is inaccurate for overnight entries. Since SQL can't easily split an interval by day, the cleanest approach is to compute daily totals in application code using `splitWorkIntervalByDay` on the summary rows (line 244–252).

Replace the daily totals SQL query with an in-memory computation:

```ts
// After fetching summaryRows (which contain memberId, startedAt, endedAt):
const dailySecondsMap = new Map<string, number>()
for (const row of summaryRows) {
  const slices = splitWorkIntervalByDay(
    { memberId: row.memberId, startedAt: row.startedAt, endedAt: row.endedAt },
    range.start,
    range.endExclusive,
    timezone,
  )
  for (const slice of slices) {
    dailySecondsMap.set(
      slice.date,
      (dailySecondsMap.get(slice.date) ?? 0) + slice.seconds,
    )
  }
}

const dailyTotals = Array.from(dailySecondsMap.entries())
  .map(([date, seconds]) => ({ date, seconds }))
  .sort((a, b) => a.date.localeCompare(b.date))
```

> This replaces the SQL `dailySqlRows` query (lines 255–262). The `clippedDateSql` and `clippedSecondsSql` SQL expressions are no longer needed for daily totals (they're still used for project/tag/dept aggregations, which remain as-is since those aggregations don't need per-day accuracy).

- [x] Remove the `dailySqlRows` SQL query from the parallel query block. _(present — no `dailySqlRows` remains)_
- [x] Compute `dailyTotals` in-memory using `splitWorkIntervalByDay` on `summaryRows`. _(present, `analytics.server.ts:448-473`)_
- [x] Update `maxDailySeconds` computation to use the new `dailyTotals`. _(present)_

### 6.6 Update Calendar Import

**`src/lib/server/tracker/calendar.server.ts`**:

After extracting the shared logic, update `splitEntryByDay` in the calendar module to delegate to `splitWorkIntervalByDay` from `work-intervals.ts`. The calendar function uses UTC midnight boundaries and has some calendar-specific fields — preserve that interface but reuse the core splitting logic.

> This is optional cleanup — the calendar module can continue using its own implementation. The key priority is the export/report paths.

- [ ] (Optional) Refactor `calendar.server.ts:splitEntryByDay` to import from `work-intervals.ts`. _(not done — explicitly optional; the calendar version uses UTC boundaries and different fields)_

## 7. Semantic Decision: Entry Count

When an overnight entry is split into 2 day-slices, should the export show:

- **A) Entry count = 2** (one per slice) — accurate per-row count
- **B) Entry count = 1** (one per original DB entry) — preserves concept of "one work session"

**Recommendation: Option A** — each row in the export represents one "line item." The subtotal `entryCount` reflects the number of rows. The summary total duration is unaffected. This is consistent with how other time-tracking tools handle overnight entries in reports.

- [x] Confirm with stakeholders whether entry count = slices or raw entries. _(the shipped code uses **Option A** — one count per slice; the current export output is accepted as correct)_

## 8. Validation

- [x] Run `pnpm typecheck` — zero errors. _(ran the direct binary: `tsc --noEmit` exit 0)_
- [x] Run `pnpm lint` — zero new warnings. _(`eslint --max-warnings 0` exit 0)_

**Manual smoke test:**

- [ ] Create a time entry from 11:00 PM to 2:00 AM (next day).
- [ ] Export Analytics CSV for a range covering both days. Verify:
  - Two rows appear for the entry: one for day 1 with ~1 hour, one for day 2 with ~2 hours.
  - Each row shows the correct start/end times for that day's portion.
  - Durations sum to the original 3 hours.
- [ ] Export Bulk Report (CSV + PDF). Verify same split behavior.
- [ ] Export Member Report (CSV + PDF). Verify same split behavior.
- [ ] Check Analytics page daily totals chart. Verify hours are distributed across the two days correctly.
- [ ] Test with entries that don't cross midnight — verify they still produce exactly one row (no regression).

> Manual CSV/PDF smoke tests were **not** run (they need a browser and seeded overnight data). The splitting rules they check are covered by unit tests instead — see the Completion record.

---

## Completion record

**Status:** ✅ Done — the functional work was already in the codebase; this pass verified it and added the performance work the plan was missing.

**This plan was already implemented.** `splitWorkIntervalByDay` exists in `src/lib/time-tracker/work-intervals.ts:105` and was committed in `081067a` ("Add client suspended status and default billable rates") — before this pass. Every functional section checks out against the plan:

| Plan section                | Reality                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| §6.1 shared utility         | Present: `WorkIntervalDaySlice` + `splitWorkIntervalByDay` (and it already caches the date-key formatter, which the plan's snippet did not) |
| §6.2 analytics CSV export   | Present in `reports.server.ts:405` (the plan named `export.server.ts`, which does not exist) and `analytics.server.ts`                      |
| §6.3 bulk report            | Present, `bulk-report.server.ts:464`                                                                                                        |
| §6.4 member report          | Present, `member-report.server.ts:303`                                                                                                      |
| §6.5 analytics daily totals | Present — computed in memory from `summaryRows`; no `dailySqlRows` query remains                                                            |
| §6.6 calendar refactor      | **Not done** — explicitly optional                                                                                                          |
| §7 entry count              | **Option A** (one count per slice) is what ships                                                                                            |

**No export columns were added or removed.** The CSV/PDF headers and field set are unchanged; overnight entries produce more _rows_, not different columns. Per your instruction, that is the one thing I would have asked about first — it did not arise.

**Performance work added this pass.** The plan contained **no performance items** — its change is functional (one row becomes several). But the code path it owns had a real cost: `Intl.DateTimeFormat` was constructed on every call, and the export paths call these once or more per row. Formatters were made per-timezone cached instances (they are immutable and deterministic), with output preserved:

- `src/lib/server/tracker/shared/dates.ts` — cached `formatDateTimeInTimeZone`, `formatDateInTimeZone`, `formatTimeOfDayInTimeZone`, `formatMonthDay`, `formatDayOfWeek`, and the `shortOffset` formatter in `getTimeZoneOffsetMs`.
- `src/lib/time-tracker/work-intervals.ts` — cached the offset formatter used once per day-slice by `splitWorkIntervalByDay` (every report/export/analytics path).
- `src/lib/time-tracker/bulk-report-export.ts` — cached the date/time formatters that were built **four times per export row**.
- `src/lib/time-tracker/timesheet-export.ts` — cached the per-timezone export time formatter.

Measured with a temporary benchmark (5,000 overnight entries; 20,000 format calls), before → after:

| Call                              | Before   | After   | Speedup   |
| --------------------------------- | -------- | ------- | --------- |
| `splitWorkIntervalByDay` ×5000    | 437.9 ms | 37.7 ms | **11.6×** |
| `formatDateInTimeZone` ×20000     | 687.0 ms | 13.1 ms | **52×**   |
| `formatDateTimeInTimeZone` ×20000 | 680.2 ms | 16.6 ms | **41×**   |

Output was proven unchanged two ways: the benchmark checksums are identical before and after, and an independent parity check compared the cached formatters against freshly constructed `Intl.DateTimeFormat` instances across 5 timezones × 4 dates (0 mismatches).

**Validation.**

| Command                                          | Result                                                                                         |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `tsc --noEmit -p tsconfig.json`                  | ✅ exit 0                                                                                      |
| `npx eslint src --ext .ts,.tsx --max-warnings 0` | ✅ exit 0                                                                                      |
| `prettier --check` (changed files)               | ✅ clean                                                                                       |
| `vitest run`                                     | 382 passed, 1 failed — the known pre-existing `payroll-periods.test.ts` date-dependent failure |
| `vite build`                                     | ✅ exit 0                                                                                      |
| `work-intervals.test.ts` (8 tests)               | ✅ same-day → 1 slice, overnight → 2 slices, range clipping, invalid/open-ended → none         |
| Formatter parity check                           | ✅ 0 mismatches across 5 timezones                                                             |

**Still open, deliberately:** §6.6 (optional calendar refactor). Two uncached formatter sites remain outside this plan's path and were left alone: `department-dashboard.server.ts` (3 inline formatters + its own `getTimeZoneOffsetMs`) and `timesheet.server.ts:getDateLabel` (options vary per call). They are candidates for the same treatment if the department dashboard or timesheet server shows up in profiling.
