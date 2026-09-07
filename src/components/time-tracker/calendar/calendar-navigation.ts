export type CalendarSearchState = {
  month?: string
  view?: 'month' | 'week'
  date?: string
  memberId?: string
}

type CalendarNavigate = (options: {
  to: '/app/calendar'
  search: CalendarSearchState
}) => unknown

export function navigateToCalendar(
  navigate: CalendarNavigate,
  search: CalendarSearchState,
): void {
  void navigate({ to: '/app/calendar', search })
}
