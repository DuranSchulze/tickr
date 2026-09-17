import { describe, expect, it } from 'vitest'
import {
  KPI_WEIGHTS,
  aggregatePerformanceDays,
  badgeForGrade,
  computeKpiForPeriod,
  daysInMonth,
  gradeForScore,
  isWeekdayDateKey,
  monthDateKeys,
  shiftMonthKey,
} from './performance-kpi'
import type { KpiDayFact, KpiEntryRow } from './performance-kpi'

const HOUR = 3600
const EXPECTED_HOURS = 8
// Full-credit span: 8 h expected + 1 h break allowance.
const FULL_DAY = (EXPECTED_HOURS + 1) * HOUR

function fact(overrides: Partial<KpiDayFact> = {}): KpiDayFact {
  const timerEntries = overrides.timerEntries ?? 4
  const sameDayEntries = overrides.sameDayTimerEntries ?? 4
  return {
    manualSeconds: 0,
    timerSeconds: timerEntries > 0 ? 8 * HOUR : 0,
    sameDayTimerSeconds:
      timerEntries > 0 ? (sameDayEntries / timerEntries) * 8 * HOUR : 0,
    trackedSeconds: 8 * HOUR,
    spanSeconds: FULL_DAY,
    timerEntries: 4,
    sameDayTimerEntries: 4,
    ...overrides,
  }
}

function factsByDate(entries: Record<string, KpiDayFact>) {
  return new Map(Object.entries(entries))
}

// 2026-09: Tue Sep 1 – Fri Sep 4 are the first four weekdays.
const SEP = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']

describe('calendar helpers', () => {
  it('identifies weekdays from date keys', () => {
    expect(isWeekdayDateKey('2026-09-04')).toBe(true) // Friday
    expect(isWeekdayDateKey('2026-09-05')).toBe(false) // Saturday
    expect(isWeekdayDateKey('2026-09-06')).toBe(false) // Sunday
    expect(isWeekdayDateKey('2026-09-07')).toBe(true) // Monday
  })

  it('builds month date keys including leap February', () => {
    expect(daysInMonth('2026-09')).toBe(30)
    expect(monthDateKeys('2026-02')).toHaveLength(28)
    expect(monthDateKeys('2024-02')).toHaveLength(29)
    expect(monthDateKeys('2026-09')[0]).toBe('2026-09-01')
    expect(monthDateKeys('2026-09').at(-1)).toBe('2026-09-30')
  })
})

describe('gradeForScore / badgeForGrade', () => {
  it('applies calibrated thresholds', () => {
    expect(gradeForScore(92)).toBe('A')
    expect(gradeForScore(91.9)).toBe('B')
    expect(gradeForScore(78)).toBe('B')
    expect(gradeForScore(77.9)).toBe('C')
    expect(gradeForScore(60)).toBe('C')
    expect(gradeForScore(39.9)).toBe('F')
  })

  it('maps grades to badges', () => {
    expect(badgeForGrade('A')).toBe('Platinum')
    expect(badgeForGrade('B')).toBe('Gold')
    expect(badgeForGrade('F')).toBe('Starter')
  })
})

