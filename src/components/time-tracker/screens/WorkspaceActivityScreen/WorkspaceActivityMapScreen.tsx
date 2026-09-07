import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, MapPinned } from 'lucide-react'
import { useState } from 'react'
import { DepartmentMemberActivitySheet } from '#/components/time-tracker/analytics/department/DepartmentMemberActivitySheet'
import {
  fetchWorkspaceActivity,
  getWorkspaceActivityQueryKey,
} from '#/lib/time-tracker/workspace-activity-query'
import { MemberLocationMap } from './MemberActivityMap'
import { countRunningTimers } from './member-timer-status'
import type { WorkspaceActivityPayload } from '#/lib/server/tracker/activity.server'
import type { WorkspaceActivityFilters } from '#/lib/time-tracker/workspace-activity-query'

const POLL_INTERVAL = 30_000

export function WorkspaceActivityMapScreen({
  initialActivity,
  currentFilters,
}: {
  initialActivity: WorkspaceActivityPayload
  currentFilters: WorkspaceActivityFilters
}) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const { data: activity = initialActivity } = useQuery({
    queryKey: getWorkspaceActivityQueryKey(currentFilters),
    queryFn: () => fetchWorkspaceActivity(currentFilters),
    initialData: initialActivity,
    staleTime: 0,
    refetchInterval: POLL_INTERVAL,
    refetchIntervalInBackground: false,
  })

  const mappedMembers = activity.members.filter(
    (member) => member.latestOrigin !== null,
  )
  const runningTimerCount = countRunningTimers(mappedMembers)
  const idleCount = mappedMembers.length - runningTimerCount
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-card">
      <h1 className="sr-only">Member locations</h1>
      <Link
        to="/app/workspace/activity"
        search={{
          departmentId: currentFilters.departmentId,
          q: currentFilters.q,
        }}
        className="absolute left-4 top-4 z-20 inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background/95 px-3 text-sm font-bold text-foreground no-underline shadow-lg backdrop-blur transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:left-6 sm:top-6"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to team activity
      </Link>

      <aside className="absolute bottom-4 left-4 z-20 max-w-[calc(100%-2rem)] rounded-lg border border-border bg-background/95 p-4 shadow-lg backdrop-blur sm:bottom-6 sm:left-6 sm:max-w-md">
        <div className="flex items-center gap-2">
          <MapPinned className="size-5 text-primary" aria-hidden="true" />
          <h2 className="m-0 text-base font-bold text-foreground">
            Member locations
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Drag to explore, scroll to zoom, and select a pin to see the member.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium">
          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <span
              className="size-2 rounded-full bg-emerald-500"
              aria-hidden="true"
            />
            {runningTimerCount} with running timers
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span
              className="size-2 rounded-full bg-muted-foreground/50"
              aria-hidden="true"
            />
            {idleCount} without running timers
          </span>
        </div>
      </aside>

      <section
        className="size-full overflow-hidden"
        aria-label="Map of member locations"
      >
        {mappedMembers.length === 0 ? (
          <div className="flex size-full items-center justify-center px-6 text-center">
            <div className="max-w-md">
              <MapPinned
                className="mx-auto size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <h2 className="mt-3 text-base font-bold text-foreground">
                No mapped members yet
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Locations appear after members log entries while location
                tracking is enabled.
              </p>
            </div>
          </div>
        ) : (
          <MemberLocationMap
            members={mappedMembers}
            className="size-full"
            interactive
            onSelectMember={(member) => setSelectedMemberId(member.memberId)}
          />
        )}
      </section>

      <DepartmentMemberActivitySheet
        memberId={selectedMemberId}
        onClose={() => setSelectedMemberId(null)}
      />
    </main>
  )
}
