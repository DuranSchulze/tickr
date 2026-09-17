import { describe, expect, it } from 'vitest'
import {
  classifyHistoricalEntrySource,
  sourceAfterTimeEdit,
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

describe('sourceAfterTimeEdit', () => {
  const existing = {
    entrySource: 'TIMER' as const,
    startedAt: new Date('2026-09-08T00:00:00Z'),
    endedAt: new Date('2026-09-08T08:00:00Z'),
  }
  it('preserves source for unchanged clock times', () => {
    expect(sourceAfterTimeEdit(existing, { ...existing })).toBe('TIMER')
  })
  it('marks changed starts or ends as manual', () => {
    expect(
      sourceAfterTimeEdit(existing, {
        ...existing,
        startedAt: new Date('2026-09-07T23:00:00Z'),
      }),
    ).toBe('MANUAL')
    expect(
      sourceAfterTimeEdit(existing, {
        ...existing,
        endedAt: new Date('2026-09-08T09:00:00Z'),
      }),
    ).toBe('MANUAL')
  })
  it('preserves manual and unknown sources on content-only edits', () => {
    expect(
      sourceAfterTimeEdit({ ...existing, entrySource: 'MANUAL' }, existing),
    ).toBe('MANUAL')
    expect(
      sourceAfterTimeEdit({ ...existing, entrySource: null }, existing),
    ).toBeNull()
  })
  it('marks a running timer with a changed start as manual', () => {
    expect(
      sourceAfterTimeEdit(
        { ...existing, endedAt: null },
        { startedAt: new Date('2026-09-07T23:00:00Z'), endedAt: null },
      ),
    ).toBe('MANUAL')
  })
})
