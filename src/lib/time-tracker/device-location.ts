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

const LOCATION_TIMEOUT_MS = 8_000
const LOCATION_MAX_AGE_MS = 15_000

/**
 * Best-effort precise location capture for new time entries.
 *
 * Browsers require a secure context and explicit user permission. Returning
 * undefined lets entry creation continue with the server's IP fallback when
 * the API is unavailable, denied, or times out.
 */
export function captureDeviceLocation(): Promise<DeviceLocation | undefined> {
  if (typeof navigator === 'undefined') {
    return Promise.resolve(undefined)
  }
  const geolocation = Reflect.get(navigator, 'geolocation') as
    | Geolocation
    | undefined
  if (typeof geolocation?.getCurrentPosition !== 'function') {
    return Promise.resolve(undefined)
  }

  return new Promise((resolve) => {
    geolocation.getCurrentPosition(
      (position) => {
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
          resolve(undefined)
          return
        }

        resolve({
          latitude,
          longitude,
          accuracyMeters: Math.max(0, accuracy),
          capturedAt: new Date(
            Number.isFinite(position.timestamp)
              ? position.timestamp
              : Date.now(),
          ).toISOString(),
        })
      },
      () => resolve(undefined),
      {
        enableHighAccuracy: true,
        timeout: LOCATION_TIMEOUT_MS,
        maximumAge: LOCATION_MAX_AGE_MS,
      },
    )
  })
}
