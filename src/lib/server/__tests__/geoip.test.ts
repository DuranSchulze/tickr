import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  geolocateCurrentNetwork,
  isPrivateIp,
  parseIpInfoPayload,
} from '../geoip'

describe('IP geolocation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('recognizes direct-development addresses as private', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true)
    expect(isPrivateIp('::1')).toBe(true)
    expect(isPrivateIp('192.168.1.50')).toBe(true)
    expect(isPrivateIp('8.8.8.8')).toBe(false)
  })

  it('normalizes a provider payload into city-level location data', () => {
    expect(
      parseIpInfoPayload({
        ip: '203.0.113.42',
        city: 'Makati City',
        region: 'Metro Manila',
        country: 'PH',
        loc: '14.5547,121.0244',
      }),
    ).toEqual({
      ipAddress: '203.0.113.42',
      location: 'Makati City, Metro Manila, PH',
      latitude: 14.5547,
      longitude: 121.0244,
    })
  })

  it('resolves the current network when proxy headers are unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ip: '203.0.113.42',
          city: 'Manila',
          region: 'Metro Manila',
          country: 'PH',
          loc: '14.5995,120.9842',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(geolocateCurrentNetwork()).resolves.toEqual({
      ipAddress: '203.0.113.42',
      location: 'Manila, Metro Manila, PH',
      latitude: 14.5995,
      longitude: 120.9842,
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('ipinfo.io/json')
  })
})
