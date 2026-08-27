import { useQuery } from '@tanstack/react-query'
import {
  fetchMyLocation,
  getMyLocationQueryKey,
} from '#/lib/time-tracker/my-location-query'
import { captureDeviceLocation } from '#/lib/time-tracker/device-location'

/**
 * The current user's location for the Navbar badge.
 *
 * Each refresh first tries the browser's device geolocation — but only when
 * permission was already granted, so polling never triggers the permission
 * prompt. Without a device fix the server resolves the request IP to a
 * city-level location. Best-effort and refreshed while this page is open. Use
 * the returned `refetch` to force an immediate refresh.
 */
export function useMyLocation() {
  return useQuery({
    queryKey: getMyLocationQueryKey(),
    queryFn: async () => {
      const deviceLocation = await captureDeviceLocation({
        onlyWhenGranted: true,
        retry: false,
        timeoutMs: 6_000,
        // Refetches run every minute — a fix up to ~70s old is still fresh
        // enough and avoids a new lookup on every poll.
        maximumAgeMs: 70_000,
      })
      return fetchMyLocation(deviceLocation)
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    // Keep checking while the location page is mounted, even when its tab is
    // temporarily in the background, so a VPN/network change is picked up.
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: 'always',
  })
}
