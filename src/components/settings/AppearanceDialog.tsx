import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { ThemeControls } from './ThemeSection'
import { TimeFormatControls } from './TimeFormatControls'
import { useTimeFormat } from '#/lib/time-tracker/useTimeFormat'

const PREVIEW_BARS = [30, 52, 38, 68, 46, 84, 58, 40, 74, 28]

// Sample durations shown in the live preview, formatted with the picked
// time display format (6h 42m today, 28h 10m this week).
const PREVIEW_TODAY_SECONDS = 6 * 3600 + 42 * 60
const PREVIEW_WEEK_SECONDS = 28 * 3600 + 10 * 60

export function AppearanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90dvh] max-h-[900px] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:h-[86dvh] sm:max-w-7xl">
        <DialogHeader className="shrink-0 gap-1 border-b border-stone px-5 py-4 pr-14 sm:px-6">
          <DialogTitle className="text-xl font-black tracking-tight text-foreground">
            Appearance
          </DialogTitle>
          <DialogDescription>
            Choose your mode, accent color, font, and time format. Changes apply
            instantly and are saved on this device.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[300px_minmax(0,1fr)]">
          <div className="shrink-0 overflow-y-auto border-b border-stone p-5 md:border-r md:border-b-0 md:p-6">
            <ThemeControls />
            <div className="mt-6 border-t border-stone pt-6">
              <TimeFormatControls />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-warm-taupe/40 p-5 md:p-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="m-0 text-xs font-bold uppercase tracking-[0.18em] text-smoke">
                Live preview
              </p>
              <span className="text-xs text-smoke">Updates as you pick</span>
            </div>
            <ThemePreview />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ThemePreview() {
  // The picked font applies via the [data-font] CSS variables, so the preview
  // uses them explicitly: var(--font-sans) for body text and var(--font-heading)
  // for headings, and formatTime() so durations follow the picked time format.
  const { formatTime } = useTimeFormat()

  return (
    <div
      className="overflow-hidden rounded-xl border border-stone bg-eggshell shadow-[var(--shadow-whisper)]"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 border-b border-stone/70 bg-eggshell px-3 py-2">
        <span className="size-2.5 rounded-full bg-red-400/80" />
        <span className="size-2.5 rounded-full bg-amber-400/80" />
        <span className="size-2.5 rounded-full bg-emerald-400/80" />
        <div className="ml-2 h-3 flex-1 rounded bg-warm-taupe" />
      </div>

      {/* Mini navbar */}
      <div className="flex items-center gap-2 border-b border-stone/70 bg-eggshell px-3 py-2">
        <span className="flex size-4 items-center justify-center rounded bg-primary-action text-[8px] font-black text-primary-action-foreground">
          T
        </span>
        <span className="h-2 w-14 rounded bg-warm-taupe" />
        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden h-4 w-16 rounded-full bg-warm-taupe/70 sm:block" />
          <span className="size-4 rounded-full bg-warm-taupe" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Mini sidebar */}
        <div className="w-24 shrink-0 space-y-1 border-r border-stone/70 bg-eggshell p-2">
          <div className="rounded-full bg-stone px-2 py-1 text-[9px] font-bold text-foreground">
            Timer
          </div>
          <div className="rounded-full px-2 py-1 text-[9px] font-semibold text-smoke">
            Calendar
          </div>
          <div className="rounded-full px-2 py-1 text-[9px] font-semibold text-smoke">
            Analytics
          </div>
          <div className="rounded-full px-2 py-1 text-[9px] font-semibold text-smoke">
            Reports
          </div>
          <div className="rounded-full px-2 py-1 text-[9px] font-semibold text-smoke">
            Settings
          </div>
        </div>

        {/* Content preview */}
        <div className="min-w-0 flex-1 space-y-2.5 p-3">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.18em] text-primary">
            <span className="size-1.5 rounded-full bg-primary" />
            Overview
          </div>

          <p
            className="m-0 font-heading text-sm font-black tracking-tight text-foreground"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Time tracker
          </p>
          <p className="m-0 text-[10px] leading-4 text-smoke">
            Log work, review your day, and keep every project moving.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-stone bg-eggshell p-2.5 shadow-[var(--shadow-whisper)]">
              <p className="m-0 text-[9px] font-bold uppercase tracking-wide text-smoke">
                Today
              </p>
              <p
                className="m-0 mt-0.5 font-heading text-base font-black tabular-nums text-foreground"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {formatTime(PREVIEW_TODAY_SECONDS)}
              </p>
            </div>
            <div className="rounded-xl border border-stone bg-eggshell p-2.5 shadow-[var(--shadow-whisper)]">
              <p className="m-0 text-[9px] font-bold uppercase tracking-wide text-smoke">
                This week
              </p>
              <p
                className="m-0 mt-0.5 font-heading text-base font-black tabular-nums text-foreground"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {formatTime(PREVIEW_WEEK_SECONDS)}
              </p>
            </div>
          </div>

          <div className="flex gap-1.5">
            <span className="rounded-full bg-primary-action px-2.5 py-1 text-[9px] font-bold text-primary-action-foreground">
              Start timer
            </span>
            <span className="rounded-full border border-stone bg-eggshell px-2.5 py-1 text-[9px] font-semibold text-foreground">
              Add entry
            </span>
          </div>

          <div className="flex h-16 items-end gap-1 rounded-xl border border-stone bg-eggshell p-2 shadow-[var(--shadow-whisper)]">
            {PREVIEW_BARS.map((height, index) => (
              <div
                key={index}
                className="flex-1 rounded-sm"
                style={{
                  height: `${height}%`,
                  backgroundColor:
                    index === 5 ? 'var(--primary)' : 'var(--muted)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
