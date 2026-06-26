import { describe, expect, it } from 'vitest'
import { getLocalDateKey, isBirthdayToday } from './BirthdayCelebration'

describe('isBirthdayToday', () => {
  it('matches when the month and day are the same', () => {
    expect(isBirthdayToday('1990-03-15', new Date(2026, 2, 15))).toBe(true)
  })

  it('does not match when the month or day differs', () => {
    expect(isBirthdayToday('1990-03-15', new Date(2026, 2, 16))).toBe(false)
    expect(isBirthdayToday('1990-03-15', new Date(2026, 3, 15))).toBe(false)
  })

  it('rejects empty and malformed dates', () => {
    expect(isBirthdayToday('', new Date(2026, 2, 15))).toBe(false)
    expect(isBirthdayToday('March 15, 1990', new Date(2026, 2, 15))).toBe(false)
    expect(isBirthdayToday('1990-02-30', new Date(2026, 2, 2))).toBe(false)
  })

  it('matches leap day only on February 29', () => {
    expect(isBirthdayToday('2000-02-29', new Date(2028, 1, 29))).toBe(true)
    expect(isBirthdayToday('2000-02-29', new Date(2026, 1, 28))).toBe(false)
    expect(isBirthdayToday('2000-02-29', new Date(2026, 2, 1))).toBe(false)
  })
})

describe('getLocalDateKey', () => {
  it('formats a local date as yyyy-mm-dd', () => {
    expect(getLocalDateKey(new Date(2026, 5, 7))).toBe('2026-06-07')
  })
})
