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
  getTrackerStateLiteFn,
} from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'
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
    const access = await context.queryClient.ensureQueryData({
      queryKey: ['workspace-access'],
      queryFn: () => getWorkspaceAccessFn(),
      staleTime: 5 * 60 * 1000,
    })
    if (access.member.permissionLevel === 'EMPLOYEE') {
      throw redirect({ to: '/app/time-tracker' })
    }
  },
  loader: async ({ deps }) => {
    const [state, memberStats, paginatedMembers] = await Promise.all([
      getTrackerStateLiteFn(),
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
    ])
    return { state, memberStats, paginatedMembers, pageSize: PAGE_SIZE }
  },
  staleTime: 30_000,
  component: MembersRoute,
})

function MembersRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const { state, memberStats, paginatedMembers, pageSize } =
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
