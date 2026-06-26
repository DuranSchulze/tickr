import type { QueryClient } from '@tanstack/react-query'
import type { TimeEntry, TrackerState } from './types'

// Centralized React Query keys for time-tracker route loaders. Keeping them in
// one place lets route loaders cache via queryClient.ensureQueryData and lets
// mutations invalidate the same keys without the strings drifting apart.
export const trackerKeys = {
  /** Full tracker state for the dashboard (getTrackerStateFn). */
  state: ['tracker-state'] as const,
  /** Lite tracker state used by the analytics screen (getTrackerStateLiteFn). */
  stateLite: ['tracker-state-lite'] as const,
  /** Analytics dashboard, keyed by the resolved query (date range + filters). */
  analytics: (deps: unknown) => ['analytics', deps] as const,
  /** Simplified analytics overview, keyed by scope/date. */
  analyticsOverview: (deps: unknown) => ['analytics-overview', deps] as const,
  /** Department dashboard, keyed by the resolved date range. */
  departmentDashboard: (deps: unknown) =>
    ['department-dashboard', deps] as const,
  /** All department member detail queries, across members/ranges/pages. */
  departmentMemberDetails: ['department-member-detail'] as const,
  /** Department member detail page, keyed by member + date range + page. */
  departmentMemberDetail: (deps: unknown) =>
    [...trackerKeys.departmentMemberDetails, deps] as const,
  /** Current member's performance page (getMyPerformanceFn). */
  myPerformance: ['my-performance'] as const,
  /** Current member's saved timer presets in a workspace. */
  timerPresets: (workspaceId: string) =>
    ['timer-presets', workspaceId] as const,
}

// Marks the dashboard's tracker state stale so the next loader run refetches.
// Call alongside router.invalidate() after a mutation: invalidate marks the
// cached entry stale, router.invalidate() re-runs the loader which then refetches
// instead of returning the cached (still-within-staleTime) value.
export function invalidateTrackerState(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: trackerKeys.state })
}

// Patch a single entry straight into the cached tracker state instead of
// refetching the whole dashboard. A timer start/stop already returns the
// authoritative row, so we splice it in and let the loader serve the (now
// fresh) cache — avoiding a full getTrackerState round trip whose cost grows
// with every entry in the 62-day window.
export function upsertTrackerStateEntry(
  queryClient: QueryClient,
  entry: TimeEntry,
) {
  queryClient.setQueryData<TrackerState>(trackerKeys.state, (prev) => {
    if (!prev) return prev
    const exists = prev.entries.some((e) => e.id === entry.id)
    return {
      ...prev,
      entries: exists
        ? prev.entries.map((e) => (e.id === entry.id ? entry : e))
        : [...prev.entries, entry],
    }
  })
}

// Drop an entry from the cached tracker state (e.g. a discarded timer) without
// a refetch.
export function removeTrackerStateEntry(queryClient: QueryClient, id: string) {
  queryClient.setQueryData<TrackerState>(trackerKeys.state, (prev) =>
    prev ? { ...prev, entries: prev.entries.filter((e) => e.id !== id) } : prev,
  )
}
