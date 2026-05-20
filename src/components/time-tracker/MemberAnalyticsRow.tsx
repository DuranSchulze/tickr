import { TableCell, TableRow } from '#/components/ui/table'
import { formatHours } from '#/lib/time-tracker/store'
import type { TrackerState } from '#/lib/time-tracker/types'
import type { MemberStat } from './MembersTable'

type Member = TrackerState['members'][number]

export function MemberAnalyticsRow({
  member,
  columnCount,
  stats,
  state,
}: {
  member: Member
  columnCount: number
  stats?: MemberStat
  state: TrackerState
}) {
  return (
    <TableRow className="border-t border-border bg-muted/40">
      <TableCell colSpan={columnCount} className="px-5 pb-5 pt-3">
        <p className="m-0 mb-3 text-xs font-bold uppercase tracking-wide text-primary">
          Analytics - {member.name}
        </p>

        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            {
              label: 'This week',
              value: formatHours(stats?.thisWeekSeconds ?? 0),
            },
            {
              label: 'This month',
              value: formatHours(stats?.thisMonthSeconds ?? 0),
            },
            {
              label: 'All time',
              value: formatHours(stats?.totalSeconds ?? 0),
            },
            {
              label: 'Billable',
              value: formatHours(stats?.billableSeconds ?? 0),
            },
            { label: 'Entries', value: String(stats?.entryCount ?? 0) },
          ].map((chip) => (
            <div
              key={chip.label}
              className="rounded-lg border border-border bg-card px-3 py-2.5"
            >
              <p className="m-0 text-xs text-muted-foreground">{chip.label}</p>
              <p className="m-0 mt-0.5 text-lg font-bold text-foreground">
                {chip.value}
              </p>
            </div>
          ))}
        </div>

        {stats && stats.topProjects.length > 0 ? (
          <div>
            <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Top projects
            </p>
            <div className="grid gap-2">
              {stats.topProjects.map(({ projectId, seconds }) => {
                const project = state.projects.find((p) => p.id === projectId)
                const pct =
                  stats.totalSeconds > 0
                    ? Math.round((seconds / stats.totalSeconds) * 100)
                    : 0
                return (
                  <div key={projectId} className="flex items-center gap-3">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: project?.color ?? '#94a3b8' }}
                    />
                    <span className="w-32 shrink-0 truncate text-sm text-foreground">
                      {project?.name ?? 'Unknown'}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                      <div
                        className="h-2 rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {formatHours(seconds)}
                    </span>
                    <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {pct}%
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="m-0 text-sm text-muted-foreground">
            No tracked entries yet.
          </p>
        )}
      </TableCell>
    </TableRow>
  )
}
