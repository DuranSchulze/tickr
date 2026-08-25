import '@tanstack/react-start/server-only'
import { getRequest } from '@tanstack/react-start/server'
import { readClientIp, readUserAgent } from '../../client-ip.server'
import { resolveRequestLocation } from '../../request-location.server'

/**
 * Origin metadata recorded when a time entry is created. All fields are
 * best-effort — an entry must never fail to save because origin resolution
 * failed or was disabled.
 */
export type EntryOrigin = {
  ipAddress: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
  userAgent: string | null
}

type DeviceLocationInput = {
  latitude: number
  longitude: number
  accuracyMeters: number
  capturedAt: string
}

const EMPTY_ORIGIN: EntryOrigin = {
  ipAddress: null,
  location: null,
  latitude: null,
  longitude: null,
  userAgent: null,
}

/**
 * Resolves the origin of the current request for entry capture.
 *
 * - Returns all-nulls immediately when the workspace has tracking disabled
 *   (no headers read, no geo call).
 * - Uses the same request-location resolver as the visible location badge, so
 *   the public IP, city, and coordinates shown to the user are also stored.
 * - Must be called within a server-function request context (same requirement
 *   as `assertTrustedOrigin`). Any failure degrades to empty rather than
 *   blocking entry creation.
 */
export function formatDeviceLocationLabel(
  location: DeviceLocationInput,
): string {
  const accuracy = Math.max(1, Math.round(location.accuracyMeters))
  return `Device location (accurate to about ${accuracy.toLocaleString('en-US')} m)`
}

/**
 * Captures only origin data that is already present in the request or payload.
 * This intentionally performs no network lookup, so creating a time entry can
 * never be delayed by an IP geolocation provider.
 */
export function captureEntryOrigin(options?: {
  trackingEnabled: boolean
  deviceLocation?: DeviceLocationInput
}): EntryOrigin {
  if (options?.trackingEnabled === false) return EMPTY_ORIGIN

  try {
    const request = getRequest()
    const origin: EntryOrigin = {
      ...EMPTY_ORIGIN,
      ipAddress: readClientIp(request),
      userAgent: readUserAgent(request),
    }
    if (!options?.deviceLocation) return origin

    return {
      ...origin,
      location: formatDeviceLocationLabel(options.deviceLocation),
      latitude: options.deviceLocation.latitude,
      longitude: options.deviceLocation.longitude,
    }
  } catch {
    if (!options?.deviceLocation) return EMPTY_ORIGIN
    return {
      ...EMPTY_ORIGIN,
      location: formatDeviceLocationLabel(options.deviceLocation),
      latitude: options.deviceLocation.latitude,
      longitude: options.deviceLocation.longitude,
    }
  }
}

export async function resolveEntryOrigin(options?: {
  trackingEnabled: boolean
  deviceLocation?: DeviceLocationInput
}): Promise<EntryOrigin> {
  if (options?.trackingEnabled === false) return EMPTY_ORIGIN

  try {
    const request = getRequest()
    const userAgent = readUserAgent(request)
    const resolved = await resolveRequestLocation(request)
    const origin: EntryOrigin = {
      ipAddress: resolved.ipAddress,
      userAgent,
      location: resolved.location,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
    }
    if (!options?.deviceLocation) return origin

    return {
      ...origin,
      location: formatDeviceLocationLabel(options.deviceLocation),
      latitude: options.deviceLocation.latitude,
      longitude: options.deviceLocation.longitude,
    }
  } catch {
    if (!options?.deviceLocation) return EMPTY_ORIGIN
    return {
      ...EMPTY_ORIGIN,
      location: formatDeviceLocationLabel(options.deviceLocation),
      latitude: options.deviceLocation.latitude,
      longitude: options.deviceLocation.longitude,
    }
  }
}
