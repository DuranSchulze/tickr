import { useMemo } from 'react'
import { ClientProjectPicker } from '../pickers/ClientProjectPicker'
import { TagPicker } from '../pickers/TagPicker'
import { DateTimePicker } from './DateTimePicker'
import type { DraftEntry } from './utils'

type ClientItem = {
  id: string
  name: string
  clientStatus: 'ACTIVE' | 'INACTIVE'
}
type ProjectItem = { id: string; name: string; color: string; clientId: string }

export function EntryDraftForm({
  draft,
  setDraft,
  clients,
  projects,
  projectTasks,
  tags,
  onCreateTask,
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
  onCreateTask?: (projectId: string, name: string) => Promise<void>
  onCreateTag?: (name: string, color: string) => Promise<void>
  canManageCatalog?: boolean
  compact?: boolean
  isRunning?: boolean
}) {
  const activeClients = useMemo(
    () => clients.filter((c) => c.clientStatus === 'ACTIVE'),
    [clients],
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
          className="h-10 w-full rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
        />
      </div>

      {/* Row 2: Client + Project (unified) + Tag */}
      <div className="grid gap-3 sm:grid-cols-2">
        <ClientProjectPicker
          clients={activeClients}
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
        />
        <TagPicker
          tags={tags}
          value={draft.tagIds}
          onChange={(ids) => setDraft({ ...draft, tagIds: ids })}
          onCreate={onCreateTag ?? (() => Promise.resolve())}
          canCreate={canManageCatalog}
        />
      </div>

      {/* Row 3: Start date + End date + Billable */}
      <div
        className={`grid gap-3 ${isRunning ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}
      >
        <DateTimePicker
          value={draft.startedAt}
          onChange={(value) => setDraft({ ...draft, startedAt: value })}
          placeholder="Start date & time"
        />
        {!isRunning && (
          <DateTimePicker
            value={draft.endedAt}
            onChange={(value) => setDraft({ ...draft, endedAt: value })}
            placeholder="End date & time"
          />
        )}
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
          className="h-10 rounded-lg border border-border bg-card text-foreground px-3 text-sm outline-none focus:border-primary"
        />
      )}
    </div>
  )
}
