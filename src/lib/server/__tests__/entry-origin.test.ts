import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureEntryOrigin,
  resolveEntryOrigin,
} from '../tracker/shared/origin.server'

const { getRequestMock } = vi.hoisted(() => ({
  getRequestMock: vi.fn(),
}))

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: getRequestMock,
}))

function ipInfoResponse() {
  return new Response(
    JSON.stringify({
      ip: '192.0.2.126',
      city: 'Davao City',
      region: 'Davao Region',
      country: 'PH',
      loc: '7.1907,125.4553',
    }),
    { status: 200 },
  )
}

function nominatimResponse() {
  return new Response(
    JSON.stringify({
      name: '5th Avenue',
      display_name:
        '5th Avenue, Bonifacio Global City, Taguig, Metro Manila, Philippines',
      address: {
        road: '5th Avenue',
        suburb: 'Bonifacio Global City',
        city: 'Taguig',
        state: 'Metro Manila',
        country: 'Philippines',
      },
    }),
    { status: 200 },
  )
}

describe('time-entry origin capture', () => {
  afterEach(() => {
    getRequestMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('captures request metadata without waiting for network geolocation', () => {
    getRequestMock.mockReturnValue(
      new Request('https://tickr.example/api/timer', {
        headers: {
          'x-forwarded-for': '192.0.2.126',
          'user-agent': 'Tickr test browser',
        },
      }),
    )
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(captureEntryOrigin({ trackingEnabled: true })).toEqual({
      ipAddress: '192.0.2.126',
      location: null,
      latitude: null,
      longitude: null,
      locationSource: 'network',
      locationAccuracyM: null,
      userAgent: 'Tickr test browser',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('stores the same resolved IP and coordinates used by the location badge', async () => {
    getRequestMock.mockReturnValue(
      new Request('https://tickr.example/api/timer', {
        headers: {
          'x-forwarded-for': '192.0.2.126',
          'user-agent': 'Tickr test browser',
        },
      }),
    )
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ipInfoResponse()))

    await expect(
      resolveEntryOrigin({ trackingEnabled: true }),
    ).resolves.toEqual({
      ipAddress: '192.0.2.126',
      location: 'Davao City, Davao Region, PH',
      latitude: 7.1907,
      longitude: 125.4553,
      locationSource: 'network',
      locationAccuracyM: null,
      userAgent: 'Tickr test browser',
    })
  })

  it('does not inspect or resolve location when workspace tracking is off', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      resolveEntryOrigin({ trackingEnabled: false }),
    ).resolves.toEqual({
      ipAddress: null,
      location: null,
      latitude: null,
      longitude: null,
      locationSource: null,
      locationAccuracyM: null,
      userAgent: null,
    })
    expect(getRequestMock).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('prefers precise device coordinates over the IP provider location', async () => {
    getRequestMock.mockReturnValue(
      new Request('https://tickr.example/api/timer', {
        headers: { 'user-agent': 'Tickr test browser' },
      }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ip: '192.0.2.126',
            city: 'Cavite City',
            region: 'Calabarzon',
            country: 'PH',
            loc: '14.4791,120.8970',
          }),
          { status: 200 },
        ),
      ),
    )

    await expect(
      resolveEntryOrigin({
        trackingEnabled: true,
        deviceLocation: {
          latitude: 14.5176,
          longitude: 121.0509,
          accuracyMeters: 18.4,
          capturedAt: '2026-08-24T04:00:00.000Z',
        },
      }),
    ).resolves.toEqual({
      ipAddress: '192.0.2.126',
      location: 'Device location (accurate to about 18 m)',
      latitude: 14.5176,
      longitude: 121.0509,
      locationSource: 'device',
      locationAccuracyM: 18,
      userAgent: 'Tickr test browser',
    })
  })

  it('labels device coordinates with their reverse-geocoded place name', async () => {
    getRequestMock.mockReturnValue(
      new Request('https://tickr.example/api/timer', {
        headers: { 'user-agent': 'Tickr test browser' },
      }),
    )
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url).includes('nominatim')
        ? nominatimResponse()
        : ipInfoResponse(),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      resolveEntryOrigin({
        trackingEnabled: true,
        deviceLocation: {
          latitude: 14.5409,
          longitude: 121.0518,
          accuracyMeters: 22,
          capturedAt: '2026-08-24T04:00:00.000Z',
        },
      }),
    ).resolves.toEqual({
      ipAddress: '192.0.2.126',
      location: '5th Avenue, Bonifacio Global City, Taguig',
      latitude: 14.5409,
      longitude: 121.0518,
      locationSource: 'device',
      locationAccuracyM: 22,
      userAgent: 'Tickr test browser',
    })
  })

  it('keeps device coordinates when IP resolution fails', async () => {
    getRequestMock.mockImplementation(() => {
      throw new Error('request context unavailable')
    })

    await expect(
      resolveEntryOrigin({
        trackingEnabled: true,
        deviceLocation: {
          latitude: 14.5176,
          longitude: 121.0509,
          accuracyMeters: 25,
          capturedAt: '2026-08-24T04:00:00.000Z',
        },
      }),
    ).resolves.toMatchObject({
      location: 'Device location (accurate to about 25 m)',
      latitude: 14.5176,
      longitude: 121.0509,
      locationSource: 'device',
      locationAccuracyM: 25,
    })
  })
})
