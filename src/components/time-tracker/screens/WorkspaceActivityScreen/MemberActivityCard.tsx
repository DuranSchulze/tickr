import { Briefcase, Clock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useNowTick } from '#/components/time-tracker/dashboard/hooks/useNowTick'
import { formatDuration } from '#/lib/time-tracker/store'
import { MemberExportButton } from '#/components/time-tracker/shared/MemberExportDialog'
import { getTimerStatusLabel, hasRunningTimer } from './member-timer-status'
import type { WorkspaceMemberActivity } from '#/lib/server/tracker/activity.server'

function MemberAvatar({
  name,
  avatarUrl,
}: {
  name: string
  avatarUrl: string | null
}) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="size-10 shrink-0 rounded-full object-cover"
      />
    )
  }

  return (
    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
      {initials}
    </div>
  )
}

function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const now = useNowTick(1000)
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - new Date(startedAt).getTime()) / 1000),
  )
  return (
    <span className="font-mono text-sm tabular-nums text-foreground">
      {formatDuration(elapsedSeconds)}
    </span>
  )
}

export function MemberActivityCard({
  member,
  viewDataAction,
}: {
  member: WorkspaceMemberActivity
  viewDataAction?: ReactNode
}) {
  const isTimerRunning = hasRunningTimer(member)
  const timerStatus = getTimerStatusLabel(member)

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors">
      <Link
        to="/app/workspace/members/$memberId"
        params={{ memberId: member.memberId }}
        className="group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        aria-label={`Open ${member.name}'s member details`}
        title={`Open ${member.name}'s member details`}
      >
        <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} />
        <span
          aria-hidden="true"
          className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full border-2 border-card ${
            isTimerRunning ? 'bg-emerald-500' : 'bg-muted-foreground/40'
          }`}
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            to="/app/workspace/members/$memberId"
            params={{ memberId: member.memberId }}
            className="truncate text-sm font-semibold text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            title={`Open ${member.name}'s member details`}
          >
            {member.name}
          </Link>
          <span
            aria-label={timerStatus}
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              isTimerRunning
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {timerStatus}
          </span>
        </div>
        <p className="m-0 mt-0.5 truncate text-xs text-muted-foreground">
          {member.departmentName ?? 'No department'}
        </p>

        {isTimerRunning && member.activeEntry ? (
          <div className="mt-1.5 space-y-1">
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Briefcase className="size-3 shrink-0" />
              <span className="truncate">
                {member.activeEntry.projectName ?? 'No project'}
              </span>
            </p>
            <p className="truncate text-xs text-foreground/80">
              {member.activeEntry.description || 'No description'}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="size-3 shrink-0" />
              <ElapsedTimer startedAt={member.activeEntry.startedAt} />
            </p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            No task is currently being tracked.
          </p>
        )}

        {/* Export button \u2014 date-range dialog with PDF / CSV */}
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {viewDataAction}
          <MemberExportButton
            memberId={member.memberId}
            memberName={member.name}
            size="sm"
          />
        </div>
      </div>
    </div>
  )
}
