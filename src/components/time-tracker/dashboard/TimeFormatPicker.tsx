import { TIME_FORMATS, FORMAT_LABELS } from '#/lib/time-tracker/time-format'
import type { TimeFormat } from '#/lib/time-tracker/time-format'

export function TimeFormatPicker({
  format,
  onChange,
}: {
  format: TimeFormat
  onChange: (f: TimeFormat) => void
}) {
  return (
    <select
      value={format}
      onChange={(e) => onChange(e.target.value as TimeFormat)}
      className="h-8 rounded-lg border border-border bg-card px-2 text-xs font-semibold text-foreground outline-none focus:border-primary"
      aria-label="Time display format"
    >
      {TIME_FORMATS.map((f) => (
        <option key={f} value={f}>
          {FORMAT_LABELS[f]}
        </option>
      ))}
    </select>
  )
}
