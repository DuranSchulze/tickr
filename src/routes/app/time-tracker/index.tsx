import { createFileRoute } from '@tanstack/react-router'
import { TimeTrackerDashboard } from '#/components/time-tracker/dashboard/TimeTrackerDashboard'
import { getTrackerStateFn } from '#/lib/server/tracker'
import { getLocalDateKey } from '#/lib/time-tracker/store'
import type { ViewMode } from '#/lib/time-tracker/types'
import { BRAND } from '#/lib/brand'

type TimeTrackerSearch = {
  view?: ViewMode
  date?: string
}

const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function isViewMode(value: unknown): value is ViewMode {
  return (
    value === 'day' || value === 'week' || value === 'month' || value === 'all'
  )
}

export const Route = createFileRoute('/app/time-tracker/')({
  validateSearch: (search: Record<string, unknown>): TimeTrackerSearch => ({
    view: isViewMode(search.view) ? search.view : undefined,
    date:
      typeof search.date === 'string' && datePattern.test(search.date)
        ? search.date
        : undefined,
  }),
  loader: () => getTrackerStateFn(),
  staleTime: 30_000,
  component: TimeTrackerRoute,
  head: () => ({
    meta: [{ title: BRAND.name }],
  }),
})

function TimeTrackerRoute() {
  const state = Route.useLoaderData()
  const { view = 'day', date = getLocalDateKey() } = Route.useSearch()

  return <TimeTrackerDashboard state={state} view={view} date={date} />
}
