import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Clock3, FolderKanban } from 'lucide-react'
import type { CalendarEntry } from '#/lib/server/tracker.server'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { CalendarDayCell } from './CalendarDayCell'
import { buildCalendarDays } from './calendar.utils'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const dateTimeFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function CalendarGrid({
  month,
  entriesByDate,
  formatTime,
}: {
  month: string
  entriesByDate: Record<string, CalendarEntry[]>
  formatTime: (seconds: number) => string
}) {
  const days = buildCalendarDays(month)
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntry | null>(null)
  const totalEntries = useMemo(
    () =>
      Object.values(entriesByDate).reduce(
        (count, entries) => count + entries.length,
        0,
      ),
    [entriesByDate],
  )

  return (
    <>
      <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3">
          <div className="min-w-0">
            <h2 className="m-0 text-base font-black text-foreground">
              Month schedule
            </h2>
            <p className="m-0 mt-0.5 text-xs font-medium text-muted-foreground">
              {totalEntries.toLocaleString()} task entr
              {totalEntries === 1 ? 'y' : 'ies'} in this month
            </p>
          </div>
          <div className="hidden items-center gap-2 text-xs font-bold text-muted-foreground sm:flex">
            <span className="size-2 rounded-full bg-primary" />
            Click a task for details
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[960px]">
            <div className="grid grid-cols-7 border-b border-border bg-muted/40">
              {weekdays.map((weekday) => (
                <div
                  key={weekday}
                  className="border-r border-border px-3 py-2 text-xs font-black uppercase tracking-wide text-muted-foreground last:border-r-0"
                >
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day, index) => (
                <div
                  key={day.dateKey}
                  className={`${index % 7 === 6 ? '[&>*]:border-r-0' : ''} ${
                    index >= 35 ? '[&>*]:border-b-0' : ''
                  }`}
                >
                  <CalendarDayCell
                    dateKey={day.dateKey}
                    dayNumber={day.dayNumber}
                    entries={entriesByDate[day.dateKey] ?? []}
                    isCurrentMonth={day.isCurrentMonth}
                    isToday={day.isToday}
                    formatTime={formatTime}
                    onSelectEntry={setSelectedEntry}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <CalendarEntryDialog
        entry={selectedEntry}
        formatTime={formatTime}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null)
        }}
      />
    </>
  )
}

function CalendarEntryDialog({
  entry,
  formatTime,
  onOpenChange,
}: {
  entry: CalendarEntry | null
  formatTime: (seconds: number) => string
  onOpenChange: (open: boolean) => void
}) {
  const description = entry?.description.trim() || 'No description'
  const startedAt = entry ? formatDateTime(entry.startedAt) : ''
  const endedAt = entry?.endedAt ? formatDateTime(entry.endedAt) : 'Running'

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8 text-xl font-black leading-7">
                {description}
              </DialogTitle>
              <DialogDescription>
                Full details for this tracked task entry.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-1 size-3 shrink-0 rounded-full bg-primary"
                    style={
                      entry.project?.color
                        ? { backgroundColor: entry.project.color }
                        : undefined
                    }
                  />
                  <div className="min-w-0">
                    <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Project
                    </p>
                    <p className="m-0 mt-1 text-sm font-black text-foreground">
                      {entry.project?.name ?? 'No project'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <DetailItem
                  icon={<Clock3 className="size-4" />}
                  label="Started"
                  value={startedAt}
                />
                <DetailItem
                  icon={<Clock3 className="size-4" />}
                  label={entry.endedAt ? 'Ended' : 'Status'}
                  value={endedAt}
                />
                <DetailItem
                  icon={<FolderKanban className="size-4" />}
                  label="Duration"
                  value={
                    entry.endedAt === null
                      ? `${formatTime(entry.durationSeconds)} so far`
                      : formatTime(entry.durationSeconds)
                  }
                />
                <DetailItem
                  icon={<FolderKanban className="size-4" />}
                  label="Entry ID"
                  value={entry.id}
                />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="m-0 mt-2 break-words text-sm font-bold text-foreground">
        {value}
      </p>
    </div>
  )
}

function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value))
}
