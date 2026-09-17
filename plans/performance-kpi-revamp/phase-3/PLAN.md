# Phase 3 — KPI Engine & Grading

> **Status:** ✅ Implemented 2026-09-08

## Composite score

```
score = 60% · Depth + 25% · Consistency + 15% · Timeliness   (capped at 100)
```

- **Depth (per workday)** — `min(span, 12h) ÷ (expectedDailyHours + 1h break allowance)`, capped at 1.25. Days with `fillRatio < 0.5` have their depth credit scaled by `fillRatio ÷ 0.5` (clocked-in-but-idle guardrail). Averaged over **elapsed workdays**, so absent days count as zero depth — attendance and length both matter.
- **Consistency** — active workdays (any completed entry, >0 s) ÷ elapsed workdays (prorated by member join date).
- **Timeliness** — share of TIMER entries created on their start day (workspace tz). MANUAL entries are excluded (backdating is their nature). If a period has no TIMER entries the component is null and its weight redistributes proportionally.

## Calibration (read-only spike on real data, 2026-09-08)

Workspace tz `Asia/Manila`, 4,837 member-weekdays over 90 days, 96 members with entries in Aug 2026:

| Metric                                | Value                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| Weekday span percentiles (h)          | p10 8.97 / p50 9.19 / p90 11.00                                                 |
| Weekday tracked percentiles (h)       | p50 8.23 / p75 9.05                                                             |
| Fill ratio average                    | 0.902                                                                           |
| Days span > 12 h                      | 4.6%                                                                            |
| Same-day TIMER logging                | 99.0%                                                                           |
| Aug-2026 composite score distribution | min 16.4 / p10 69.4 / p25 84.9 / **p50 91.4** / p75 95.3 / p90 97.2 / max 102.9 |

Reading: the workforce is genuinely strong and uniform (median day ≈ 9.2 h span ≈ full credit) with an absence-driven lower tail. Timeliness is near-saturated (kept as a backfill deterrent, not a differentiator). Full-credit span set to **expected + 1 h** (median-matched), depth ratio capped at 1.25 to blunt overwork farming.

## Grade thresholds (from the distribution above)

| Grade        | Threshold | Aug-2026 share |
| ------------ | --------- | -------------- |
| A / Platinum | ≥ 92      | ~45%           |
| B / Gold     | ≥ 78      | ~42%           |
| C / Silver   | ≥ 60      | ~5%            |
| D / Bronze   | ≥ 40      | ~3%            |
| F / Starter  | < 40      | ~5%            |

A is earned by sustained full days + near-perfect attendance (the p25 member at 84.9 misses it); the absence tail lands C–F. Constants live in `performance-kpi.ts` for future re-tuning — they are not DB config (per root plan §12).

## Periods

KPI computed per calendar month (closed months only — in-progress months show a projected score + pace, no letter grade) **and** for the current payroll period derived from `payrollCutoffDays` (Phase 1 settings).

## Files

- `src/lib/time-tracker/performance-kpi.ts` — weights, thresholds, `computeKpiForPeriod()`.
- `src/lib/time-tracker/performance-kpi.test.ts` — curve edges, fill guardrail, weight redistribution, streaks, proration, closed/in-progress months.
- `src/lib/server/tracker/performance.server.ts` — applies the engine per month + payroll period.

## Approved manual-time policy — 2026-09-08

The user selected **manual hours receive half credit throughout grading**. This supersedes the unadjusted component definitions above. Existing calibration figures describe the original model only.

- Keep actual durations, active-day counts, streaks, and payroll/time reports intact.
- Per weekday, grading-credit hours = tracked hours minus half of manual hours. Divide these by actual hours to obtain the day's credit fraction.
- Multiply each day's depth credit by that fraction. Consistency sums those fractions over expected weekdays (a fully manual day earns 0.5 day of grading credit).
- Timeliness uses same-day TIMER **seconds**, divided by all TIMER seconds, multiplied by the period's grading-credit/actual-time fraction. Splitting entries cannot improve this component. Without timer hours, redistribute its weight to the already-adjusted depth and consistency components.
- Otherwise full-credit examples: all timer = 100, equal timer/manual hours = 75, all manual = 50. Long-day bonuses still exist, so these are examples, not fixed ceilings for every period.
- Show manual/timer totals and grading-credit hours inside the collapsed score explanation. Show each entry's recording method in the private daily record.
- Future changes to start/end times classify an entry as MANUAL, including member/admin edits and changed running starts. Stopping a manually adjusted timer retains MANUAL. Content-only edits preserve its source.

Limitations: historical unknown sources retain their old credit and are labeled Unknown; they are not presented as verified timer evidence. Earlier timestamp edits are not retroactively reconstructed. Offline timer replay remains supported, so TIMER describes recording method, not proof of attendance. Historical monthly scores recalculate under this policy; no frozen grade snapshots exist. No migration or historical source rewrite was performed.

Manual QA: at `/app/my-performance`, compare equivalent timer/manual/mixed days, expand the score explanation and entry descriptions, edit a timer start then stop it, and confirm MANUAL persists. Edit only the description and confirm the source does not change. Check the same score policy on the public summary; confirm reported actual hours stay unchanged.

Validation of manual-time policy: `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `pnpm test` passed (366 tests, 72 files). Regression coverage includes manual-only/mixed grading, duration-based timeliness, long manual spans, unknown sources, source display, and timestamp edit classification. React Doctor stayed at 77/100 with 14 findings. Vitest still reports its existing post-success shutdown timeout. No new queries or database migration were needed. Signed-in acceptance QA remains pending.
