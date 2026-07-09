import { Plus } from 'lucide-react'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import type { Client, Project, Tag } from '#/lib/time-tracker/types'
import { EntryDraftForm } from './EntryDraftForm'
import { calculateManualSeconds } from './utils'
import type { DraftEntry } from './utils'
import { PresetDropdown } from './PresetDropdown'

export function ManualEntryPanel({
  workspaceId,
  draft,
  setDraft,
  clients,
  projects,
  projectTasks,
  tags,
  onCreateClient,
  onCreateProject,
  onCreateTask,
  onDeleteTask,
  onCreateTag,
  onApplyPreset,
  canManageCatalog = true,
  pending,
  onSubmit,
}: {
  workspaceId: string
  draft: DraftEntry
  setDraft: (draft: DraftEntry) => void
  clients: Client[]
  projects: Project[]
  projectTasks: Array<{ id: string; projectId: string; name: string }>
  tags: SearchableItem[]
  onCreateClient: (name: string) => Promise<void>
  onCreateProject: (
    name: string,
    color: string,
    clientId: string,
  ) => Promise<void>
  onCreateTask: (projectId: string, name: string) => Promise<void>
  onDeleteTask: (id: string) => Promise<void>
  onCreateTag: (name: string, color: string) => Promise<void>
  onApplyPreset: (preset: {
    clientId: string
    projectId: string
    taskId: string
    tagIds: string[]
    billable: boolean
  }) => void
  canManageCatalog?: boolean
  pending: boolean
  onSubmit: () => void
}) {
  return (
    <div className="grid gap-3">
      <p className="m-0 text-sm text-muted-foreground">
        Add time when work was tracked outside the timer.
      </p>
      <EntryDraftForm
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
      />
      {/* Row 5: Submit + Presets */}
      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={
            pending ||
            !draft.description.trim() ||
            !draft.clientId ||
            !draft.projectId ||
            calculateManualSeconds(draft) <= 0
          }
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          <Plus className="size-4" />
          Add entry
        </button>
        <PresetDropdown
          workspaceId={workspaceId}
          clientId={draft.clientId}
          projectId={draft.projectId}
          taskId={draft.taskId}
          tagIds={draft.tagIds}
          billable={draft.billable}
          clients={clients}
          projects={projects}
          projectTasks={projectTasks}
          tags={tags as Tag[]}
          onApplyPreset={onApplyPreset}
        />
      </div>
    </div>
  )
}
