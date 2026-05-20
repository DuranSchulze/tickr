import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { addMonths, formatMonthTitle, toMonthKey } from './calendar.utils'

export function CalendarHeader({
  month,
  onChangeMonth,
}: {
  month: string
  onChangeMonth: (month: string) => void
}) {
  const currentMonth = toMonthKey(new Date())

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary">
            <CalendarDays className="h-3.5 w-3.5" />
            Calendar
          </div>
          <h1 className="m-0 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            {formatMonthTitle(month)}
          </h1>
          <p className="m-0 mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Review your completed tracked work by month.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChangeMonth(addMonths(month, -1))}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onChangeMonth(currentMonth)}
            className="h-10 rounded-md border border-border px-4 text-sm font-bold text-foreground transition-colors hover:bg-accent"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => onChangeMonth(addMonths(month, 1))}
            className="flex h-10 w-10 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  )
}
