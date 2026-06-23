import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { DateRange } from 'react-day-picker'
import { CalendarDays, Check } from 'lucide-react'
import { Calendar } from '#/components/ui/calendar'

const DESKTOP_QUERY = '(min-width: 640px)'

const presets = [
  { label: 'Today', kind: 'today' },
  { label: '1 Week', kind: 'week' },
  { label: '1 Month', kind: 'month' },
] as const

function toLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateKey(value: string): Date | undefined {
  if (!value) return undefined
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatDateLabel(value: string) {
  const date = parseDateKey(value)
  if (!date) return value
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getPresetRange(kind: (typeof presets)[number]['kind']) {
  const end = new Date()
  const start = new Date(end)
  if (kind === 'week') {
    start.setDate(end.getDate() - 6)
  } else if (kind === 'month') {
    start.setMonth(end.getMonth() - 1)
  }
  return {
    startDate: toLocalDateKey(start),
    endDate: toLocalDateKey(end),
  }
}

function subscribeToDesktop(onChange: () => void) {
  const mql = window.matchMedia(DESKTOP_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

function getDesktopSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches
}

function getServerDesktopSnapshot() {
  return true
}

function useIsDesktop() {
  return useSyncExternalStore(
    subscribeToDesktop,
    getDesktopSnapshot,
    getServerDesktopSnapshot,
  )
}

export function ExportDateRangePicker({
  startDate,
  endDate,
  onChangeRange,
}: {
  startDate: string
  endDate: string
  onChangeRange: (range: { startDate: string; endDate: string }) => void
}) {
  const isDesktop = useIsDesktop()
  const selected = useMemo<DateRange | undefined>(() => {
    const from = parseDateKey(startDate)
    const to = parseDateKey(endDate)
    return from && to ? { from, to } : undefined
  }, [endDate, startDate])
  const [draft, setDraft] = useState<DateRange | undefined>(selected)
  const draftRef = useRef<DateRange | undefined>(selected)
  const today = useMemo(() => new Date(), [])

  const label =
    startDate && endDate
      ? `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`
      : 'Select date range'

  function commitRange(nextDraft: DateRange) {
    if (!nextDraft.from || !nextDraft.to) return
    const next = {
      startDate: toLocalDateKey(nextDraft.from),
      endDate: toLocalDateKey(nextDraft.to),
    }
    onChangeRange(next)
  }

  function selectDraftDay(day: Date) {
    if (!draft?.from || draft.to) {
      const nextDraft = { from: day, to: undefined }
      draftRef.current = nextDraft
      setDraft(nextDraft)
      return
    }

    const nextDraft =
      day < draft.from
        ? { from: day, to: draft.from }
        : { from: draft.from, to: day }
    draftRef.current = nextDraft
    setDraft(nextDraft)
    commitRange(nextDraft)
  }

  function applyPreset(kind: (typeof presets)[number]['kind']) {
    const next = getPresetRange(kind)
    const nextDraft = {
      from: parseDateKey(next.startDate),
      to: parseDateKey(next.endDate),
    }
    draftRef.current = nextDraft
    setDraft(nextDraft)
    onChangeRange(next)
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-3 rounded-lg border border-border bg-background p-1">
        {presets.map((preset) => (
          <button
            key={preset.kind}
            type="button"
            onClick={() => applyPreset(preset.kind)}
            className="h-8 rounded-md px-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-sm font-bold text-foreground">
          <CalendarDays className="size-4 text-primary" />
          <span className="min-w-0 truncate">{label}</span>
        </div>
        <Calendar
          mode="range"
          selected={draft}
          onSelect={() => undefined}
          onDayClick={selectDraftDay}
          numberOfMonths={isDesktop ? 2 : 1}
          defaultMonth={draft?.from ?? selected?.from}
          disabled={{ after: today }}
          className="w-full bg-card p-3 [--cell-size:--spacing(10)]"
          classNames={{
            root: 'w-full',
            months: 'relative flex flex-col gap-4 sm:flex-row',
            month: 'flex w-full min-w-0 flex-col gap-4',
            day: 'group/day relative aspect-square size-full rounded-(--cell-radius) p-0 text-center select-none',
          }}
        />
        <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <Check className="size-3.5 text-primary" />
          Tap a start date, then an end date to apply.
        </div>
      </div>
    </div>
  )
}
