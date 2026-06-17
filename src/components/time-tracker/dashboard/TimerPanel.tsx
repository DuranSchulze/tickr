import { useMemo, useState } from 'react'
import {
  Loader2,
  Pencil,
  Play,
  SlidersHorizontal,
  Square,
  Trash2,
} from 'lucide-react'
import { Kbd } from '#/components/ui/kbd'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import type { Client, Project, TimeEntry, Tag } from '#/lib/time-tracker/types'
import { ClientProjectPicker } from '../pickers/ClientProjectPicker'
import { TagPicker } from '../pickers/TagPicker'
import { BillableToggleButton } from './BillableToggleButton'
import { DescriptionAutocomplete } from './DescriptionAutocomplete'
import { RunningTimer } from './RunningTimer'
import { TimerOptionsSheet } from './TimerOptionsSheet'
import { PresetDropdown } from './PresetDropdown'

export function TimerPanel({
  workspaceId,
  clients,
  projects,
  tags,
  description,
  onDescriptionChange,
  descriptionSuggestions,
  onApplySuggestion,
  clientId,
  onClientIdChange,
  projectId,
  onProjectIdChange,
  taskId,
  onTaskIdChange,
  projectTasks,
  tagIds,
  onTagIdsChange,
  billable,
  onBillableChange,
  onCreateTask,
  onArchiveTask,
  onCreateTag,
  canManageCatalog = true,
  activeEntry,
  startPending,
  stopPending,
  formatTime,
  onApplyPreset,
  onStart,
  onStop,
  onDiscard,
  onUpdateStartedAt,
  descriptionDropdownUp = false,
}: {
  workspaceId: string
  clients: Client[]
  projects: Project[]
  tags: SearchableItem[]
  description: string
  onDescriptionChange: (value: string) => void
  descriptionSuggestions: string[]
  onApplySuggestion: (description: string) => void
  clientId: string
  onClientIdChange: (id: string) => void
  projectId: string
  onProjectIdChange: (id: string) => void
  taskId: string
  onTaskIdChange: (id: string) => void
  projectTasks: Array<{ id: string; projectId: string; name: string }>
  tagIds: string[]
  onTagIdsChange: (ids: string[]) => void
  billable: boolean
  onBillableChange: (next: boolean) => void
  onCreateTask: (projectId: string, name: string) => Promise<void>
  onArchiveTask: (id: string) => Promise<void>
  onCreateTag: (name: string, color: string) => Promise<void>
  canManageCatalog?: boolean
  activeEntry: TimeEntry | undefined
  startPending: boolean
  stopPending: boolean
  formatTime: (seconds: number) => string
  onApplyPreset: (preset: {
    clientId: string
    projectId: string
    tagIds: string[]
    billable: boolean
  }) => void
  onStart: () => void
  onStop: () => void
  onDiscard: () => void
  onUpdateStartedAt: (iso: string) => void
  descriptionDropdownUp?: boolean
}) {
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [editStarted, setEditStarted] = useState(false)
  const [draftStarted, setDraftStarted] = useState('')

  function openStartedEdit() {
    if (!activeEntry) return
    const d = new Date(activeEntry.startedAt)
    setDraftStarted(
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    )
    setEditStarted(true)
  }

  function commitStartedAt() {
    setEditStarted(false)
    if (!activeEntry || !draftStarted) return
    const [h, m] = draftStarted.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return
    const updated = new Date(activeEntry.startedAt)
    updated.setHours(h, m, 0, 0)
    if (updated >= new Date()) return
    onUpdateStartedAt(updated.toISOString())
  }
  const activeClients = useMemo(
    () => clients.filter((c) => c.clientStatus === 'ACTIVE'),
    [clients],
  )
  const activeProject = useMemo(
    () =>
      activeEntry
        ? projects.find((p) => p.id === activeEntry.projectId)
        : undefined,
    [activeEntry, projects],
  )
  const activeTags = useMemo(
    () =>
      activeEntry ? tags.filter((t) => activeEntry.tagIds.includes(t.id)) : [],
    [activeEntry, tags],
  )

  const stopBlocked =
    !!activeEntry &&
    (!description.trim() ||
      !clientId ||
      !projectId ||
      tagIds.filter(Boolean).length === 0)

  const stopBlockedReason = activeEntry
    ? !description.trim()
      ? 'Add a task description before stopping.'
      : !clientId || !projectId
        ? 'Pick a client and project before stopping.'
        : tagIds.filter(Boolean).length === 0
          ? 'Add at least one tag before stopping.'
          : ''
    : ''

  return (
    <div className="grid min-w-0 gap-3">
      {/* Unified Clockify-style bar: description | client/project | tags | $ |
          presets | start-stop — one continuous control with thin dividers
          instead of separate boxed inputs. */}
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex h-12 max-sm:h-16 min-w-0 flex-1 items-stretch rounded-lg border border-border bg-background transition-shadow focus-within:border-primary/60 focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-primary)_12%,transparent)]">
          <div className="min-w-0 flex-[1.2]">
            <DescriptionAutocomplete
              value={description}
              onChange={onDescriptionChange}
              suggestions={descriptionSuggestions}
              onApplySuggestion={onApplySuggestion}
              onSubmit={activeEntry ? onStop : onStart}
              bare
              dropdownUp={descriptionDropdownUp}
            />
          </div>

          <div className="my-2.5 hidden w-px bg-border sm:block" />
          <div className="hidden min-w-0 flex-[1] sm:flex">
            <ClientProjectPicker
              clients={activeClients}
              projects={projects}
              tasks={projectTasks}
              clientId={clientId}
              projectId={projectId}
              taskId={taskId}
              onChange={(cid, pid, tid) => {
                onClientIdChange(cid)
                onProjectIdChange(pid)
                onTaskIdChange(tid ?? '')
              }}
              onCreateTask={onCreateTask}
              onArchiveTask={onArchiveTask}
              bare
            />
          </div>

          <div className="hidden min-w-0 flex-[0.4] lg:flex">
            <TagPicker
              tags={tags}
              value={tagIds}
              onChange={onTagIdsChange}
              onCreate={onCreateTag}
              canCreate={canManageCatalog}
              bare
            />
          </div>

          <div className="my-2.5 hidden w-px bg-border md:block" />
          <div className="hidden items-center gap-0.5 px-1.5 md:flex">
            <BillableToggleButton
              pressed={billable}
              onPressedChange={onBillableChange}
              className="size-9 border-0 shadow-none"
            />
            <PresetDropdown
              workspaceId={workspaceId}
              clientId={clientId}
              projectId={projectId}
              tagIds={tagIds}
              billable={billable}
              clients={clients}
              projects={projects}
              tags={tags as Tag[]}
              onApplyPreset={onApplyPreset}
              bare
            />
          </div>
        </div>

        {/* Start / Stop — anchored outside the bar so it never shifts.
            Hidden on mobile — the full-width button below handles it. */}
        <div className="hidden shrink-0 items-center sm:flex">
          <button
            type="button"
            onClick={activeEntry ? onStop : onStart}
            disabled={activeEntry ? stopPending || stopBlocked : startPending}
            title={stopBlocked ? stopBlockedReason : undefined}
            className={`inline-flex h-12 items-center justify-center gap-2 rounded-lg px-5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground min-w-[120px] ${
              activeEntry
                ? 'bg-destructive text-destructive-foreground hover:brightness-110'
                : 'bg-primary text-primary-foreground hover:brightness-110'
            }`}
          >
            {activeEntry ? (
              stopPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Square className="size-4 fill-current" />
              )
            ) : startPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {activeEntry ? 'Stop' : 'Start'}
            <Kbd className="bg-white/20 text-white/80 hidden lg:inline-flex">
              ↵
            </Kbd>
          </button>
        </div>
      </div>

      {/* Mobile: Options + Start/Stop in one row */}
      <div className="flex items-center gap-2 sm:hidden">
        <button
          type="button"
          onClick={() => setOptionsOpen(true)}
          className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-bold text-foreground shadow-sm transition-colors hover:bg-accent"
        >
          <SlidersHorizontal className="size-4" />
          Options
        </button>
        <button
          type="button"
          onClick={activeEntry ? onStop : onStart}
          disabled={activeEntry ? stopPending || stopBlocked : startPending}
          title={stopBlocked ? stopBlockedReason : undefined}
          className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground ${
            activeEntry
              ? 'bg-destructive text-destructive-foreground hover:brightness-110'
              : 'bg-primary text-primary-foreground hover:brightness-110'
          }`}
        >
          {activeEntry ? (
            stopPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Square className="size-4 fill-current" />
            )
          ) : startPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          {activeEntry ? 'Stop' : 'Start'}
        </button>
      </div>

      {stopBlocked && (
        <p className="m-0 text-xs font-bold text-destructive">
          {stopBlockedReason}
        </p>
      )}

      {activeEntry && (
        <div className="min-w-0 rounded-lg border border-primary/30 bg-primary/10 p-3 sm:p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 sm:mb-0">
            <p className="m-0 text-xs font-bold uppercase tracking-wide text-primary">
              Running now
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onDiscard}
                disabled={stopPending}
                title="Discard timer — deletes this entry with no record saved"
                className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3"
              >
                <Trash2 className="size-3" />
                Discard
                <Kbd className="hidden sm:inline-flex">Esc</Kbd>
              </button>
              {!stopBlocked && (
                <button
                  type="button"
                  onClick={onStop}
                  disabled={stopPending}
                  className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-2.5 py-1 text-xs font-bold text-destructive-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3"
                >
                  {stopPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Square className="size-3 fill-current" />
                  )}
                  Stop
                </button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 grid gap-1.5">
              <p className="m-0 font-bold text-foreground truncate">
                {activeEntry.description || (
                  <span className="text-muted-foreground">No description</span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {activeProject && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: activeProject.color }}
                    />
                    {activeProject.name}
                  </span>
                )}
                {activeEntry.billable && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    Billable
                  </span>
                )}
                {activeTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="rounded px-1.5 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: tag.color ? `${tag.color}22` : undefined,
                      color: tag.color,
                      border: `1px solid ${tag.color}`,
                    }}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>

              {/* Editable start time */}
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span>Started at</span>
                {editStarted ? (
                  <input
                    type="time"
                    className="rounded border border-primary bg-background px-1 py-px text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    value={draftStarted}
                    onChange={(e) => setDraftStarted(e.target.value)}
                    onBlur={commitStartedAt}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitStartedAt()
                      if (e.key === 'Escape') setEditStarted(false)
                    }}
                    aria-label="Started at"
                  />
                ) : (
                  <span className="flex items-center gap-1">
                    <span className="font-semibold text-foreground">
                      {new Date(activeEntry.startedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={openStartedEdit}
                      className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      title="Edit start time"
                    >
                      <Pencil className="size-3" />
                    </button>
                  </span>
                )}
              </div>
            </div>
            <RunningTimer entry={activeEntry} formatTime={formatTime} />
          </div>
        </div>
      )}

      {optionsOpen && !activeEntry && (
        <TimerOptionsSheet
          clients={clients}
          projects={projects}
          projectTasks={projectTasks}
          tags={tags}
          clientId={clientId}
          projectId={projectId}
          taskId={taskId}
          onClientProjectChange={(cid, pid, tid) => {
            onClientIdChange(cid)
            onProjectIdChange(pid)
            onTaskIdChange(tid ?? '')
          }}
          tagIds={tagIds}
          onTagIdsChange={onTagIdsChange}
          billable={billable}
          onBillableChange={onBillableChange}
          onCreateTag={onCreateTag}
          canManageCatalog={canManageCatalog}
          onClose={() => setOptionsOpen(false)}
        />
      )}
    </div>
  )
}
