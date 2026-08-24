import { getLocationHistoryFn } from '#/lib/server/tracker'

export type LocationHistoryFilters = {
  memberId?: string
}

export function normalizeLocationHistoryFilters(
  filters: LocationHistoryFilters,
): LocationHistoryFilters {
  return { memberId: filters.memberId?.trim() || undefined }
}

export function getLocationHistoryQueryKey(filters: LocationHistoryFilters) {
  const normalized = normalizeLocationHistoryFilters(filters)
  return ['location-history', { memberId: normalized.memberId ?? '' }] as const
}

export function fetchLocationHistory(filters: LocationHistoryFilters) {
  const data = normalizeLocationHistoryFilters(filters)
  return data.memberId ? getLocationHistoryFn({ data }) : getLocationHistoryFn()
}
