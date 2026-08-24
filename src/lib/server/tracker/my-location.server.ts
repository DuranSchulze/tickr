import '@tanstack/react-start/server-only'
import { getRequest } from '@tanstack/react-start/server'
import { resolveRequestLocation } from '../request-location.server'

/**
 * The current user's approximate location, resolved from their request IP.
 * All fields are best-effort — a private/unknown IP or a geo failure yields
 * nulls rather than an error, so the Navbar badge always has something to
 * render.
 */
export type MyLocation = {
  ipAddress: string | null
  /** 'City, Region, Country' — null when the provider returns no usable parts. */
  location: string | null
  latitude: number | null
  longitude: number | null
}

const EMPTY_LOCATION: MyLocation = {
  ipAddress: null,
  location: null,
  latitude: null,
  longitude: null,
}

/**
 * Resolves the current request through the shared request-location helper —
 * the exact same source used for time-entry origins. Must be called within a
 * server-function request context; any failure degrades to an all-null result.
 */
export async function getMyLocation(): Promise<MyLocation> {
  try {
    const request = getRequest()
    return await resolveRequestLocation(request)
  } catch {
    return EMPTY_LOCATION
  }
}
