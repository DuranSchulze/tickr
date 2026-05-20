import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CalendarScreen } from '#/components/time-tracker/calendar/CalendarScreen'
import { getCalendarEntriesFn } from '#/lib/server/tracker'

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/

type CalendarSearch = {
  month?: string
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function resolveMonth(search: CalendarSearch): string {
  return search.month && monthPattern.test(search.month)
    ? search.month
    : getCurrentMonth()
}

export const Route = createFileRoute('/app/calendar')({
  validateSearch: (search: Record<string, unknown>): CalendarSearch => ({
    month:
      typeof search.month === 'string' && monthPattern.test(search.month)
        ? search.month
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ month: resolveMonth(search) }),
  loader: ({ deps }) => getCalendarEntriesFn({ data: deps }),
  staleTime: 60_000,
  component: CalendarRoute,
})

function CalendarRoute() {
  const calendar = Route.useLoaderData()
  const navigate = useNavigate()

  function changeMonth(month: string): void {
    void navigate({
      to: '/app/calendar',
      search: { month },
    })
  }

  return <CalendarScreen calendar={calendar} onChangeMonth={changeMonth} />
}
