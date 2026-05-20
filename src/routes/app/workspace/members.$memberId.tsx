import { createFileRoute } from '@tanstack/react-router'
import { MemberDetailScreen } from '#/components/time-tracker/MemberDetailScreen'
import { getMemberDetailFn } from '#/lib/server/tracker'

export const Route = createFileRoute('/app/workspace/members/$memberId')({
  loader: ({ params }) =>
    getMemberDetailFn({ data: { memberId: params.memberId } }),
  staleTime: 30_000,
  component: MemberDetailRoute,
})

function MemberDetailRoute() {
  const detail = Route.useLoaderData()
  return <MemberDetailScreen detail={detail} />
}
