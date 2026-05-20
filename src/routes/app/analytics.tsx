import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
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
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'

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
    page:
      typeof search.page === 'number' && search.page >= 1
        ? search.page
        : undefined,
  }),
  loaderDeps: ({ search }) => resolveQuery(search),
  beforeLoad: async ({ context }) => {
    const access = await context.queryClient.ensureQueryData({
      queryKey: ['workspace-access'],
      queryFn: () => getWorkspaceAccessFn(),
      staleTime: 5 * 60 * 1000,
    })
    if (access.member.permissionLevel === 'EMPLOYEE') {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: async ({ deps }) => {
    const [analytics, state] = await Promise.all([
      getAnalyticsFn({ data: deps }),
      getTrackerStateLiteFn(),
    ])
    return { analytics, state }
  },
  staleTime: 30_000,
  component: AnalyticsRoute,
})

function AnalyticsRoute() {
  const { analytics, state } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()

  function changeQuery(updates: Partial<AnalyticsQuery & AnalyticsSearch>) {
    void navigate({
      to: '/app/analytics',
      search: (prev) => ({ ...prev, ...updates }),
    })
  }

  return (
    <AnalyticsScreen
      analytics={analytics}
      state={state}
      currentFilters={{
        projectId: search.projectId,
        clientId: search.clientId,
        tagIds: search.tagIds,
        memberIds: search.memberIds,
        billable: search.billable,
        page: search.page,
      }}
      onChangeQuery={changeQuery}
    />
  )
}
