import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildCalendarDays,
  buildWeekDays,
  workspaceDateKey,
} from './calendar.utils'

afterEach(() => vi.useRealTimers())
describe('workspace calendar today', () => {
  it('highlights Tuesday November 3 in both views before UTC midnight', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-02T23:50:00Z'))
    expect(workspaceDateKey(new Date(), 'Asia/Manila')).toBe('2026-11-03')
    for (const days of [
      buildCalendarDays('2026-11', 'Asia/Manila'),
      buildWeekDays('2026-11-03', 'Asia/Manila'),
    ]) {
      expect(
        days.filter((day) => day.isToday).map((day) => day.dateKey),
      ).toEqual(['2026-11-03'])
      expect(days.find((day) => day.isToday)?.date.getUTCDay()).toBe(2)
    }
  })
})
