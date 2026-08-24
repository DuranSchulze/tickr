import { useMemo } from 'react'
import { Loader2, Play, Square } from 'lucide-react'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import type { CreateProjectTask } from '../pickers/ClientProjectPicker'
import type { Client, Project, Tag, TimeEntry } from '#/lib/time-tracker/types'
import { ClientProjectPicker } from '../pickers/ClientProjectPicker'
import { TagPicker } from '../pickers/TagPicker'
import { SuspendedClientWarning } from '../catalogs/CatalogFormParts'
import { BillableToggleButton } from './BillableToggleButton'
import { PresetDropdown } from './PresetDropdown'

export function TimerMobileControls({
  workspaceId,
  clients,
  projects,
  projectTasks,
  tags,
  clientId,
  projectId,
  taskId,
  tagIds,
  billable,
  canManageCatalog,
  activeEntry,
  startPending,
  stopPending,
  stopBlocked,
  stopBlockedReason,
  onClientIdChange,
  onProjectIdChange,
  onTaskIdChange,
  onTagIdsChange,
  onBillableChange,
  onCreateTask,
  onDeleteTask,
  onCreateTag,
  onApplyPreset,
  onStart,
  onStop,
}: {
  workspaceId: string
  clients: Client[]
  projects: Project[]
  projectTasks: Array<{ id: string; projectId: string; name: string }>
  tags: SearchableItem[]
  clientId: string
  projectId: string
  taskId: string
  tagIds: string[]
  billable: boolean
  canManageCatalog: boolean
  activeEntry: TimeEntry | undefined
  startPending: boolean
  stopPending: boolean
  stopBlocked: boolean
  stopBlockedReason: string
  onClientIdChange: (id: string) => void
  onProjectIdChange: (id: string) => void
  onTaskIdChange: (id: string) => void
  onTagIdsChange: (ids: string[]) => void
  onBillableChange: (next: boolean) => void
  onCreateTask: CreateProjectTask
  onDeleteTask: (id: string) => Promise<void>
  onCreateTag: (name: string, color: string) => Promise<void>
  onApplyPreset: (preset: {
    clientId: string
    projectId: string
    taskId: string
    tagIds: string[]
    billable: boolean
  }) => void
  onStart: () => void
  onStop: () => void
}) {
  const selectableClients = useMemo(
    () => clients.filter((c) => c.clientStatus !== 'INACTIVE'),
    [clients],
  )
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId],
  )

  return (
    <div className="grid gap-2 sm:hidden">
      <div className="grid gap-2 rounded-lg border border-border bg-card p-2">
        <ClientProjectPicker
          clients={selectableClients}
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
          onDeleteTask={onDeleteTask}
        />
        {selectedClient?.clientStatus === 'SUSPENDED' && (
          <SuspendedClientWarning clientName={selectedClient.name} />
        )}
        <TagPicker
          tags={tags}
          value={tagIds}
          onChange={onTagIdsChange}
          onCreate={onCreateTag}
          canCreate={canManageCatalog}
        />
        <div className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3">
          <span className="min-w-0 text-sm font-semibold text-foreground">
            Billable
          </span>
          <BillableToggleButton
            pressed={billable}
            onPressedChange={onBillableChange}
            className="ml-auto size-8"
          />
          <PresetDropdown
            workspaceId={workspaceId}
            clientId={clientId}
            projectId={projectId}
            taskId={taskId}
            tagIds={tagIds}
            billable={billable}
            clients={clients}
            projects={projects}
            projectTasks={projectTasks}
            tags={tags as Tag[]}
            onApplyPreset={onApplyPreset}
            bare
          />
        </div>
      </div>

      <button
        type="button"
        onClick={activeEntry ? onStop : onStart}
        disabled={activeEntry ? stopPending || stopBlocked : startPending}
        title={stopBlocked ? stopBlockedReason : undefined}
        className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground ${
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
  )
}
