import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { ReportsScreen } from '#/components/time-tracker/reports/ReportsScreen'
import type { ReportsQuery } from '#/components/time-tracker/reports/ReportsScreen'
import {
  getDefaultAnalyticsRange,
  isDateKey,
  parseDateKey,
} from '#/components/time-tracker/analytics/analytics.utils'
import {
  getDepartmentMemberDetailFn,
  getReportsFn,
  getTrackerStateLiteFn,
} from '#/lib/server/tracker'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import {
  ensureWorkspaceAuthorization,
  fetchFreshWorkspaceAuthorization,
} from '#/lib/time-tracker/workspace-authorization'

type ReportsSearch = {
  startDate?: string
  endDate?: string
  departmentId?: string
  clientId?: string
  projectId?: string
  taskId?: string
  tagIds?: string
  memberIds?: string
  status?: 'all' | 'completed' | 'running'
  description?: string
  billable?: 'true' | 'false'
  page?: number
  pageSize?: number
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

function resolveQuery(search: ReportsSearch): ReportsSearch & {
  startDate: string
  endDate: string
} {
  if (isDateKey(search.startDate) && isDateKey(search.endDate)) {
    const start = parseDateKey(search.startDate)
    const end = parseDateKey(search.endDate)
    if (start && end && start <= end) {
      return {
        ...search,
        startDate: search.startDate,
        endDate: search.endDate,
      }
    }
  }

  return {
    ...search,
    ...getDefaultAnalyticsRange(),
  }
}

export const Route = createFileRoute('/app/reports')({
  validateSearch: (search: Record<string, unknown>): ReportsSearch => ({
    startDate: isDateKey(search.startDate) ? search.startDate : undefined,
    endDate: isDateKey(search.endDate) ? search.endDate : undefined,
    departmentId:
      typeof search.departmentId === 'string' ? search.departmentId : undefined,
    clientId: typeof search.clientId === 'string' ? search.clientId : undefined,
    projectId:
      typeof search.projectId === 'string' ? search.projectId : undefined,
    taskId: typeof search.taskId === 'string' ? search.taskId : undefined,
    tagIds: typeof search.tagIds === 'string' ? search.tagIds : undefined,
    memberIds:
      typeof search.memberIds === 'string' ? search.memberIds : undefined,
    status:
      search.status === 'all' ||
      search.status === 'completed' ||
      search.status === 'running'
        ? search.status
        : undefined,
    description:
      typeof search.description === 'string' ? search.description : undefined,
    billable:
      search.billable === 'true' || search.billable === 'false'
        ? search.billable
        : undefined,
    page: parsePositiveNumber(search.page),
    pageSize: parsePositiveNumber(search.pageSize),
  }),
  loaderDeps: ({ search }) => resolveQuery(search),
  beforeLoad: async ({ context }) => {
    await fetchFreshWorkspaceAuthorization(context.queryClient)
  },
  loader: async ({ context, deps }) => {
    const singleMemberId =
      deps.memberIds && !deps.memberIds.includes(',') ? deps.memberIds : null

    const [reports, state, detail, access] = await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: trackerKeys.reports(deps),
        queryFn: () => getReportsFn({ data: deps }),
        staleTime: 60_000,
      }),
      context.queryClient.ensureQueryData({
        queryKey: trackerKeys.stateLite,
        queryFn: () => getTrackerStateLiteFn(),
        staleTime: 60_000,
      }),
      singleMemberId
        ? context.queryClient.ensureQueryData({
            queryKey: trackerKeys.departmentMemberDetail({
              memberId: singleMemberId,
              ...deps,
            }),
            queryFn: () =>
              getDepartmentMemberDetailFn({
                data: { memberId: singleMemberId, ...deps },
              }),
            staleTime: 30_000,
          })
        : Promise.resolve(undefined),
      ensureWorkspaceAuthorization(context.queryClient),
    ])
    return { reports, state, detail, singleMemberId, access }
  },
  staleTime: 60_000,
  component: ReportsRoute,
})

function ReportsRoute() {
  const { reports, state, detail, singleMemberId, access } =
    Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()

  const canEditEntries = access.member.permissions['time_entries.manage_all']

  const changeQuery = useCallback(
    (updates: Partial<ReportsQuery & ReportsSearch>) => {
      void navigate({
        to: '/app/reports',
        search: (prev) => ({ ...prev, ...updates }) as ReportsSearch,
      })
    },
    [navigate],
  )

  const currentFilters = useMemo(
    () => ({
      departmentId: search.departmentId,
      clientId: search.clientId,
      projectId: search.projectId,
      taskId: search.taskId,
      tagIds: search.tagIds,
      memberIds: search.memberIds,
      status: search.status,
      description: search.description,
      billable: search.billable,
      page: search.page,
      pageSize: search.pageSize,
    }),
    [
      search.departmentId,
      search.clientId,
      search.projectId,
      search.taskId,
      search.tagIds,
      search.memberIds,
      search.status,
      search.description,
      search.billable,
      search.page,
      search.pageSize,
    ],
  )

  return (
    <ReportsScreen
      reports={reports}
      state={state}
      detail={detail}
      singleMemberId={singleMemberId}
      canEditEntries={canEditEntries}
      currentFilters={currentFilters}
      onChangeQuery={changeQuery}
    />
  )
}
