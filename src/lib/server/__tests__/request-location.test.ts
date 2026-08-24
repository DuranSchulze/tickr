import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveRequestLocation } from '../request-location.server'

describe('request location resolution', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses a forwarded public client IP as the stored origin', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ip: '198.51.100.77',
          city: 'Cebu City',
          region: 'Central Visayas',
          country: 'PH',
          loc: '10.3157,123.8854',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const request = new Request('https://tickr.example/locations', {
      headers: { 'x-forwarded-for': '198.51.100.77, 10.0.0.4' },
    })

    await expect(resolveRequestLocation(request)).resolves.toEqual({
      ipAddress: '198.51.100.77',
      location: 'Cebu City, Central Visayas, PH',
      latitude: 10.3157,
      longitude: 123.8854,
    })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'ipinfo.io/198.51.100.77',
    )
  })

  it('uses the outward public network for a direct local request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ip: '203.0.113.91',
            city: 'Makati City',
            region: 'Metro Manila',
            country: 'PH',
            loc: '14.5547,121.0244',
          }),
          { status: 200 },
        ),
      ),
    )

    await expect(
      resolveRequestLocation(new Request('http://localhost:3001/locations')),
    ).resolves.toEqual({
      ipAddress: '203.0.113.91',
      location: 'Makati City, Metro Manila, PH',
      latitude: 14.5547,
      longitude: 121.0244,
    })
  })
})
