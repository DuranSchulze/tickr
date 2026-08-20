import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '#/components/ui/button'
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
  eyebrow = 'Calendar',
  description = 'Toggle month or week, click a day to review tasks, then open a task for full details.',
  onChangeCalendar,
}: {
  month: string
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
    <section className="min-w-0 rounded-xl bg-card shadow-xs ring-1 ring-foreground/10">
      <div className="p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
              <CalendarDays className="size-3.5" />
              {eyebrow}
            </div>
            <h1 className="m-0 text-3xl font-black tracking-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            <p className="m-0 mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          </div>

          <div className="grid gap-2 sm:flex sm:items-center">
            <div className="grid grid-cols-2 rounded-md bg-muted p-1">
              {(['month', 'week'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => changeView(option)}
                  className={`h-8 rounded px-3 text-sm font-bold capitalize transition-colors ${
                    view === option
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-[40px_1fr_40px] items-center gap-2 sm:flex">
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                onClick={() => navigate(-1)}
                aria-label={`Previous ${view}`}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() =>
                  onChangeCalendar({
                    month: currentMonth,
                    date: currentDate,
                    view,
                  })
                }
                className="font-bold"
              >
                Today
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                onClick={() => navigate(1)}
                aria-label={`Next ${view}`}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
