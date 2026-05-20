import { Briefcase, Clock } from 'lucide-react'
import { useNowTick } from '#/components/time-tracker/dashboard/hooks/useNowTick'
import { formatDuration } from '#/lib/time-tracker/store'
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
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
    )
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
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
}: {
  member: WorkspaceMemberActivity
}) {
  const isOnline = member.activeEntry !== null

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors">
      <div className="relative">
        <MemberAvatar name={member.name} avatarUrl={member.avatarUrl} />
        <span
          aria-hidden="true"
          className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${
            isOnline ? 'bg-emerald-500' : 'bg-muted-foreground/40'
          }`}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {member.name}
          </p>
          <span
            aria-label={isOnline ? 'Online' : 'Offline'}
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
              isOnline
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        {isOnline && member.activeEntry ? (
          <div className="mt-1.5 space-y-1">
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              <Briefcase className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {member.activeEntry.projectName ?? 'No project'}
              </span>
            </p>
            <p className="truncate text-xs text-foreground/80">
              {member.activeEntry.description || 'No description'}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 shrink-0" />
              <ElapsedTimer startedAt={member.activeEntry.startedAt} />
            </p>
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">Not working</p>
        )}
      </div>
    </div>
  )
}
