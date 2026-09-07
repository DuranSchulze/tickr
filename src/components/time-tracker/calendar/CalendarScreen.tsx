import type {
  CalendarEntriesPayload,
  CalendarMemberOption,
} from '#/lib/server/tracker.server'
import { useTimeFormat } from '#/lib/time-tracker/useTimeFormat'
import { CalendarGrid } from './CalendarGrid'
import { CalendarHeader } from './CalendarHeader'
import { CalendarMemberSwitcher } from './CalendarMemberSwitcher'
import type { CalendarView } from './calendar.utils'

const EMPTY_MEMBER_OPTIONS: CalendarMemberOption[] = []

export function CalendarScreen({
  calendar,
  view,
  selectedDate,
  eyebrow,
  description,
  memberOptions = EMPTY_MEMBER_OPTIONS,
  currentMemberId,
  onChangeMember,
  onChangeCalendar,
}: {
  calendar: CalendarEntriesPayload
  view: CalendarView
  selectedDate: string
  eyebrow?: string
  description?: string
  memberOptions?: CalendarMemberOption[]
  currentMemberId?: string
  onChangeMember?: (memberId: string) => void
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
      {memberOptions.length > 0 && currentMemberId && onChangeMember && (
        <CalendarMemberSwitcher
          members={memberOptions}
          selectedMemberId={calendar.member.id}
          currentMemberId={currentMemberId}
          onChange={onChangeMember}
        />
      )}
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
