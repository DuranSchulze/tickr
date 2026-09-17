import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CircleHelp, Loader2, Trophy } from 'lucide-react'
import type {
  LeaderboardEntry,
  WorkspaceLeaderboard,
} from '#/lib/server/tracker/leaderboard.server'
import { getWorkspaceLeaderboardFn } from '#/lib/server/tracker'
import { trackerKeys } from '#/lib/time-tracker/query-keys'
import { cn } from '#/lib/utils'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '#/components/ui/drawer'
import { BADGE_COLORS } from './performance.utils'

const RANK_STYLES: Record<number, string> = {
  1: 'bg-amber-400/20 text-amber-500 border-amber-400/50',
  2: 'bg-slate-400/20 text-slate-400 border-slate-400/50',
  3: 'bg-orange-400/20 text-orange-500 border-orange-400/50',
}

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function LeaderboardRow({
  entry,
  highlight,
}: {
  entry: LeaderboardEntry
  highlight?: boolean
}) {
  const badgeStyle = BADGE_COLORS[entry.badge]
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl border px-3 py-2.5',
        highlight
          ? 'border-primary/60 bg-primary/8'
          : 'border-stone bg-eggshell',
      )}
    >
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-full border text-sm font-black tabular-nums',
          RANK_STYLES[entry.rank] ?? 'border-stone bg-warm-taupe text-smoke',
        )}
      >
        {entry.rank}
      </span>
      <span className="size-9 shrink-0 overflow-hidden rounded-full border border-primary/25 bg-primary/10">
        {entry.image ? (
          <img
            src={entry.image}
            alt=""
            className="size-full rounded-full object-cover"
          />
        ) : (
          <span className="grid size-full place-items-center text-xs font-black text-primary">
            {initials(entry.displayName)}
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-bold text-foreground">
            {entry.displayName}
          </span>
          {highlight && (
            <span className="shrink-0 rounded-full bg-primary-action px-1.5 py-0.5 text-[10px] font-black uppercase text-primary-action-foreground">
              You
            </span>
          )}
        </div>
        <p className="m-0 mt-0.5 text-xs text-smoke tabular-nums">
          {entry.activeDays}/{entry.elapsedWorkdays} active days
        </p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-warm-taupe">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${Math.min(100, entry.score)}%` }}
          />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="m-0 font-heading text-lg font-black leading-none text-foreground tabular-nums">
          {entry.score}
        </p>
        <span
          className={cn(
            'mt-1 inline-flex rounded-xl border px-1.5 py-0.5 text-[10px] font-black',
            badgeStyle.bg,
            badgeStyle.text,
            badgeStyle.border,
          )}
        >
          {entry.grade}
        </span>
      </div>
    </li>
  )
}

export function LeaderboardList({ data }: { data: WorkspaceLeaderboard }) {
  const youId = data.you?.memberId
  if (data.top.length === 0) {
    return (
      <div className="px-4">
        <p className="m-0 py-8 text-center text-sm font-semibold text-smoke">
          No members with tracked time in this pay period yet.
        </p>
      </div>
    )
  }
  return (
    <div className="grid gap-4 px-4">
      <ul className="grid list-none gap-2 p-0">
        {data.top.map((entry) => (
          <LeaderboardRow
            key={entry.memberId}
            entry={entry}
            highlight={entry.memberId === youId}
          />
        ))}
      </ul>
      {data.you && data.you.rank > data.top.length && (
        <>
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-smoke">
            <span className="h-px flex-1 bg-border" />
            Your standing
            <span className="h-px flex-1 bg-border" />
          </div>
          <ul className="grid list-none gap-2 p-0">
            <LeaderboardRow entry={data.you} highlight />
          </ul>
        </>
      )}
      <p className="m-0 text-center text-xs text-smoke tabular-nums">
        Ranked {data.totalRanked}{' '}
        {data.totalRanked === 1 ? 'member' : 'members'} with tracked time in
        this pay period.
      </p>
    </div>
  )
}

export function LeaderboardDrawer() {
  const [open, setOpen] = useState(false)

  const query = useQuery({
    queryKey: trackerKeys.workspaceLeaderboard,
    queryFn: () => getWorkspaceLeaderboardFn(),
    enabled: open,
    staleTime: 60_000,
  })

  return (
    <Drawer direction="right" open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-stone px-3 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <Trophy className="size-4 text-primary" aria-hidden="true" />
          Leaderboard
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center gap-2 font-heading text-lg font-black">
            <Trophy className="size-5 text-primary" aria-hidden="true" />
            Workspace leaderboard
          </DrawerTitle>
          <DrawerDescription>
            {query.data
              ? `Pay period ${query.data.periodLabel} — top 10 by projected KPI. Standings reset at each cutoff and grades finalize when the period closes.`
              : 'Top 10 members by projected KPI score for the current pay period.'}
          </DrawerDescription>
        </DrawerHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {query.isPending ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-sm font-semibold text-smoke">
              <Loader2 className="size-5 animate-spin text-primary motion-reduce:animate-none" />
              Crunching the pay period&apos;s standings…
            </div>
          ) : query.isError ? (
            <div className="grid gap-3 px-4 py-8 text-center">
              <p className="m-0 text-sm font-semibold text-smoke">
                Could not load the leaderboard.
              </p>
              <button
                type="button"
                onClick={() => void query.refetch()}
                className="mx-auto h-9 rounded-xl border border-stone px-4 text-sm font-semibold text-foreground hover:bg-accent"
              >
                Try again
              </button>
            </div>
          ) : (
            <LeaderboardList data={query.data} />
          )}
        </div>

        <DrawerFooter>
          <p className="m-0 flex items-start gap-1.5 text-xs leading-4 text-smoke">
            <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-primary" />
            Same KPI as your performance page: day span, consistency, and timely
            logging. It measures tracking health — not productivity or worth.
          </p>
          <DrawerClose asChild>
            <button
              type="button"
              className="h-9 rounded-xl border border-stone px-4 text-sm font-semibold text-foreground hover:bg-accent"
            >
              Close
            </button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
