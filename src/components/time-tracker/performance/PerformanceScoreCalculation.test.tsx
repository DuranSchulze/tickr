// @vitest-environment jsdom
import { screen } from '@testing-library/dom'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { computeKpiForPeriod } from '#/lib/time-tracker/performance-kpi'
import type { PerformanceMonthSummary } from '#/lib/server/tracker/performance.server'
import { PerformanceScoreCalculation } from './PerformanceScoreCalculation'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})
function summary(manualHours: number): PerformanceMonthSummary {
  const result = computeKpiForPeriod(
    new Map([
      [
        '2026-09-08',
        {
          trackedSeconds: 8 * 3600,
          spanSeconds: 9 * 3600,
          manualSeconds: manualHours * 3600,
          timerSeconds: (8 - manualHours) * 3600,
          sameDayTimerSeconds: (8 - manualHours) * 3600,
          timerEntries: manualHours === 8 ? 0 : 1,
          sameDayTimerEntries: manualHours === 8 ? 0 : 1,
        },
      ],
    ]),
    ['2026-09-08'],
    8,
  )
  return {
    ...result,
    month: '2026-09',
    inProgress: true,
    workingDays: 1,
    totalWorkdays: 22,
    activePercent: 100,
    projectedScore: result.score,
    grade: null,
    badge: null,
  }
}
function render(value: PerformanceMonthSummary, periodLabel?: string) {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() =>
    root!.render(
      <PerformanceScoreCalculation
        summary={value}
        expectedDailyHours={8}
        periodLabel={periodLabel}
      />,
    ),
  )
}

describe('PerformanceScoreCalculation', () => {
  it('shows mixed-hour credit and actual weighted points without doubling the penalty', () => {
    render(summary(4))
    expect(
      screen.getByText(/4h timer × 100% \+ 4h manual × 50%.*6h grading credit/),
    ).toBeTruthy()
    expect(screen.getByText('45 + 18.75 + 11.25 = 75 → 75/100')).toBeTruthy()
    expect(
      screen.getByText('How this score is calculated').closest('details')?.open,
    ).toBe(false)
  })
  it('explains manual-only weight redistribution and the supplied payroll period', () => {
    render(summary(8), 'September 1–15')
    expect(screen.getByText(/September 1–15/)).toBeTruthy()
    expect(screen.getByText('35.29 + 14.71 = 50 → 50/100')).toBeTruthy()
    expect(screen.getByText(/No timer hours to assess/)).toBeTruthy()
    expect(
      screen.getByText(/manual time still receives half credit/),
    ).toBeTruthy()
  })
  it('does not show a fabricated calculation before eligible workdays exist', () => {
    render({
      ...summary(0),
      workingDays: 0,
      components: null,
      calculation: null,
    })
    expect(screen.getByText(/There is no score to calculate/)).toBeTruthy()
    expect(screen.queryByText('How the points add up')).toBeNull()
  })
})
