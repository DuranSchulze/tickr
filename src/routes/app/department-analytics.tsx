import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import {
  getDefaultAnalyticsRange,
  isDateKey,
} from '#/components/time-tracker/analytics/analytics.utils'
import { getDepartmentDashboardFn } from '#/lib/server/tracker'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'
import { DepartmentDashboardScreen } from '#/components/time-tracker/analytics/department/DepartmentDashboardScreen'

type DeptSearch = {
  startDate?: string
  endDate?: string
  departmentId?: string
  q?: string
}

function resolveRange(search: DeptSearch): {
  startDate: string
  endDate: string
  departmentId?: string
  q?: string
} {
  const filters = {
    departmentId: search.departmentId,
    q: search.q?.trim() || undefined,
  }
  if (isDateKey(search.startDate) && isDateKey(search.endDate)) {
    return { startDate: search.startDate, endDate: search.endDate, ...filters }
  }
  return { ...getDefaultAnalyticsRange(), ...filters }
}

export const Route = createFileRoute('/app/department-analytics')({
  validateSearch: (search: Record<string, unknown>): DeptSearch => ({
    startDate: isDateKey(search.startDate) ? search.startDate : undefined,
    endDate: isDateKey(search.endDate) ? search.endDate : undefined,
    departmentId:
      typeof search.departmentId === 'string' && search.departmentId.trim()
        ? search.departmentId
        : undefined,
    q:
      typeof search.q === 'string' && search.q.trim()
        ? search.q.trim()
        : undefined,
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
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData({
      queryKey: trackerKeys.departmentDashboard(deps),
      queryFn: () => getDepartmentDashboardFn({ data: deps }),
      staleTime: 60_000,
    }),
  staleTime: 60_000,
  component: DepartmentAnalyticsRoute,
})

// oxlint-disable-next-line react/only-export-components
function DepartmentAnalyticsRoute() {
  const dashboard = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const resolved = resolveRange(search)

  function changeRange(startDate: string, endDate: string) {
    void navigate({
      to: '/app/department-analytics',
      search: (prev) => ({ ...prev, startDate, endDate }),
    })
  }

  function changeFilters(filters: { departmentId?: string; q?: string }) {
    void navigate({
      to: '/app/department-analytics',
      search: (prev) => ({
        ...prev,
        departmentId: filters.departmentId,
        q: filters.q,
      }),
    })
  }

  return (
    <DepartmentDashboardScreen
      dashboard={dashboard}
      startDate={resolved.startDate}
      endDate={resolved.endDate}
      onChangeRange={changeRange}
      onChangeFilters={changeFilters}
    />
  )
}
