import type { CalendarEntriesPayload } from '#/lib/server/tracker.server'
import { useTimeFormat } from '#/lib/time-tracker/useTimeFormat'
import { CalendarGrid } from './CalendarGrid'
import { CalendarHeader } from './CalendarHeader'
import type { CalendarView } from './calendar.utils'

export function CalendarScreen({
  calendar,
  view,
  selectedDate,
  eyebrow,
  description,
  onChangeCalendar,
}: {
  calendar: CalendarEntriesPayload
  view: CalendarView
  selectedDate: string
  eyebrow?: string
  description?: string
  onChangeCalendar: (next: {
    month: string
    view?: CalendarView
    date?: string
  }) => void
}) {
  const { formatTime } = useTimeFormat()

  return (
    <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-6">
      <CalendarHeader
        month={calendar.month}
        view={view}
        selectedDate={selectedDate}
        eyebrow={eyebrow}
        description={description}
        onChangeCalendar={onChangeCalendar}
      />
      <CalendarGrid
        month={calendar.month}
        view={view}
        selectedDate={selectedDate}
        member={calendar.member}
        timezone={calendar.timezone}
        entriesByDate={calendar.entriesByDate}
        formatTime={formatTime}
      />
    </div>
  )
}
