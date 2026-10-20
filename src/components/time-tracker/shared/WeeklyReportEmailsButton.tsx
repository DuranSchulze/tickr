import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  FileText,
  Info,
  LoaderCircle,
  Mail,
  RefreshCw,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  getWeeklyReportPreferencesFn,
  updateWeeklyReportPreferencesFn,
} from '#/lib/server/weekly-report-preferences'

type Preferences = Awaited<ReturnType<typeof getWeeklyReportPreferencesFn>>

const deliveryFormatters = new Map<string, Intl.DateTimeFormat>()
const periodFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
function formatPeriod(start: string, end: string) {
  return periodFormatter.formatRange(
    new Date(`${start}T00:00:00Z`),
    new Date(`${end}T00:00:00Z`),
  )
}
function formatDelivery(dueAt: string, timezone: string) {
  let formatter = deliveryFormatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    deliveryFormatters.set(timezone, formatter)
  }
  return formatter.format(new Date(dueAt))
}

const statusLabels: Record<string, string> = {
  pending: 'Queued for delivery',
  processing: 'Preparing your report',
  sent: 'Sent to email provider',
  skipped: 'Not sent',
  retryable_failure: 'We’ll try again shortly',
  terminal_failure: 'Unable to send',
  uncertain: 'Delivery could not be confirmed',
}
const reasonLabels: Record<string, string> = {
  empty_week: 'No completed entries this week.',
  preference_disabled: 'Weekly emails were turned off.',
  report_expired: 'The delivery window has passed.',
  member_ineligible: 'Workspace access or email preferences changed.',
  recipient_or_preference_changed: 'Your email address or preferences changed.',
  attachment_too_large:
    'The PDF was too large to email. You can export this period manually.',
  app_url_missing: 'Automatic delivery is temporarily unavailable.',
  provider_throttled: 'Delivery is taking a little longer.',
  provider_rate_limited: 'Delivery is taking a little longer.',
  retry_window_exhausted: 'Please export this period manually.',
  provider_terminal:
    'Please check your account email or export this period manually.',
  provider_uncertain: 'Check your inbox before exporting this period manually.',
  delivery_persistence_failed:
    'Check your inbox before exporting this period manually.',
  report_generation_failed: 'Please try exporting this period manually.',
  worker_lease_expired:
    'Processing was interrupted. Check your inbox for this report.',
}

