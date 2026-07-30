import { describe, expect, it } from 'vitest'
import {
  classifyHistoricalEntrySource,
  formatManualEntryIndicator,
  formatTimeEntrySource,
} from './entry-source'

const base = new Date('2026-07-30T01:00:00.000Z')

function secondsAfter(value: Date, seconds: number) {
  return new Date(value.getTime() + seconds * 1000)
}

describe('historical time-entry source classification', () => {
  it('classifies both timestamp pairs within the 60-second margin as timer', () => {
    expect(
      classifyHistoricalEntrySource({
        createdAt: secondsAfter(base, 60),
        startedAt: base,
        updatedAt: secondsAfter(base, 3_660),
        endedAt: secondsAfter(base, 3_600),
      }),
    ).toBe('TIMER')
  })

  it('classifies an entry as manual when either pair exceeds the margin', () => {
    expect(
      classifyHistoricalEntrySource({
        createdAt: secondsAfter(base, 61),
        startedAt: base,
        updatedAt: secondsAfter(base, 3_600),
        endedAt: secondsAfter(base, 3_600),
      }),
    ).toBe('MANUAL')

    expect(
      classifyHistoricalEntrySource({
        createdAt: base,
        startedAt: base,
        updatedAt: secondsAfter(base, 3_661),
        endedAt: secondsAfter(base, 3_600),
      }),
    ).toBe('MANUAL')
  })

  it('leaves an ongoing entry unclassified', () => {
    expect(
      classifyHistoricalEntrySource({
        createdAt: base,
        startedAt: base,
        updatedAt: base,
        endedAt: null,
      }),
    ).toBeNull()
  })
})

describe('time-entry source formatting', () => {
  it('uses export-safe labels including the nullable fallback', () => {
    expect(formatTimeEntrySource('TIMER')).toBe('Timer')
    expect(formatTimeEntrySource('MANUAL')).toBe('Manual')
    expect(formatTimeEntrySource(null)).toBe('Unknown')
  })

  it('marks only manual entries in the simplified export column', () => {
    expect(formatManualEntryIndicator('MANUAL')).toBe('X')
    expect(formatManualEntryIndicator('TIMER')).toBe('')
    expect(formatManualEntryIndicator(null)).toBe('')
  })
})
