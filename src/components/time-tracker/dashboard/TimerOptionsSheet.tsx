import { X } from 'lucide-react'
import { ClientProjectPicker } from '../pickers/ClientProjectPicker'
import type { ClientItem, ProjectItem } from '../pickers/ClientProjectPicker'
import { TagPicker } from '../pickers/TagPicker'
import { BillableToggleButton } from './BillableToggleButton'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'
import { useMemo } from 'react'

export function TimerOptionsSheet({
  clients,
  projects,
  projectTasks,
  tags,
  clientId,
  projectId,
  taskId,
  onClientProjectChange,
  onTagIdsChange,
  tagIds,
  billable,
  onBillableChange,
  onCreateTag,
  canManageCatalog = true,
  onClose,
}: {
  clients: ClientItem[]
  projects: ProjectItem[]
  projectTasks: Array<{ id: string; projectId: string; name: string }>
  tags: SearchableItem[]
  clientId: string
  projectId: string
  taskId: string
  onClientProjectChange: (
    clientId: string,
    projectId: string,
    taskId?: string,
  ) => void
  tagIds: string[]
  onTagIdsChange: (ids: string[]) => void
  billable: boolean
  onBillableChange: (next: boolean) => void
  onCreateTag: (name: string, color: string) => Promise<void>
  canManageCatalog?: boolean
  onClose: () => void
}) {
  const activeClients = useMemo(
    () =>
      clients.filter((c) =>
        'clientStatus' in c ? (c as any).clientStatus === 'ACTIVE' : true,
      ),
    [clients],
  )

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative grid w-full max-w-sm gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="m-0 text-base font-bold text-foreground">
            Timer options
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close timer options"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-3">
          <ClientProjectPicker
            clients={activeClients}
            projects={projects}
            tasks={projectTasks}
            clientId={clientId}
            projectId={projectId}
            taskId={taskId}
            onChange={onClientProjectChange}
          />
          <TagPicker
            tags={tags}
            value={tagIds}
            onChange={onTagIdsChange}
            onCreate={onCreateTag}
            canCreate={canManageCatalog}
          />
          <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
            <span className="text-sm font-semibold text-foreground">
              Billable
            </span>
            <BillableToggleButton
              pressed={billable}
              onPressedChange={onBillableChange}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-lg bg-primary text-sm font-bold text-primary-foreground transition-colors hover:brightness-110"
        >
          Done
        </button>
      </div>
    </div>
  )
}
