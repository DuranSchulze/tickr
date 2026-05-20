import { createFileRoute } from '@tanstack/react-router'
import { PerformancePage } from '#/components/time-tracker/performance/PerformancePage'
import { getMyPerformanceFn } from '#/lib/server/tracker'
import { BRAND } from '#/lib/brand'

export const Route = createFileRoute('/app/my-performance')({
  loader: async () => {
    const performance = await getMyPerformanceFn()
    return { performance }
  },
  staleTime: 60_000,
  component: MyPerformanceRoute,
  head: () => ({
    meta: [{ title: `My Performance — ${BRAND.name}` }],
  }),
})

function MyPerformanceRoute() {
  const { performance } = Route.useLoaderData()
  return <PerformancePage data={performance} />
}
