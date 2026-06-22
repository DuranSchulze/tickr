import type { DepartmentDashboard } from '#/lib/server/tracker/department-dashboard.server'
import { EmptyChart, formatHours } from './DepartmentChartUtils'

type TopTag = DepartmentDashboard['topTags'][number]

export function DepartmentTopTagsChart({ tags }: { tags: TopTag[] }) {
  const maxSeconds = Math.max(...tags.map((tag) => tag.seconds), 1)

  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="m-0 text-base font-bold text-foreground">Top Tags</h2>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">
          Tags with the highest tracked hours
        </p>
      </div>

      <div className="p-4">
        {tags.length === 0 ? (
          <EmptyChart label="Tags will appear after tagged entries are completed." />
        ) : (
          <div className="grid gap-3">
            {tags.map((tag) => {
              const width = Math.max(5, (tag.seconds / maxSeconds) * 100)
              return (
                <div
                  key={tag.tagId}
                  className="grid min-w-0 gap-2 sm:grid-cols-[160px_minmax(0,1fr)_88px] sm:items-center"
                  title={`${tag.name}: ${formatHours(tag.seconds)}`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <p className="m-0 truncate text-sm font-bold text-foreground">
                      {tag.name}
                    </p>
                  </div>
                  <div className="h-4 min-w-0 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${width}%`,
                        backgroundColor: tag.color,
                      }}
                    />
                  </div>
                  <p className="m-0 text-right text-xs font-mono font-semibold text-foreground">
                    {formatHours(tag.seconds)}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
