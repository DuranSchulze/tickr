import { describe, expect, it } from 'vitest'
import { formatCoordinates } from './my-location-query'

describe('formatCoordinates', () => {
  it('formats northern/eastern coordinates', () => {
    expect(formatCoordinates(14.5995, 120.9842)).toBe(
      '14.5995°N, 120.9842°E',
    )
  })

  it('uses absolute values with hemisphere letters for south/west', () => {
    expect(formatCoordinates(-33.8688, 151.2093)).toBe(
      '33.8688°S, 151.2093°E',
    )
    expect(formatCoordinates(0, -77.0369)).toBe('0.0000°N, 77.0369°W')
  })

  it('rounds to four decimal places', () => {
    expect(formatCoordinates(1.23456, 2.34567)).toBe('1.2346°N, 2.3457°E')
  })
})
