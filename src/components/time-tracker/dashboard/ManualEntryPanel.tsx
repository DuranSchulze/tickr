import { Plus } from 'lucide-react'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import type { Client, Project } from '#/lib/time-tracker/types'
import { EntryDraftForm } from './EntryDraftForm'
import { calculateManualSeconds } from './utils'
import type { DraftEntry } from './utils'

export function ManualEntryPanel({
  draft,
  setDraft,
  clients,
  projects,
  tags,
  onCreateClient,
  onCreateProject,
  onCreateTag,
  canManageCatalog = true,
  pending,
  onSubmit,
}: {
  draft: DraftEntry
  setDraft: (draft: DraftEntry) => void
  clients: Client[]
  projects: Project[]
  tags: SearchableItem[]
  onCreateClient: (name: string) => Promise<void>
  onCreateProject: (
    name: string,
    color: string,
    clientId: string,
  ) => Promise<void>
  onCreateTag: (name: string, color: string) => Promise<void>
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
        tags={tags}
        onCreateClient={onCreateClient}
        onCreateProject={onCreateProject}
        onCreateTag={onCreateTag}
        canManageCatalog={canManageCatalog}
      />
      {/* Row 5: Add entry button (full width) */}
      <div className="pt-2">
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
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          <Plus className="h-4 w-4" />
          Add entry
        </button>
      </div>
    </div>
  )
}
