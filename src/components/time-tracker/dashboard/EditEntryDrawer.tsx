import { Save, X } from 'lucide-react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { EntryDraftForm } from './EntryDraftForm'
import type { DraftEntry } from './utils'
import type { Client, Project, TimeEntry } from '#/lib/time-tracker/types'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'

type EditEntryDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: TimeEntry | null
  editingDraft: DraftEntry
  setEditingDraft: (draft: DraftEntry) => void
  clients: Client[]
  projects: Project[]
  projectTasks: Array<{ id: string; projectId: string; name: string }>
  tags: SearchableItem[]
  canManageCatalog?: boolean
  pending: boolean
  onSave: () => void
  onCancel: () => void
  onCreateClient?: (name: string) => Promise<void>
  onCreateProject?: (
    name: string,
    color: string,
    clientId: string,
  ) => Promise<void>
  onCreateTask?: (projectId: string, name: string) => Promise<void>
  onDeleteTask?: (id: string) => Promise<void>
  onCreateTag?: (name: string, color: string) => Promise<void>
}

export function EditEntryDrawer({
  open,
  onOpenChange,
  entry,
  editingDraft,
  setEditingDraft,
  clients,
  projects,
  projectTasks,
  tags,
  canManageCatalog = true,
  pending,
  onSave,
  onCancel,
  onCreateClient,
  onCreateProject,
  onCreateTask,
  onDeleteTask,
  onCreateTag,
}: EditEntryDrawerProps) {
  const dialogOpen = open && !!entry

  return (
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-4 max-h-[calc(100dvh-2rem)] translate-y-0 overflow-hidden p-0 sm:top-1/2 sm:max-h-[92vh] sm:max-w-3xl sm:-translate-y-1/2"
        showCloseButton={false}
      >
        {entry && (
          <>
            <DialogHeader className="flex-row items-center justify-between gap-3 border-b border-border px-5 py-4">
              <DialogTitle>Edit</DialogTitle>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close edit dialog"
                  title="Close"
                >
                  <X className="size-4" />
                </Button>
              </DialogClose>
            </DialogHeader>

            <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto overscroll-contain p-4 [-webkit-overflow-scrolling:touch] sm:max-h-[calc(92vh-9rem)] sm:p-5">
              <div className="mb-4 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                {!entry.endedAt ? (
                  <p className="m-0">
                    Timer is currently running. Changes will be saved without
                    stopping the timer.
                  </p>
                ) : (
                  <p className="m-0">
                    Editing entry from{' '}
                    <span className="font-semibold text-foreground">
                      {new Date(entry.startedAt).toLocaleString()}
                    </span>
                  </p>
                )}
              </div>

              <EntryDraftForm
                draft={editingDraft}
                setDraft={setEditingDraft}
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
                isRunning={!entry.endedAt}
              />
            </div>

            <DialogFooter className="border-t border-border p-4 sm:px-5">
              <DialogClose asChild>
                <Button
                  variant="outline"
                  onClick={onCancel}
                  disabled={pending}
                  className="w-full sm:w-auto"
                >
                  <X className="mr-2 size-4" />
                  Cancel
                </Button>
              </DialogClose>
              <Button
                onClick={onSave}
                disabled={pending}
                className="w-full sm:w-auto"
              >
                <Save className="mr-2 size-4" />
                Save Changes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
