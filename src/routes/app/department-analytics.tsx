import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import {
  getDefaultAnalyticsRange,
  isDateKey,
} from '#/components/time-tracker/analytics/analytics.utils'
import { getDepartmentDashboardFn } from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'
import { DepartmentDashboardScreen } from '#/components/time-tracker/analytics/department/DepartmentDashboardScreen'

type DeptSearch = {
  startDate?: string
  endDate?: string
}

function resolveRange(search: DeptSearch): {
  startDate: string
  endDate: string
} {
  if (isDateKey(search.startDate) && isDateKey(search.endDate)) {
    return { startDate: search.startDate, endDate: search.endDate }
  }
  return getDefaultAnalyticsRange()
}

export const Route = createFileRoute('/app/department-analytics')({
  validateSearch: (search: Record<string, unknown>): DeptSearch => ({
    startDate: isDateKey(search.startDate) ? search.startDate : undefined,
    endDate: isDateKey(search.endDate) ? search.endDate : undefined,
  }),
  loaderDeps: ({ search }) => resolveRange(search),
  beforeLoad: async ({ context }) => {
    const access = await context.queryClient.ensureQueryData({
      queryKey: ['workspace-access'],
      queryFn: () => getWorkspaceAccessFn(),
      staleTime: 5 * 60 * 1000,
    })
    const level = access.member.permissionLevel
    if (level === 'EMPLOYEE') {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: async ({ deps }) => getDepartmentDashboardFn({ data: deps }),
  staleTime: 30_000,
  component: DepartmentAnalyticsRoute,
})

function DepartmentAnalyticsRoute() {
  const dashboard = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const resolved = resolveRange(search)

  function changeRange(startDate: string, endDate: string) {
    void navigate({
      to: '/app/department-analytics',
      search: { startDate, endDate },
    })
  }

  return (
    <DepartmentDashboardScreen
      dashboard={dashboard}
      startDate={resolved.startDate}
      endDate={resolved.endDate}
      onChangeRange={changeRange}
    />
  )
}
