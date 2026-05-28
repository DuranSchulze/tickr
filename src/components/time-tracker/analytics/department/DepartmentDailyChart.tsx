import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

function formatHoursShort(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)}h`
}

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
  dailyTotals: Array<{ date: string; seconds: number }>
}) {
  const data = dailyTotals.map((d) => ({
    date: formatDateLabel(d.date),
    hours: parseFloat((d.seconds / 3600).toFixed(2)),
  }))

  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="m-0 text-base font-bold text-foreground">Daily Hours</h2>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">
          Total department hours per day
        </p>
      </div>
      <div className="h-[220px] px-2 py-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ left: 0, right: 8, top: 4, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={formatHoursShort}
              width={40}
            />
            <Tooltip
              formatter={(value) => [`${value}h`, 'Hours']}
              contentStyle={{
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Bar dataKey="hours" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
