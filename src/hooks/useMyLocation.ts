import { useQuery } from '@tanstack/react-query'
import {
  fetchMyLocation,
  getMyLocationQueryKey,
} from '#/lib/time-tracker/my-location-query'

/**
 * The current user's approximate location, resolved from their request IP.
 * Best-effort and refreshed while this page is open. The server resolves proxy
 * IPs in production and falls back to the current network in local/direct
 * environments. Use the returned `refetch` to force an immediate refresh.
 */
export function useMyLocation() {
  return useQuery({
    queryKey: getMyLocationQueryKey(),
    queryFn: fetchMyLocation,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    // Keep checking while the location page is mounted, even when its tab is
    // temporarily in the background, so a VPN/network change is picked up.
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: 'always',
  })
}
