import { createFileRoute, redirect } from '@tanstack/react-router'
import { SettingsScreen } from '#/components/time-tracker/WorkspaceScreens'
import { getTrackerStateLiteFn } from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'

export const Route = createFileRoute('/app/workspace/settings')({
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
  loader: () => getTrackerStateLiteFn(),
  staleTime: 30_000,
  component: SettingsRoute,
})

function SettingsRoute() {
  const state = Route.useLoaderData()
  return <SettingsScreen state={state} />
}
