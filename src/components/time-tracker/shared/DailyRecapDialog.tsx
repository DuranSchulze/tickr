import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlarmClock, CalendarCheck, CalendarX, Sunrise } from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { getDailyRecapFn, setDailyLeaveFn } from '#/lib/server/daily-recap'
import { confirmMissingWeekdayFn } from '#/lib/server/missing-weekday'
import { MissingWeekdayDialog } from './MissingWeekdayDialog'
import { DAILY_STATUS_LABELS } from '#/lib/time-tracker/daily-report'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import { useNetworkStatus } from '#/lib/time-tracker/useNetworkStatus'

type Recap = NonNullable<Awaited<ReturnType<typeof getDailyRecapFn>>>

/** The recap date the member already closed, so it shows once per day. */
function seenKey(workspaceId: string, userId: string) {
  return `trackly_daily_recap:${workspaceId}:${userId}`
}
function readStorage(storage: 'local' | 'session', key: string) {
  try {
    return (storage === 'local' ? localStorage : sessionStorage).getItem(key)
  } catch {
    return null
  }
}
function writeStorage(
  storage: 'local' | 'session',
  key: string,
  value: string,
) {
  try {
    ;(storage === 'local' ? localStorage : sessionStorage).setItem(key, value)
  } catch {
    // Without storage the check-in may show again; that is harmless.
  }
}

function greeting() {
  const hour = new Date().getHours()
  return hour < 12
    ? 'Good morning'
    : hour < 18
      ? 'Good afternoon'
      : 'Good evening'
}

const dayNameFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  weekday: 'long',
  month: 'short',
  day: 'numeric',
})

function dayName(recap: Recap) {
  return dayNameFormatter.format(new Date(`${recap.date}T12:00:00Z`))
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-stone bg-eggshell px-3 py-2.5">
      <p className="m-0 text-[11px] font-medium uppercase tracking-wide text-smoke">
        {label}
      </p>
      <p className="m-0 mt-0.5 truncate text-sm font-semibold tabular-nums">
        {value}
      </p>
    </div>
  )
}

