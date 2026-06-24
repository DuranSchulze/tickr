import { useMemo } from 'react'
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

  // Resolve selected items for the preview panel
  const selectedClient = useMemo(
    () => clients.find((c) => c.id === editingDraft.clientId),
    [clients, editingDraft.clientId],
  )
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === editingDraft.projectId),
    [projects, editingDraft.projectId],
  )
  const selectedTask = useMemo(
    () => projectTasks.find((t) => t.id === editingDraft.taskId),
    [projectTasks, editingDraft.taskId],
  )
  const selectedTags = useMemo(
    () => tags.filter((t) => editingDraft.tagIds.includes(t.id)),
    [tags, editingDraft.tagIds],
  )

  return (
    <Dialog open={dialogOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-4 max-h-[calc(100dvh-2rem)] translate-y-0 overflow-hidden p-0 sm:top-1/2 sm:max-h-[92vh] sm:max-w-5xl sm:-translate-y-1/2"
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

            <div className="max-h-[calc(100dvh-11rem)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] sm:max-h-[calc(92vh-9rem)]">
              <div className="mb-0 rounded-none bg-muted/50 p-3 text-sm text-muted-foreground sm:mx-5 sm:mt-4 sm:rounded-md">
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

              <div className="grid gap-0 sm:grid-cols-[1fr_minmax(240px,300px)] sm:gap-0">
                {/* Left: Form */}
                <div className="p-4 sm:p-5">
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

                {/* Right: Selection preview */}
                <div className="border-t border-border bg-muted/30 p-4 sm:border-l sm:border-t-0 sm:p-5">
                  <h3 className="m-0 mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Selection Preview
                  </h3>

                  <div className="grid gap-4">
                    {/* Client */}
                    <div className="grid gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Client
                      </span>
                      {selectedClient ? (
                        <span
                          className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                            selectedClient.clientStatus === 'INACTIVE'
                              ? 'text-muted-foreground line-through'
                              : 'text-foreground'
                          }`}
                        >
                          {selectedClient.name}
                          {selectedClient.clientStatus === 'INACTIVE' && (
                            <span className="rounded bg-muted px-1 text-[10px] font-normal text-muted-foreground no-underline">
                              Inactive
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-sm italic text-muted-foreground">
                          None selected
                        </span>
                      )}
                    </div>

                    {/* Project */}
                    <div className="grid gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Project
                      </span>
                      {selectedProject ? (
                        <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                          <span
                            className="inline-block size-2.5 shrink-0 rounded-full"
                            style={{
                              backgroundColor: selectedProject.color || '#888',
                            }}
                          />
                          {selectedProject.name}
                        </span>
                      ) : (
                        <span className="text-sm italic text-muted-foreground">
                          None selected
                        </span>
                      )}
                    </div>

                    {/* Project Task */}
                    <div className="grid gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Task
                      </span>
                      {selectedTask ? (
                        <span className="text-sm font-semibold text-foreground">
                          {selectedTask.name}
                        </span>
                      ) : (
                        <span className="text-sm italic text-muted-foreground">
                          None selected
                        </span>
                      )}
                    </div>

                    {/* Tags */}
                    <div className="grid gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Tags
                      </span>
                      {selectedTags.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {selectedTags.map((tag) => (
                            <span
                              key={tag.id}
                              className="rounded px-2 py-0.5 text-xs font-semibold"
                              style={{
                                backgroundColor: tag.color
                                  ? `${tag.color}22`
                                  : undefined,
                                color: tag.color || undefined,
                                border: tag.color
                                  ? `1px solid ${tag.color}`
                                  : undefined,
                              }}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-sm italic text-muted-foreground">
                          None selected
                        </span>
                      )}
                    </div>

                    {/* Billable */}
                    <div className="grid gap-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Billing
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                          editingDraft.billable
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {editingDraft.billable ? (
                          <>
                            <span className="size-2 rounded-full bg-amber-500" />
                            Billable
                          </>
                        ) : (
                          'Non-billable'
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="border-t border-border p-4 sm:justify-between sm:px-5">
              <DialogClose asChild>
                <Button
                  variant="outline"
                  onClick={onCancel}
                  disabled={pending}
                  className="w-full sm:w-auto"
                >
                  <X className="hidden size-4 sm:mr-2 sm:inline" />
                  Cancel
                </Button>
              </DialogClose>
              <Button
                onClick={onSave}
                disabled={pending}
                className="w-full sm:w-auto"
              >
                <Save className="hidden size-4 sm:mr-2 sm:inline" />
                Save Changes
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
