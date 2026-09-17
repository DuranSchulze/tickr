# Phase 4 — My Performance UI Revamp

> **Status:** ✅ Implemented 2026-09-08

## Goal

Rebuild the member-facing page around the composite KPI with full transparency:

- **KPI card** (replaces the old consistency card): score ring + grade/badge, three component bars (Depth / Consistency / Timeliness with their weights and plain-language explanations), active days, **day span vs tracked hours side-by-side** (so span-based scoring is visible, not mysterious), long-day count, best streak, and a "points to next grade via weakest component" hint.
- **In-progress months** show a projected score and day-pace ("Day 8 of 22") instead of a letter grade; closed months keep grade + badge.
- **Payroll period card**: KPI for the period derived from `payrollCutoffDays`, labelled with its date range.
- **Month history**: six months with score + grade (current month marked "In progress").
- Heatmap, metric explorer, charts, and project totals keep working off the same daily aggregates (now timezone-correct; daily cells also carry span seconds).
- **Public share page parity**: same KPI card for the current month, read-only.
- Copy moves away from "consistency" as the whole story; framing stays "tracking health, not a productivity judgment".
- Leaderboard/rank vs workspace median: **deferred** (optional per root plan §11).

## Files

- `src/components/time-tracker/performance/PerformanceBadgeCard.tsx` — evolved into the KPI card (handles closed + in-progress states).
- `src/components/time-tracker/performance/PerformanceHistory.tsx` — score/grade tiles, in-progress marker.
- `src/components/time-tracker/performance/PerformancePage.tsx` — adds payroll-period card, streak headline.
- `src/components/time-tracker/performance/PublicPerformancePage.tsx` — parity.
- `src/components/time-tracker/performance/performance.utils.ts` — display helpers kept, thresholds moved into `performance-kpi.ts`.

## Layout simplification — 2026-09-08

User requested less information at once and a clearer page hierarchy.

- Overview now contains one score, three supporting metrics, and the current week’s time records (Monday through today, in the workspace timezone).
- Score weights, streaks, and explanatory detail live behind “How your score works.” The breakdown uses plain labels and shows redistributed weights when timeliness is unavailable. The next-grade hint now identifies the nearest threshold.
- Daily record provides the full 30-day entry list. On mobile, days stack with labeled clock times instead of requiring horizontal scrolling.
- Trends contains monthly history, a compact payroll summary, lazily loaded charts, and a collapsed yearly heatmap. The duplicate metric explorer is removed from this page.
- The shared score card also simplifies the public summary. Scoring calculations and permissions are unchanged.

Validation: typecheck, lint, production build, and 22 focused tests passed. React Doctor remains 77/100. An isolated fixture with sample data verified desktop/mobile layout, view switching, the 30-day record, trend filters, and keyboard score disclosure. Share control was stubbed in that fixture; authenticated end-to-end QA remains pending.

## Calculation transparency — 2026-09-08

Added a shared, collapsed “How this score is calculated” section to the monthly card (private and public), selected historical month, and current payroll score. It shows actual timer/manual/unknown hours, the 50% manual credit equation, component results and effective weights, weighted point contributions, unrounded total, final rounded score, and grade thresholds. Period-specific wording explains provisional scores and source limitations. The KPI engine returns calculation evidence so UI surfaces share the exact score inputs; no extra queries or migrations were added.

Validation: 370 tests passed across 73 files; typecheck, lint, and production build passed. React Doctor remained 77/100. Sample-data desktop/mobile browser checks verified disclosure by keyboard and the displayed 75-point mixed-time calculation with no page overflow. Authenticated end-to-end checks remain pending.
