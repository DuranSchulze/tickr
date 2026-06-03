import { Fragment } from 'react'
import { ChevronDown, ChevronRight, Play } from 'lucide-react'
import type { Project, TimeEntry } from '#/lib/time-tracker/types'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import { TableHead, TableHeader, TableRow } from '#/components/ui/table'
import { EntryCard } from './EntryCard'
import { EntryRow } from './EntryRow'
import type { TaskGroup } from './entries-grouping'
import { getEntrySeconds } from '#/lib/time-tracker/store'
import { useNowTick } from './hooks/useNowTick'

// ─── Shared types ────────────────────────────────────────────────────────────

type InlinePatch = Partial<
  Pick<
    TimeEntry,
    | 'description'
    | 'billable'
    | 'projectId'
    | 'tagIds'
    | 'startedAt'
    | 'endedAt'
  >
>

type ClientItem = { id: string; name: string; clientStatus: string }

// ─── Shared formatter for group totals ──────────────────────────────────────

function formatGroupTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// ─── Live total (ticks when a timer is running) ───────────────────────────────

export function LiveGroupTotal({
  completedSeconds,
  runningEntry,
  formatTime,
}: {
  completedSeconds: number
  runningEntry: TimeEntry | null
  formatTime: (seconds: number) => string
}) {
  const tick = useNowTick(runningEntry ? 1000 : null)
  const total =
    completedSeconds + (runningEntry ? getEntrySeconds(runningEntry, tick) : 0)
  return (
    <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
      {formatTime(total)}
    </span>
  )
}

// ─── Task group header row (desktop table) ────────────────────────────────────

function TaskGroupHeaderRow({
  group,
  projects,
  hasActiveTimer,
  isExpanded,
  onToggle,
  onResume,
}: {
  group: TaskGroup
  projects: Project[]
  hasActiveTimer: boolean
  isExpanded: boolean
  onToggle: () => void
  onResume: () => void
}) {
  const project = projects.find((p) => p.id === group.projectId)

  return (
    <TableRow
      className="bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onToggle}
    >
      <td className="px-4 py-3 w-[26%]">
        <div className="flex items-center gap-2 min-w-0">
          {isExpanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-sm font-semibold text-foreground">
            {group.description || (
              <span className="text-muted-foreground font-normal">
                No description
              </span>
            )}
          </span>
          <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">
            ×{group.entries.length}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 w-[18%]">
        {project ? (
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span
              className="size-2 rounded-full shrink-0"
              style={{ backgroundColor: project.color }}
            />
            <span className="truncate">{project.name}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">–</span>
        )}
      </td>
      <td className="px-4 py-3 w-[14%]">
        <span className="text-xs text-muted-foreground">
          {group.tagIds.length} tag{group.tagIds.length !== 1 ? 's' : ''}
        </span>
      </td>
      <td className="px-4 py-3 w-[8%] text-center">
        {group.billable && (
          <span className="inline-block rounded-full bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">
            $
          </span>
        )}
      </td>
      <td className="px-4 py-3 w-[12%] text-center text-xs text-muted-foreground">
        —
      </td>
      <td className="px-4 py-3 w-[10%] text-right">
        <span className="font-mono text-sm font-bold tabular-nums text-foreground">
          {formatGroupTime(group.totalSeconds)}
        </span>
      </td>
      <td className="px-4 py-3 w-[12%]" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onResume}
            disabled={hasActiveTimer}
            title={
              hasActiveTimer
                ? 'Stop the running timer first'
                : 'Resume this task'
            }
            className="rounded-lg border border-primary/40 p-1.5 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Resume task"
          >
            <Play className="size-3.5" />
          </button>
        </div>
      </td>
    </TableRow>
  )
}

// ─── Task group header card (mobile) ─────────────────────────────────────────

