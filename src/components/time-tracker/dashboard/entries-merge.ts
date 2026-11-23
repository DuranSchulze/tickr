import type { TimeEntry } from '#/lib/time-tracker/types'

/**
 * Merge a freshly fetched first page into the rows the paginated "all entries"
 * list has already loaded.
 *
 * That list is owned by the dashboard, not by the route loader, so a refresh
 * (timer stop, mutation, cross-tab sync) must not rebuild it from page one —
 * doing so silently discarded every page the user had loaded with "Load more".
 * Overlaying page one by id updates rows that changed and adds rows created
 * since, while every deeper page keeps its place. Array order is irrelevant
 * because useEntriesFilterSort sorts the visible entries.
 *
 * Rows deleted elsewhere deeper than page one are not removed here; the list is
 * rebuilt (reset) on a date-range change, filter clear, or full reload.
 */
export function mergeEntriesPage(
  existing: TimeEntry[],
  page: TimeEntry[],
): TimeEntry[] {
  if (existing.length === 0) return page

  const byId = new Map(existing.map((entry) => [entry.id, entry]))
  for (const entry of page) byId.set(entry.id, entry)
  return Array.from(byId.values())
}
