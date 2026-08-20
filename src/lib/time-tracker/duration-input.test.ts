import { describe, expect, it } from 'vitest'
import { parseDurationInput } from './duration-input'

describe('parseDurationInput', () => {
  it.each([
    ['1:30', 5_400],
    ['1:30:45', 5_445],
    ['1h 30m', 5_400],
    ['1h', 3_600],
    ['30m', 1_800],
    ['1.5', 5_400],
    ['  2H 15M  ', 8_100],
  ])('parses %s as %i seconds', (input, expected) => {
    expect(parseDurationInput(input)).toBe(expected)
  })

  it.each([
    '',
    'garbage',
    '1:60',
    '1:30:60',
    '1h garbage',
    '1.5 hours',
    ':30',
    '-1',
  ])('rejects malformed duration %j', (input) => {
    expect(parseDurationInput(input)).toBeNull()
  })
})
