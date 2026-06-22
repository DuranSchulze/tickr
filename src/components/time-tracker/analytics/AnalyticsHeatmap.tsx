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

  const projectItems = projectTotals.slice(0, 5).map((project) => ({
    id: project.projectId,
    name: project.name,
    color: project.color,
    meta: 'Project',
    seconds: project.seconds,
  }))
  const tagItems = topTags.map((tag) => ({
    id: tag.tagId,
    name: tag.name,
    color: tag.color,
    meta: `${tag.entryCount} entries`,
    seconds: tag.seconds,
  }))
  const departmentItems = topDepartments.map((department) => ({
    id: department.departmentId,
    name: department.name,
    color: department.color,
    meta: `${department.memberCount} members`,
    seconds: department.seconds,
  }))
  const taskItems = topTasks.map((task, index) => ({
    id: `${task.description}-${index}`,
    name: task.description,
    meta: `${task.entryCount} entries`,
    seconds: task.seconds,
  }))

  return (
    <div className="grid min-w-0 gap-4">
      <section className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="m-0 text-base font-black text-foreground">
            Activity heatmap
          </h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            Darker cells mean more completed tracked time.
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(14px,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(18px,1fr))] sm:gap-1.5">
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
        <div className="mt-4 flex flex-wrap items-center justify-end gap-1 text-xs font-semibold text-muted-foreground">
          <span>Less</span>
          {intensityStyles.map((_, index) => (
            <span
              key={`intensity-${index}`}
              className={`size-3 rounded-[3px] border border-border/60 ${intensityStyles[index]}`}
              title={`Level ${index}`}
            />
          ))}
          <span>More</span>
        </div>
      </section>

      {showTaskRankings ? (
        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          <RankingPanel
            title="Top tasks"
            subtitle="Most-tracked descriptions in this range."
            emptyLabel="Tasks will show here after entries are completed."
            items={taskItems}
            className="lg:col-span-3"
          />
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 lg:grid-cols-3">
          <RankingPanel
            title="Most projects"
            subtitle="Projects with the highest tracked hours."
            emptyLabel="Projects will show here after entries are completed."
            items={projectItems}
          />
          <RankingPanel
            title="Most tags"
            subtitle="Tags used most often by tracked hours."
            emptyLabel="Tags will show here after entries are completed."
            items={tagItems}
          />
          <RankingPanel
            title="Most departments"
            subtitle="Department totals for the selected range."
            emptyLabel="Departments will show here after entries are completed."
            items={departmentItems}
          />
        </div>
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
  className,
}: {
  title: string
  subtitle: string
  emptyLabel: string
  items: RankingItem[]
  className?: string
}) {
  return (
    <section
      className={`min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm ${className ?? ''}`}
    >
      <div className="mb-4">
        <h2 className="m-0 text-base font-black text-foreground">{title}</h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <RankingRows emptyLabel={emptyLabel} items={items} />
    </section>
  )
}

function RankingRows({
  emptyLabel,
  items,
}: {
  emptyLabel: string
  items: RankingItem[]
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-background p-6 text-center text-sm font-semibold text-muted-foreground">
        {emptyLabel}
      </div>
    )
  }

  const maxSeconds = Math.max(...items.map((item) => item.seconds), 1)

  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <div
          key={item.id}
          className="grid min-w-0 gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5"
        >
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    item.color ?? `hsl(${(index * 72 + 210) % 360} 70% 48%)`,
                }}
              />
              <p
                className="m-0 truncate text-sm font-bold text-foreground"
                title={item.name}
              >
                {item.name}
              </p>
              <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                {item.meta}
              </p>
            </div>
            <span className="shrink-0 text-right text-sm font-black text-primary">
              {formatHours(item.seconds)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${Math.max(6, (item.seconds / maxSeconds) * 100)}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}
