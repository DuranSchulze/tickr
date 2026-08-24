import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'
import { AnalyticsOverviewScreen } from '#/components/time-tracker/analytics/AnalyticsOverviewScreen'
import {
  getAnalyticsOverviewFn,
  getTrackerStateLiteFn,
} from '#/lib/server/tracker'
import { fetchFreshWorkspaceAuthorization } from '#/lib/time-tracker/workspace-authorization'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import {
  isAnalyticsScope,
  isDateKey,
} from '#/components/time-tracker/analytics/analytics.utils'

type AnalyticsOverviewSearch = {
  scope?: 'personal' | 'organization' | 'department'
  asOfDate?: string
}

function resolveQuery(search: AnalyticsOverviewSearch) {
  return {
    scope: search.scope,
    asOfDate: search.asOfDate,
  }
}

export const Route = createFileRoute('/app/analytics_/overview')({
  validateSearch: (
    search: Record<string, unknown>,
  ): AnalyticsOverviewSearch => ({
    scope: isAnalyticsScope(search.scope) ? search.scope : undefined,
    asOfDate: isDateKey(search.asOfDate) ? search.asOfDate : undefined,
  }),
  loaderDeps: ({ search }) => resolveQuery(search),
  beforeLoad: async ({ context }) => {
    await fetchFreshWorkspaceAuthorization(context.queryClient)
  },
  loader: async ({ context, deps }) => {
    const [overview] = await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: trackerKeys.analyticsOverview(deps),
        queryFn: () => getAnalyticsOverviewFn({ data: deps }),
        staleTime: 5 * 60 * 1000,
      }),
      context.queryClient.ensureQueryData({
        queryKey: trackerKeys.stateLite,
        queryFn: () => getTrackerStateLiteFn(),
        staleTime: 60_000,
      }),
    ])
    return { overview }
  },
  staleTime: 5 * 60 * 1000,
  component: AnalyticsOverviewRoute,
})

function AnalyticsOverviewRoute() {
  const { overview } = Route.useLoaderData()
  const navigate = useNavigate()

  const changeScope = useCallback(
    (scope: AnalyticsOverviewSearch['scope']) => {
      void navigate({
        to: '/app/analytics/overview',
        search: (prev) => ({ ...prev, scope }),
      })
    },
    [navigate],
  )

  return (
    <AnalyticsOverviewScreen overview={overview} onChangeScope={changeScope} />
  )
}
