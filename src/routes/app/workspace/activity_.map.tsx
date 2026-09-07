import { createFileRoute, redirect } from '@tanstack/react-router'
import { WorkspaceActivityMapScreen } from '#/components/time-tracker/screens/WorkspaceActivityScreen/WorkspaceActivityMapScreen'
import { fetchFreshWorkspaceAuthorization } from '#/lib/time-tracker/workspace-authorization'
import {
  fetchWorkspaceActivity,
  getWorkspaceActivityQueryKey,
} from '#/lib/time-tracker/workspace-activity-query'
import type { WorkspaceActivityFilters } from '#/lib/time-tracker/workspace-activity-query'

export const Route = createFileRoute('/app/workspace/activity_/map')({
  validateSearch: (
    search: Record<string, unknown>,
  ): WorkspaceActivityFilters => ({
    departmentId:
      typeof search.departmentId === 'string' && search.departmentId.trim()
        ? search.departmentId
        : undefined,
    q:
      typeof search.q === 'string' && search.q.trim()
        ? search.q.trim()
        : undefined,
  }),
  loaderDeps: ({ search }) => ({
    departmentId: search.departmentId,
    q: search.q,
  }),
  beforeLoad: async ({ context }) => {
    const access = await fetchFreshWorkspaceAuthorization(context.queryClient)
    if (!access.member.permissions['activity.view']) {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData({
      queryKey: getWorkspaceActivityQueryKey(deps),
      queryFn: () => fetchWorkspaceActivity(deps),
      staleTime: 30_000,
    }),
  component: WorkspaceActivityMapRoute,
})

function WorkspaceActivityMapRoute() {
  return (
    <WorkspaceActivityMapScreen
      initialActivity={Route.useLoaderData()}
      currentFilters={Route.useSearch()}
    />
  )
}
