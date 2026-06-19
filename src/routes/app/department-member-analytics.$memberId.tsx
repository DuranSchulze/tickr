import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  getDefaultAnalyticsRange,
  isDateKey,
  parseDateKey,
} from '#/components/time-tracker/analytics/analytics.utils'
import { DepartmentMemberDetailScreen } from '#/components/time-tracker/analytics/department/DepartmentMemberDetailScreen'
import { getDepartmentMemberDetailFn } from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'
import { trackerKeys } from '#/lib/time-tracker/query-keys'

type MemberDetailSearch = {
  startDate?: string
  endDate?: string
  page?: number
}

function resolveQuery(search: MemberDetailSearch): {
  startDate: string
  endDate: string
  page?: number
} {
  if (isDateKey(search.startDate) && isDateKey(search.endDate)) {
    const start = parseDateKey(search.startDate)
    const end = parseDateKey(search.endDate)
    if (start && end && start <= end) {
      return {
        startDate: search.startDate,
        endDate: search.endDate,
        page: search.page,
      }
    }
  }

  return {
    ...getDefaultAnalyticsRange(),
    page: search.page,
  }
}

export const Route = createFileRoute(
  '/app/department-member-analytics/$memberId',
)({
  validateSearch: (search: Record<string, unknown>): MemberDetailSearch => ({
    startDate: isDateKey(search.startDate) ? search.startDate : undefined,
    endDate: isDateKey(search.endDate) ? search.endDate : undefined,
    page:
      typeof search.page === 'number' && search.page >= 1
        ? search.page
        : undefined,
  }),
  loaderDeps: ({ search }) => resolveQuery(search),
  beforeLoad: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ['workspace-access'],
      queryFn: () => getWorkspaceAccessFn(),
      staleTime: 5 * 60 * 1000,
    })
  },
  loader: ({ context, deps, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: trackerKeys.departmentMemberDetail({
        memberId: params.memberId,
        ...deps,
      }),
      queryFn: () =>
        getDepartmentMemberDetailFn({
          data: { memberId: params.memberId, ...deps },
        }),
      staleTime: 30_000,
    }),
  staleTime: 30_000,
  component: DepartmentMemberDetailRoute,
})

// oxlint-disable-next-line react/only-export-components
function DepartmentMemberDetailRoute() {
  const detail = Route.useLoaderData()
  const params = Route.useParams()
  const navigate = useNavigate()

  function changeRange(startDate: string, endDate: string) {
    void navigate({
      to: '/app/department-member-analytics/$memberId',
      params,
      search: (prev) => ({ ...prev, startDate, endDate, page: undefined }),
    })
  }

  function changePage(page: number) {
    void navigate({
      to: '/app/department-member-analytics/$memberId',
      params,
      search: (prev) => ({ ...prev, page }),
    })
  }

  function backToDepartment() {
    void navigate({
      to: '/app/department-analytics',
      search: {
        startDate: detail.startDate,
        endDate: detail.endDate,
      },
    })
  }

  return (
    <DepartmentMemberDetailScreen
      detail={detail}
      onBack={backToDepartment}
      onChangeRange={changeRange}
      onChangePage={changePage}
    />
  )
}
