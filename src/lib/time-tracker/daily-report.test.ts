import { describe, expect, it } from 'vitest'
import {
  classifyDay,
  duePhases,
  formatHoursMinutes,
  getDayKind,
  latestSaturdayBefore,
  memberMinimumSeconds,
  minimumSecondsFor,
  previousWorkingDay,
  readDailyReportConfig,
} from './daily-report'

const defaults = readDailyReportConfig({})

describe('daily report config', () => {
  it('is off by default with the agreed thresholds', () => {
    expect(defaults.enabled).toBe(false)
    expect(defaults.nudgeHour).toBe(17)
    expect(defaults.breakAllowanceHours).toBe(0.5)
    expect(defaults.saturdayMinimumHours).toBe(4)
    expect(defaults.attachmentMaxBytes).toBe(2 * 1024 * 1024)
  })

  it('can send report links without attachments', () => {
    expect(
      readDailyReportConfig({ DAILY_REPORT_ATTACHMENT_MAX_MB: '0' })
        .attachmentMaxBytes,
    ).toBe(0)
  })

  it('parses lists, ignores invalid values, and can turn the nudge off', () => {
    const config = readDailyReportConfig({
      DAILY_REPORT_EMAILS_ENABLED: 'true',
      DAILY_REPORT_HR_EMAILS: 'HR@example.com, not-an-email, hr@example.com',
      DAILY_REPORT_HOLIDAYS: '2026-12-25,2026-13-01',
      DAILY_REPORT_NUDGE_HOUR: 'off',
      DAILY_REPORT_SATURDAY_MIN_HOURS: '-3',
    })
    expect(config.enabled).toBe(true)
    expect(config.hrEmails).toEqual(['hr@example.com'])
    expect([...config.holidays]).toEqual(['2026-12-25'])
    expect(config.nudgeHour).toBeNull()
    expect(config.saturdayMinimumHours).toBe(4)
  })
})

describe('daily minimums and status', () => {
  it('uses 7.5h Monday–Friday, 4h Saturday, and none on rest days', () => {
    expect(minimumSecondsFor('weekday', defaults, 8)).toBe(27_000)
    expect(minimumSecondsFor('saturday', defaults, 8)).toBe(14_400)
    expect(minimumSecondsFor('sunday', defaults, 8)).toBe(0)
    expect(minimumSecondsFor('holiday', defaults, 8)).toBe(0)
  })

  it('classifies working days, rest days, N/A, and leave', () => {
    const weekday = { minimumSeconds: 27_000, confirmedNotWorking: false }
    expect(classifyDay({ ...weekday, workedSeconds: 27_000 })).toBe('MET')
    expect(classifyDay({ ...weekday, workedSeconds: 26_999 })).toBe('SHORT')
    expect(classifyDay({ ...weekday, workedSeconds: 0 })).toBe('NO_TIME')
    expect(
      classifyDay({ ...weekday, workedSeconds: 0, confirmedNotWorking: true }),
    ).toBe('NOT_WORKING')
    expect(
      classifyDay({ ...weekday, workedSeconds: 3_600, onLeave: true }),
    ).toBe('LEAVE')
    const saturday = { minimumSeconds: 14_400, confirmedNotWorking: false }
    expect(classifyDay({ ...saturday, workedSeconds: 0 })).toBe('NO_TIME')
    expect(classifyDay({ ...saturday, workedSeconds: 3_600 })).toBe('SHORT')
    const sunday = { minimumSeconds: 0, confirmedNotWorking: false }
    expect(classifyDay({ ...sunday, workedSeconds: 0 })).toBe('OFF')
    expect(classifyDay({ ...sunday, workedSeconds: 3_600 })).toBe('MET')
  })

  it('recognises Saturday, Sunday, and configured holidays', () => {
    expect(getDayKind('2026-11-21', new Set())).toBe('saturday')
    expect(getDayKind('2026-11-22', new Set())).toBe('sunday')
    expect(getDayKind('2026-11-20', new Set())).toBe('weekday')
    expect(getDayKind('2026-11-20', new Set(['2026-11-20']))).toBe('holiday')
  })

  it('skips Sundays and holidays when finding the previous working day', () => {
    // Monday 23 Nov looks back to Saturday 21 Nov.
    expect(previousWorkingDay('2026-11-23', defaults)).toBe('2026-11-21')
    // With Saturdays off, it looks back to Friday 20 Nov.
    expect(
      previousWorkingDay(
        '2026-11-23',
        readDailyReportConfig({ DAILY_REPORT_SATURDAY_MIN_HOURS: '0' }),
      ),
    ).toBe('2026-11-20')
    expect(
      previousWorkingDay('2026-12-26', {
        ...defaults,
        holidays: new Set(['2026-12-25']),
      }),
    ).toBe('2026-12-24')
  })
})

describe('Saturday workers', () => {
  it('applies the Saturday minimum only to people who worked last Saturday', () => {
    expect(memberMinimumSeconds('saturday', 14_400, true)).toBe(14_400)
    expect(memberMinimumSeconds('saturday', 14_400, false)).toBe(0)
    expect(memberMinimumSeconds('weekday', 27_000, false)).toBe(27_000)
  })

  it('shows Friday on Monday to someone who works Monday–Friday', () => {
    expect(previousWorkingDay('2026-11-23', defaults, false)).toBe('2026-11-20')
    expect(previousWorkingDay('2026-11-23', defaults, true)).toBe('2026-11-21')
  })

  it('finds the latest Saturday before a date', () => {
    expect(latestSaturdayBefore('2026-11-23')).toBe('2026-11-21')
    expect(latestSaturdayBefore('2026-11-22')).toBe('2026-11-21')
    expect(latestSaturdayBefore('2026-11-21')).toBe('2026-11-14')
  })
})

describe('delivery windows', () => {
  it('sends the previous day’s report after local midnight', () => {
    // 00:10 on Fri 20 Nov 2026 in Manila (UTC+8).
    expect(
      duePhases(new Date('2026-11-19T16:10:00Z'), 'Asia/Manila', defaults),
    ).toEqual([{ kind: 'report', date: '2026-11-19' }])
  })

  it('nudges Monday to Friday evenings only', () => {
    // 17:05 on Fri 20 Nov and Sat 21 Nov 2026 in Manila.
    expect(
      duePhases(new Date('2026-11-20T09:05:00Z'), 'Asia/Manila', defaults),
    ).toEqual([{ kind: 'nudge', date: '2026-11-20' }])
    expect(
      duePhases(new Date('2026-11-21T09:05:00Z'), 'Asia/Manila', defaults),
    ).toEqual([])
  })

  it('does nothing outside the windows', () => {
    // 12:00 in Manila.
    expect(
      duePhases(new Date('2026-11-20T04:00:00Z'), 'Asia/Manila', defaults),
    ).toEqual([])
  })
})

describe('formatHoursMinutes', () => {
  it('formats durations compactly', () => {
    expect(formatHoursMinutes(0)).toBe('0m')
    expect(formatHoursMinutes(27_000)).toBe('7h 30m')
    expect(formatHoursMinutes(14_400)).toBe('4h')
  })
})
