import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureDeviceLocation,
  getLocationPermissionState,
} from './device-location'

function position(latitude = 14.5176, longitude = 121.0509, accuracy = 12.6) {
  return {
    coords: {
      latitude,
      longitude,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON: () => ({}),
    },
    timestamp: Date.parse('2026-08-24T04:00:00.000Z'),
    toJSON: () => ({}),
  }
}

describe('captureDeviceLocation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns precise browser coordinates with their accuracy and timestamp', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success(position())
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
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    )
  })

  it('falls back cleanly when browser location is unavailable', async () => {
    vi.stubGlobal('navigator', {})
    await expect(captureDeviceLocation()).resolves.toBeUndefined()
  })

  it('retries once without high accuracy when the first attempt fails', async () => {
    const calls: Array<{
      success: PositionCallback
      error: PositionErrorCallback
    }> = []
    const geolocation = {
      getCurrentPosition: vi.fn(
        (success: PositionCallback, error: PositionErrorCallback) => {
          calls.push({ success, error })
          if (calls.length === 1) {
            error(
              new Error(
                'GPS unavailable',
              ) as unknown as GeolocationPositionError,
            )
          } else {
            success(position(14.5, 121.05, 150))
          }
        },
      ),
    }
    vi.stubGlobal('navigator', { geolocation })

    await expect(captureDeviceLocation()).resolves.toMatchObject({
      latitude: 14.5,
      longitude: 121.05,
      accuracyMeters: 150,
    })
    expect(geolocation.getCurrentPosition).toHaveBeenCalledTimes(2)
  })

  it('skips retries when retry is disabled', async () => {
    const getCurrentPosition = vi.fn(
      (_success: PositionCallback, error: PositionErrorCallback) => {
        error(
          new Error('GPS unavailable') as unknown as GeolocationPositionError,
        )
      },
    )
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })

    await expect(
      captureDeviceLocation({ retry: false }),
    ).resolves.toBeUndefined()
    expect(getCurrentPosition).toHaveBeenCalledOnce()
  })

  it('skips silently when permission is not granted and onlyWhenGranted is set', async () => {
    const getCurrentPosition = vi.fn()
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition },
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'prompt' }),
      },
    })

    await expect(
      captureDeviceLocation({ onlyWhenGranted: true }),
    ).resolves.toBeUndefined()
    expect(getCurrentPosition).not.toHaveBeenCalled()
  })

  it('captures when permission is already granted and onlyWhenGranted is set', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success(position())
    })
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition },
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'granted' }),
      },
    })

    await expect(
      captureDeviceLocation({ onlyWhenGranted: true }),
    ).resolves.toMatchObject({ latitude: 14.5176 })
  })
})

describe('getLocationPermissionState', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reports unsupported when the Permissions API is missing', async () => {
    vi.stubGlobal('navigator', {})
    await expect(getLocationPermissionState()).resolves.toBe('unsupported')
  })

  it('reports unsupported when the query rejects', async () => {
    vi.stubGlobal('navigator', {
      permissions: { query: vi.fn().mockRejectedValue(new TypeError()) },
    })
    await expect(getLocationPermissionState()).resolves.toBe('unsupported')
  })
})
