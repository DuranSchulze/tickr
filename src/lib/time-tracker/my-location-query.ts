import { getMyLocationFn } from '#/lib/server/tracker'

export type MyLocation = {
  ipAddress: string | null
  /** 'City, Region, Country' — null when the provider returns no usable parts. */
  location: string | null
  latitude: number | null
  longitude: number | null
}

export const getMyLocationQueryKey = () => ['my-location'] as const

export function fetchMyLocation(): Promise<MyLocation> {
  return getMyLocationFn()
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
