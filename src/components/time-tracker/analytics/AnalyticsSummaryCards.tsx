import { Clock3, DollarSign, ListChecks, Users } from 'lucide-react'
import type { AnalyticsPayload } from '#/lib/server/tracker.server'
import { formatHours } from './analytics.utils'

export function AnalyticsSummaryCards({
  summary,
}: {
  summary: AnalyticsPayload['summary']
}) {
  const cards = [
    {
      label: 'Total hours',
      value: formatHours(summary.totalSeconds),
      helper: 'Completed time',
      icon: Clock3,
    },
    {
      label: 'Billable',
      value: formatHours(summary.billableSeconds),
      helper: `${formatHours(summary.nonBillableSeconds)} non-billable`,
      icon: DollarSign,
    },
    {
      label: 'Entries',
      value: summary.entryCount.toLocaleString(),
      helper: 'Tracked tasks',
      icon: ListChecks,
    },
    ...(summary.activeMembers == null
      ? []
      : [
          {
            label: 'Active members',
            value: summary.activeMembers.toLocaleString(),
            helper: 'In this scope',
            icon: Users,
          },
        ]),
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <section
            key={card.label}
            className="rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {card.label}
                </p>
                <p className="m-0 mt-2 text-2xl font-black tracking-tight text-foreground">
                  {card.value}
                </p>
              </div>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="m-0 mt-3 text-sm font-medium text-muted-foreground">
              {card.helper}
            </p>
          </section>
        )
      })}
    </div>
  )
}
