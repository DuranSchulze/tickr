import { useState } from 'react'
import { Play, Pencil } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import type { Client, Project, TimeEntry } from '#/lib/time-tracker/types'
import { ManualEntryPanel } from './ManualEntryPanel'
import { TimerPanel } from './TimerPanel'
import type { DraftEntry } from './utils'

export function InputSection({
  workspaceId,
  clients,
  projects,
  tags,
  // timer
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
  activeEntry,
  onApplyPreset,
  onStart,
  onStop,
  onDiscard,
  onUpdateStartedAt,
  // manual
  draft,
  setDraft,
  onAddManual,
  // shared
  onCreateClient,
  onCreateProject,
  onCreateTask,
  onDeleteTask,
  onCreateTag,
  canManageCatalog = true,
  pending,
  startPending,
  stopPending,
  formatTime,
  descriptionDropdownUp = false,
}: {
  workspaceId: string
  clients: Client[]
  projects: Project[]
  tags: SearchableItem[]
  description: string
  onDescriptionChange: (v: string) => void
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
  activeEntry: TimeEntry | undefined
  onApplyPreset: (preset: {
    clientId: string
    projectId: string
    taskId: string
    tagIds: string[]
    billable: boolean
  }) => void
  onStart: () => void
  onStop: () => void
  onDiscard: () => void
  onUpdateStartedAt: (iso: string) => void
  draft: DraftEntry
  setDraft: (draft: DraftEntry) => void
  onAddManual: () => void
  onCreateClient: (name: string) => Promise<void>
  onCreateProject: (
    name: string,
    color: string,
    clientId: string,
  ) => Promise<void>
  onCreateTask: (projectId: string, name: string) => Promise<void>
  onDeleteTask: (id: string) => Promise<void>
  onCreateTag: (name: string, color: string) => Promise<void>
  canManageCatalog?: boolean
  pending: boolean
  startPending: boolean
  stopPending: boolean
  formatTime: (seconds: number) => string
  descriptionDropdownUp?: boolean
}) {
  const [mode, setMode] = useState<'timer' | 'manual'>('timer')

  const modeToggle = (
    <div
      className="flex shrink-0 flex-row items-center justify-center gap-1 border-border/60 max-sm:border-t max-sm:pt-2 sm:flex-col sm:border-l sm:pl-2"
      role="tablist"
      aria-label="Entry mode"
    >
      <button
        type="button"
        onClick={() => setMode('timer')}
        role="tab"
        aria-selected={mode === 'timer'}
        title="Timer"
        className={`grid size-8 place-items-center rounded-md transition-colors ${
          mode === 'timer'
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <Play className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => setMode('manual')}
        role="tab"
        aria-selected={mode === 'manual'}
        title="Manual entry"
        className={`grid size-8 place-items-center rounded-md transition-colors ${
          mode === 'manual'
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        <Pencil className="size-4" />
      </button>
    </div>
  )

  return (
    // Elevated above the rest of the page (shadow + ring) so the entry point
    // for tracking time is the first thing the eye lands on — Clockify-style
    // single bar with a compact timer/manual toggle on the right edge.
    <section className="min-w-0 rounded-xl border border-border bg-card p-3 shadow-lg shadow-black/[0.06] ring-1 ring-black/[0.03] dark:shadow-black/30 dark:ring-white/[0.04]">
      <div className="flex min-w-0 gap-2 max-sm:flex-col sm:items-stretch">
        {/* justify-center keeps the h-12 bar vertically centered against the
            taller mode-toggle column instead of pinned to the card's top. */}
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <AnimatePresence mode="wait">
            {mode === 'timer' && (
              <motion.div
                key="timer"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeInOut' }}
              >
                <TimerPanel
                  workspaceId={workspaceId}
                  clients={clients}
                  projects={projects}
                  tags={tags}
                  description={description}
                  onDescriptionChange={onDescriptionChange}
                  descriptionSuggestions={descriptionSuggestions}
                  onApplySuggestion={onApplySuggestion}
                  clientId={clientId}
                  onClientIdChange={onClientIdChange}
                  projectId={projectId}
                  onProjectIdChange={onProjectIdChange}
                  taskId={taskId}
                  onTaskIdChange={onTaskIdChange}
                  projectTasks={projectTasks}
                  tagIds={tagIds}
                  onTagIdsChange={onTagIdsChange}
                  billable={billable}
                  onBillableChange={onBillableChange}
                  onCreateTask={onCreateTask}
                  onDeleteTask={onDeleteTask}
                  onCreateTag={onCreateTag}
                  canManageCatalog={canManageCatalog}
                  activeEntry={activeEntry}
                  startPending={startPending}
                  stopPending={stopPending}
                  formatTime={formatTime}
                  onApplyPreset={onApplyPreset}
                  onStart={onStart}
                  onStop={onStop}
                  onDiscard={onDiscard}
                  onUpdateStartedAt={onUpdateStartedAt}
                  descriptionDropdownUp={descriptionDropdownUp}
                />
              </motion.div>
            )}

            {mode === 'manual' && (
              <motion.div
                key="manual"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeInOut' }}
              >
                <ManualEntryPanel
                  draft={draft}
                  setDraft={setDraft}
                  clients={clients}
                  projects={projects}
                  projectTasks={projectTasks}
                  tags={tags}
                  onCreateClient={onCreateClient}
                  onCreateProject={onCreateProject}
                  onCreateTask={onCreateTask}
                  onDeleteTask={onDeleteTask}
                  onCreateTag={onCreateTag}
                  canManageCatalog={canManageCatalog}
                  pending={pending}
                  onSubmit={onAddManual}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {modeToggle}
      </div>
    </section>
  )
}
