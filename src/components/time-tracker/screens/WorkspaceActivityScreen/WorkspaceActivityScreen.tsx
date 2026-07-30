import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { RefreshCw, Search, X } from 'lucide-react'
import { BulkExportButton } from '#/components/time-tracker/shared/BulkExportDialog'
import { getTrackerStateLiteFn } from '#/lib/server/tracker'
import {
  fetchWorkspaceActivity,
  getWorkspaceActivityQueryKey,
} from '#/lib/time-tracker/workspace-activity-query'
import { Page } from '../shared/Page'
import { MemberActivityCard } from './MemberActivityCard'
import type {
  WorkspaceActivityPayload,
  WorkspaceMemberActivity,
} from '#/lib/server/tracker/activity.server'
import type { FormEvent } from 'react'

const POLL_INTERVAL = 30_000

type ActivityFilters = {
  departmentId?: string
  q?: string
}

function sortMembers(
  members: WorkspaceMemberActivity[],
): WorkspaceMemberActivity[] {
  const online = members
    .filter((m) => m.activeEntry !== null)
    .sort((a, b) => a.name.localeCompare(b.name))
  const offline = members
    .filter((m) => m.activeEntry === null)
    .sort((a, b) => a.name.localeCompare(b.name))
  return [...online, ...offline]
}

export function WorkspaceActivityScreen({
  initialActivity,
  currentFilters,
  onChangeFilters,
}: {
  initialActivity: WorkspaceActivityPayload
  currentFilters: ActivityFilters
  onChangeFilters: (filters: ActivityFilters) => void
}) {
  const {
    data: activity = initialActivity,
    dataUpdatedAt,
    isFetching,
  } = useQuery({
    queryKey: getWorkspaceActivityQueryKey(currentFilters),
    queryFn: () => fetchWorkspaceActivity(currentFilters),
    initialData: initialActivity,
    staleTime: 0,
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: false,
  })

  // Workspace catalogs (clients/departments/tags) for the bulk export dialog.
  const { data: trackerState } = useQuery({
    queryKey: ['tracker-state-lite'],
    queryFn: () => getTrackerStateLiteFn(),
    staleTime: 5 * 60 * 1000,
  })

  const members = activity.members
  const sorted = sortMembers(members)
  const onlineCount = members.filter((m) => m.activeEntry !== null).length
  const total = members.length
  const canFilterDepartments = activity.canFilterDepartments
  const filters = activity.filters

  const lastRefreshed = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const q = String(formData.get('q') ?? '').trim()
    onChangeFilters({
      departmentId: filters.departmentId || undefined,
      q: q || undefined,
    })
  }

  function clearSearch() {
    onChangeFilters({
      departmentId: filters.departmentId || undefined,
      q: undefined,
    })
  }

  return (
    <Page title="Team Activity" eyebrow="Analytics">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {onlineCount} online
          </span>
          {' · '}
          {total} total members
        </p>
        <div className="flex items-center gap-2">
          {trackerState && <BulkExportButton state={trackerState} />}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <RefreshCw
              className={`size-3 ${isFetching ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {lastRefreshed && <span>Updated {lastRefreshed}</span>}
          </div>
        </div>
      </div>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div
          className={`grid gap-3 ${
            canFilterDepartments
              ? 'md:grid-cols-[minmax(180px,260px)_minmax(240px,1fr)]'
              : 'md:grid-cols-[minmax(240px,1fr)]'
          } md:items-end`}
        >
          {canFilterDepartments && (
            <div className="min-w-0 flex flex-col gap-1">
              <label
                htmlFor="activity-department-filter"
                className="text-xs font-semibold text-muted-foreground"
              >
                Department
              </label>
              <select
                id="activity-department-filter"
                value={filters.departmentId}
                onChange={(event) =>
                  onChangeFilters({
                    departmentId: event.target.value || undefined,
                    q: filters.q || undefined,
                  })
                }
                className="h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="">All departments</option>
                {activity.departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <form
            key={filters.q}
            onSubmit={applySearch}
            className="min-w-0 flex flex-col gap-1"
          >
            <label
              htmlFor="activity-member-search"
              className="text-xs font-semibold text-muted-foreground"
            >
              Name or email
            </label>
            <div className="flex min-w-0 gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="activity-member-search"
                  name="q"
                  type="search"
                  defaultValue={filters.q}
                  placeholder="Search members"
                  className="h-10 w-full min-w-0 rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              {filters.q && (
                <button
                  type="button"
                  onClick={clearSearch}
                  title="Clear search"
                  aria-label="Clear search"
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
              <button
                type="submit"
                className="h-10 shrink-0 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Search
              </button>
            </div>
          </form>
        </div>
      </section>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active members found.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((member) => (
            <MemberActivityCard
              key={member.memberId}
              member={member}
              viewDataAction={
                <Link
                  to="/app/reports"
                  search={{
                    memberIds: member.memberId,
                    departmentId: canFilterDepartments
                      ? (member.departmentId ?? undefined)
                      : undefined,
                  }}
                  className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground no-underline transition-colors hover:bg-accent"
                >
                  View Data
                </Link>
              }
            />
          ))}
        </div>
      )}
    </Page>
  )
}
