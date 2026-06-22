import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { DateRange } from 'react-day-picker'
import { CalendarDays, Check, ChevronDown } from 'lucide-react'
import { Calendar } from '#/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import type { AnalyticsRange } from './analytics.utils'
import { formatRange, parseDateKey } from './analytics.utils'

const DESKTOP_QUERY = '(min-width: 640px)'

const presets = [
  { label: '7D', days: 6 },
  { label: '30D', days: 29 },
  { label: '90D', days: 89 },
] as const

function getPresetRange(days: number): AnalyticsRange {
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - days)
  return {
    startDate: toLocalDateKey(start),
    endDate: toLocalDateKey(end),
  }
}

function toLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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

export function AnalyticsDateRange({
  range,
  onChangeRange,
}: {
  range: AnalyticsRange
  onChangeRange: (range: AnalyticsRange) => void
}) {
  const [open, setOpen] = useState(false)
  const isDesktop = useIsDesktop()
  const selected = useMemo<DateRange | undefined>(() => {
    const from = parseDateKey(range.startDate)
    const to = parseDateKey(range.endDate)
    return from && to ? { from, to } : undefined
  }, [range.endDate, range.startDate])
  const [draft, setDraft] = useState<DateRange | undefined>(selected)
  const draftRef = useRef<DateRange | undefined>(selected)

  const draftLabel =
    draft?.from && draft.to
      ? formatRange(toLocalDateKey(draft.from), toLocalDateKey(draft.to))
      : draft?.from
        ? `${toLocalDateKey(draft.from)} - Select end date`
        : 'Select start date'

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      draftRef.current = selected
      setDraft(selected)
    }
  }

  function applyRange() {
    const rangeDraft = draftRef.current
    if (!rangeDraft?.from || !rangeDraft.to) return
    commitRange(rangeDraft)
  }

  function commitRange(rangeDraft: DateRange) {
    if (!rangeDraft.from || !rangeDraft.to) return
    onChangeRange({
      startDate: toLocalDateKey(rangeDraft.from),
      endDate: toLocalDateKey(rangeDraft.to),
    })
    setOpen(false)
  }

  function selectDraftDay(day: Date) {
    if (!draft?.from || draft.to) {
      const nextDraft = { from: day, to: undefined }
      draftRef.current = nextDraft
      setDraft(nextDraft)
      return
    }

    if (day < draft.from) {
      const nextDraft = { from: day, to: draft.from }
      draftRef.current = nextDraft
      setDraft(nextDraft)
      commitRange(nextDraft)
      return
    }

    const nextDraft = { from: draft.from, to: day }
    draftRef.current = nextDraft
    setDraft(nextDraft)
    commitRange(nextDraft)
  }

  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
      <div className="grid grid-cols-3 rounded-lg border border-border bg-card p-1 sm:inline-flex">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => {
              const next = getPresetRange(preset.days)
              setDraft({
                from: parseDateKey(next.startDate) ?? undefined,
                to: parseDateKey(next.endDate) ?? undefined,
              })
              draftRef.current = {
                from: parseDateKey(next.startDate) ?? undefined,
                to: parseDateKey(next.endDate) ?? undefined,
              }
              onChangeRange(next)
            }}
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
            className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground transition-colors hover:bg-accent sm:min-w-[220px] sm:justify-start"
          >
            <CalendarDays className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 truncate">
              {formatRange(range.startDate, range.endDate)}
            </span>
            <ChevronDown
              className={`size-4 shrink-0 text-muted-foreground transition-transform ${
                open ? 'rotate-180' : ''
              }`}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align={isDesktop ? 'end' : 'center'}
          sideOffset={8}
          className="max-h-[min(82vh,680px)] w-[calc(100vw-1rem)] max-w-[430px] gap-0 overflow-hidden rounded-lg p-0 shadow-2xl sm:w-auto sm:max-w-[760px]"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="m-0 text-sm font-bold text-foreground">
              Custom range
            </p>
            <p className="m-0 mt-1 text-xs text-muted-foreground">
              {draftLabel}
            </p>
          </div>

          <div className="max-h-[min(58vh,500px)] overflow-y-auto">
            <Calendar
              mode="range"
              selected={draft}
              onSelect={() => undefined}
              onDayClick={selectDraftDay}
              numberOfMonths={isDesktop ? 2 : 1}
              defaultMonth={draft?.from ?? selected?.from}
              className="w-full bg-card p-3 [--cell-size:--spacing(11)]"
              classNames={{
                root: 'w-full',
                months: 'relative flex flex-col gap-4 sm:flex-row',
                month: 'flex w-full min-w-0 flex-col gap-4',
                day: 'group/day relative aspect-square size-full rounded-(--cell-radius) p-0 text-center select-none',
              }}
            />
          </div>

          <div className="flex flex-col gap-3 border-t border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-primary" />
                Selected
              </span>
              <span>Tap start date, then end date to apply</span>
            </div>
            <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault()
                applyRange()
              }}
              onClick={applyRange}
              disabled={!draft?.from || !draft.to}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
            >
              <Check className="size-4" />
              Apply
            </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
