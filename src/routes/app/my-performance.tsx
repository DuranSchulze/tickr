import { createFileRoute } from '@tanstack/react-router'
import { PerformancePage } from '#/components/time-tracker/performance/PerformancePage'
import { getMyPerformanceFn } from '#/lib/server/tracker'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import { BRAND } from '#/lib/brand'

export const Route = createFileRoute('/app/my-performance')({
  loader: async ({ context }) => {
    const performance = await context.queryClient.ensureQueryData({
      queryKey: trackerKeys.myPerformance,
      queryFn: () => getMyPerformanceFn(),
      staleTime: 60_000,
    })
    return { performance }
  },
  staleTime: 60_000,
  component: MyPerformanceRoute,
  head: () => ({
    meta: [{ title: `My Performance — ${BRAND.name}` }],
  }),
})

// oxlint-disable-next-line react/only-export-components
function MyPerformanceRoute() {
  const { performance } = Route.useLoaderData()
  return <PerformancePage data={performance} />
}
