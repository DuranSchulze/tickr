import { useMemo, useState, useSyncExternalStore } from 'react'
import type { DateRange } from 'react-day-picker'
import { CalendarDays, ChevronDown, X } from 'lucide-react'
import { Calendar } from '#/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'

export type EntriesDateRange = {
  startDate: string
  endDate: string
}

const DESKTOP_QUERY = '(min-width: 640px)'
const presets = [
  { label: 'Today', days: 0 },
  { label: '7 days', days: 6 },
  { label: '30 days', days: 29 },
] as const

function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateKey(value: string) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatRange(range: EntriesDateRange | null) {
  if (!range) return 'All dates'
  const start = parseDateKey(range.startDate)
  const end = parseDateKey(range.endDate)
  if (!start || !end) return 'Custom dates'
  const startLabel = start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  const endLabel = end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return range.startDate === range.endDate
    ? end.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : `${startLabel} - ${endLabel}`
}

function subscribeToDesktop(onChange: () => void) {
  const media = window.matchMedia(DESKTOP_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

function useIsDesktop() {
  return useSyncExternalStore(
    subscribeToDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  )
}

export function EntriesDateRangeFilter({
  range,
  onChange,
}: {
  range: EntriesDateRange | null
  onChange: (range: EntriesDateRange | null) => void
}) {
  const isDesktop = useIsDesktop()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>()
  const selected = useMemo<DateRange | undefined>(() => {
    if (!range) return undefined
    const from = parseDateKey(range.startDate)
    const to = parseDateKey(range.endDate)
    return from && to ? { from, to } : undefined
  }, [range])

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) setDraft(selected)
  }

  function selectDay(day: Date) {
    if (!draft?.from || draft.to) {
      setDraft({ from: day, to: undefined })
      return
    }
    const next =
      day < draft.from
        ? { from: day, to: draft.from }
        : { from: draft.from, to: day }
    setDraft(next)
    onChange({
      startDate: toDateKey(next.from),
      endDate: toDateKey(next.to),
    })
    setOpen(false)
  }

  function applyPreset(days: number) {
    const end = new Date()
    const start = new Date(end)
    start.setDate(end.getDate() - days)
    onChange({ startDate: toDateKey(start), endDate: toDateKey(end) })
    setOpen(false)
  }

  return (
    <div className="grid min-w-0 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <div className="grid grid-cols-3 rounded-lg border border-border bg-card p-1 sm:inline-flex">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset.days)}
            className="h-8 px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground transition-colors hover:bg-accent sm:min-w-56 sm:justify-start"
          >
            <CalendarDays className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-left">
              {formatRange(range)}
            </span>
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align={isDesktop ? 'start' : 'center'}
          className="max-h-[min(82dvh,680px)] w-[calc(100vw-1rem)] max-w-[430px] overflow-y-auto p-0 sm:w-auto sm:max-w-[760px]"
        >
          <Calendar
            mode="range"
            selected={draft}
            onSelect={() => undefined}
            onDayClick={selectDay}
            numberOfMonths={isDesktop ? 2 : 1}
            defaultMonth={draft?.from ?? selected?.from}
            className="w-full bg-card p-3 [--cell-size:--spacing(10)]"
            classNames={{
              root: 'w-full',
              months: 'relative flex flex-col gap-4 sm:flex-row',
              month: 'flex w-full min-w-0 flex-col gap-4',
              day: 'group/day relative aspect-square size-full rounded-(--cell-radius) p-0 text-center select-none',
            }}
          />
          <p className="m-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            Select a start date, then an end date.
          </p>
        </PopoverContent>
      </Popover>

      {range && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-3.5" />
          All dates
        </button>
      )}
    </div>
  )
}
