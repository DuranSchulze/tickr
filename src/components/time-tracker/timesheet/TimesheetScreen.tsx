import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import {
  Building2,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  UserRound,
  Users,
} from 'lucide-react'
import type { TimesheetPayload } from '#/lib/server/tracker/timesheet.server'
import { getTimesheetExportFn, getTimesheetFn } from '#/lib/server/tracker'
import type { TimesheetSearch } from '#/routes/app/timesheet'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import {
  addDateKeyDays,
  formatTimesheetDuration,
  getLiveCellSeconds,
} from '#/lib/time-tracker/timesheet'
import {
  downloadTimesheetCsv,
  downloadTimesheetExcel,
} from '#/lib/time-tracker/timesheet-export'
import { gooeyToast } from '#/lib/toast'
import { useNowTick } from '#/components/time-tracker/dashboard/hooks/useNowTick'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import { Combobox } from '#/components/ui/combobox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'

type TimesheetScreenProps = {
  initialData: TimesheetPayload
  query: TimesheetSearch
  onChangeQuery: (updates: Partial<TimesheetSearch>) => void
}

const pageSizeOptions = [25, 50, 100] as const

function formatWeekRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00.000Z`)
  const endDate = new Date(`${end}T00:00:00.000Z`)
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear()
  const first = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' as const }),
  }).format(startDate)
  const last = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(endDate)
  return `${first} – ${last}`
}

function formatTime(value: string | null, timezone: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value))
}

export function TimesheetScreen({
  initialData,
  query,
  onChangeQuery,
}: TimesheetScreenProps) {
  const { data, isFetching, refetch } = useQuery({
    queryKey: trackerKeys.timesheet(query),
    queryFn: () => getTimesheetFn({ data: query }),
    initialData,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null)
  const hasRunning = data.members.some((member) =>
    member.days.some((day) => day.status === 'RUNNING'),
  )
  const tick = useNowTick(hasRunning ? 1000 : null)
  const nowMs = tick || new Date(data.snapshotAt).getTime()

  const liveDailyTotals = useMemo(
    () =>
      data.dates.map((_, dayIndex) =>
        data.members.reduce(
          (sum, member) =>
            sum + getLiveCellSeconds(member.days[dayIndex], nowMs),
          0,
        ),
      ),
    [data.dates, data.members, nowMs],
  )
  const liveWeekTotal = liveDailyTotals.reduce((sum, value) => sum + value, 0)

  async function exportTimesheet(format: 'csv' | 'xlsx') {
    setExporting(format)
    try {
      const exported = await getTimesheetExportFn({
        data: {
          weekStart: data.weekStart,
          memberId: query.memberId,
          departmentId: query.departmentId,
          q: query.q,
          pageSize: query.pageSize,
        },
      })
      if (format === 'xlsx') {
        await downloadTimesheetExcel(exported)
        gooeyToast.success('Timesheet Excel file downloaded')
      } else {
        downloadTimesheetCsv(exported)
        gooeyToast.success('Timesheet CSV downloaded')
      }
    } catch {
      gooeyToast.error('Could not export the timesheet', {
        description: 'Please try again without leaving this page.',
      })
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="grid min-w-0 gap-5">
      <header className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div>
          <p className="m-0 flex items-center gap-2 text-sm font-semibold text-primary">
            <CalendarClock className="size-4" />
            Analytics · Weekly attendance
          </p>
          <h1 className="m-0 mt-1 text-3xl font-black tracking-tight text-foreground">
            Timesheet
          </h1>
          <p className="m-0 mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Open one member&apos;s weekly DTR directly, or choose a department
            for the wider team view. Times follow {data.timezone}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous week"
            onClick={() =>
              onChangeQuery({
                weekStart: addDateKeyDays(data.weekStart, -7),
                page: 1,
              })
            }
          >
            <ChevronLeft />
          </Button>
          <div className="min-w-44 rounded-md border border-border bg-card px-3 py-2 text-center shadow-xs">
            <p className="m-0 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Work week
            </p>
            <p className="m-0 mt-0.5 font-mono text-sm font-bold tabular-nums text-foreground">
              {formatWeekRange(data.weekStart, data.weekEnd)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next week"
            onClick={() =>
              onChangeQuery({
                weekStart: addDateKeyDays(data.weekStart, 7),
                page: 1,
              })
            }
          >
            <ChevronRight />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onChangeQuery({ weekStart: undefined, page: 1 })}
          >
            Current week
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                disabled={exporting !== null || data.selectionRequired}
              >
                <Download className={exporting ? 'animate-pulse' : ''} />
                {exporting ? 'Preparing…' : 'Export'}
                {!exporting && <ChevronDown className="size-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
              <DropdownMenuItem onSelect={() => void exportTimesheet('csv')}>
                <FileText />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportTimesheet('xlsx')}>
                <FileSpreadsheet />
                Export Excel (.xlsx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {!data.selectionRequired && (
        <section
          className="grid gap-3 sm:grid-cols-3"
          aria-label="Week summary"
        >
          <SummaryStat
            icon={Users}
            label="People in view"
            value={String(data.totalCount)}
          />
          <SummaryStat
            icon={Clock3}
            label="Logged this week"
            value={formatTimesheetDuration(liveWeekTotal)}
          />
          <SummaryStat
            icon={RefreshCw}
            label="Data refresh"
            value={hasRunning ? 'Live · every second' : 'Every 30 seconds'}
            live={hasRunning}
          />
        </section>
      )}

      <Card className="gap-0 py-0">
        <TimesheetScopePicker
          data={data}
          query={query}
          onChangeQuery={onChangeQuery}
          isFetching={isFetching}
          onRefresh={() => void refetch()}
        />

        {data.selectionRequired ? (
          <div className="grid min-h-96 place-items-center px-6 py-16 text-center">
            <div className="max-w-md">
              <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <UserRound className="size-6" />
              </div>
              <h2 className="m-0 mt-5 text-xl font-black tracking-tight text-foreground">
                Select a member or department to begin
              </h2>
              <p className="m-0 mt-2 text-sm leading-6 text-muted-foreground">
                Choose one person for a focused DTR, or open a department to see
                everyone on that team.
              </p>
            </div>
          </div>
        ) : data.members.length === 0 ? (
          <div className="grid min-h-80 place-items-center px-6 py-12 text-center">
            <div className="max-w-sm">
              <CalendarClock className="mx-auto size-8 text-muted-foreground" />
              <h2 className="m-0 mt-3 text-lg font-bold text-foreground">
                No people in this view
              </h2>
              <p className="m-0 mt-1 text-sm leading-6 text-muted-foreground">
                Choose another member or department to review this week&apos;s
                DTR records.
              </p>
            </div>
          </div>
        ) : (
          <TimesheetGrid
            data={data}
            nowMs={nowMs}
            dailyTotals={liveDailyTotals}
          />
        )}

        {!data.selectionRequired && data.totalPages > 1 && (
          <TimesheetPagination data={data} onChangeQuery={onChangeQuery} />
        )}
      </Card>
    </div>
  )
}

function TimesheetScopePicker({
  data,
  query,
  onChangeQuery,
  isFetching,
  onRefresh,
}: {
  data: TimesheetPayload
  query: TimesheetSearch
  onChangeQuery: (updates: Partial<TimesheetSearch>) => void
  isFetching: boolean
  onRefresh: () => void
}) {
  const canChooseScope = data.permissionLevel !== 'EMPLOYEE'
  const selectedMember = data.memberOptions.find(
    (member) => member.id === query.memberId,
  )
  const selectedDepartment = data.departments.find(
    (department) => department.id === query.departmentId,
  )
  const viewLabel = selectedMember
    ? selectedMember.name
    : selectedDepartment
      ? selectedDepartment.name
      : canChooseScope
        ? 'Choose a view'
        : data.members[0]?.name

  return (
    <div className="grid gap-4 border-b border-border bg-muted/20 px-4 py-4 lg:grid-cols-[minmax(13rem,0.7fr)_minmax(0,1.5fr)_auto] lg:items-end">
      <div>
        <p className="m-0 text-xs font-black uppercase tracking-[0.14em] text-primary">
          Timesheet focus
        </p>
        <p className="m-0 mt-1 truncate text-base font-bold text-foreground">
          {viewLabel}
        </p>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">
          {selectedMember
            ? selectedMember.email
            : selectedDepartment
              ? 'Department view'
              : canChooseScope
                ? 'No attendance data is loaded yet'
                : 'Your personal weekly DTR'}
        </p>
      </div>

      {canChooseScope && (
        <div className="grid min-w-0 gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Find a member
            </label>
            <Combobox
              value={query.memberId ?? ''}
              options={data.memberOptions.map((member) => ({
                value: member.id,
                label: member.name,
                description: query.departmentId
                  ? member.email
                  : [member.email, member.departmentName]
                      .filter(Boolean)
                      .join(' · '),
              }))}
              onValueChange={(memberId) =>
                onChangeQuery({
                  memberId,
                  q: undefined,
                  page: 1,
                })
              }
              placeholder="Search or select a member"
              searchPlaceholder="Search name or email"
              emptyText={
                query.departmentId
                  ? 'No members found in this department.'
                  : 'No permitted members found.'
              }
            />
          </div>

          {data.departments.length > 0 && (
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                View department
              </label>
              <Select
                value={query.departmentId}
                onValueChange={(departmentId) =>
                  onChangeQuery({
                    memberId: undefined,
                    departmentId,
                    q: undefined,
                    page: 1,
                  })
                }
              >
                <SelectTrigger>
                  <Building2 className="size-4 text-muted-foreground" />
                  <SelectValue placeholder="View department" />
                </SelectTrigger>
                <SelectContent>
                  {data.departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {canChooseScope && !data.selectionRequired && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChangeQuery({
                memberId: undefined,
                departmentId: undefined,
                q: undefined,
                page: 1,
              })
            }
          >
            Clear view
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Refresh timesheet"
          onClick={onRefresh}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? 'animate-spin' : ''} />
        </Button>
      </div>
    </div>
  )
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  live = false,
}: {
  icon: typeof Users
  label: string
  value: string
  live?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card px-4 py-3 shadow-xs ring-1 ring-foreground/10">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="m-0 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </p>
        <p className="m-0 mt-0.5 flex items-center gap-2 truncate font-mono text-base font-black tabular-nums text-foreground">
          {live && (
            <span className="size-2 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
          )}
          {value}
        </p>
      </div>
    </div>
  )
}

export function TimesheetGrid({
  data,
  nowMs,
  dailyTotals,
}: {
  data: TimesheetPayload
  nowMs: number
  dailyTotals: number[]
}) {
  return (
    <div
      className="overflow-x-auto"
      role="region"
      aria-label="Weekly DTR grid"
      tabIndex={0}
    >
      <table className="w-full min-w-[1180px] border-collapse text-sm sm:min-w-[1260px] xl:min-w-[1400px]">
        <thead>
          <tr className="border-b border-border bg-muted/45">
            <th
              scope="col"
              className="sticky left-0 z-30 w-40 min-w-40 bg-muted px-3 py-3 text-left shadow-[1px_0_0_var(--border)] sm:w-52 sm:min-w-52 sm:px-4"
            >
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Member
              </span>
            </th>
            {data.dates.map((date) => (
              <th
                key={date.date}
                scope="col"
                className="min-w-32 px-2 py-3 text-left sm:min-w-36 sm:px-3 xl:min-w-40"
              >
                <span className="block text-xs font-black uppercase tracking-[0.14em] text-foreground">
                  {date.dayLabel}
                </span>
                <span className="mt-0.5 block font-mono text-xs font-medium text-muted-foreground">
                  {date.shortLabel}
                </span>
              </th>
            ))}
            <th
              scope="col"
              className="w-28 min-w-28 bg-muted px-3 py-3 text-right sm:w-32 sm:min-w-32 lg:sticky lg:right-0 lg:z-30 lg:shadow-[-1px_0_0_var(--border)]"
            >
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Week total
              </span>
            </th>
          </tr>
        </thead>
        <tbody>
          {data.members.map((member) => {
            const weeklySeconds = member.days.reduce(
              (sum, day) => sum + getLiveCellSeconds(day, nowMs),
              0,
            )
            return (
              <tr
                key={member.id}
                className="border-b border-border last:border-b-0 hover:bg-muted/20"
              >
                <th
                  scope="row"
                  className="sticky left-0 z-20 max-w-40 bg-card px-3 py-4 text-left shadow-[1px_0_0_var(--border)] sm:max-w-52 sm:px-4"
                >
                  <div className="min-w-0">
                    <p className="m-0 truncate font-bold text-foreground">
                      {member.name}
                    </p>
                    <p className="m-0 mt-0.5 truncate text-xs font-normal text-muted-foreground">
                      {member.email}
                    </p>
                    {member.departmentName && (
                      <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        <span
                          className="size-1.5 rounded-full"
                          style={{
                            backgroundColor:
                              member.departmentColor ?? 'var(--primary)',
                          }}
                        />
                        {member.departmentName}
                      </span>
                    )}
                  </div>
                </th>
                {member.days.map((day) => (
                  <td
                    key={day.date}
                    className="min-w-0 px-1.5 py-3 align-top sm:px-2.5 xl:px-3"
                  >
                    <DayCell day={day} timezone={data.timezone} nowMs={nowMs} />
                  </td>
                ))}
                <td className="bg-card px-3 py-4 text-right sm:px-4 lg:sticky lg:right-0 lg:z-20 lg:shadow-[-1px_0_0_var(--border)]">
                  <p className="m-0 font-mono text-base font-black tabular-nums text-foreground">
                    {formatTimesheetDuration(weeklySeconds)}
                  </p>
                </td>
              </tr>
            )
          })}
        </tbody>
        {data.members.length > 1 && (
          <tfoot>
            <tr className="border-t border-border bg-muted/55">
              <th
                scope="row"
                className="sticky left-0 z-30 bg-muted px-3 py-4 text-left shadow-[1px_0_0_var(--border)] sm:px-4"
              >
                <span className="text-xs font-black uppercase tracking-[0.12em] text-foreground">
                  Department total
                </span>
              </th>
              {dailyTotals.map((seconds, index) => (
                <td key={data.dates[index].date} className="px-2 py-4 sm:px-3">
                  <span className="font-mono text-sm font-black tabular-nums text-foreground">
                    {formatTimesheetDuration(seconds)}
                  </span>
                </td>
              ))}
              <td className="bg-muted px-3 py-4 text-right sm:px-4 lg:sticky lg:right-0 lg:z-30 lg:shadow-[-1px_0_0_var(--border)]">
                <span className="font-mono text-base font-black tabular-nums text-primary">
                  {formatTimesheetDuration(
                    dailyTotals.reduce((sum, seconds) => sum + seconds, 0),
                  )}
                </span>
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function DayCell({
  day,
  timezone,
  nowMs,
}: {
  day: TimesheetPayload['members'][number]['days'][number]
  timezone: string
  nowMs: number
}) {
  if (day.status === 'NO_TIME') {
    return <span className="text-lg text-muted-foreground/45">—</span>
  }
  const seconds = getLiveCellSeconds(day, nowMs)
  return (
    <div className="min-w-0 overflow-hidden rounded-lg bg-muted/35 px-2 py-2.5 ring-1 ring-border/70 sm:px-2.5">
      <dl className="m-0 grid min-w-0 gap-2 text-[10px] leading-4 sm:text-[11px]">
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <dt className="shrink-0 font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:tracking-wide">
            Time in
          </dt>
          <dd className="m-0 min-w-0 font-mono font-semibold tabular-nums text-foreground">
            {formatTime(day.timeIn, timezone)}
          </dd>
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
          <dt className="shrink-0 font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:tracking-wide">
            Duration
          </dt>
          <dd className="m-0 min-w-0 font-mono font-black tabular-nums text-foreground">
            {formatTimesheetDuration(seconds)}
          </dd>
        </div>
        {day.status === 'RUNNING' ? (
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <dt className="shrink-0 font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:tracking-wide">
              Status
            </dt>
            <dd className="m-0 flex max-w-full min-w-0 justify-end">
              <span className="inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/12 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] text-emerald-700 dark:text-emerald-300 sm:px-2 sm:text-[10px] sm:tracking-wide">
                <span className="size-1.5 shrink-0 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
                In progress
              </span>
            </dd>
          </div>
        ) : (
          <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
            <dt className="shrink-0 font-semibold uppercase tracking-[0.08em] text-muted-foreground sm:tracking-wide">
              Time out
            </dt>
            <dd className="m-0 min-w-0 font-mono font-semibold tabular-nums text-foreground">
              {formatTime(day.timeOut, timezone)}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}

function TimesheetPagination({
  data,
  onChangeQuery,
}: {
  data: TimesheetPayload
  onChangeQuery: (updates: Partial<TimesheetSearch>) => void
}) {
  const start = data.totalCount === 0 ? 0 : (data.page - 1) * data.pageSize + 1
  const end = Math.min(data.page * data.pageSize, data.totalCount)
  return (
    <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="m-0 text-xs text-muted-foreground">
        Showing {start}–{end} of {data.totalCount} people
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={String(data.pageSize)}
          onValueChange={(value) =>
            onChangeQuery({ pageSize: Number(value), page: 1 })
          }
        >
          <SelectTrigger size="sm" aria-label="Rows per page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} rows
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={data.page <= 1}
          onClick={() => onChangeQuery({ page: data.page - 1 })}
        >
          Previous
        </Button>
        <span className="px-1 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
          {data.page} / {data.totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={data.page >= data.totalPages}
          onClick={() => onChangeQuery({ page: data.page + 1 })}
        >
          Next
        </Button>
      </div>
    </div>
  )
}