function DeliveryHistory({ last }: { last: Preferences['last'] }) {
  if (!last)
    return (
      <div className="flex items-start gap-3 text-sm text-smoke">
        <Mail className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p className="m-0 leading-6">
          Your first report will appear here after the next weekly delivery.
        </p>
      </div>
    )
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-warm-taupe text-graphite">
        {last.status === 'sent' ? (
          <Check className="size-3.5" aria-hidden="true" />
        ) : (
          <Mail className="size-3.5" aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="m-0 text-sm font-medium">
          {statusLabels[last.status] ?? 'Report status unavailable'}
        </p>
        <p className="m-0 text-xs leading-5 text-smoke">
          {formatPeriod(last.week_start, last.week_end)}
        </p>
        {last.error && (
          <p className="m-0 text-xs leading-5 text-smoke">
            {reasonLabels[last.error] ??
              'Please check your inbox or export this period manually.'}
          </p>
        )}
      </div>
    </div>
  )
}

function WeeklyDeliverySettings({
  data,
  pending,
  onToggle,
}: {
  data: Preferences
  pending: boolean
  onToggle: (enabled: boolean) => void
}) {
  const labelId = useId()
  const descriptionId = useId()
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-5">
        <div className="space-y-1">
          <p id={labelId} className="m-0 text-sm font-semibold">
            Automatic delivery
          </p>
          <p id={descriptionId} className="m-0 text-xs leading-5 text-smoke">
            {data.enabled
              ? 'A weekly PDF, without the manual export.'
              : 'Turn on to receive your next weekly report.'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={data.enabled}
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          disabled={pending}
          onClick={() => onToggle(!data.enabled)}
          className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover disabled:cursor-wait disabled:opacity-50 ${data.enabled ? 'bg-primary-action' : 'bg-stone'}`}
        >
          <span
            className={`size-5 rounded-full shadow-sm ${data.enabled ? 'translate-x-5 bg-primary-action-foreground' : 'bg-popover'}`}
          />
        </button>
      </div>

      <section
        aria-label="Weekly report schedule"
        className="overflow-hidden rounded-[20px] border border-stone bg-warm-taupe"
      >
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between gap-3 text-xs text-graphite">
            <span className="font-medium">Weekly schedule</span>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-stone bg-eggshell px-2 py-1 text-[11px] font-medium">
              <FileText className="size-3" aria-hidden="true" />
              PDF report
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="m-0 font-heading text-[28px] font-normal leading-tight tracking-tight">
              Sunday
            </p>
            <p className="m-0 text-lg font-medium tabular-nums">8:00 AM</p>
          </div>
          <p className="m-0 mt-2 break-words text-xs text-smoke">
            {data.timezone} · Covers Sunday through Saturday
          </p>
        </div>
        <div className="space-y-2 border-t border-stone px-5 py-3.5 text-xs">
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
            <span className="text-smoke">
              {data.enabled ? 'Next report' : 'Upcoming reporting period'}
            </span>
            <span className="font-medium tabular-nums">
              {formatPeriod(data.next.weekStart, data.next.weekEnd)}
            </span>
          </div>
          {data.enabled && (
            <p className="m-0 leading-5 text-smoke">
              Scheduled for {formatDelivery(data.next.dueAt, data.timezone)}.
              Delivery may take a little time.
            </p>
          )}
          {!data.enabled && (
            <p className="m-0 leading-5 text-smoke">
              Delivery is paused. Re-enabling resumes future reports.
            </p>
          )}
        </div>
      </section>

      <div className="flex items-start gap-3">
        <Mail
          className="mt-0.5 size-4 shrink-0 text-smoke"
          aria-hidden="true"
        />
        <div className="min-w-0 space-y-1">
          <p className="m-0 text-xs text-smoke">Send to your account email</p>
          <p className="m-0 break-all text-sm font-medium">{data.email}</p>
        </div>
      </div>
      {!data.rolloutActive && (
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-xl bg-warm-taupe px-3.5 py-3 text-xs leading-5 text-graphite"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p className="m-0">
            Your preference is saved. Sending will start when weekly reports are
            activated for this workspace.
          </p>
        </div>
      )}
      <div className="border-t border-stone pt-5">
        <p className="m-0 mb-3 text-xs font-medium text-graphite">
          Last report
        </p>
        <DeliveryHistory last={data.last} />
      </div>
    </div>
  )
}

export function WeeklyReportEmailsButton({ memberId }: { memberId: string }) {
  const [open, setOpen] = useState(false)
  const client = useQueryClient()
  const queryKey = ['weekly-report-preferences', memberId]
  const preferences = useQuery({
    queryKey,
    queryFn: () => getWeeklyReportPreferencesFn(),
    enabled: open,
    staleTime: 0,
  })
  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      updateWeeklyReportPreferencesFn({ data: { enabled } }),
    onSuccess: async (data) => {
      client.setQueryData(queryKey, data)
      await client.invalidateQueries({ queryKey })
    },
  })
  const data = preferences.data
  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) mutation.reset()
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="no-print gap-1.5 px-3 font-semibold"
      >
        <Mail className="size-4" aria-hidden="true" />
        Weekly emails
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[460px]">
          <DialogHeader className="shrink-0 gap-3 px-6 pt-6 pb-5 sm:px-7 sm:pt-7">
            <div className="flex items-start gap-3 pr-5">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-stone bg-warm-taupe"
              >
                <Mail className="size-5 text-graphite" strokeWidth={1.5} />
              </span>
              <div className="space-y-1.5">
                <DialogTitle className="text-[22px] font-normal leading-tight tracking-tight">
                  Weekly report emails
                </DialogTitle>
                <DialogDescription className="text-[13px] leading-5">
                  Your week of work, delivered to your inbox.
                </DialogDescription>
              </div>
            </div>
            {data && (
              <p
                className="m-0 truncate text-xs font-medium text-graphite"
                title={data.workspaceName}
              >
                {data.workspaceName}{' '}
                <span className="px-1 text-ash" aria-hidden="true">
                  /
                </span>{' '}
                <span className="font-normal text-smoke">Personal reports</span>
              </p>
            )}
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto px-6 pb-4 sm:px-7">
            {preferences.isPending && (
              <div
                role="status"
                className="flex min-h-48 items-center justify-center gap-2 text-sm text-smoke"
              >
                <LoaderCircle
                  className="size-4 motion-safe:animate-spin"
                  aria-hidden="true"
                />
                Loading your delivery settings…
              </div>
            )}
            {preferences.isError && (
              <div
                role="alert"
                className="space-y-3 rounded-xl border border-stone bg-warm-taupe p-4"
              >
                <p className="m-0 text-sm leading-6">
                  We couldn’t load your email preferences.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void preferences.refetch()}
                  disabled={preferences.isFetching}
                >
                  <RefreshCw className="size-3.5" />
                  Try again
                </Button>
              </div>
            )}
            {data && (
              <WeeklyDeliverySettings
                data={data}
                pending={mutation.isPending || preferences.isFetching}
                onToggle={(enabled) => mutation.mutate(enabled)}
              />
            )}
            <div
              className="mt-4 min-h-5 text-xs"
              aria-live="polite"
              aria-atomic="true"
            >
              {mutation.isPending && (
                <span className="text-smoke">Saving your preference…</span>
              )}
              {mutation.isError && (
                <span className="text-destructive">
                  Couldn’t save your preference. Please try again.
                </span>
              )}
              {mutation.isSuccess && (
                <span className="inline-flex items-center gap-1.5 text-graphite">
                  <Check className="size-3.5" aria-hidden="true" />
                  Preference saved
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center justify-between gap-4 border-t border-stone bg-warm-taupe/50 px-6 py-4 sm:px-7">
            <p className="m-0 max-w-64 text-[11px] leading-5 text-smoke">
              Only your completed entries are included. Empty weeks are skipped.
            </p>
            <DialogClose asChild>
              <Button type="button" className="px-5">
                Done
              </Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
