import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CalendarScreen } from '#/components/time-tracker/calendar/CalendarScreen'
import { getCalendarEntriesFn } from '#/lib/server/tracker'

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/

type CalendarSearch = {
  month?: string
  view?: 'month' | 'week'
  date?: string
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function getCurrentDate(): string {
  return new Date().toISOString().slice(0, 10)
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
    view: search.view === 'week' ? 'week' : 'month',
    date:
      typeof search.date === 'string' && datePattern.test(search.date)
        ? search.date
        : undefined,
  }),
  loaderDeps: ({ search }) => ({ month: resolveMonth(search) }),
  loader: ({ deps }) => getCalendarEntriesFn({ data: deps }),
  staleTime: 60_000,
  component: CalendarRoute,
})

// oxlint-disable-next-line react/only-export-components
function CalendarRoute() {
  const calendar = Route.useLoaderData()
  const navigate = useNavigate()
  const search = Route.useSearch()

  function changeCalendar(next: {
    month: string
    view?: 'month' | 'week'
    date?: string
  }): void {
    void navigate({
      to: '/app/calendar',
      search: {
        month: next.month,
        view: next.view ?? search.view ?? 'month',
        date: next.date ?? search.date ?? getCurrentDate(),
      },
    })
  }

  return (
    <CalendarScreen
      calendar={calendar}
      view={search.view ?? 'month'}
      selectedDate={search.date ?? getCurrentDate()}
      onChangeCalendar={changeCalendar}
    />
  )
}
