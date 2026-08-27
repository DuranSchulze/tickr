import { TIME_FORMATS, FORMAT_LABELS } from '#/lib/time-tracker/time-format'
import type { TimeFormat } from '#/lib/time-tracker/time-format'
import { useTimeFormat } from '#/lib/time-tracker/useTimeFormat'
import { cn } from '#/lib/utils'

const FORMAT_EXAMPLES: Record<TimeFormat, string> = {
  precise: '01:30:45:12',
  clock: '01:30:45',
  'hours-minutes': '01:30',
  decimal: '1.51h',
  human: '1h 30m',
}

/**
 * The time display format picker without any dialog chrome, so it can be
 * embedded in a dialog or settings card.
 */
export function TimeFormatControls() {
  const { format, setFormat } = useTimeFormat()

  return (
    <div>
      <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Time display format
      </p>
      <div
        role="radiogroup"
        aria-label="Time display format"
        className="grid gap-2"
      >
        {TIME_FORMATS.map((f) => {
          const isActive = f === format
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => setFormat(f)}
              className={cn(
                'flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-foreground hover:bg-accent',
              )}
            >
              <span>{FORMAT_LABELS[f]}</span>
              <span
                className={cn(
                  'font-mono text-xs tabular-nums',
                  isActive
                    ? 'text-primary-foreground/70'
                    : 'text-muted-foreground',
                )}
              >
                {FORMAT_EXAMPLES[f]}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
