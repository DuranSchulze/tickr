import type { CalendarEntriesPayload } from '#/lib/server/tracker.server'
import { useTimeFormat } from '#/lib/time-tracker/useTimeFormat'
import { CalendarGrid } from './CalendarGrid'
import { CalendarHeader } from './CalendarHeader'

export function CalendarScreen({
  calendar,
  onChangeMonth,
}: {
  calendar: CalendarEntriesPayload
  onChangeMonth: (month: string) => void
}) {
  const { formatTime } = useTimeFormat(calendar.workspaceId)

  return (
    <div className="mx-auto grid w-full max-w-7xl gap-5">
      <CalendarHeader month={calendar.month} onChangeMonth={onChangeMonth} />
      <CalendarGrid
        month={calendar.month}
        entriesByDate={calendar.entriesByDate}
        formatTime={formatTime}
      />
    </div>
  )
}
