import { afterEach, describe, expect, it, vi } from 'vitest'
import { getMyLocation } from '../tracker/my-location.server'

const { getRequestMock } = vi.hoisted(() => ({
  getRequestMock: vi.fn(),
}))

vi.mock('@tanstack/react-start/server', () => ({
  getRequest: getRequestMock,
}))

function stubFetch() {
  return vi.fn(async (url: string | URL | Request) => {
    const href = String(url)
    if (href.includes('nominatim')) {
      return new Response(
        JSON.stringify({
          name: '5th Avenue',
          address: {
            road: '5th Avenue',
            suburb: 'Bonifacio Global City',
            city: 'Taguig',
            state: 'Metro Manila',
          },
        }),
        { status: 200 },
      )
    }
    return new Response(
      JSON.stringify({
        ip: '192.0.2.126',
        city: 'Pasig',
        region: 'Metro Manila',
        country: 'PH',
        loc: '14.5833,121.0879',
      }),
      { status: 200 },
    )
  })
}

describe('getMyLocation', () => {
  afterEach(() => {
    getRequestMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('resolves the network location when no device fix is supplied', async () => {
    getRequestMock.mockReturnValue(
      new Request('https://tickr.example/api/location', {
        headers: { 'x-forwarded-for': '192.0.2.126' },
      }),
    )
    vi.stubGlobal('fetch', stubFetch())

    await expect(getMyLocation()).resolves.toEqual({
      source: 'network',
      ipAddress: '192.0.2.126',
      location: 'Pasig, Metro Manila, PH',
      latitude: 14.5833,
      longitude: 121.0879,
      accuracyMeters: null,
    })
  })

  it('prefers the device fix and its reverse-geocoded place name', async () => {
    getRequestMock.mockReturnValue(
      new Request('https://tickr.example/api/location', {
        headers: { 'x-forwarded-for': '192.0.2.126' },
      }),
    )
    vi.stubGlobal('fetch', stubFetch())

    await expect(
      getMyLocation({
        latitude: 14.5409,
        longitude: 121.0518,
        accuracyMeters: 22,
        capturedAt: '2026-08-24T04:00:00.000Z',
      }),
    ).resolves.toEqual({
      source: 'device',
      ipAddress: '192.0.2.126',
      location: '5th Avenue, Bonifacio Global City, Taguig',
      latitude: 14.5409,
      longitude: 121.0518,
      accuracyMeters: 22,
    })
  })

  it('degrades to empty values when the request context is unavailable', async () => {
    getRequestMock.mockImplementation(() => {
      throw new Error('no request context')
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(getMyLocation()).resolves.toEqual({
      source: 'network',
      ipAddress: null,
      location: null,
      latitude: null,
      longitude: null,
      accuracyMeters: null,
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