describe('aggregatePerformanceDays', () => {
  const MANILA = 'Asia/Manila'

  function timerEntry(
    startIso: string,
    endIso: string,
    seconds: number,
    createdIso?: string,
  ): KpiEntryRow {
    return {
      startedAt: new Date(startIso),
      endedAt: new Date(endIso),
      durationSeconds: seconds,
      createdAt: new Date(createdIso ?? startIso),
      entrySource: 'TIMER',
    }
  }

  it('buckets Manila days by local date, not UTC', () => {
    // 2026-09-08 01:00 Manila = 2026-09-07 17:00 UTC — must land on Sep 8.
    const days = aggregatePerformanceDays(
      [timerEntry('2026-09-07T17:00:00Z', '2026-09-07T17:30:00Z', 1800)],
      MANILA,
    )

    expect(days.has('2026-09-08')).toBe(true)
    expect(days.has('2026-09-07')).toBe(false)
  })

  it('derives the day span from first start to last end across gaps', () => {
    // Clock in 08:00, stop 09:00; resume 13:00, clock out 18:00 (Manila).
    const days = aggregatePerformanceDays(
      [
        timerEntry('2026-09-08T00:00:00Z', '2026-09-08T01:00:00Z', 3600),
        timerEntry('2026-09-08T05:00:00Z', '2026-09-08T10:00:00Z', 5 * 3600),
      ],
      MANILA,
    )

    const day = days.get('2026-09-08')!
    expect(day.spanSeconds).toBe(10 * 3600)
    expect(day.trackedSeconds).toBe(6 * 3600)
    expect(day.entryCount).toBe(2)
    expect(day.firstStartedAt).toBe('2026-09-08T00:00:00.000Z')
    expect(day.lastEndedAt).toBe('2026-09-08T10:00:00.000Z')
  })

  it('counts same-day-created TIMER entries for timeliness and skips MANUAL', () => {
    const days = aggregatePerformanceDays(
      [
        timerEntry(
          '2026-09-08T01:00:00Z',
          '2026-09-08T02:00:00Z',
          3600,
          '2026-09-08T02:00:01Z', // created right after stopping, same day
        ),
        {
          ...timerEntry(
            '2026-09-08T04:00:00Z',
            '2026-09-08T05:00:00Z',
            3600,
            '2026-09-20T09:00:00Z', // logged 12 days later
          ),
        },
        {
          startedAt: new Date('2026-09-08T06:00:00Z'),
          endedAt: new Date('2026-09-08T07:00:00Z'),
          durationSeconds: 3600,
          createdAt: new Date('2026-09-25T09:00:00Z'),
          entrySource: 'MANUAL', // excluded from timeliness entirely
        },
      ],
      MANILA,
    )

    const day = days.get('2026-09-08')!
    expect(day.timerEntries).toBe(2)
    expect(day.sameDayTimerEntries).toBe(1)
  })

  it('ignores entries without an end', () => {
    const days = aggregatePerformanceDays(
      [
        {
          startedAt: new Date('2026-09-08T01:00:00Z'),
          endedAt: null,
          durationSeconds: 0,
          createdAt: new Date('2026-09-08T01:00:00Z'),
          entrySource: 'TIMER',
        },
      ],
      MANILA,
    )

    expect(days.size).toBe(0)
  })
})

describe('shiftMonthKey', () => {
  it('shifts across year boundaries', () => {
    expect(shiftMonthKey('2026-09', -9)).toBe('2025-12')
    expect(shiftMonthKey('2025-12', 1)).toBe('2026-01')
  })
})

