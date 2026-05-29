import { createFileRoute, redirect } from '@tanstack/react-router'
import { MemberDetailScreen } from '#/components/time-tracker/MemberDetailScreen'
import { getMemberDetailFn } from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'

export const Route = createFileRoute('/app/workspace/members/$memberId')({
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
  loader: ({ params }) =>
    getMemberDetailFn({ data: { memberId: params.memberId } }),
  staleTime: 30_000,
  component: MemberDetailRoute,
})

function MemberDetailRoute() {
  const detail = Route.useLoaderData()
  return <MemberDetailScreen detail={detail} />
}
