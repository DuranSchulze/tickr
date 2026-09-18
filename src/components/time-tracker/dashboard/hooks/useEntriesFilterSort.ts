import { useMemo, useState } from 'react'
import { getEntrySeconds } from '#/lib/time-tracker/store'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { useNowTick } from './useNowTick'

export type SortKey = 'newest' | 'oldest' | 'longest' | 'shortest'
export type BillableFilter = 'all' | 'yes' | 'no'

export function useEntriesFilterSort(entries: TimeEntry[]) {
  const [filterProject, setFilterProject] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterBillable, setFilterBillable] = useState<BillableFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('newest')

  // Only tick when the selected sort depends on live durations, and only
  // every 5s — the individual LiveDuration components handle sub-second
  // display updates already. This avoids re-sorting the entire list 60x/min.
  const isDurationSort = sortKey === 'longest' || sortKey === 'shortest'
  const tick = useNowTick(isDurationSort ? 5000 : null)
  const tickForSort = isDurationSort ? tick : 0

  const filteredEntries = useMemo(() => {
    let result = [...entries]

    if (filterProject)
      result = result.filter((e) => e.projectId === filterProject)
    if (filterTag) result = result.filter((e) => e.tagIds.includes(filterTag))
    if (filterBillable === 'yes') result = result.filter((e) => e.billable)
    if (filterBillable === 'no') result = result.filter((e) => !e.billable)

    if (sortKey === 'newest' || sortKey === 'oldest') {
      // Parse each timestamp once up front: doing it inside the comparator
      // allocated two `Date` objects per comparison (~2·n log n total).
      const withTime = result.map((entry) => ({
        entry,
        time: Date.parse(entry.startedAt),
      }))
      withTime.sort((a, b) =>
        sortKey === 'newest' ? b.time - a.time : a.time - b.time,
      )
      result = withTime.map((x) => x.entry)
    } else {
      result.sort((a, b) =>
        sortKey === 'longest'
          ? getEntrySeconds(b, tickForSort) - getEntrySeconds(a, tickForSort)
          : getEntrySeconds(a, tickForSort) - getEntrySeconds(b, tickForSort),
      )
    }

    return result
  }, [entries, filterProject, filterTag, filterBillable, sortKey, tickForSort])

  const activeFilterCount = [
    filterProject !== '',
    filterTag !== '',
    filterBillable !== 'all',
    sortKey !== 'newest',
  ].filter(Boolean).length

  function clearFilters() {
    setFilterProject('')
    setFilterTag('')
    setFilterBillable('all')
    setSortKey('newest')
  }

  return {
    filteredEntries,
    activeFilterCount,
    clearFilters,
    controls: {
      filterProject,
      setFilterProject,
      filterTag,
      setFilterTag,
      filterBillable,
      setFilterBillable,
      sortKey,
      setSortKey,
    },
  }
}