describe('computeKpiForPeriod', () => {
  it('scores a perfect month at 100 with grade A', () => {
    const result = computeKpiForPeriod(
      factsByDate(Object.fromEntries(SEP.map((d) => [d, fact()]))),
      SEP,
      EXPECTED_HOURS,
    )

    expect(result.score).toBe(100)
    expect(result.grade).toBe('A')
    expect(result.components.depth).toBe(100)
    expect(result.components.consistency).toBe(100)
    expect(result.components.timeliness).toBe(100)
    expect(result.activeDays).toBe(4)
    expect(result.elapsedWorkdays).toBe(4)
    expect(result.longDays).toBe(0)
    expect(result.currentStreak).toBe(4)
    expect(result.bestStreak).toBe(4)
    expect(result.avgSpanSeconds).toBe(FULL_DAY)
  })

  it('averages depth over elapsed workdays so missed days score zero', () => {
    const result = computeKpiForPeriod(
      factsByDate({ '2026-09-01': fact(), '2026-09-03': fact() }),
      SEP,
      EXPECTED_HOURS,
    )

    // Two full days out of four: depth 50, consistency 50, timeliness 100.
    expect(result.components.depth).toBe(50)
    expect(result.components.consistency).toBe(50)
    expect(result.activeDays).toBe(2)
    const expected =
      50 * KPI_WEIGHTS.depth +
      50 * KPI_WEIGHTS.consistency +
      100 * KPI_WEIGHTS.timeliness
    expect(result.score).toBe(Math.round(expected))
  })

  it('rewards longer days beyond full credit up to the ratio cap', () => {
    const full = computeKpiForPeriod(
      factsByDate({ '2026-09-01': fact() }),
      SEP.slice(0, 1),
      EXPECTED_HOURS,
    )
    const longDay = computeKpiForPeriod(
      factsByDate({ '2026-09-01': fact({ spanSeconds: 11 * HOUR }) }),
      SEP.slice(0, 1),
      EXPECTED_HOURS,
    )
    const capped = computeKpiForPeriod(
      factsByDate({
        '2026-09-01': fact({
          spanSeconds: 15 * HOUR,
          trackedSeconds: 15 * HOUR,
        }),
      }),
      SEP.slice(0, 1),
      EXPECTED_HOURS,
    )

    expect(longDay.components.depth).toBeGreaterThan(full.components.depth)
    expect(longDay.longDays).toBe(1)
    // 11 h ÷ 9 h full day = 1.22; a 30 h span caps at 12 h ÷ 9 h = 1.33 →
    // clamped to the 1.25 ratio cap.
    expect(longDay.components.depth).toBe(122.2)
    expect(capped.components.depth).toBe(125)
  })

  it('scales down depth credit for idle-heavy spans (fill guardrail)', () => {
    const dense = computeKpiForPeriod(
      factsByDate({
        '2026-09-01': fact({ trackedSeconds: 8 * HOUR, spanSeconds: 9 * HOUR }),
      }),
      SEP.slice(0, 1),
      EXPECTED_HOURS,
    )
    const idle = computeKpiForPeriod(
      factsByDate({
        '2026-09-01': fact({
          trackedSeconds: 2 * HOUR,
          spanSeconds: 10 * HOUR,
        }),
      }),
      SEP.slice(0, 1),
      EXPECTED_HOURS,
    )

    // fill = 0.2 < 0.5 floor → ratio = (10/9) × (0.2/0.5) = 0.444.
    expect(idle.components.depth).toBeLessThan(dense.components.depth)
    expect(idle.components.depth).toBe(44.4)
  })

  it('redistributes timeliness weight when a period has no TIMER entries', () => {
    const result = computeKpiForPeriod(
      factsByDate({
        '2026-09-01': fact({ timerEntries: 0, sameDayTimerEntries: 0 }),
      }),
      SEP.slice(0, 1),
      EXPECTED_HOURS,
    )

    expect(result.components.timeliness).toBeNull()
    const expected =
      (100 * KPI_WEIGHTS.depth + 100 * KPI_WEIGHTS.consistency) /
      (KPI_WEIGHTS.depth + KPI_WEIGHTS.consistency)
    expect(result.score).toBe(Math.round(expected))
    expect(result.score).toBe(100)
  })

  it('penalizes late-logged entries in timeliness', () => {
    const result = computeKpiForPeriod(
      factsByDate({
        '2026-09-01': fact({ timerEntries: 4, sameDayTimerEntries: 2 }),
      }),
      SEP.slice(0, 1),
      EXPECTED_HOURS,
    )

    expect(result.components.timeliness).toBe(50)
  })

  it('tracks best streak across gaps and ignores a trailing incomplete day', () => {
    const result = computeKpiForPeriod(
      factsByDate({
        '2026-09-01': fact(),
        '2026-09-02': fact(),
        '2026-09-04': fact(),
      }),
      SEP,
      EXPECTED_HOURS,
    )

    // Active Tue+Wed, idle Thu, active Fri (trailing day counts — it is active).
    expect(result.bestStreak).toBe(2)
    expect(result.currentStreak).toBe(1)
  })

  it('does not break the current streak on an idle final day', () => {
    const result = computeKpiForPeriod(
      factsByDate({ '2026-09-01': fact(), '2026-09-02': fact() }),
      SEP,
      EXPECTED_HOURS,
    )

    // Wed and Thu idle; Thu is the trailing day and gets ignored once.
    expect(result.currentStreak).toBe(0)
    expect(result.bestStreak).toBe(2)
  })

  it('returns zeroed results for an empty period', () => {
    const result = computeKpiForPeriod(factsByDate({}), [], EXPECTED_HOURS)

    expect(result.score).toBe(0)
    expect(result.grade).toBe('F')
    expect(result.elapsedWorkdays).toBe(0)
    expect(result.avgSpanSeconds).toBeNull()
    expect(result.currentStreak).toBe(0)
  })
})

describe('closed-day streak regression', () => {
  const days = factsByDate({ '2026-09-01': fact(), '2026-09-02': fact() })
  const keys = SEP.slice(0, 3)

  it('breaks the streak when the last closed workday was missed', () => {
    expect(computeKpiForPeriod(days, keys, 8).currentStreak).toBe(0)
  })

  it('preserves the streak only when the missing final day is explicitly open', () => {
    expect(computeKpiForPeriod(days, keys, 8, '2026-09-03').currentStreak).toBe(
      2,
    )
    expect(computeKpiForPeriod(days, keys, 8, '2026-09-04').currentStreak).toBe(
      0,
    )
  })
})

