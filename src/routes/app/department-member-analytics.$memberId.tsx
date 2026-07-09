import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { isDateKey } from '#/components/time-tracker/analytics/analytics.utils'
import { DepartmentMemberDetailScreen } from '#/components/time-tracker/analytics/department/DepartmentMemberDetailScreen'
import {
  getDepartmentMemberDetailFn,
  getTrackerStateLiteFn,
} from '#/lib/server/tracker'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'
import { trackerKeys } from '#/lib/time-tracker/query-keys'

type MemberDetailSearch = {
  startDate?: string
  endDate?: string
  page?: number
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10)
}

function getRangeDayCount(startDate?: string | null, endDate?: string | null) {
  if (!startDate || !endDate) return null
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime()
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return Math.floor((end - start) / 86_400_000) + 1
}

function resolveQuery(search: MemberDetailSearch): {
  startDate?: string
  endDate?: string
  page?: number
} {
  const hasDates = isDateKey(search.startDate) && isDateKey(search.endDate)

  return {
    startDate: hasDates ? search.startDate : undefined,
    endDate: hasDates ? search.endDate : undefined,
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
  loader: async ({ context, deps, params }) => {
    const [detail, state, access] = await Promise.all([
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
      context.queryClient.ensureQueryData({
        queryKey: trackerKeys.stateLite,
        queryFn: () => getTrackerStateLiteFn(),
        staleTime: 60_000,
      }),
      context.queryClient.ensureQueryData({
        queryKey: ['workspace-access'],
        queryFn: () => getWorkspaceAccessFn(),
        staleTime: 5 * 60 * 1000,
      }),
    ])
    return { detail, state, access }
  },
  staleTime: 30_000,
  component: DepartmentMemberDetailRoute,
})

// oxlint-disable-next-line react/only-export-components
function DepartmentMemberDetailRoute() {
  const { detail, state, access } = Route.useLoaderData()
  const params = Route.useParams()
  const navigate = useNavigate()

  function changeRange(
    startDate: string | undefined,
    endDate: string | undefined,
  ) {
    void navigate({
      to: '/app/department-member-analytics/$memberId',
      params,
      search: (prev) => ({
        ...prev,
        startDate,
        endDate,
        page: undefined,
      }),
    })
  }

  function clearRange() {
    void navigate({
      to: '/app/department-member-analytics/$memberId',
      params,
      search: (prev) => {
        const { startDate, endDate, ...rest } = prev as Record<string, unknown>
        return { ...rest, page: undefined }
      },
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
      search:
        detail.startDate && detail.endDate
          ? {
              startDate: detail.startDate,
              endDate: detail.endDate,
            }
          : undefined,
    })
  }

  function viewCalendar() {
    const selectedDate = detail.startDate ?? getTodayKey()
    const dayCount = getRangeDayCount(detail.startDate, detail.endDate)
    void navigate({
      to: '/app/department-member-calendar/$memberId',
      params,
      search: {
        month: selectedDate.slice(0, 7),
        date: selectedDate,
        view: dayCount !== null && dayCount <= 7 ? 'week' : 'month',
      },
    })
  }

  return (
    <DepartmentMemberDetailScreen
      detail={detail}
      state={state}
      canEditEntries={
        access.member.permissionLevel === 'OWNER' ||
        access.member.permissionLevel === 'ADMIN'
      }
      onBack={backToDepartment}
      onViewCalendar={viewCalendar}
      onChangeRange={changeRange}
      onClearRange={clearRange}
      onChangePage={changePage}
    />
  )
}
