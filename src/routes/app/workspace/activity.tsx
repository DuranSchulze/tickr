import { createFileRoute, redirect } from '@tanstack/react-router'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'
import { getWorkspaceActivityFn } from '#/lib/server/tracker'
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
    const access = await context.queryClient.ensureQueryData({
      queryKey: ['workspace-access'],
      queryFn: () => getWorkspaceAccessFn(),
      staleTime: 5 * 60 * 1000,
    })
    const level = access.member.permissionLevel
    if (level !== 'OWNER' && level !== 'ADMIN' && level !== 'MANAGER') {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: async ({ context, deps }) => {
    return context.queryClient.ensureQueryData({
      queryKey: ['workspace-activity', deps],
      queryFn: () => getWorkspaceActivityFn({ data: deps }),
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
