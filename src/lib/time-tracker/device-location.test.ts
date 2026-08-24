import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureDeviceLocation } from './device-location'

describe('captureDeviceLocation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns precise browser coordinates with their accuracy and timestamp', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 14.5176,
          longitude: 121.0509,
          accuracy: 12.6,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
          toJSON: () => ({}),
        },
        timestamp: Date.parse('2026-08-24T04:00:00.000Z'),
        toJSON: () => ({}),
      })
    })
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    await expect(captureDeviceLocation()).resolves.toEqual({
      latitude: 14.5176,
      longitude: 121.0509,
      accuracyMeters: 12.6,
      capturedAt: '2026-08-24T04:00:00.000Z',
    })
    expect(getCurrentPosition).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 15_000 },
    )
  })

  it('falls back cleanly when browser location is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    await expect(captureDeviceLocation()).resolves.toBeUndefined()
  })
})
