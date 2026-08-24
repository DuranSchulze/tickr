import '@tanstack/react-start/server-only'
import { readClientIp } from './client-ip.server'
import { geolocateCurrentNetwork, geolocateIp, isPrivateIp } from './geoip'

export type RequestLocation = {
  ipAddress: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
}

const EMPTY_LOCATION: RequestLocation = {
  ipAddress: null,
  location: null,
  latitude: null,
  longitude: null,
}

function mayResolveCurrentNetwork(request: Request): boolean {
  if (process.env.NODE_ENV !== 'production') return true

  try {
    const hostname = new URL(request.url).hostname
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return false
  }
}

/**
 * Resolves the network location represented by a request. A trusted public
 * proxy IP is preferred in production. Local development falls back to the
 * server's outward public network because browsers do not expose their public
 * IP and the local dev server has no reverse-proxy headers.
 */
export async function resolveRequestLocation(
  request: Request,
): Promise<RequestLocation> {
  const requestIp = readClientIp(request)

  if (requestIp && !isPrivateIp(requestIp)) {
    const geo = await geolocateIp(requestIp)
    return {
      ipAddress: requestIp,
      location: geo?.location ?? null,
      latitude: geo?.latitude ?? null,
      longitude: geo?.longitude ?? null,
    }
  }

  if (!mayResolveCurrentNetwork(request)) {
    return { ...EMPTY_LOCATION, ipAddress: requestIp }
  }

  const currentNetwork = await geolocateCurrentNetwork()
  return {
    ipAddress: currentNetwork?.ipAddress ?? requestIp,
    location: currentNetwork?.location ?? null,
    latitude: currentNetwork?.latitude ?? null,
    longitude: currentNetwork?.longitude ?? null,
  }
}
