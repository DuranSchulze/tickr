import { createFileRoute, redirect } from '@tanstack/react-router'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'
import { getWorkspaceActivityFn } from '#/lib/server/tracker'
import { WorkspaceActivityScreen } from '#/components/time-tracker/screens/WorkspaceActivityScreen/WorkspaceActivityScreen'

export const Route = createFileRoute('/app/workspace/activity')({
  beforeLoad: async ({ context }) => {
    const access = await context.queryClient.ensureQueryData({
      queryKey: ['workspace-access'],
      queryFn: () => getWorkspaceAccessFn(),
      staleTime: 5 * 60 * 1000,
    })
    const level = access.member.permissionLevel
    if (level !== 'OWNER' && level !== 'ADMIN') {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ['workspace-activity'],
      queryFn: () => getWorkspaceActivityFn(),
      staleTime: 30_000,
    })
  },
  component: WorkspaceActivityRoute,
})

function WorkspaceActivityRoute() {
  return <WorkspaceActivityScreen />
}
