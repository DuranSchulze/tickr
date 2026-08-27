/**
 * Best-effort reverse geocoding: device coordinates → place name.
 *
 * Uses OpenStreetMap's Nominatim endpoint (no API key) with an in-memory
 * cache. Any failure returns null — callers fall back to the coordinate
 * accuracy label, so a slow or unavailable geocoder never blocks entry
 * creation. Set REVERSE_GEOCODE_URL to point at a self-hosted or commercial
 * geocoder with the same Nominatim-compatible response shape.
 */

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // place names rarely change
const CACHE_MAX_ENTRIES = 2000

const reverseCache = new Map<
  string,
  { value: string | null; expiresAt: number }
>()

function cacheKey(latitude: number, longitude: number): string {
  // ~110 m grid — close fixes share an entry without visible jumps.
  return `${latitude.toFixed(3)}|${longitude.toFixed(3)}`
}

function readCached(key: string): string | null | undefined {
  const hit = reverseCache.get(key)
  if (!hit) return undefined
  if (hit.expiresAt <= Date.now()) {
    reverseCache.delete(key)
    return undefined
  }
  return hit.value
}

function writeCache(key: string, value: string | null): void {
  if (reverseCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = reverseCache.keys().next().value
    if (oldest !== undefined) reverseCache.delete(oldest)
  }
  reverseCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return null
}

/**
 * Composes a compact place label from a Nominatim reverse response, e.g.
 * "5th Avenue, Bonifacio Global City, Taguig". At most three parts, most
 * specific first. Returns null when the payload has no usable address.
 */
export function parseNominatimPayload(
  data: Record<string, unknown>,
): string | null {
  const address =
    typeof data.address === 'object' && data.address !== null
      ? (data.address as Record<string, unknown>)
      : {}

  const street = firstString(data.name, address.house_number, address.road)
  const locality = firstString(
    address.neighbourhood,
    address.suburb,
    address.city_district,
    address.quarter,
  )
  const city = firstString(
    address.city,
    address.municipality,
    address.town,
    address.county,
  )
  const state = firstString(address.state, address.region)

  const parts: string[] = []
  for (const part of [street, locality, city, state]) {
    if (part && !parts.includes(part) && parts.length < 3) {
      parts.push(part)
    }
  }
  if (parts.length > 0) return parts.join(', ')

  // Shape without addressdetails — degrade to the leading display parts.
  if (typeof data.display_name === 'string' && data.display_name.length > 0) {
    const displayParts = data.display_name
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 3)
    if (displayParts.length > 0) return displayParts.join(', ')
  }
  return null
}

/** Resolves coordinates to a place name; null when unavailable or unusable. */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<string | null> {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null
  }

  const key = cacheKey(latitude, longitude)
  const cached = readCached(key)
  if (cached !== undefined) return cached

  const baseUrl = (
    process.env.REVERSE_GEOCODE_URL ??
    'https://nominatim.openstreetmap.org/reverse'
  ).replace(/\/+$/, '')
  const url = `${baseUrl}?format=jsonv2&addressdetails=1&zoom=16&lat=${latitude}&lon=${longitude}`
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'Tickr/1.0 (time-entry location labels)' },
    })
    if (!response.ok) {
      // Negative answers are cached too, but briefly-failed lookups should
      // retry sooner — skip caching so the next capture can try again.
      return null
    }
    const data = (await response.json()) as Record<string, unknown>
    const name = parseNominatimPayload(data)
    writeCache(key, name)
    return name
  } catch {
    return null
  }
}
