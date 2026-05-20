import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { Page } from '../shared/Page'
import { MemberActivityCard } from './MemberActivityCard'
import { getWorkspaceActivityFn } from '#/lib/server/tracker'
import type { WorkspaceMemberActivity } from '#/lib/server/tracker/activity.server'

const POLL_INTERVAL = 30_000

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

export function WorkspaceActivityScreen() {
  const {
    data: members = [],
    dataUpdatedAt,
    isFetching,
  } = useQuery({
    queryKey: ['workspace-activity'],
    queryFn: () => getWorkspaceActivityFn(),
    staleTime: 0,
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: false,
  })

  const sorted = sortMembers(members)
  const onlineCount = members.filter((m) => m.activeEntry !== null).length
  const total = members.length

  const lastRefreshed = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null

  return (
    <Page title="Team Activity" eyebrow="Owner / Admin">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
            {onlineCount} online
          </span>
          {' · '}
          {total} total members
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <RefreshCw
            className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {lastRefreshed && <span>Updated {lastRefreshed}</span>}
        </div>
      </div>

      {total === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active members found.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((member) => (
            <MemberActivityCard key={member.memberId} member={member} />
          ))}
        </div>
      )}
    </Page>
  )
}
