import { useMemo, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { CalendarDays, Check, ChevronDown } from 'lucide-react'
import { Calendar } from '#/components/ui/calendar'
import type { AnalyticsRange } from './analytics.utils'
import { formatRange, parseDateKey, toDateKey } from './analytics.utils'

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
    startDate: toDateKey(start),
    endDate: toDateKey(end),
  }
}

export function AnalyticsDateRange({
  range,
  onChangeRange,
}: {
  range: AnalyticsRange
  onChangeRange: (range: AnalyticsRange) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = useMemo<DateRange | undefined>(() => {
    const from = parseDateKey(range.startDate)
    const to = parseDateKey(range.endDate)
    return from && to ? { from, to } : undefined
  }, [range.endDate, range.startDate])
  const [draft, setDraft] = useState<DateRange | undefined>(selected)

  function applyRange() {
    if (!draft?.from || !draft.to) return
    onChangeRange({
      startDate: toDateKey(draft.from),
      endDate: toDateKey(draft.to),
    })
    setOpen(false)
  }

  return (
    <div className="relative flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-lg border border-border bg-card p-1">
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
              onChangeRange(next)
            }}
            className="h-8 px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          setDraft(selected)
          setOpen((value) => !value)
        }}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-bold text-foreground transition-colors hover:bg-accent"
      >
        <CalendarDays className="h-4 w-4 text-primary" />
        {formatRange(range.startDate, range.endDate)}
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-20 w-[min(92vw,640px)] overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
          <div className="border-b border-border px-4 py-3">
            <p className="m-0 text-sm font-bold text-foreground">
              Custom range
            </p>
            <p className="m-0 mt-1 text-xs text-muted-foreground">
              Completed entries inside this range are included.
            </p>
          </div>
          <Calendar
            mode="range"
            selected={draft}
            onSelect={setDraft}
            numberOfMonths={2}
            className="max-w-full"
          />
          <div className="flex justify-end gap-2 border-t border-border p-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyRange}
              disabled={!draft?.from || !draft.to}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
            >
              <Check className="h-4 w-4" />
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
