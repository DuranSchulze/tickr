import { useState } from 'react'
import { Pencil, Play } from 'lucide-react'
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
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setMode('timer')}
          className={`flex-1 py-3 text-sm font-bold transition-colors ${
            mode === 'timer'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Play className="mr-1.5 inline h-3.5 w-3.5" />
          Timer
        </button>
        <button
          type="button"
          onClick={() => setMode('manual')}
          className={`flex-1 py-3 text-sm font-bold transition-colors ${
            mode === 'manual'
              ? 'border-b-2 border-primary text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Pencil className="mr-1.5 inline h-3.5 w-3.5" />
          Manual entry
        </button>
      </div>

      <div className="p-4">
        {mode === 'timer' && (
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
            pending={pending}
            startPending={startPending}
            stopPending={stopPending}
            formatTime={formatTime}
            onApplyPreset={onApplyPreset}
            onStart={onStart}
            onStop={onStop}
            onDiscard={onDiscard}
            onUpdateStartedAt={onUpdateStartedAt}
          />
        )}

        {mode === 'manual' && (
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
        )}
      </div>
    </section>
  )
}