function TaskGroupHeaderCard({
  group,
  projects,
  tags,
  formatTime,
  hasActiveTimer,
  isExpanded,
  onToggle,
  onResume,
}: {
  group: TaskGroup
  projects: Project[]
  tags: SearchableItem[]
  formatTime: (seconds: number) => string
  hasActiveTimer: boolean
  isExpanded: boolean
  onToggle: () => void
  onResume: () => void
}) {
  const project = projects.find((p) => p.id === group.projectId)
  const entryTags = tags.filter((t) => group.tagIds.includes(t.id))

  return (
    <div className="rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {isExpanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate font-semibold text-foreground">
            {group.description || (
              <span className="text-muted-foreground">No description</span>
            )}
          </span>
          <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">
            ×{group.entries.length}
          </span>
        </div>
        <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-foreground">
          {formatTime(group.totalSeconds)}
        </span>
      </button>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {project && (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: project.color }}
              />
              {project.name}
            </span>
          )}
          {entryTags.map((tag) => (
            <span
              key={tag.id}
              className="rounded-md border px-2 py-0.5 text-xs font-semibold"
              style={{ color: tag.color, borderColor: `${tag.color}55` }}
            >
              {tag.name}
            </span>
          ))}
          {group.billable && (
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-bold text-primary">
              Billable
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onResume}
          disabled={hasActiveTimer}
          title={
            hasActiveTimer ? 'Stop the running timer first' : 'Resume this task'
          }
          className="rounded-lg border border-primary/40 p-1.5 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Resume task"
        >
          <Play className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Desktop table header ────────────────────────────────────────────────────

export function DayGroupTableHeader() {
  return (
    <TableHeader className="bg-muted/80">
      <TableRow className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80 hover:bg-transparent">
        <TableHead className="px-4 py-3 w-[26%] text-muted-foreground/80 font-bold">
          Description
        </TableHead>
        <TableHead className="px-4 py-3 w-[18%] text-muted-foreground/80 font-bold">
          Client / Project
        </TableHead>
        <TableHead className="px-4 py-3 w-[14%] text-muted-foreground/80 font-bold">
          Tags
        </TableHead>
        <TableHead className="px-4 py-3 w-[8%] text-center text-muted-foreground/80 font-bold">
          Billable
        </TableHead>
        <TableHead className="px-4 py-3 w-[12%] text-center text-muted-foreground/80 font-bold">
          Time
        </TableHead>
        <TableHead className="px-4 py-3 w-[10%] text-right text-muted-foreground/80 font-bold">
          Duration
        </TableHead>
        <TableHead className="px-4 py-3 w-[12%]" />
      </TableRow>
    </TableHeader>
  )
}

// ─── Common rendering helpers for EntryRow / EntryCard ───────────────────────

type CommonRowProps = {
  clients: ClientItem[]
  projects: Project[]
  tags: SearchableItem[]
  pending: boolean
  pendingEntryIds?: Set<string>
  formatTime: (seconds: number) => string
  hasActiveTimer: boolean
  currency: string
  rateLookup: (memberId: string) => number
  onStartEdit: (entry: TimeEntry) => void
  onUpdate: (entryId: string, patch: InlinePatch) => void
  onResume: (entry: TimeEntry) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}

type CommonCardProps = {
  projects: Project[]
  tags: SearchableItem[]
  pending: boolean
  pendingEntryIds?: Set<string>
  formatTime: (seconds: number) => string
  hasActiveTimer: boolean
  currency: string
  rateLookup: (memberId: string) => number
  onStartEdit: (entry: TimeEntry) => void
  onResume: (entry: TimeEntry) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}

type TaskGroupHeaderConfig = {
  isExpanded: (groupKey: string) => boolean
  onToggle: (groupKey: string) => void
  onResumeGroup: (taskGroup: TaskGroup) => void
}

// ─── Desktop table body entries ──────────────────────────────────────────────

export function DayGroupDesktopEntries({
  taskGroups,
  clients,
  projects,
  tags,
  pending,
  pendingEntryIds,
  formatTime,
  hasActiveTimer,
  currency,
  rateLookup,
  onStartEdit,
  onUpdate,
  onResume,
  onDuplicate,
  onDelete,
  taskGroupHeader,
}: CommonRowProps & {
  taskGroups: TaskGroup[]
  taskGroupHeader?: TaskGroupHeaderConfig
}) {
  const renderEntryRow = (entry: TimeEntry, isSubEntry = false) => (
    <EntryRow
      key={entry.id}
      entry={entry}
      clients={clients}
      projects={projects}
      tags={tags}
      pending={pending}
      isPending={pendingEntryIds?.has(entry.id)}
      formatTime={formatTime}
      hasActiveTimer={hasActiveTimer}
      isSubEntry={isSubEntry}
      currency={currency}
      rateLookup={rateLookup}
      onStartEdit={() => onStartEdit(entry)}
      onUpdate={(patch) => onUpdate(entry.id, patch)}
      onResume={() => onResume(entry)}
      onDuplicate={() => onDuplicate(entry.id)}
      onDelete={() => onDelete(entry.id)}
    />
  )

  return (
    <>
      {taskGroups.map((taskGroup) => {
        // Simple mode (AllEntriesSection): inline all entries with isSubEntry for i>0
        if (!taskGroupHeader) {
          if (taskGroup.entries.length === 1) {
            return renderEntryRow(taskGroup.entries[0])
          }
          return (
            <Fragment key={taskGroup.key}>
              {taskGroup.entries.map((entry, i) =>
                renderEntryRow(entry, i > 0),
              )}
            </Fragment>
          )
        }

        // Grouped mode (EntriesSection): with task group headers and collapse
        const isGrouped = taskGroup.entries.length > 1
        const expanded = taskGroupHeader.isExpanded(taskGroup.key)

        if (!isGrouped) {
          return renderEntryRow(taskGroup.entries[0])
        }

        return (
          <Fragment key={taskGroup.key}>
            <TaskGroupHeaderRow
              group={taskGroup}
              projects={projects}
              hasActiveTimer={hasActiveTimer}
              isExpanded={expanded}
              onToggle={() => taskGroupHeader.onToggle(taskGroup.key)}
              onResume={() => taskGroupHeader.onResumeGroup(taskGroup)}
            />
            {expanded &&
              taskGroup.entries.map((entry) => renderEntryRow(entry, true))}
          </Fragment>
        )
      })}
    </>
  )
}

// ─── Mobile entry cards ──────────────────────────────────────────────────────

export function DayGroupMobileCards({
  taskGroups,
  projects,
  tags,
  pending,
  pendingEntryIds,
  formatTime,
  hasActiveTimer,
  currency,
  rateLookup,
  onStartEdit,
  onResume,
  onDuplicate,
  onDelete,
  taskGroupHeader,
}: CommonCardProps & {
  taskGroups: TaskGroup[]
  taskGroupHeader?: TaskGroupHeaderConfig
}) {
  const renderEntryCard = (entry: TimeEntry, isSubEntry = false) => (
    <EntryCard
      key={entry.id}
      entry={entry}
      projects={projects}
      tags={tags}
      currency={currency}
      rateLookup={rateLookup}
      pending={pending}
      isPending={pendingEntryIds?.has(entry.id)}
      formatTime={formatTime}
      hasActiveTimer={hasActiveTimer}
      isSubEntry={isSubEntry}
      onStartEdit={() => onStartEdit(entry)}
      onResume={() => onResume(entry)}
      onDuplicate={() => onDuplicate(entry.id)}
      onDelete={() => onDelete(entry.id)}
    />
  )

  return (
    <div className="grid gap-2 border-t border-border/40 p-3 sm:hidden">
      {taskGroups.map((taskGroup) => {
        // Simple mode (AllEntriesSection): flat list of all cards, no sub-entry styling
        if (!taskGroupHeader) {
          if (taskGroup.entries.length === 1) {
            return renderEntryCard(taskGroup.entries[0])
          }
          return (
            <Fragment key={taskGroup.key}>
              {taskGroup.entries.map((entry) => renderEntryCard(entry))}
            </Fragment>
          )
        }

        // Grouped mode (EntriesSection): with task group header cards and collapse
        const isGrouped = taskGroup.entries.length > 1
        const expanded = taskGroupHeader.isExpanded(taskGroup.key)

        if (!isGrouped) {
          return renderEntryCard(taskGroup.entries[0])
        }

        return (
          <div key={`group-${taskGroup.key}`} className="grid gap-1.5">
            <TaskGroupHeaderCard
              group={taskGroup}
              projects={projects}
              tags={tags}
              formatTime={formatTime}
              hasActiveTimer={hasActiveTimer}
              isExpanded={expanded}
              onToggle={() => taskGroupHeader.onToggle(taskGroup.key)}
              onResume={() => taskGroupHeader.onResumeGroup(taskGroup)}
            />
            {expanded &&
              taskGroup.entries.map((entry) => renderEntryCard(entry, true))}
          </div>
        )
      })}
    </div>
  )
}
