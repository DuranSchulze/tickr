import type { ReactNode } from 'react'
import { BarChart2, Clock, DollarSign, UserPlus } from 'lucide-react'
import type { MemberStat } from './MembersTable'
import { formatHours } from '#/lib/time-tracker/store'

type WorkspaceSummary = {
  thisWeekSeconds: number
  totalSeconds: number
  billableSeconds: number
  entryCount: number
}

export function getWorkspaceMembersSummary(
  memberStats: MemberStat[],
): WorkspaceSummary | null {
  if (memberStats.length === 0) return null

  return memberStats.reduce(
    (acc, stat) => ({
      thisWeekSeconds: acc.thisWeekSeconds + stat.thisWeekSeconds,
      totalSeconds: acc.totalSeconds + stat.totalSeconds,
      billableSeconds: acc.billableSeconds + stat.billableSeconds,
      entryCount: acc.entryCount + stat.entryCount,
    }),
    {
      thisWeekSeconds: 0,
      totalSeconds: 0,
      billableSeconds: 0,
      entryCount: 0,
    },
  )
}

export function WorkspaceMembersSummary({
  summary,
}: {
  summary: WorkspaceSummary
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <AnalyticCard
        icon={<Clock className="h-4 w-4" />}
        label="This week"
        value={formatHours(summary.thisWeekSeconds)}
      />
      <AnalyticCard
        icon={<BarChart2 className="h-4 w-4" />}
        label="Total tracked"
        value={formatHours(summary.totalSeconds)}
      />
      <AnalyticCard
        icon={<DollarSign className="h-4 w-4" />}
        label="Billable"
        value={formatHours(summary.billableSeconds)}
      />
      <AnalyticCard
        icon={<UserPlus className="h-4 w-4" />}
        label="Total entries"
        value={String(summary.entryCount)}
      />
    </div>
  )
}

function AnalyticCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="m-0 text-2xl font-bold text-foreground">{value}</p>
    </div>
  )
}
