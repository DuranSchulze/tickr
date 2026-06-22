import {
  departmentChartColors,
  formatHours,
} from './DepartmentChartUtils'

function formatDateLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}

export function DepartmentDailyChart({
  dailyTotals,
}: {
  dailyTotals: Array<{
    date: string
    seconds: number
    billableSeconds: number
    nonBillableSeconds: number
  }>
}) {
  const maxSeconds = Math.max(...dailyTotals.map((day) => day.seconds), 1)

  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="m-0 text-base font-bold text-foreground">Daily Hours</h2>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">
          Billable and non-billable department hours per day
        </p>
      </div>

      <div className="grid gap-3 p-4">
        {dailyTotals.map((day) => {
          const totalWidth = Math.max(4, (day.seconds / maxSeconds) * 100)
          const billableShare =
            day.seconds === 0 ? 0 : (day.billableSeconds / day.seconds) * 100
          const nonBillableShare = 100 - billableShare

          return (
            <div
              key={day.date}
              className="grid min-w-0 gap-2 sm:grid-cols-[88px_minmax(0,1fr)_92px] sm:items-center"
            >
              <div>
                <p className="m-0 text-xs font-bold text-foreground">
                  {formatDateLabel(day.date)}
                </p>
                <p className="m-0 text-[11px] text-muted-foreground">
                  {day.date}
                </p>
              </div>
              <div className="h-4 min-w-0 overflow-hidden rounded-full bg-muted">
                <div
                  className="flex h-full overflow-hidden rounded-full"
                  style={{ width: `${totalWidth}%` }}
                  title={`Billable ${formatHours(day.billableSeconds)} · Non-billable ${formatHours(day.nonBillableSeconds)}`}
                >
                  {day.billableSeconds > 0 && (
                    <div
                      className="h-full"
                      style={{
                        width: `${billableShare}%`,
                        backgroundColor: departmentChartColors.billable,
                      }}
                    />
                  )}
                  {day.nonBillableSeconds > 0 && (
                    <div
                      className="h-full"
                      style={{
                        width: `${nonBillableShare}%`,
                        backgroundColor: departmentChartColors.nonBillable,
                      }}
                    />
                  )}
                </div>
              </div>
              <p className="m-0 text-right text-xs font-mono font-semibold text-foreground">
                {formatHours(day.seconds)}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