describe('manual time receives half grading credit', () => {
  const keys = SEP.slice(0, 1)
  function gradeManualShare(manualHours: number) {
    return computeKpiForPeriod(
      factsByDate({
        '2026-09-01': fact({
          trackedSeconds: 8 * HOUR,
          manualSeconds: manualHours * HOUR,
          timerSeconds: (8 - manualHours) * HOUR,
          sameDayTimerSeconds: (8 - manualHours) * HOUR,
          timerEntries: manualHours === 8 ? 0 : 1,
          sameDayTimerEntries: manualHours === 8 ? 0 : 1,
        }),
      }),
      keys,
      8,
    )
  }

  it('keeps actual hours and active days while halving all-manual grading', () => {
    const result = gradeManualShare(8)
    expect(result.score).toBe(50)
    expect(result.grade).toBe('D')
    expect(result.totalSeconds).toBe(8 * HOUR)
    expect(result.creditedSeconds).toBe(4 * HOUR)
    expect(result.activeDays).toBe(1)
    expect(result.components.depth).toBe(50)
    expect(result.components.consistency).toBe(50)
    expect(result.components.timeliness).toBeNull()
  })

  it('weights mixed entries by duration, not their count', () => {
    expect(gradeManualShare(0).score).toBe(100)
    const mixed = gradeManualShare(4)
    expect(mixed.score).toBe(75)
    expect(mixed.components.timeliness).toBe(75)
    const split = computeKpiForPeriod(
      factsByDate({
        '2026-09-01': fact({
          manualSeconds: 4 * HOUR,
          timerSeconds: 4 * HOUR,
          sameDayTimerSeconds: 4 * HOUR,
          timerEntries: 100,
          sameDayTimerEntries: 100,
        }),
      }),
      keys,
      8,
    )
    expect(split.score).toBe(mixed.score)
  })

  it('does not let long manual days reach an A through span bonuses', () => {
    const result = computeKpiForPeriod(
      factsByDate({
        '2026-09-01': fact({
          trackedSeconds: 12 * HOUR,
          spanSeconds: 12 * HOUR,
          manualSeconds: 12 * HOUR,
          timerSeconds: 0,
          sameDayTimerSeconds: 0,
          timerEntries: 0,
          sameDayTimerEntries: 0,
        }),
      }),
      keys,
      8,
    )
    expect(result.score).toBeLessThan(60)
  })

  it('buckets manual durations separately and ignores running manual entries', () => {
    const days = aggregatePerformanceDays(
      [
        {
          startedAt: new Date('2026-09-01T00:00:00Z'),
          endedAt: new Date('2026-09-01T08:00:00Z'),
          durationSeconds: 8 * HOUR,
          createdAt: null,
          entrySource: 'MANUAL',
        },
        {
          startedAt: new Date('2026-09-01T09:00:00Z'),
          endedAt: null,
          durationSeconds: HOUR,
          createdAt: null,
          entrySource: 'MANUAL',
        },
      ],
      'Asia/Manila',
    )
    expect(days.get('2026-09-01')?.manualSeconds).toBe(8 * HOUR)
    expect(days.get('2026-09-01')?.timerSeconds).toBe(0)
  })
})

describe('duration-weighted logging credit', () => {
  it('does not let many short timely entries outweigh a long late entry', () => {
    const result = computeKpiForPeriod(
      factsByDate({
        '2026-09-01': fact({
          timerSeconds: 8 * HOUR,
          sameDayTimerSeconds: HOUR,
          timerEntries: 101,
          sameDayTimerEntries: 100,
        }),
      }),
      SEP.slice(0, 1),
      8,
    )
    expect(result.components.timeliness).toBe(12.5)
  })
  it('does not relabel historical unknown time as manual', () => {
    const result = computeKpiForPeriod(
      factsByDate({
        '2026-09-01': fact({
          timerSeconds: 0,
          sameDayTimerSeconds: 0,
          timerEntries: 0,
          sameDayTimerEntries: 0,
        }),
      }),
      SEP.slice(0, 1),
      8,
    )
    expect(result.manualSeconds).toBe(0)
    expect(result.timerSeconds).toBe(0)
    expect(result.creditedSeconds).toBe(result.totalSeconds)
  })
})

describe('calculation evidence', () => {
  it('returns unrounded contributions used by the actual score', () => {
    const result = computeKpiForPeriod(
      factsByDate({
        '2026-09-01': fact({ spanSeconds: 7.123 * HOUR }),
      }),
      SEP.slice(0, 1),
      8,
    )
    const { points, weights, unroundedScore } = result.calculation
    expect(points.depth + points.consistency + (points.timeliness ?? 0)).toBe(
      unroundedScore,
    )
    expect(
      weights.depth + weights.consistency + weights.timeliness,
    ).toBeCloseTo(1)
    expect(Math.min(100, Math.round(unroundedScore))).toBe(result.score)
  })
})
