# Phase 2 — Time in / Time out & Day Metrics

> **Status:** ✅ Implemented 2026-09-08 (see root PLAN.md §11 for context)

## Goal

Put performance math on correct days and correct days on correct lengths:

1. **Workspace-timezone day bucketing** — replace UTC `toDateKey()` bucketing with `dateKeyInTimeZone()` (pattern from `src/lib/time-tracker/timesheet.ts`). Fixes Manila early-morning entries landing on the previous day / being dropped as weekends.
2. **Span-based day length (D1)** — per member/day, `spanSeconds = lastEntryEnd − firstEntryStart`, computed from raw `time_entries` (same source the page already loads; single source of truth). Tracked seconds retained alongside.
3. **Secondary signals** — `fillRatio = trackedSeconds ÷ spanSeconds` (anti-gaming), early-start / late-finish timestamps surfaced per day.
4. **Structural fixes** — no letter-grade on partial months (show pace/projection instead); months prorated by member join date (`workspace_members.createdAt`); working-day calendar (Mon–Fri) derived from tz-correct date keys.

## Decisions

- Day aggregates computed from **raw entries**, not `analytics_daily_member_metrics` — avoids depending on rollup completeness; the page already loads a year of raw entries so there is no query-cost change. The rollup remains available for a future consistency-check script (out of scope here).
- Month date keys are built as `'YYYY-MM-DD'` strings directly (1..days-in-month), not from UTC `Date` math — no drift possible.
- Timeliness input data (entry `createdAt` vs `startedAt` same-day, TIMER entries only) is collected in this phase; scoring lives in Phase 3.

## Files

- `src/lib/time-tracker/performance-kpi.ts` (NEW) — pure day/period math: weekday calendar, span/fill normalization, streaks, join-date proration window.
- `src/lib/time-tracker/performance-kpi.test.ts` (NEW)
- `src/lib/server/tracker/performance.server.ts` (REWRITE) — tz bucketing, day aggregates, new payload.
