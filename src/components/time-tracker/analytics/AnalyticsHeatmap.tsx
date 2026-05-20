import type { AnalyticsPayload } from '#/lib/server/tracker.server'
import { formatChartDate, formatHours } from './analytics.utils'

const intensityStyles = [
  'bg-muted',
  'bg-primary/20',
  'bg-primary/35',
  'bg-primary/55',
  'bg-primary/80',
]

export function AnalyticsHeatmap({
  heatmap,
  projectTotals,
  topTasks,
  topTags,
  topDepartments,
  selectedScope,
}: {
  heatmap: AnalyticsPayload['heatmap']
  projectTotals: AnalyticsPayload['projectTotals']
  topTasks: AnalyticsPayload['topTasks']
  topTags: AnalyticsPayload['topTags']
  topDepartments: AnalyticsPayload['topDepartments']
  selectedScope: AnalyticsPayload['selectedScope']
}) {
  const showTaskRankings = selectedScope === 'personal'

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="m-0 text-base font-black text-foreground">
            Activity heatmap
          </h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            Darker cells mean more completed tracked time.
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(18px,1fr))] gap-1.5">
          {heatmap.map((day) => (
            <div
              key={day.date}
              title={`${formatChartDate(day.date)}: ${formatHours(day.seconds)}`}
              className={`aspect-square rounded-[4px] border border-border/60 ${
                intensityStyles[day.intensity] ?? intensityStyles[0]
              }`}
            />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-end gap-1 text-xs font-semibold text-muted-foreground">
          <span>Less</span>
          {intensityStyles.map((className, index) => (
            <span
              key={className}
              className={`h-3 w-3 rounded-[3px] border border-border/60 ${className}`}
              title={`Level ${index}`}
            />
          ))}
          <span>More</span>
        </div>
      </section>

      {showTaskRankings ? (
        <RankingPanel
          title="Top tasks"
          subtitle="Most-tracked descriptions in this range."
          emptyLabel="Tasks will show here after entries are completed."
          items={topTasks.map((task) => ({
            id: task.description,
            name: task.description,
            meta: `${task.entryCount} entries`,
            seconds: task.seconds,
          }))}
        />
      ) : (
        <section className="grid gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <RankingList
            title="Most projects"
            emptyLabel="Projects will show here after entries are completed."
            items={projectTotals.slice(0, 5).map((project) => ({
              id: project.projectId,
              name: project.name,
              color: project.color,
              meta: 'Project',
              seconds: project.seconds,
            }))}
          />
          <RankingList
            title="Most tags"
            emptyLabel="Tags will show here after entries are completed."
            items={topTags.map((tag) => ({
              id: tag.tagId,
              name: tag.name,
              color: tag.color,
              meta: `${tag.entryCount} entries`,
              seconds: tag.seconds,
            }))}
          />
          <RankingList
            title="Most departments"
            emptyLabel="Departments will show here after entries are completed."
            items={topDepartments.map((department) => ({
              id: department.departmentId,
              name: department.name,
              color: department.color,
              meta: `${department.memberCount} members`,
              seconds: department.seconds,
            }))}
          />
        </section>
      )}
    </div>
  )
}

type RankingItem = {
  id: string
  name: string
  meta: string
  seconds: number
  color?: string
}

function RankingPanel({
  title,
  subtitle,
  emptyLabel,
  items,
}: {
  title: string
  subtitle: string
  emptyLabel: string
  items: RankingItem[]
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="m-0 text-base font-black text-foreground">{title}</h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <RankingRows emptyLabel={emptyLabel} items={items} />
    </section>
  )
}

function RankingList({
  title,
  emptyLabel,
  items,
}: {
  title: string
  emptyLabel: string
  items: RankingItem[]
}) {
  return (
    <div>
      <h2 className="m-0 mb-2 text-sm font-black text-foreground">{title}</h2>
      <RankingRows emptyLabel={emptyLabel} items={items} compact />
    </div>
  )
}

function RankingRows({
  emptyLabel,
  items,
  compact = false,
}: {
  emptyLabel: string
  items: RankingItem[]
  compact?: boolean
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2 ${
            compact ? 'min-h-12' : 'min-h-14'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            {item.color && (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
            )}
            <div className="min-w-0">
              <p className="m-0 truncate text-sm font-bold text-foreground">
                {item.name}
              </p>
              <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                {item.meta}
              </p>
            </div>
          </div>
          <span className="shrink-0 text-sm font-black text-primary">
            {formatHours(item.seconds)}
          </span>
        </div>
      ))}
    </div>
  )
}
