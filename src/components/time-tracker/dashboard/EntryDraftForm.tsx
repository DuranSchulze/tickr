import { useMemo } from 'react'
import type { FocusEvent } from 'react'
import { ClientProjectPicker } from '../pickers/ClientProjectPicker'
import type { CreateProjectTask } from '../pickers/ClientProjectPicker'
import { TagPicker } from '../pickers/TagPicker'
import { SuspendedClientWarning } from '../catalogs/CatalogFormParts'
import { DraftTimeEditor } from './DraftTimeEditor'
import type { DraftEntry } from './utils'

type ClientItem = {
  id: string
  name: string
  clientStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
}
type ProjectItem = { id: string; name: string; color: string; clientId: string }

function keepFocusedFieldVisible(event: FocusEvent<HTMLElement>) {
  const target = event.currentTarget
  window.setTimeout(() => {
    target.scrollIntoView({ block: 'center', inline: 'nearest' })
  }, 120)
}

export function EntryDraftForm({
  draft,
  setDraft,
  clients,
  projects,
  projectTasks,
  tags,
  onCreateTask,
  onDeleteTask,
  onCreateTag,
  canManageCatalog = true,
  compact = false,
  isRunning = false,
}: {
  draft: DraftEntry
  setDraft: (draft: DraftEntry) => void
  clients: ClientItem[]
  projects: ProjectItem[]
  projectTasks: Array<{ id: string; projectId: string; name: string }>
  tags: { id: string; name: string; color: string }[]
  onCreateClient?: (name: string) => Promise<void>
  onCreateProject?: (
    name: string,
    color: string,
    clientId: string,
  ) => Promise<void>
  onCreateTask?: CreateProjectTask
  onDeleteTask?: (id: string) => Promise<void>
  onCreateTag?: (name: string, color: string) => Promise<void>
  canManageCatalog?: boolean
  compact?: boolean
  isRunning?: boolean
}) {
  const selectableClients = useMemo(
    () => clients.filter((c) => c.clientStatus !== 'INACTIVE'),
    [clients],
  )
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === draft.clientId),
    [clients, draft.clientId],
  )

  return (
    <div className={compact ? 'grid gap-2' : 'flex flex-col gap-3'}>
      {/* Row 1: Task name */}
      <div className="relative">
        <input
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Task description"
          aria-label="Task description"
          onFocus={keepFocusedFieldVisible}
          className="h-10 w-full scroll-mt-28 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
        />
      </div>

      {/* Row 2: Client + Project (unified) + Tag */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ClientProjectPicker
          clients={selectableClients}
          projects={projects}
          tasks={projectTasks}
          clientId={draft.clientId}
          projectId={draft.projectId}
          taskId={draft.taskId}
          onChange={(cid, pid, tid) =>
            setDraft({
              ...draft,
              clientId: cid,
              projectId: pid,
              taskId: tid ?? '',
            })
          }
          onCreateTask={onCreateTask}
          onDeleteTask={onDeleteTask}
        />
        <TagPicker
          tags={tags}
          value={draft.tagIds}
          onChange={(ids) => setDraft({ ...draft, tagIds: ids })}
          onCreate={onCreateTag ?? (() => Promise.resolve())}
          canCreate={canManageCatalog}
        />
      </div>
      {selectedClient?.clientStatus === 'SUSPENDED' && (
        <SuspendedClientWarning clientName={selectedClient.name} />
      )}

      {/* Row 3: Date range + Billable */}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <DraftTimeEditor
          startedAt={draft.startedAt}
          endedAt={draft.endedAt}
          isRunning={isRunning}
          onChange={(patch) => setDraft({ ...draft, ...patch })}
        />
        <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground">
          <input
            type="checkbox"
            checked={draft.billable}
            onChange={(e) => setDraft({ ...draft, billable: e.target.checked })}
            className="size-4"
          />
          Billable
        </label>
      </div>

      {/* Row 4: Notes (full width) */}
      {!compact && (
        <input
          value={draft.notes}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          placeholder="Notes (optional)"
          aria-label="Notes"
          onFocus={keepFocusedFieldVisible}
          className="h-10 scroll-mt-28 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
        />
      )}
    </div>
  )
}
