import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseNominatimPayload, reverseGeocode } from '../reverse-geocode'

describe('parseNominatimPayload', () => {
  it('composes street, locality, and city from the address block', () => {
    expect(
      parseNominatimPayload({
        name: '5th Avenue',
        address: {
          road: '5th Avenue',
          suburb: 'Bonifacio Global City',
          city: 'Taguig',
          state: 'Metro Manila',
        },
      }),
    ).toBe('5th Avenue, Bonifacio Global City, Taguig')
  })

  it('skips missing parts instead of leaving gaps', () => {
    expect(
      parseNominatimPayload({
        address: { city: 'Pasig', state: 'Metro Manila' },
      }),
    ).toBe('Pasig, Metro Manila')
  })

  it('falls back to display_name parts without address details', () => {
    expect(
      parseNominatimPayload({
        display_name: 'BGC, Taguig, Metro Manila, Philippines',
      }),
    ).toBe('BGC, Taguig, Metro Manila')
  })

  it('returns null when nothing usable is present', () => {
    expect(parseNominatimPayload({})).toBeNull()
    expect(parseNominatimPayload({ error: 'rate limited' })).toBeNull()
  })
})

describe('reverseGeocode', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('rejects out-of-range coordinates without calling the provider', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(reverseGeocode(95, 121)).resolves.toBeNull()
    await expect(reverseGeocode(14, 181)).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('caches results so repeated captures skip the provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          name: '5th Avenue',
          address: { road: '5th Avenue', suburb: 'BGC', city: 'Taguig' },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(reverseGeocode(10.3157, 123.8854)).resolves.toBe(
      '5th Avenue, BGC, Taguig',
    )
    // ~110 m grid — a capture a few meters away shares the cache entry.
    await expect(reverseGeocode(10.3158, 123.8855)).resolves.toBe(
      '5th Avenue, BGC, Taguig',
    )
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('returns null on provider failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 })),
    )

    await expect(reverseGeocode(-33.8688, 151.2093)).resolves.toBeNull()
  })
})
