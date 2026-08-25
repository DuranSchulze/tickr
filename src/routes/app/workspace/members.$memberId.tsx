import { createFileRoute, redirect } from '@tanstack/react-router'
import { MemberDetailScreen } from '#/components/time-tracker/MemberDetailScreen'
import { getMemberDetailFn } from '#/lib/server/tracker'
import { fetchFreshWorkspaceAuthorization } from '#/lib/time-tracker/workspace-authorization'

export const Route = createFileRoute('/app/workspace/members/$memberId')({
  beforeLoad: async ({ context }) => {
    const access = await fetchFreshWorkspaceAuthorization(context.queryClient)
    if (!access.member.permissions['members.view']) {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: ({ params }) =>
    getMemberDetailFn({ data: { memberId: params.memberId } }),
  staleTime: 30_000,
  component: MemberDetailRoute,
})

// oxlint-disable-next-line react/only-export-components
function MemberDetailRoute() {
  const detail = Route.useLoaderData()
  return <MemberDetailScreen detail={detail} />
}
