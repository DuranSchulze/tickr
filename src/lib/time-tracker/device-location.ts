export type DeviceLocation = {
  latitude: number
  longitude: number
  accuracyMeters: number
  capturedAt: string
}

export type EntryLocationCaptureStatus =
  | 'idle'
  | 'locating'
  | 'attached'
  | 'approximate'
  | 'unavailable'

const DEFAULT_TIMEOUT_MS = 12_000
const DEFAULT_MAX_AGE_MS = 30_000
const RETRY_TIMEOUT_MS = 8_000

export type LocationPermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'unsupported'

/**
 * Reads the geolocation permission via the Permissions API. Returns
 * 'unsupported' when the API is missing or rejects — callers must treat that
 * as "unknown", never as granted.
 */
export async function getLocationPermissionState(): Promise<LocationPermissionState> {
  if (typeof navigator === 'undefined') return 'unsupported'
  const permissions = Reflect.get(navigator, 'permissions') as
    | { query?: (descriptor: { name: string }) => Promise<PermissionStatus> }
    | undefined
  if (typeof permissions?.query !== 'function') return 'unsupported'
  try {
    const status = await permissions.query({ name: 'geolocation' })
    return status.state
  } catch {
    return 'unsupported'
  }
}

export type CaptureDeviceLocationOptions = {
  timeoutMs?: number
  maximumAgeMs?: number
  /** Retry once without high accuracy when the first attempt fails (default). */
  retry?: boolean
  /**
   * Skip silently unless geolocation permission is already granted. Passive
   * callers (badge polling) must never trigger the browser permission prompt.
   */
  onlyWhenGranted?: boolean
}

function requestPosition(
  geolocation: Geolocation,
  enableHighAccuracy: boolean,
  timeoutMs: number,
  maximumAgeMs: number,
): Promise<GeolocationPosition | undefined> {
  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(undefined),
      { enableHighAccuracy, timeout: timeoutMs, maximumAge: maximumAgeMs },
    )
  })
}

function toDeviceLocation(
  position: GeolocationPosition | undefined,
): DeviceLocation | undefined {
  if (!position) return undefined
  const { latitude, longitude, accuracy } = position.coords
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(accuracy) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    accuracy < 0 ||
    accuracy > 100_000
  ) {
    return undefined
  }

  return {
    latitude,
    longitude,
    accuracyMeters: Math.max(0, accuracy),
    capturedAt: new Date(
      Number.isFinite(position.timestamp) ? position.timestamp : Date.now(),
    ).toISOString(),
  }
}

/**
 * Best-effort precise location capture for new time entries.
 *
 * Browsers require a secure context and explicit user permission. Returning
 * undefined lets entry creation continue with the server's IP fallback when
 * the API is unavailable, denied, or times out. A high-accuracy attempt is
 * retried once at low accuracy — a WiFi/cell fix still beats IP geolocation.
 */
export async function captureDeviceLocation(
  options?: CaptureDeviceLocationOptions,
): Promise<DeviceLocation | undefined> {
  if (typeof navigator === 'undefined') {
    return undefined
  }
  const geolocation = Reflect.get(navigator, 'geolocation') as
    | Geolocation
    | undefined
  if (typeof geolocation?.getCurrentPosition !== 'function') {
    return undefined
  }

  if (
    options?.onlyWhenGranted &&
    (await getLocationPermissionState()) !== 'granted'
  ) {
    return undefined
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maximumAgeMs = options?.maximumAgeMs ?? DEFAULT_MAX_AGE_MS

  const precise = toDeviceLocation(
    await requestPosition(geolocation, true, timeoutMs, maximumAgeMs),
  )
  if (precise) return precise

  if (options?.retry === false) return undefined
  return toDeviceLocation(
    await requestPosition(
      geolocation,
      false,
      Math.min(RETRY_TIMEOUT_MS, timeoutMs),
      maximumAgeMs,
    ),
  )
}
