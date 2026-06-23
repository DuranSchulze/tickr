import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  addMonths,
  addWeeks,
  formatMonthTitle,
  formatWeekTitle,
  toMonthKey,
} from './calendar.utils'
import type { CalendarView } from './calendar.utils'

export function CalendarHeader({
  month,
  view,
  selectedDate,
  onChangeCalendar,
}: {
  month: string
  view: CalendarView
  selectedDate: string
  onChangeCalendar: (next: {
    month: string
    view?: CalendarView
    date?: string
  }) => void
}) {
  const today = new Date()
  const currentMonth = toMonthKey(today)
  const currentDate = today.toISOString().slice(0, 10)
  const title =
    view === 'week' ? formatWeekTitle(selectedDate) : formatMonthTitle(month)

  function navigate(amount: -1 | 1) {
    if (view === 'week') {
      const date = addWeeks(selectedDate, amount)
      onChangeCalendar({ month: date.slice(0, 7), date, view })
      return
    }
    const nextMonth = addMonths(month, amount)
    onChangeCalendar({ month: nextMonth, date: `${nextMonth}-01`, view })
  }

  function changeView(nextView: CalendarView) {
    onChangeCalendar({
      month: selectedDate.slice(0, 7),
      date: selectedDate,
      view: nextView,
    })
  }

  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="h-1 bg-primary" />
      <div className="p-4 sm:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary">
              <CalendarDays className="size-3.5" />
              Calendar
            </div>
            <h1 className="m-0 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            <p className="m-0 mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Toggle month or week, click a day to review tasks, then open a
              task for full details.
            </p>
          </div>

          <div className="grid gap-2 sm:flex sm:items-center">
            <div className="grid grid-cols-2 rounded-md border border-border bg-background p-1">
              {(['month', 'week'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => changeView(option)}
                  className={`h-8 rounded px-3 text-sm font-bold capitalize transition-colors ${
                    view === option
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-[40px_1fr_40px] items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex size-10 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={`Previous ${view}`}
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() =>
                  onChangeCalendar({
                    month: currentMonth,
                    date: currentDate,
                    view,
                  })
                }
                className="h-10 rounded-md border border-border px-4 text-sm font-bold text-foreground transition-colors hover:bg-accent"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => navigate(1)}
                className="flex size-10 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label={`Next ${view}`}
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
