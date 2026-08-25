import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import { MembersScreen } from '#/components/time-tracker/WorkspaceScreens'
import {
  getMemberAnalyticsFn,
  getPaginatedMembersFn,
  getMemberDirectoryStateFn,
} from '#/lib/server/tracker'
import {
  ensureWorkspaceAuthorization,
  fetchFreshWorkspaceAuthorization,
} from '#/lib/time-tracker/workspace-authorization'
import type { MemberStat } from '#/lib/server/tracker.server'

const PAGE_SIZE = 10

type MembersSearch = {
  page?: number
  search?: string
  role?: string
  dept?: string
  cohort?: string
  status?: string
}

export const Route = createFileRoute('/app/workspace/members')({
  validateSearch: (search: Record<string, unknown>): MembersSearch => ({
    page: typeof search.page === 'number' ? search.page : undefined,
    search: typeof search.search === 'string' ? search.search : undefined,
    role: typeof search.role === 'string' ? search.role : undefined,
    dept: typeof search.dept === 'string' ? search.dept : undefined,
    cohort: typeof search.cohort === 'string' ? search.cohort : undefined,
    status: typeof search.status === 'string' ? search.status : undefined,
  }),
  loaderDeps: ({ search }) => ({
    page: search.page ?? 0,
    search: search.search ?? '',
    roleId: search.role ?? '',
    departmentId: search.dept ?? '',
    cohortId: search.cohort ?? '',
    status: search.status ?? '',
  }),
  beforeLoad: async ({ context }) => {
    const access = await fetchFreshWorkspaceAuthorization(context.queryClient)
    if (!access.member.permissions['members.view']) {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: async ({ context, deps }) => {
    const [state, memberStats, paginatedMembers, access] = await Promise.all([
      getMemberDirectoryStateFn(),
      getMemberAnalyticsFn().catch((): MemberStat[] => []),
      getPaginatedMembersFn({
        data: {
          page: deps.page,
          pageSize: PAGE_SIZE,
          search: deps.search || undefined,
          roleId: deps.roleId || undefined,
          departmentId: deps.departmentId || undefined,
          cohortId: deps.cohortId || undefined,
          status: deps.status || undefined,
        },
      }),
      ensureWorkspaceAuthorization(context.queryClient),
    ])
    return {
      state,
      memberStats,
      paginatedMembers,
      pageSize: PAGE_SIZE,
      canManage: access.member.permissions['members.manage'],
    }
  },
  staleTime: 30_000,
  component: MembersRoute,
})

// oxlint-disable-next-line react/only-export-components
function MembersRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { state, memberStats, paginatedMembers, pageSize, canManage } =
    Route.useLoaderData()
  const navigate = Route.useNavigate()
  const search = Route.useSearch()

  const isDetailRoute =
    pathname !== '/app/workspace/members' &&
    pathname !== '/app/workspace/members/'

  if (isDetailRoute) {
    return <Outlet />
  }

  return (
    <MembersScreen
      state={state}
      memberStats={memberStats}
      members={paginatedMembers.members}
      totalCount={paginatedMembers.totalCount}
      totalPages={paginatedMembers.totalPages}
      page={search.page ?? 0}
      pageSize={pageSize}
      search={search.search ?? ''}
      roleFilter={search.role ?? ''}
      deptFilter={search.dept ?? ''}
      cohortFilter={search.cohort ?? ''}
      statusFilter={search.status ?? ''}
      canManage={canManage}
      onFilterChange={(updates) => {
        void navigate({
          search: (prev) => ({ ...prev, ...updates, page: 0 }),
        })
      }}
      onPageChange={(page) => {
        void navigate({
          search: (prev) => ({ ...prev, page }),
        })
      }}
    />
  )
}
