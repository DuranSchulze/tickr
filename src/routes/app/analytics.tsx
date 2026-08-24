import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { AnalyticsScreen } from '#/components/time-tracker/analytics/AnalyticsScreen'
import type {
  AnalyticsQuery,
  AnalyticsScopeSearch,
} from '#/components/time-tracker/analytics/analytics.utils'
import {
  getDefaultAnalyticsRange,
  isAnalyticsScope,
  isDateKey,
  parseDateKey,
} from '#/components/time-tracker/analytics/analytics.utils'
import { getAnalyticsFn, getTrackerStateLiteFn } from '#/lib/server/tracker'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import { fetchFreshWorkspaceAuthorization } from '#/lib/time-tracker/workspace-authorization'

type AnalyticsSearch = {
  startDate?: string
  endDate?: string
  scope?: AnalyticsScopeSearch
  projectId?: string
  clientId?: string
  tagIds?: string
  memberIds?: string
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

function resolveQuery(search: AnalyticsSearch): AnalyticsSearch & {
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

export const Route = createFileRoute('/app/analytics')({
  validateSearch: (search: Record<string, unknown>): AnalyticsSearch => ({
    startDate: isDateKey(search.startDate) ? search.startDate : undefined,
    endDate: isDateKey(search.endDate) ? search.endDate : undefined,
    scope: isAnalyticsScope(search.scope) ? search.scope : undefined,
    projectId:
      typeof search.projectId === 'string' ? search.projectId : undefined,
    clientId: typeof search.clientId === 'string' ? search.clientId : undefined,
    tagIds: typeof search.tagIds === 'string' ? search.tagIds : undefined,
    memberIds:
      typeof search.memberIds === 'string' ? search.memberIds : undefined,
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
    const [analytics, state] = await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: trackerKeys.analytics(deps),
        queryFn: () => getAnalyticsFn({ data: deps }),
        staleTime: 60_000,
      }),
      context.queryClient.ensureQueryData({
        queryKey: trackerKeys.stateLite,
        queryFn: () => getTrackerStateLiteFn(),
        staleTime: 60_000,
      }),
    ])
    return { analytics, state }
  },
  staleTime: 60_000,
  component: AnalyticsRoute,
})

// oxlint-disable-next-line react/only-export-components
function AnalyticsRoute() {
  const { analytics, state } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()

  const changeQuery = useCallback(
    (updates: Partial<AnalyticsQuery & AnalyticsSearch>) => {
      void navigate({
        to: '/app/analytics',
        search: (prev) => ({ ...prev, ...updates }),
      })
    },
    [navigate],
  )

  const currentFilters = useMemo(
    () => ({
      projectId: search.projectId,
      clientId: search.clientId,
      tagIds: search.tagIds,
      memberIds: search.memberIds,
      billable: search.billable,
      page: search.page,
      pageSize: search.pageSize,
    }),
    [
      search.projectId,
      search.clientId,
      search.tagIds,
      search.memberIds,
      search.billable,
      search.page,
      search.pageSize,
    ],
  )

  return (
    <AnalyticsScreen
      analytics={analytics}
      state={state}
      currentFilters={currentFilters}
      onChangeQuery={changeQuery}
    />
  )
}
