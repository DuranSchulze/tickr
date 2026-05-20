import { useMemo, useState } from 'react'
import { getEntrySeconds } from '#/lib/time-tracker/store'
import type { TimeEntry } from '#/lib/time-tracker/types'

export type SortKey = 'newest' | 'oldest' | 'longest' | 'shortest'
export type BillableFilter = 'all' | 'yes' | 'no'

export function useEntriesFilterSort(entries: TimeEntry[], tick: number) {
  const [filterProject, setFilterProject] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterBillable, setFilterBillable] = useState<BillableFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('newest')

  // Only re-sort on every tick when the selected sort actually depends on live
  // durations. For time-based sorts (newest/oldest) tick has no effect.
  const tickForSort = sortKey === 'longest' || sortKey === 'shortest' ? tick : 0

  const filteredEntries = useMemo(() => {
    let result = [...entries]

    if (filterProject)
      result = result.filter((e) => e.projectId === filterProject)
    if (filterTag) result = result.filter((e) => e.tagIds.includes(filterTag))
    if (filterBillable === 'yes') result = result.filter((e) => e.billable)
    if (filterBillable === 'no') result = result.filter((e) => !e.billable)

    result.sort((a, b) => {
      if (sortKey === 'newest')
        return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
      if (sortKey === 'oldest')
        return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
      if (sortKey === 'longest')
        return getEntrySeconds(b, tickForSort) - getEntrySeconds(a, tickForSort)
      return getEntrySeconds(a, tickForSort) - getEntrySeconds(b, tickForSort)
    })

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
