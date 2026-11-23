import { useState, useCallback } from 'react'
import { Play, Pencil } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import type { Client, Project, TimeEntry } from '#/lib/time-tracker/types'
import { ManualEntryPanel } from './ManualEntryPanel'
import { TimerPanel } from './TimerPanel'
import type { DraftEntry } from './utils'
import type { CreateProjectTask } from '../pickers/ClientProjectPicker'
import type { EntryLocationCaptureStatus } from '#/lib/time-tracker/device-location'

export function InputSection({
  workspaceId,
  clients,
  projects,
  tags,
  // timer
  description,
  onDescriptionChange,
  onDescriptionBlur,
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
  locationStatus,
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
  onDescriptionBlur?: () => void
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
  locationStatus: EntryLocationCaptureStatus
  draft: DraftEntry
  setDraft: (draft: DraftEntry) => void
  onAddManual: () => void
  onCreateClient: (name: string) => Promise<void>
  onCreateProject: (
    name: string,
    color: string,
    clientId: string,
  ) => Promise<void>
  onCreateTask: CreateProjectTask
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
  const effectiveMode = activeEntry ? 'timer' : mode

  const applyPresetToDraft = useCallback(
    (preset: {
      clientId: string
      projectId: string
      taskId: string
      tagIds: string[]
      billable: boolean
    }) => {
      setDraft({
        ...draft,
        clientId: preset.clientId,
        projectId: preset.projectId,
        taskId: preset.taskId || '',
        tagIds: preset.tagIds,
        billable: preset.billable,
      })
    },
    [draft, setDraft],
  )

  const modeTabClass = (selected: boolean, disabled = false) =>
    `inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
      disabled
        ? 'cursor-not-allowed text-smoke/50'
        : selected
          ? 'bg-eggshell text-foreground ring-1 ring-stone'
          : 'text-smoke hover:text-foreground'
    }`

  const modeToggle = (
    <div
      className="inline-flex shrink-0 items-center rounded-full border border-stone bg-warm-taupe p-1"
      role="tablist"
      aria-label="Entry mode"
    >
      <button
        type="button"
        onClick={() => setMode('timer')}
        role="tab"
        aria-selected={effectiveMode === 'timer'}
        className={modeTabClass(effectiveMode === 'timer')}
      >
        <Play aria-hidden="true" className="size-3.5" />
        Timer
      </button>
      <button
        type="button"
        onClick={() => setMode('manual')}
        role="tab"
        aria-selected={effectiveMode === 'manual'}
        title={activeEntry ? 'Stop the timer first' : undefined}
        disabled={!!activeEntry}
        className={modeTabClass(effectiveMode === 'manual', !!activeEntry)}
      >
        <Pencil aria-hidden="true" className="size-3.5" />
        Manual entry
      </button>
    </div>
  )

  return (
    <section className="min-w-0 rounded-xl border border-stone bg-eggshell p-3 sm:p-4">
      <div className="mb-3 flex min-w-0 justify-center">{modeToggle}</div>
      <div className="min-w-0">
        <AnimatePresence mode="wait">
          {effectiveMode === 'timer' && (
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
                onDescriptionBlur={onDescriptionBlur}
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
                locationStatus={locationStatus}
                descriptionDropdownUp={descriptionDropdownUp}
              />
            </motion.div>
          )}

          {effectiveMode === 'manual' && (
            <motion.div
              key="manual"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: 'easeInOut' }}
            >
              <ManualEntryPanel
                workspaceId={workspaceId}
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
                onApplyPreset={applyPresetToDraft}
                canManageCatalog={canManageCatalog}
                pending={pending}
                onSubmit={onAddManual}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
