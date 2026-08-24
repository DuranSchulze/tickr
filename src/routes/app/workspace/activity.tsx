import { createFileRoute, redirect } from '@tanstack/react-router'
import { fetchFreshWorkspaceAuthorization } from '#/lib/time-tracker/workspace-authorization'
import {
  fetchWorkspaceActivity,
  getWorkspaceActivityQueryKey,
} from '#/lib/time-tracker/workspace-activity-query'
import { WorkspaceActivityScreen } from '#/components/time-tracker/screens/WorkspaceActivityScreen/WorkspaceActivityScreen'

type ActivitySearch = {
  departmentId?: string
  q?: string
}

export const Route = createFileRoute('/app/workspace/activity')({
  validateSearch: (search: Record<string, unknown>): ActivitySearch => ({
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
  loader: async ({ context, deps }) => {
    return context.queryClient.ensureQueryData({
      queryKey: getWorkspaceActivityQueryKey(deps),
      queryFn: () => fetchWorkspaceActivity(deps),
      staleTime: 30_000,
    })
  },
  component: WorkspaceActivityRoute,
})

// oxlint-disable-next-line react/only-export-components
function WorkspaceActivityRoute() {
  const initialActivity = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  function changeFilters(filters: ActivitySearch) {
    void navigate({
      search: (prev) => ({
        ...prev,
        departmentId: filters.departmentId,
        q: filters.q,
      }),
    })
  }

  return (
    <WorkspaceActivityScreen
      initialActivity={initialActivity}
      currentFilters={search}
      onChangeFilters={changeFilters}
    />
  )
}
