import { fetchFreshWorkspaceAuthorization } from '#/lib/time-tracker/workspace-authorization'
import { workspaceDateKey } from '#/components/time-tracker/calendar/calendar.utils'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CalendarScreen } from '#/components/time-tracker/calendar/CalendarScreen'
import { getCalendarPageFn } from '#/lib/server/tracker'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import { navigateToCalendar } from '#/components/time-tracker/calendar/calendar-navigation'
import type { CalendarSearchState } from '#/components/time-tracker/calendar/calendar-navigation'

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/
const datePattern = /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/

export const Route = createFileRoute('/app/calendar')({
  validateSearch: (search: Record<string, unknown>): CalendarSearchState => ({
    month:
      typeof search.month === 'string' && monthPattern.test(search.month)
        ? search.month
        : undefined,
    view: search.view === 'week' ? 'week' : 'month',
    date:
      typeof search.date === 'string' && datePattern.test(search.date)
        ? search.date
        : undefined,
    memberId:
      typeof search.memberId === 'string' && search.memberId.trim()
        ? search.memberId.trim()
        : undefined,
  }),
  loaderDeps: ({ search }) => ({
    month: search.month,
    memberId: search.memberId,
  }),
  loader: async ({ context, deps }) => {
    const access = await fetchFreshWorkspaceAuthorization(context.queryClient)
    const resolved = {
      ...deps,
      month:
        deps.month ??
        workspaceDateKey(new Date(), access.workspace.timezone || 'UTC').slice(
          0,
          7,
        ),
    }
    return context.queryClient.ensureQueryData({
      queryKey: trackerKeys.calendar(resolved),
      queryFn: () => getCalendarPageFn({ data: resolved }),
      staleTime: 60_000,
    })
  },
  staleTime: 60_000,
  component: CalendarRoute,
})

// oxlint-disable-next-line react/only-export-components
function CalendarRoute() {
  const page = Route.useLoaderData()
  const calendar = page.calendar
  const navigate = useNavigate()
  const search = Route.useSearch()

  function changeCalendar(next: {
    month: string
    view?: 'month' | 'week'
    date?: string
  }): void {
    navigateToCalendar(navigate, {
      month: next.month,
      view: next.view ?? search.view ?? 'month',
      date: next.date ?? search.date ?? calendar.todayDate,
      memberId: search.memberId,
    })
  }

  function changeMember(memberId: string): void {
    navigateToCalendar(navigate, {
      month: search.month,
      view: search.view,
      date: search.date,
      memberId: memberId === page.currentMemberId ? undefined : memberId,
    })
  }

  const viewingAnotherMember = calendar.member.id !== page.currentMemberId

  return (
    <CalendarScreen
      calendar={calendar}
      view={search.view ?? 'month'}
      selectedDate={search.date ?? calendar.todayDate}
      eyebrow={viewingAnotherMember ? 'Team calendar' : undefined}
      description={
        viewingAnotherMember
          ? `Viewing ${calendar.member.name}'s tracked activity in the workspace timezone.`
          : undefined
      }
      memberOptions={page.memberOptions}
      currentMemberId={page.currentMemberId}
      onChangeMember={page.canViewTeamCalendars ? changeMember : undefined}
      onChangeCalendar={changeCalendar}
    />
  )
}
