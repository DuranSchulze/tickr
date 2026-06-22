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

export function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0 && m === 0) return '0m'
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
