import type { ReactNode } from 'react'
import { useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Calendar } from '#/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import type { ViewMode } from '#/lib/time-tracker/types'

const VIEW_OPTIONS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
] as const satisfies readonly { value: ViewMode; label: string }[]

export function DashboardHeader({
  workspaceName,
  userName,
  userRoleName,
  view,
  onChangeView,
  selectedDate,
  selectedRangeLabel,
  onPreviousPeriod,
  onNextPeriod,
  onCurrentPeriod,
  onSelectDate,
  selectedTotalSeconds,
  formatTime,
  trailing,
}: {
  workspaceName: string
  userName: string
  userRoleName: string
  view: ViewMode
  onChangeView: (view: ViewMode) => void
  selectedDate: string
  selectedRangeLabel: string
  onPreviousPeriod: () => void
  onNextPeriod: () => void
  onCurrentPeriod: () => void
  onSelectDate: (dateKey: string) => void
  selectedTotalSeconds: number
  formatTime: (seconds: number) => string
  trailing?: ReactNode
}) {
  const [calendarOpen, setCalendarOpen] = useState(false)

  const [y, m, d] = selectedDate.split('-').map(Number)
  const selectedDateObj = new Date(y, m - 1, d)

  function handleCalendarSelect(day: Date | undefined) {
    if (!day) return
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    onSelectDate(key)
    setCalendarOpen(false)
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="m-0 text-sm font-semibold text-primary">
            {workspaceName}
          </p>
          <h1 className="m-0 mt-1 text-2xl font-bold tracking-tight text-foreground">
            Time Tracker
          </h1>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            {userName} · {userRoleName}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onPreviousPeriod}
              aria-label={`Previous ${view}`}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="min-w-0 rounded-lg border border-border bg-background px-2 py-1.5 text-left transition-colors hover:bg-accent sm:px-3 sm:py-2"
                  aria-label="Open calendar to pick a date"
                >
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="m-0 max-w-40 truncate text-sm font-semibold text-foreground sm:max-w-none">
                        {selectedRangeLabel}
                      </p>
                      <p className="m-0 max-w-40 truncate text-xs text-muted-foreground sm:max-w-none">
                        {selectedDate}
                      </p>
                    </div>
                  </div>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDateObj}
                  defaultMonth={selectedDateObj}
                  onSelect={handleCalendarSelect}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onNextPeriod}
              aria-label={`Next ${view}`}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCurrentPeriod}
            >
              Today
            </Button>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
          <div
            className="inline-flex overflow-hidden rounded-md border border-border bg-background p-1"
            role="group"
            aria-label="Time tracker view"
          >
            {VIEW_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={view === option.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onChangeView(option.value)}
                aria-pressed={view === option.value}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="w-full rounded-lg border border-border bg-muted px-4 py-3 text-left sm:w-auto sm:text-right">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {view} total
            </p>
            <p className="m-0 mt-1 text-2xl font-bold text-foreground">
              {formatTime(selectedTotalSeconds)}
            </p>
          </div>
        </div>
      </div>
      {trailing && (
        <div className="mt-4 min-w-0 overflow-x-hidden">{trailing}</div>
      )}
    </section>
  )
}
