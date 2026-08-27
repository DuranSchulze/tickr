import { getMyLocationFn } from '#/lib/server/tracker'
import type { DeviceLocation } from '#/lib/time-tracker/device-location'

export type MyLocation = {
  source: 'device' | 'network'
  ipAddress: string | null
  /** Place name (device fix) or 'City, Region, Country' (IP fallback). */
  location: string | null
  latitude: number | null
  longitude: number | null
  accuracyMeters: number | null
}

export const getMyLocationQueryKey = () => ['my-location'] as const

export function fetchMyLocation(
  deviceLocation?: DeviceLocation,
): Promise<MyLocation> {
  return getMyLocationFn({ data: { deviceLocation } })
}

/**
 * Formats decimal degrees into a compact human label, e.g.
 * `14.5995°N, 120.9842°E`. Hemisphere letters are absolute, so southern/
 * western coordinates never render with a minus sign.
 */
export function formatCoordinates(latitude: number, longitude: number): string {
  const latDir = latitude >= 0 ? 'N' : 'S'
  const lngDir = longitude >= 0 ? 'E' : 'W'
  return `${Math.abs(latitude).toFixed(4)}°${latDir}, ${Math.abs(longitude).toFixed(4)}°${lngDir}`
}
