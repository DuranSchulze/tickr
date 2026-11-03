import { fetchFreshWorkspaceAuthorization } from '#/lib/time-tracker/workspace-authorization'
import { workspaceDateKey } from '#/components/time-tracker/calendar/calendar.utils'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CalendarScreen } from '#/components/time-tracker/calendar/CalendarScreen'
import { getDepartmentMemberCalendarEntriesFn } from '#/lib/server/tracker'
import { trackerKeys } from '#/lib/time-tracker/query-keys'

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/

type CalendarSearch = {
  month?: string
  view?: 'month' | 'week'
  date?: string
}

export const Route = createFileRoute(
  '/app/department-member-calendar/$memberId',
)({
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
  loaderDeps: ({ search }) => ({ month: search.month }),
  loader: async ({ context, deps, params }) => {
    const access = await fetchFreshWorkspaceAuthorization(context.queryClient)
    const resolved = {
      memberId: params.memberId,
      month:
        deps.month ??
        workspaceDateKey(new Date(), access.workspace.timezone || 'UTC').slice(
          0,
          7,
        ),
    }
    return context.queryClient.ensureQueryData({
      queryKey: trackerKeys.departmentMemberCalendar(resolved),
      queryFn: () => getDepartmentMemberCalendarEntriesFn({ data: resolved }),
      staleTime: 60_000,
    })
  },
  staleTime: 60_000,
  component: DepartmentMemberCalendarRoute,
})

// oxlint-disable-next-line react/only-export-components
function DepartmentMemberCalendarRoute() {
  const calendar = Route.useLoaderData()
  const navigate = useNavigate()
  const params = Route.useParams()
  const search = Route.useSearch()
  const memberDescription = [
    calendar.member.email,
    calendar.member.departmentName,
  ]
    .filter(Boolean)
    .join(' - ')

  function changeCalendar(next: {
    month: string
    view?: 'month' | 'week'
    date?: string
  }): void {
    void navigate({
      to: '/app/department-member-calendar/$memberId',
      params,
      search: {
        month: next.month,
        view: next.view ?? search.view ?? 'month',
        date: next.date ?? search.date ?? calendar.todayDate,
      },
    })
  }

  return (
    <CalendarScreen
      calendar={calendar}
      view={search.view ?? 'month'}
      selectedDate={search.date ?? calendar.todayDate}
      eyebrow="Member calendar"
      description={`${calendar.member.name}${memberDescription ? ` - ${memberDescription}` : ''}`}
      onChangeCalendar={changeCalendar}
    />
  )
}
