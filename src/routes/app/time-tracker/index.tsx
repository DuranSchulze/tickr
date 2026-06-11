import { createFileRoute } from '@tanstack/react-router'
import { TimeTrackerDashboard } from '#/components/time-tracker/dashboard/TimeTrackerDashboard'
import { getTrackerStateFn } from '#/lib/server/tracker'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
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
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({
      queryKey: trackerKeys.state,
      queryFn: () => getTrackerStateFn(),
      staleTime: 60_000,
    }),
  staleTime: 60_000,
  component: TimeTrackerRoute,
  head: () => ({
    meta: [{ title: BRAND.name }],
  }),
})

function TimeTrackerRoute() {
  const state = Route.useLoaderData()
  // Default to the day view: it renders straight from the loader's payload.
  // The 'all' view ignores that payload and fires a second, paginated request
  // after mount — a slower first paint for no benefit as a landing view.
  const { view = 'day', date = getLocalDateKey() } = Route.useSearch()

  return <TimeTrackerDashboard state={state} view={view} date={date} />
}
