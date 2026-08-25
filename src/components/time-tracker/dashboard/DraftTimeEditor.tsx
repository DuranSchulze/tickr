import { useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { Calendar } from '#/components/ui/calendar'
import type { DateRange } from 'react-day-picker'
import {
  isTimeInputWithSeconds,
  patchDateAndTimeWithSeconds,
  toTimeInputWithSeconds,
} from '#/lib/time-tracker/entry-timing'
import { formatDuration } from '#/lib/time-tracker/store'

function isSameLocalDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatShortDate(d: Date) {
  const month = d.toLocaleString('default', { month: 'short' })
  const day = d.getDate()
  return `${month} ${day}`
}

function formatTimeDisplay(iso: string) {
  const d = new Date(iso)
  const hour = d.getHours()
  const minute = d.getMinutes()
  const second = d.getSeconds()
  const period = hour >= 12 ? 'pm' : 'am'
  const h12 = hour % 12 || 12
  if (second !== 0) {
    return `${h12}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}${period}`
  }
  return minute === 0
    ? `${h12}${period}`
    : `${h12}:${String(minute).padStart(2, '0')}${period}`
}

type DraftTimeEditorProps = {
  startedAt: string
  endedAt: string
  isRunning: boolean
  onChange: (patch: { startedAt?: string; endedAt?: string }) => void
}

export function DraftTimeEditor({
  startedAt,
  endedAt,
  isRunning,
  onChange,
}: DraftTimeEditorProps) {
  const startDate = new Date(startedAt)
  const endDate = isRunning ? new Date() : new Date(endedAt || startedAt)

  const [open, setOpen] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startDate,
    to: isRunning ? undefined : endDate,
  })
  const [startTime, setStartTime] = useState(() =>
    toTimeInputWithSeconds(startedAt),
  )
  const [endTime, setEndTime] = useState(() =>
    isRunning ? '' : toTimeInputWithSeconds(endedAt || startedAt),
  )
  const [saveAttempted, setSaveAttempted] = useState(false)

  const spansDates = !isRunning && !isSameLocalDate(startDate, endDate)

  function openEditor() {
    setDateRange({
      from: startDate,
      to: isRunning ? undefined : endDate,
    })
    setStartTime(toTimeInputWithSeconds(startedAt))
    setEndTime(isRunning ? '' : toTimeInputWithSeconds(endedAt))
    setSaveAttempted(false)
    setOpen(true)
  }

  function selectRangeDay(day: Date) {
    setDateRange((current) => {
      if (!current.from || current.to) {
        return { from: day, to: undefined }
      }
      return day < current.from
        ? { from: day, to: current.from }
        : { from: current.from, to: day }
    })
  }

  function saveTimeChange() {
    setSaveAttempted(true)
    if (!isTimeInputWithSeconds(startTime)) return
    const draftStartDate = dateRange.from ?? startDate
    const draftEndDate = dateRange.to ?? draftStartDate

    const newStartedAt = patchDateAndTimeWithSeconds(
      startedAt,
      draftStartDate,
      startTime,
    )
    const newEndedAt =
      !isRunning && isTimeInputWithSeconds(endTime) && dateRange.to
        ? patchDateAndTimeWithSeconds(endedAt, draftEndDate, endTime)
        : !isRunning && isTimeInputWithSeconds(endTime)
          ? patchDateAndTimeWithSeconds(endedAt, draftStartDate, endTime)
          : undefined

    if (
      new Date(newStartedAt).getTime() >= new Date(newEndedAt || '').getTime()
    ) {
      return
    }

    onChange({ startedAt: newStartedAt, endedAt: newEndedAt })
    setOpen(false)
  }

  const draftStartDate = dateRange.from ?? startDate
  const draftEndDate = dateRange.to ?? draftStartDate
  const previewStartedAt = isTimeInputWithSeconds(startTime)
    ? patchDateAndTimeWithSeconds(startedAt, draftStartDate, startTime)
    : null
  const previewEndedAt =
    !isRunning && isTimeInputWithSeconds(endTime)
      ? patchDateAndTimeWithSeconds(
          endedAt,
          dateRange.to ? draftEndDate : draftStartDate,
          endTime,
        )
      : null
  const previewDurationSeconds =
    previewStartedAt && previewEndedAt
      ? Math.floor(
          (new Date(previewEndedAt).getTime() -
            new Date(previewStartedAt).getTime()) /
            1000,
        )
      : null
  const hasTimeError =
    !isRunning &&
    (previewDurationSeconds === null || previewDurationSeconds <= 0)

  return (
    <>
      <button
        type="button"
        onClick={openEditor}
        className="inline-flex h-10 w-full items-center justify-start gap-2 rounded-lg border border-border bg-card px-3 text-sm text-foreground transition-colors hover:bg-accent"
        title="Edit date and time"
        aria-label="Edit date and time"
      >
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
        <span className="grid min-w-0 justify-items-start gap-0.5 text-xs leading-tight tabular-nums">
          <span className="font-semibold text-foreground">
            {formatShortDate(startDate)}
          </span>
          <span className="text-muted-foreground">
            {isRunning
              ? 'now'
              : spansDates
                ? `${formatShortDate(endDate)}`
                : formatTimeDisplay(startedAt)}{' '}
            -{' '}
            {isRunning
              ? 'Running'
              : spansDates
                ? formatTimeDisplay(endedAt)
                : formatTimeDisplay(endedAt || startedAt)}
          </span>
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-3 flex max-h-[min(90dvh,42rem)] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:top-1/2 sm:max-w-xl sm:-translate-y-1/2 md:max-w-2xl"
          showCloseButton={false}
        >
          <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-border px-5 py-4">
            <DialogTitle>Edit Date & Time</DialogTitle>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Close time editor"
                title="Close"
              >
                <X className="size-4" />
              </Button>
            </DialogClose>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 [-webkit-overflow-scrolling:touch] sm:p-4">
            <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)]">
              <div className="rounded-md border border-border p-2">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  defaultMonth={dateRange.from}
                  onSelect={() => undefined}
                  onDayClick={selectRangeDay}
                  autoFocus
                  className="w-full bg-card p-2 [--cell-size:--spacing(8)] sm:[--cell-size:--spacing(9)]"
                  classNames={{
                    root: 'w-full',
                    month: 'flex w-full min-w-0 flex-col gap-4',
                    day: 'group/day relative aspect-square size-full rounded-(--cell-radius) p-0 text-center select-none',
                  }}
                />
              </div>

              <div className="grid content-start gap-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-left text-sm text-muted-foreground">
                    <span className="block text-xs font-semibold uppercase tracking-wide">
                      Start date
                    </span>
                    <span className="font-semibold">
                      {draftStartDate.toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-left text-sm text-muted-foreground">
                    <span className="block text-xs font-semibold uppercase tracking-wide">
                      End date
                    </span>
                    <span className="font-semibold">
                      {isRunning
                        ? 'Running'
                        : draftEndDate.toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                    </span>
                  </div>
                </div>
                <p className="m-0 text-xs text-muted-foreground">
                  Select one date for a same-day entry, or select a start and
                  end date for overnight or multi-day work.
                </p>

                <label className="grid gap-1.5 text-sm font-semibold text-foreground">
                  Start time
                  <input
                    type="time"
                    step="1"
                    value={startTime}
                    onChange={(event) => {
                      setStartTime(event.target.value)
                      setSaveAttempted(false)
                    }}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
                  />
                </label>

                <label className="grid gap-1.5 text-sm font-semibold text-foreground">
                  End time
                  <input
                    type="time"
                    step="1"
                    value={isRunning ? '' : endTime}
                    onChange={(event) => {
                      setEndTime(event.target.value)
                      setSaveAttempted(false)
                    }}
                    disabled={isRunning}
                    placeholder={isRunning ? 'Running timer' : undefined}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary disabled:bg-muted disabled:text-muted-foreground"
                  />
                </label>
                {!isRunning && (
                  <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Duration preview
                    </span>
                    <p className="m-0 mt-1 font-mono font-bold text-foreground">
                      {previewDurationSeconds !== null &&
                      previewDurationSeconds > 0
                        ? formatDuration(previewDurationSeconds)
                        : '—'}
                    </p>
                  </div>
                )}
                {saveAttempted && hasTimeError && (
                  <p className="m-0 text-xs font-semibold text-destructive">
                    End must be after start.
                  </p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4 sm:pb-4 [&_button]:w-full sm:[&_button]:w-auto">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={saveTimeChange}>
              Save Time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
