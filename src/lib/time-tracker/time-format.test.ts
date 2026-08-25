import { describe, expect, it } from 'vitest'
import { getFormatter } from './time-format'

describe('time display format', () => {
  it('formats a duration without seconds', () => {
    const format = getFormatter('hours-minutes')

    expect(format(5_445)).toBe('01:30')
    expect(format(90_061)).toBe('25:01')
  })

  it('clamps negative durations before formatting hours and minutes', () => {
    expect(getFormatter('hours-minutes')(-1)).toBe('00:00')
  })
})
