import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import {
  isDateKey,
  toDateKey,
} from '#/components/time-tracker/analytics/analytics.utils'
import { getDepartmentDashboardFn } from '#/lib/server/tracker'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import { fetchFreshWorkspaceAuthorization } from '#/lib/time-tracker/workspace-authorization'
import { DepartmentDashboardScreen } from '#/components/time-tracker/analytics/department/DepartmentDashboardScreen'

type DeptSearch = {
  startDate?: string
  endDate?: string
  departmentId?: string
  memberId?: string
  q?: string
  projectPage?: number
}

function getDefaultDepartmentRange() {
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - 6)
  return {
    startDate: toDateKey(start),
    endDate: toDateKey(end),
  }
}

function resolveRange(search: DeptSearch): {
  startDate: string
  endDate: string
  departmentId?: string
  memberId?: string
  q?: string
  projectPage?: number
} {
  const filters = {
    departmentId: search.departmentId,
    memberId: search.memberId,
    q: search.q?.trim() || undefined,
    projectPage: search.projectPage,
  }
  if (isDateKey(search.startDate) && isDateKey(search.endDate)) {
    return { startDate: search.startDate, endDate: search.endDate, ...filters }
  }
  return { ...getDefaultDepartmentRange(), ...filters }
}

function parsePositiveNumber(value: unknown): number | undefined {
  const numberValue =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN
  return Number.isInteger(numberValue) && numberValue >= 1
    ? numberValue
    : undefined
}

export const Route = createFileRoute('/app/department-analytics')({
  validateSearch: (search: Record<string, unknown>): DeptSearch => ({
    startDate: isDateKey(search.startDate) ? search.startDate : undefined,
    endDate: isDateKey(search.endDate) ? search.endDate : undefined,
    departmentId:
      typeof search.departmentId === 'string' && search.departmentId.trim()
        ? search.departmentId
        : undefined,
    memberId:
      typeof search.memberId === 'string' && search.memberId.trim()
        ? search.memberId
        : undefined,
    q:
      typeof search.q === 'string' && search.q.trim()
        ? search.q.trim()
        : undefined,
    projectPage: parsePositiveNumber(search.projectPage),
  }),
  loaderDeps: ({ search }) => resolveRange(search),
  beforeLoad: async ({ context }) => {
    await fetchFreshWorkspaceAuthorization(context.queryClient)
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

  const changeRange = useCallback(
    (startDate: string, endDate: string) => {
      void navigate({
        to: '/app/department-analytics',
        search: (prev) => ({
          ...prev,
          startDate,
          endDate,
          projectPage: undefined,
        }),
      })
    },
    [navigate],
  )

  const changeFilters = useCallback(
    (filters: { departmentId?: string; memberId?: string; q?: string }) => {
      void navigate({
        to: '/app/department-analytics',
        search: (prev) => ({
          ...prev,
          departmentId: filters.departmentId,
          memberId: filters.memberId,
          q: filters.q,
          projectPage: undefined,
        }),
      })
    },
    [navigate],
  )

  const viewMember = useCallback(
    (memberId: string) => {
      void navigate({
        to: '/app/department-member-analytics/$memberId',
        params: { memberId },
        search: {
          startDate: resolved.startDate,
          endDate: resolved.endDate,
        },
      })
    },
    [navigate, resolved.endDate, resolved.startDate],
  )

  const changeProjectPage = useCallback(
    (projectPage: number) => {
      void navigate({
        to: '/app/department-analytics',
        search: (prev) => ({
          ...prev,
          projectPage,
        }),
      })
    },
    [navigate],
  )

  return (
    <DepartmentDashboardScreen
      dashboard={dashboard}
      startDate={resolved.startDate}
      endDate={resolved.endDate}
      onChangeRange={changeRange}
      onChangeFilters={changeFilters}
      onViewMember={viewMember}
      onProjectPageChange={changeProjectPage}
    />
  )
}
