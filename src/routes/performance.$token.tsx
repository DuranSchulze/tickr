import { createFileRoute, notFound } from '@tanstack/react-router'
import { PublicPerformancePage } from '#/components/time-tracker/performance/PublicPerformancePage'
import { getPublicPerformanceFn } from '#/lib/server/tracker'

export const Route = createFileRoute('/performance/$token')({
  loader: async ({ params }) => {
    const data = await getPublicPerformanceFn({ data: { token: params.token } })
    if (!data) throw notFound()
    return { data }
  },
  staleTime: 300_000,
  component: PublicPerformanceRoute,
})

function PublicPerformanceRoute() {
  const { data } = Route.useLoaderData()
  return <PublicPerformancePage data={data} />
}
