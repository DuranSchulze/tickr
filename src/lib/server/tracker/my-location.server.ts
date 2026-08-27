import '@tanstack/react-start/server-only'
import { getRequest } from '@tanstack/react-start/server'
import { resolveRequestLocation } from '../request-location.server'
import { reverseGeocode } from '../reverse-geocode'
import { formatDeviceLocationLabel } from './shared/origin.server'
import type { DeviceLocation } from '#/lib/time-tracker/device-location'

/**
 * The current user's location as shown by the Navbar badge. A device fix
 * (browser geolocation, reverse-geocoded to a place name) is preferred; the
 * request IP's city-level resolution is the fallback. All fields are
 * best-effort — failures yield nulls rather than errors, so the badge always
 * has something to render.
 */
export type MyLocation = {
  source: 'device' | 'network'
  ipAddress: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
  /** Accuracy radius in meters for device fixes; null for network ones. */
  accuracyMeters: number | null
}

const EMPTY_LOCATION: MyLocation = {
  source: 'network',
  ipAddress: null,
  location: null,
  latitude: null,
  longitude: null,
  accuracyMeters: null,
}

/**
 * Must be called within a server-function request context. The network side
 * is always resolved (the badge displays the public IP); when a device fix is
 * supplied its coordinates and reverse-geocoded name take precedence.
 */
export async function getMyLocation(
  deviceLocation?: DeviceLocation,
): Promise<MyLocation> {
  try {
    const request = getRequest()
    const resolved = await resolveRequestLocation(request)

    if (!deviceLocation) {
      return {
        source: 'network',
        ipAddress: resolved.ipAddress,
        location: resolved.location,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        accuracyMeters: null,
      }
    }

    const placeName = await reverseGeocode(
      deviceLocation.latitude,
      deviceLocation.longitude,
    )
    return {
      source: 'device',
      ipAddress: resolved.ipAddress,
      location: placeName ?? formatDeviceLocationLabel(deviceLocation),
      latitude: deviceLocation.latitude,
      longitude: deviceLocation.longitude,
      accuracyMeters: Math.max(0, Math.round(deviceLocation.accuracyMeters)),
    }
  } catch {
    return EMPTY_LOCATION
  }
}
