import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'
import { TimesheetScreen } from '#/components/time-tracker/timesheet/TimesheetScreen'
import { Button } from '#/components/ui/button'
import { getTimesheetFn } from '#/lib/server/tracker'
import { fetchFreshWorkspaceAuthorization } from '#/lib/time-tracker/workspace-authorization'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import { isValidDateKey } from '#/lib/time-tracker/timesheet'

export type TimesheetSearch = {
  weekStart?: string
  memberId?: string
  departmentId?: string
  q?: string
  page?: number
  pageSize?: number
}

function parsePositiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined
}

export const Route = createFileRoute('/app/timesheet')({
  validateSearch: (search: Record<string, unknown>): TimesheetSearch => ({
    weekStart: isValidDateKey(search.weekStart) ? search.weekStart : undefined,
    memberId: typeof search.memberId === 'string' ? search.memberId : undefined,
    departmentId:
      typeof search.departmentId === 'string' ? search.departmentId : undefined,
    q:
      typeof search.q === 'string' && search.q.trim().length > 0
        ? search.q.trim().slice(0, 120)
        : undefined,
    page: parsePositiveNumber(search.page),
    pageSize: parsePositiveNumber(search.pageSize),
  }),
  loaderDeps: ({ search }) => search,
  beforeLoad: async ({ context }) => {
    await fetchFreshWorkspaceAuthorization(context.queryClient)
  },
  loader: async ({ context, deps }) => {
    const timesheet = await context.queryClient.ensureQueryData({
      queryKey: trackerKeys.timesheet(deps),
      queryFn: () => getTimesheetFn({ data: deps }),
      staleTime: 30_000,
    })
    return { timesheet }
  },
  staleTime: 30_000,
  component: TimesheetRoute,
  errorComponent: ({ reset }) => (
    <div className="mx-auto grid max-w-lg gap-4 rounded-xl bg-card p-6 text-center shadow-sm ring-1 ring-border">
      <div>
        <p className="m-0 text-sm font-semibold text-destructive">
          Timesheet unavailable
        </p>
        <h1 className="m-0 mt-1 text-2xl font-bold text-foreground">
          We couldn&apos;t load this week
        </h1>
        <p className="m-0 mt-2 text-sm text-muted-foreground">
          Check your connection and try loading the timesheet again.
        </p>
      </div>
      <Button type="button" onClick={reset} className="mx-auto">
        Try again
      </Button>
    </div>
  ),
})

function TimesheetRoute() {
  const { timesheet } = Route.useLoaderData()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const query = useMemo(
    () => ({
      weekStart: search.weekStart,
      memberId: search.memberId,
      departmentId: search.departmentId,
      q: search.q,
      page: search.page,
      pageSize: search.pageSize,
    }),
    [
      search.weekStart,
      search.memberId,
      search.departmentId,
      search.q,
      search.page,
      search.pageSize,
    ],
  )

  const changeQuery = useCallback(
    (updates: Partial<TimesheetSearch>) => {
      void navigate({
        to: '/app/timesheet',
        search: (previous) => ({ ...previous, ...updates }),
      })
    },
    [navigate],
  )

  return (
    <TimesheetScreen
      initialData={timesheet}
      query={query}
      onChangeQuery={changeQuery}
    />
  )
}
