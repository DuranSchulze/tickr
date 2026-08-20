export const departmentChartColors = {
  billable: '#16a34a',
  nonBillable: '#94a3b8',
}

export function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 text-center text-sm font-semibold text-muted-foreground sm:h-[260px]">
      {label}
    </div>
  )
}

export { formatDuration } from '#/lib/time-tracker/store'
