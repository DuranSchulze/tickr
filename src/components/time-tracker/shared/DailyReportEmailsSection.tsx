import { useQuery } from '@tanstack/react-query'
import {
  AlarmClock,
  Building2,
  Check,
  Download,
  FileText,
  Info,
  LoaderCircle,
  RefreshCw,
  UserRound,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '#/components/ui/button'
import { getDailyReportOverviewFn } from '#/lib/server/daily-report'

type Overview = Awaited<ReturnType<typeof getDailyReportOverviewFn>>

const KIND_LABELS: Record<Overview['recent'][number]['kind'], string> = {
  member_report: 'My daily report',
  department_digest: 'Department report',
  workspace_digest: 'Workspace report',
  shift_nudge: 'End-of-shift reminder',
}

const OUTCOME_LABELS: Record<Overview['recent'][number]['outcome'], string> = {
  pdf_attached: 'Sent with PDF',
  link_only: 'Sent with download link',
  sent: 'Sent',
  failed: 'Could not be sent',
}

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})
function formatDate(date: string) {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`))
}

function Row({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-warm-taupe text-graphite">
        {icon}
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="m-0 text-sm font-medium">{title}</p>
        <p className="m-0 text-xs leading-5 text-smoke">{children}</p>
      </div>
    </li>
  )
}

function DailyOverview({ data }: { data: Overview }) {
  const { receives, rules } = data
  return (
    <div className="space-y-6">
      <section
        aria-label="Daily report schedule"
        className="overflow-hidden rounded-[20px] border border-stone bg-warm-taupe"
      >
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3 text-xs text-graphite">
            <span className="font-medium">Daily schedule</span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium ${data.active ? 'border-stone bg-eggshell' : 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300'}`}
            >
              {data.active ? 'Active' : 'Not active yet'}
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="m-0 font-heading text-[28px] font-normal leading-tight tracking-tight">
              Every night
            </p>
            <p className="m-0 text-lg font-medium tabular-nums">12:00 AM</p>
          </div>
          <p className="m-0 mt-2 break-words text-xs text-smoke">
            {data.timezone} · Covers the previous day, including weekends
          </p>
        </div>
        <div className="flex items-start gap-2 border-t border-stone px-5 py-3.5 text-xs leading-5 text-smoke">
          <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p className="m-0">
            {rules.attachmentMaxMb > 0
              ? `The PDF is attached when it is ${rules.attachmentMaxMb} MB or smaller. Every email also links to a page where you can download the PDF or Excel, so large reports never depend on email size limits.`
              : 'Emails carry a link to a page where you can download the PDF or Excel. Nothing is attached.'}
          </p>
        </div>
      </section>

      <div>
        <p className="m-0 mb-3 text-xs font-medium text-graphite">
          What you receive
        </p>
        <ul className="m-0 list-none space-y-3 p-0">
          <Row
            icon={<UserRound className="size-3.5" aria-hidden="true" />}
            title="Your own daily report"
          >
            Your hours, first and last entry, every entry, and your status. Sent
            when you logged time or your day needs attention.
          </Row>
          {receives.departmentReport ? (
            <Row
              icon={<Building2 className="size-3.5" aria-hidden="true" />}
              title={`${receives.departmentReport} department report`}
            >
              Every member of {receives.departmentReport}, with hours, time in
              and out, and who is short. Sent to each Admin in the department.
            </Row>
          ) : receives.adminWithoutDepartment ? (
            <Row
              icon={<Building2 className="size-3.5" aria-hidden="true" />}
              title="No department report"
            >
              Department reports go to the Admins assigned to that department.
              You are not assigned to one.
            </Row>
          ) : null}
          {receives.workspaceReport && (
            <Row
              icon={<Building2 className="size-3.5" aria-hidden="true" />}
              title="Workspace report"
            >
              Every department in one email, with members who need attention
              listed first. Owners receive it; other roles can be given it in
              Roles → Permissions.
            </Row>
          )}
          {receives.reminders && rules.reminderTime && (
            <Row
              icon={<AlarmClock className="size-3.5" aria-hidden="true" />}
              title={`End-of-shift reminder at ${rules.reminderTime}`}
            >
              On weekdays, if you are under the minimum and no timer is running.
            </Row>
          )}
        </ul>
      </div>

      <div className="rounded-xl border border-stone px-4 py-3.5">
        <p className="m-0 mb-2 text-xs font-medium text-graphite">
          When a day needs attention
        </p>
        <ul className="m-0 list-disc space-y-1 pl-4 text-xs leading-5 text-smoke">
          <li>
            Monday–Friday: under <strong>{rules.weekdayMinimum}</strong> is
            marked Short, and a day with no entries is marked No time logged.
          </li>
          <li>
            Saturdays count only if you logged time the previous Saturday. Then
            under <strong>{rules.saturdayMinimum}</strong> is marked Short, and
            a Saturday with no entries is marked No time logged. Otherwise
            Saturday is a rest day for you, and on Monday the morning check-in
            shows Friday.
          </li>
          <li>Sundays and holidays are rest days and are never flagged.</li>
          <li>
            Days you mark as leave in the morning check-in are not flagged.
            Running timers are not counted until they are stopped.
          </li>
          {rules.upcomingHolidays.length > 0 && (
            <li>
              Upcoming holidays:{' '}
              {rules.upcomingHolidays.map(formatDate).join(', ')}.
            </li>
          )}
        </ul>
      </div>

      {data.latest.links.length > 0 && (
        <div>
          <p className="m-0 mb-3 text-xs font-medium text-graphite">
            Reports for {formatDate(data.latest.date)}
          </p>
          <div className="flex flex-wrap gap-2">
            {data.latest.links.map((link) => (
              <Button key={link.scope} asChild variant="outline" size="sm">
                <a href={link.path}>
                  <Download className="size-3.5" aria-hidden="true" />
                  {link.label}
                </a>
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-stone pt-5">
        <p className="m-0 mb-3 text-xs font-medium text-graphite">
          Recent daily emails
        </p>
        {data.recent.length === 0 ? (
          <p className="m-0 text-sm text-smoke">
            {data.active
              ? 'Your first daily email will appear here after midnight.'
              : 'Nothing sent yet. Daily emails start once they are activated for this workspace.'}
          </p>
        ) : (
          <ul className="m-0 list-none space-y-2.5 p-0">
            {data.recent.map((item) => (
              <li
                key={`${item.kind}-${item.date}-${item.sentAt}`}
                className="flex items-start gap-3"
              >
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-warm-taupe text-graphite">
                  {item.outcome === 'failed' ? (
                    <X className="size-3" aria-hidden="true" />
                  ) : (
                    <Check className="size-3" aria-hidden="true" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="m-0 text-sm font-medium">
                    {KIND_LABELS[item.kind]} · {formatDate(item.date)}
                  </p>
                  <p className="m-0 text-xs text-smoke">
                    {OUTCOME_LABELS[item.outcome]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!data.active && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl bg-warm-taupe px-3.5 py-3 text-xs leading-5 text-graphite"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="m-0">
            Daily emails are switched on for the whole workspace by the system
            administrator. Until then, nothing is sent.
          </p>
        </div>
      )}
    </div>
  )
}

export function DailyReportEmailsSection({
  memberId,
  enabled,
}: {
  memberId: string
  enabled: boolean
}) {
  const overview = useQuery({
    queryKey: ['daily-report-overview', memberId],
    queryFn: () => getDailyReportOverviewFn(),
    enabled,
    staleTime: 60_000,
  })
  if (overview.isPending)
    return (
      <div
        role="status"
        className="flex min-h-40 items-center justify-center gap-2 text-sm text-smoke"
      >
        <LoaderCircle
          className="size-4 motion-safe:animate-spin"
          aria-hidden="true"
        />
        Loading daily report details…
      </div>
    )
  if (overview.isError)
    return (
      <div
        role="alert"
        className="space-y-3 rounded-xl border border-stone bg-warm-taupe p-4"
      >
        <p className="m-0 text-sm leading-6">
          We couldn’t load your daily report details.
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void overview.refetch()}
          disabled={overview.isFetching}
        >
          <RefreshCw className="size-3.5" />
          Try again
        </Button>
      </div>
    )
  return <DailyOverview data={overview.data} />
}