function RecapBody({ recap }: { recap: Recap }) {
  const progress =
    recap.minimumSeconds > 0
      ? Math.min(
          100,
          Math.round((recap.workedSeconds / recap.minimumSeconds) * 100),
        )
      : 100
  const tone =
    recap.status === 'MET'
      ? 'bg-emerald-500'
      : recap.status === 'LEAVE'
        ? 'bg-violet-500'
        : 'bg-amber-500'
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
          <span className="font-semibold tabular-nums">
            {recap.worked}{' '}
            <span className="font-normal text-smoke">of {recap.minimum}</span>
          </span>
          <span className="text-xs font-medium text-graphite">
            {DAILY_STATUS_LABELS[recap.status]}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Logged time against the daily minimum"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          className="h-2 overflow-hidden rounded-full bg-stone"
        >
          <div className={`h-full ${tone}`} style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat
          label="In–out"
          value={
            recap.timeIn && recap.timeOut
              ? `${recap.timeIn}–${recap.timeOut}`
              : '—'
          }
        />
        <Stat label="Billable" value={recap.billable} />
        <Stat label="Entries" value={String(recap.entryCount)} />
      </div>
      {recap.topEntries.length > 0 && (
        <ul className="m-0 list-none divide-y divide-stone rounded-xl border border-stone p-0">
          {recap.topEntries.map((entry, index) => (
            <li
              key={`${entry.description}-${index}`}
              className="flex items-start justify-between gap-3 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="m-0 truncate text-sm">
                  {entry.description || '(no description)'}
                </p>
                {entry.project && (
                  <p className="m-0 truncate text-xs text-smoke">
                    {entry.project}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-xs font-medium tabular-nums text-graphite">
                {entry.duration}
              </span>
            </li>
          ))}
        </ul>
      )}
      {recap.runningCount > 0 && (
        <p className="m-0 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <AlarmClock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          A timer from that day is still running and is not counted until you
          stop it.
        </p>
      )}
    </div>
  )
}

/**
 * Morning check-in: shows the member's previous working day once per day
 * when they open the app, and asks whether they were on leave when the day
 * is under the minimum (Mon–Fri expected hours less the break allowance,
 * Saturday's half-day minimum for people who worked the previous Saturday;
 * Sundays and holidays are skipped).
 */
export function DailyRecapDialog({
  workspaceId,
  userId,
}: {
  workspaceId: string
  userId: string
}) {
  const { isOnline } = useNetworkStatus()
  const queryClient = useQueryClient()
  const queryKey = ['daily-recap', workspaceId, userId] as const
  const storageKey = seenKey(workspaceId, userId)
  const [closedDate, setClosedDate] = useState<string | null>(null)
  const recapQuery = useQuery({
    queryKey,
    queryFn: () => getDailyRecapFn({ data: { workspaceId } }),
    enabled: isOnline && typeof window !== 'undefined',
    retry: false,
    staleTime: 5 * 60_000,
  })
  const leave = useMutation({
    mutationFn: (input: { date: string; onLeave: boolean }) =>
      setDailyLeaveFn({ data: { workspaceId, userId, ...input } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: trackerKeys.timesheets }),
      ])
    },
  })

  const notApplicable = useMutation({
    mutationFn: (date: string) =>
      confirmMissingWeekdayFn({ data: { workspaceId, userId, date } }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: trackerKeys.timesheets }),
        queryClient.invalidateQueries({
          queryKey: trackerKeys.missingWeekday(workspaceId, userId),
        }),
      ])
    },
  })
  const pending = leave.isPending || notApplicable.isPending

  const recap = recapQuery.data
  if (!isOnline) return null
  const seen =
    recap &&
    (closedDate === recap.date ||
      readStorage('local', storageKey) === recap.date ||
      readStorage('session', storageKey) === recap.date)
  if (!recap || seen) {
    // One prompt at a time: once the check-in is closed (or there is none),
    // the missing-weekday N/A prompt may ask about an earlier weekday, e.g.
    // Friday on a Monday whose check-in covered Saturday.
    return recapQuery.isPending ? null : (
      <MissingWeekdayDialog
        workspaceId={workspaceId}
        userId={userId}
        skipDate={recap?.date}
      />
    )
  }

  function finish() {
    if (!recap || pending) return
    writeStorage('local', storageKey, recap.date)
    setClosedDate(recap.date)
  }
  function later() {
    if (!recap || pending) return
    writeStorage('session', storageKey, recap.date)
    setClosedDate(recap.date)
  }

  const day = dayName(recap)
  const onLeave = recap.status === 'LEAVE'
  const minimumNote =
    recap.dayKind === 'saturday'
      ? `the ${recap.minimum} Saturday minimum`
      : `the ${recap.minimum} weekday minimum`

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          if (recap.needsAnswer) later()
          else finish()
        }
      }}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[460px]">
        <DialogHeader className="shrink-0 gap-3 px-6 pt-6 pb-4 sm:px-7 sm:pt-7">
          <div className="flex items-start gap-3 pr-5">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-stone bg-warm-taupe"
            >
              <Sunrise className="size-5 text-graphite" strokeWidth={1.5} />
            </span>
            <div className="space-y-1.5">
              <DialogTitle className="text-[22px] font-normal leading-tight tracking-tight">
                {greeting()}, {recap.firstName}
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-5">
                Here is your {recap.dateLabel} in {recap.workspaceName}.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 space-y-4 overflow-y-auto px-6 pb-5 sm:px-7">
          <RecapBody recap={recap} />

          {recap.needsAnswer && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3.5 text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              <p className="m-0 text-sm font-semibold">
                Were you on leave on {day}?
              </p>
              <p className="m-0 mt-1 text-xs leading-5">
                {recap.status === 'NO_TIME'
                  ? `You have no time logged for ${day}.`
                  : `You logged ${recap.worked}, ${recap.missing} below ${minimumNote}.`}{' '}
                Telling us helps your department Admins read your report
                correctly.
                {recap.status === 'NO_TIME' && recap.dayKind === 'weekday'
                  ? ' If you were working but had nothing to log, choose N/A.'
                  : ''}
              </p>
            </div>
          )}

          {onLeave && (
            <p className="m-0 flex items-start gap-2 rounded-xl bg-warm-taupe px-3.5 py-3 text-xs leading-5 text-graphite">
              <CalendarCheck
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {day} is marked as leave. It will not be flagged in daily reports.
            </p>
          )}

          {leave.isError && (
            <p role="alert" className="m-0 text-xs text-destructive">
              Could not save your answer. Please try again.
            </p>
          )}
          {notApplicable.isError && (
            <p role="alert" className="m-0 text-xs text-destructive">
              Could not save N/A. Please try again.
            </p>
          )}
          {(leave.data === 'ineligible' ||
            notApplicable.data === 'ineligible') && (
            <p role="alert" className="m-0 text-xs text-destructive">
              This day can no longer be changed here. Contact your Admin.
            </p>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-col gap-2 border-t border-stone bg-warm-taupe/50 px-6 py-4 sm:flex-row sm:flex-wrap sm:justify-end sm:px-7">
          {recap.needsAnswer ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={later}
                disabled={pending}
              >
                Later
              </Button>
              <Button
                type="button"
                variant="outline"
                asChild
                disabled={pending}
              >
                <Link
                  to="/app/timesheet"
                  search={{ weekStart: recap.timesheetWeekStart }}
                  onClick={finish}
                >
                  <CalendarX className="size-4" aria-hidden="true" />
                  No, I’ll add my time
                </Link>
              </Button>
              <Button
                type="button"
                onClick={() =>
                  leave.mutate({ date: recap.date, onLeave: true })
                }
                disabled={pending}
              >
                {leave.isPending ? 'Saving…' : 'Yes, I was on leave'}
              </Button>
              {recap.status === 'NO_TIME' && recap.dayKind === 'weekday' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => notApplicable.mutate(recap.date)}
                  disabled={pending}
                >
                  {notApplicable.isPending ? 'Saving…' : 'No work to log (N/A)'}
                </Button>
              )}
            </>
          ) : onLeave ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  leave.mutate({ date: recap.date, onLeave: false })
                }
                disabled={leave.isPending}
              >
                {leave.isPending ? 'Saving…' : 'Undo leave'}
              </Button>
              <Button type="button" onClick={finish} disabled={leave.isPending}>
                Start my day
              </Button>
            </>
          ) : (
            <Button type="button" onClick={finish}>
              Start my day
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
