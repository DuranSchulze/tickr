const PRIVATE_IP_PREFIXES = [
  '192.168.',
  '10.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  'fc',
  'fd',
]

export function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true
  return PRIVATE_IP_PREFIXES.some((prefix) => ip.startsWith(prefix))
}

export type GeoLocation = {
  /** 'City, Region, Country' — null when the provider returns no usable parts. */
  location: string | null
  latitude: number | null
  longitude: number | null
}

export type NetworkLocation = GeoLocation & {
  /** Public IP reported by the provider; null when it is missing or malformed. */
  ipAddress: string | null
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h — offices resolve once per day
const CACHE_MAX_ENTRIES = 1000

const geoCache = new Map<string, { value: GeoLocation; expiresAt: number }>()

function readCached(ip: string): GeoLocation | null {
  const hit = geoCache.get(ip)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    geoCache.delete(ip)
    return null
  }
  return hit.value
}

function writeCache(ip: string, value: GeoLocation): void {
  // Simple size bound: evict the oldest key (Map preserves insertion order).
  if (geoCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = geoCache.keys().next().value
    if (oldest !== undefined) geoCache.delete(oldest)
  }
  geoCache.set(ip, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

/** Parses ipinfo's `loc` field ("lat,lng") with range guards; null when unusable. */
function parseLoc(
  loc: unknown,
): { latitude: number; longitude: number } | null {
  if (typeof loc !== 'string' || !loc.includes(',')) return null
  const [latStr, lngStr] = loc.split(',')
  const latitude = Number.parseFloat(latStr)
  const longitude = Number.parseFloat(lngStr)
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null
  if (latitude < -90 || latitude > 90) return null
  if (longitude < -180 || longitude > 180) return null
  return { latitude, longitude }
}

export function parseIpInfoPayload(
  data: Record<string, unknown>,
): NetworkLocation {
  const parts = [data.city, data.region, data.country].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
  const coords = parseLoc(data.loc)

  return {
    ipAddress:
      typeof data.ip === 'string' && data.ip.trim().length > 0
        ? data.ip.trim().slice(0, 64)
        : null,
    location: parts.length > 0 ? parts.join(', ') : null,
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
  }
}

async function fetchIpInfo(url: string): Promise<NetworkLocation | null> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
    if (!response.ok) return null

    const data = (await response.json()) as Record<string, unknown>
    return parseIpInfoPayload(data)
  } catch {
    return null
  }
}

/**
 * Resolves an IP to a city-level location via ipinfo.io. Coordinates come from
 * the provider's `loc` field. Private/local IPs and any fetch failure return
 * an all-null result — callers treat geo as best-effort and must not block on it.
 */
export async function geolocateIp(ip: string): Promise<GeoLocation | null> {
  if (isPrivateIp(ip)) return null

  const cached = readCached(ip)
  if (cached) return cached

  const token = process.env.IPINFO_TOKEN
  const url = token
    ? `https://ipinfo.io/${ip}?token=${token}`
    : `https://ipinfo.io/${ip}/json`
  const value = await fetchIpInfo(url)
  if (!value) return null

  const geo = {
    location: value.location,
    latitude: value.latitude,
    longitude: value.longitude,
  }
  writeCache(ip, geo)
  return geo
}

/**
 * Resolves the public network used by this server request. This is a fallback
 * for direct/local development requests, where no reverse-proxy client IP
 * header exists. It intentionally is not cached under a synthetic key so a
 * manual refresh can observe a changed VPN or network immediately.
 */
export async function geolocateCurrentNetwork(): Promise<NetworkLocation | null> {
  const token = process.env.IPINFO_TOKEN
  const url = token
    ? `https://ipinfo.io/json?token=${token}`
    : 'https://ipinfo.io/json'
  return fetchIpInfo(url)
}
