import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { TIME_FORMATS, FORMAT_LABELS } from '#/lib/time-tracker/time-format'
import type { TimeFormat } from '#/lib/time-tracker/time-format'
import { useTimeFormat } from '#/lib/time-tracker/useTimeFormat'

const FORMAT_EXAMPLES: Record<TimeFormat, string> = {
  precise: '01:30:45:12',
  clock: '01:30:45',
  decimal: '1.51h',
  human: '1h 30m',
}

export function TimeFormatDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { format, setFormat } = useTimeFormat()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Time display format</DialogTitle>
          <DialogDescription>
            Controls how durations appear across the dashboard and calendar.
            Stored in your browser.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-2">
          {TIME_FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm font-semibold transition-colors ${
                f === format
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-foreground hover:bg-accent'
              }`}
            >
              <span>{FORMAT_LABELS[f]}</span>
              <span
                className={`font-mono text-xs tabular-nums ${
                  f === format
                    ? 'text-primary-foreground/70'
                    : 'text-muted-foreground'
                }`}
              >
                {FORMAT_EXAMPLES[f]}
              </span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
