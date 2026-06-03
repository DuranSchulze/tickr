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
  onCreateTag,
  canManageCatalog = true,
  pending,
  startPending,
  stopPending,
  formatTime,
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
  tagIds: string[]
  onTagIdsChange: (ids: string[]) => void
  billable: boolean
  onBillableChange: (next: boolean) => void
  activeEntry: TimeEntry | undefined
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
  draft: DraftEntry
  setDraft: (draft: DraftEntry) => void
  onAddManual: () => void
  onCreateClient: (name: string) => Promise<void>
  onCreateProject: (
    name: string,
    color: string,
    clientId: string,
  ) => Promise<void>
  onCreateTag: (name: string, color: string) => Promise<void>
  canManageCatalog?: boolean
  pending: boolean
  startPending: boolean
  stopPending: boolean
  formatTime: (seconds: number) => string
}) {
  const [mode, setMode] = useState<'timer' | 'manual'>('timer')

  return (
    <section className="min-w-0 rounded-xl border border-border bg-card shadow-sm">
      {/* ── Modern segmented tab bar ────────────────────────────────── */}
      <div className="px-4 pt-3">
        <div className="flex gap-1 rounded-lg bg-muted/60 p-1" role="tablist">
          <button
            type="button"
            onClick={() => setMode('timer')}
            role="tab"
            aria-selected={mode === 'timer'}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold transition-all ${
              mode === 'timer'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Play
              className={`size-4 ${mode === 'timer' ? 'text-primary' : 'text-muted-foreground'}`}
            />
            Timer
          </button>
          <button
            type="button"
            onClick={() => setMode('manual')}
            role="tab"
            aria-selected={mode === 'manual'}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-bold transition-all ${
              mode === 'manual'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <Pencil
              className={`size-4 ${mode === 'manual' ? 'text-primary' : 'text-muted-foreground'}`}
            />
            Manual entry
          </button>
        </div>
      </div>

      {/* ── Content with fade/slide animation ──────────────────────── */}
      <div className="border-t border-border/50 mt-3 px-4 pb-4 pt-4">
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
                tagIds={tagIds}
                onTagIdsChange={onTagIdsChange}
                billable={billable}
                onBillableChange={onBillableChange}
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
                tags={tags}
                onCreateClient={onCreateClient}
                onCreateProject={onCreateProject}
                onCreateTag={onCreateTag}
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
