import { useMemo, useRef, useState } from 'react'
import {
  Building2,
  ChevronDown,
  ChevronRight,
  ListPlus,
  Trash2,
  X,
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { cn } from '#/lib/utils'

export type ClientItem = { id: string; name: string }

export type ProjectItem = {
  id: string
  name: string
  color: string
  clientId: string
}

export type ProjectTaskItem = {
  id: string
  projectId: string
  name: string
}

interface Props {
  clients: ClientItem[]
  projects: ProjectItem[]
  tasks: ProjectTaskItem[]
  clientId: string
  projectId: string
  taskId: string
  onChange: (clientId: string, projectId: string, taskId?: string) => void
  onCreateTask?: (projectId: string, name: string) => Promise<void>
  onDeleteTask?: (id: string) => Promise<void>
  disabled?: boolean
  placeholder?: string
  bare?: boolean
  /** Compact badge style — minimal text-only trigger for table rows. */
  compact?: boolean
}

type GroupedRow =
  | { kind: 'client'; client: ClientItem }
  | { kind: 'project'; project: ProjectItem; client: ClientItem }
  | { kind: 'task'; task: ProjectTaskItem; project: ProjectItem }
  | { kind: 'add-task'; project: ProjectItem }

const MAX_VISIBLE_PROJECTS = 50

function getSearchTokens(search: string): string[] {
  return search.toLowerCase().trim().split(/\s+/).filter(Boolean)
}

function matchesTokens(tokens: string[], ...values: Array<string | undefined>) {
  if (tokens.length === 0) return true
  const haystack = values.join(' ').toLowerCase()
  return tokens.every((token) => haystack.includes(token))
}

export function ClientProjectPicker({
  clients,
  projects,
  tasks,
  clientId,
  projectId,
  taskId,
  onChange,
  onCreateTask,
  onDeleteTask,
  disabled = false,
  placeholder = 'Client / Project',
  bare = false,
  compact = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [addingTaskFor, setAddingTaskFor] = useState<string | null>(null)
  const [newTaskName, setNewTaskName] = useState('')
  const [submittingTask, setSubmittingTask] = useState(false)
  const [collapsedClients, setCollapsedClients] = useState<Set<string>>(
    new Set(),
  )
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(
    new Set(),
  )

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ProjectTaskItem | null>(null)
  const [deletingTask, setDeletingTask] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const newTaskInputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  function seedCollapsedProjects() {
    setCollapsedProjects(new Set(projects.map((p) => p.id)))
  }

  function scrollSelectedIntoView() {
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(
        '[data-selected="true"]',
      )
      el?.scrollIntoView({ block: 'nearest' })
    })
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      seedCollapsedProjects()
      setOpen(true)
      scrollSelectedIntoView()
    } else {
      setOpen(false)
      setSearch('')
      setAddingTaskFor(null)
      setNewTaskName('')
    }
  }

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId],
  )
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  )
  const selectedTask = useMemo(
    () => (taskId ? tasks.find((t) => t.id === taskId) : undefined),
    [tasks, taskId],
  )

  const hasSelection = !!clientId && !!projectId && !!selectedProject

  const projectsByClient = useMemo(() => {
    const map = new Map<string, ProjectItem[]>()
    for (const project of projects) {
      const list = map.get(project.clientId)
      if (list) list.push(project)
      else map.set(project.clientId, [project])
    }
    return map
  }, [projects])

  const tasksByProject = useMemo(() => {
    const map = new Map<string, ProjectTaskItem[]>()
    for (const task of tasks) {
      const list = map.get(task.projectId)
      if (list) list.push(task)
      else map.set(task.projectId, [task])
    }
    return map
  }, [tasks])

  const { rows, truncated } = useMemo(() => {
    if (!open) return { rows: [] as GroupedRow[], truncated: false }
    const tokens = getSearchTokens(search)
    const hasQuery = tokens.length > 0
    const result: GroupedRow[] = []
    let projectCount = 0
    let cut = false

    for (const client of clients) {
      if (projectCount >= MAX_VISIBLE_PROJECTS) {
        cut = true
        break
      }
      const clientProjects = projectsByClient.get(client.id) ?? []
      const clientMatches = matchesTokens(tokens, client.name)
      const visibleProjects = hasQuery
        ? clientProjects.filter((project) => {
            const projectTasks = tasksByProject.get(project.id) ?? []
            return (
              matchesTokens(tokens, client.name, project.name) ||
              projectTasks.some((task) =>
                matchesTokens(tokens, client.name, project.name, task.name),
              )
            )
          })
        : clientProjects

      if (visibleProjects.length === 0 && !clientMatches) continue

      const clientCollapsed = collapsedClients.has(client.id)
      result.push({ kind: 'client', client })

      if (clientCollapsed) continue

      for (const project of visibleProjects) {
        if (projectCount >= MAX_VISIBLE_PROJECTS) {
          cut = true
          break
        }
        result.push({ kind: 'project', project, client })
        projectCount++

        const projectTasks = tasksByProject.get(project.id) ?? []
        const projectCollapsed = collapsedProjects.has(project.id)

        if (!projectCollapsed) {
          for (const task of projectTasks) {
            if (
              hasQuery &&
              !matchesTokens(tokens, client.name, project.name, task.name)
            )
              continue
            result.push({ kind: 'task', task, project })
          }
        }

        if (onCreateTask && !projectCollapsed) {
          result.push({ kind: 'add-task', project })
        }
      }
    }
    return { rows: result, truncated: cut }
  }, [
    open,
    search,
    clients,
    projectsByClient,
    tasksByProject,
    collapsedClients,
    collapsedProjects,
    onCreateTask,
  ])

  function toggleClient(cid: string) {
    setCollapsedClients((prev) => {
      const next = new Set(prev)
      if (next.has(cid)) next.delete(cid)
      else next.add(cid)
      return next
    })
  }

  function toggleProject(pid: string) {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
  }

  function openAddTaskFor(pid: string) {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      next.delete(pid)
      return next
    })
    setAddingTaskFor(pid)
    setNewTaskName('')
    requestAnimationFrame(() => newTaskInputRef.current?.focus())
  }

  function handleSelect(
    nextClientId: string,
    nextProjectId: string,
    nextTaskId?: string,
  ) {
    onChange(nextClientId, nextProjectId, nextTaskId)
    setOpen(false)
  }

  function handleClear(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    onChange('', '', undefined)
  }

  async function handleCreateTask(pid: string) {
    if (!onCreateTask || !newTaskName.trim() || submittingTask) return
    setSubmittingTask(true)
    try {
      await onCreateTask(pid, newTaskName.trim())
      setAddingTaskFor(null)
      setNewTaskName('')
    } catch {
      // Error handled by toast in parent
    } finally {
      setSubmittingTask(false)
    }
  }

  async function handleDeleteTask() {
    if (!onDeleteTask || !deleteTarget || deletingTask) return
    setDeletingTask(true)
    try {
      await onDeleteTask(deleteTarget.id)
      setDeleteTarget(null)
    } catch {
      // Error handled by toast in parent
    } finally {
      setDeletingTask(false)
    }
  }

  return (
    <>
      <Popover
        open={open}
        onOpenChange={disabled ? undefined : handleOpenChange}
      >
        {/* Trigger */}
        <div
          className={
            bare
              ? 'group relative h-full'
              : compact
                ? 'group relative'
                : 'group relative'
          }
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={
                compact
                  ? 'flex h-9 w-full items-center justify-start rounded-md px-1.5 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:text-muted-foreground'
                  : bare
                    ? 'flex h-full w-full items-center gap-2 px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent/50 disabled:cursor-not-allowed disabled:text-muted-foreground'
                    : 'flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:border-border/80 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground'
              }
            >
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                {hasSelection ? (
                  compact ? (
                    <>
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: selectedProject.color }}
                      />
                      <span className="flex min-w-0 items-center gap-0 text-left leading-tight">
                        {selectedClient?.name ? (
                          <>
                            <span className="truncate max-w-[82px]">
                              {selectedClient.name}
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              &nbsp;/&nbsp;
                            </span>
                          </>
                        ) : null}
                        {selectedTask ? (
                          <>
                            <span className="shrink-0 whitespace-nowrap text-foreground">
                              {selectedTask.name}
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              &nbsp;-&nbsp;
                            </span>
                          </>
                        ) : null}
                        <span className="truncate text-foreground">
                          {selectedProject.name}
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: selectedProject.color }}
                      />
                      <div
                        className="flex min-w-0 items-center gap-0 text-left"
                        title={`${selectedClient?.name ? selectedClient.name + ' / ' : ''}${selectedTask ? selectedTask.name + ' - ' : ''}${selectedProject.name}`}
                      >
                        {selectedClient?.name ? (
                          <>
                            <span className="truncate max-w-[100px]">
                              {selectedClient.name}
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              &nbsp;/&nbsp;
                            </span>
                          </>
                        ) : null}
                        {selectedTask ? (
                          <>
                            <span className="shrink-0 whitespace-nowrap text-foreground">
                              {selectedTask.name}
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              &nbsp;-&nbsp;
                            </span>
                          </>
                        ) : null}
                        <span className="truncate text-foreground">
                          {selectedProject.name}
                        </span>
                      </div>
                    </>
                  )
                ) : (
                  <span className="text-muted-foreground">{placeholder}</span>
                )}
              </div>

              {!compact && (
                <div className="flex shrink-0 items-center gap-1">
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </div>
              )}
            </button>
          </PopoverTrigger>

          {hasSelection && !compact && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear client and project"
              className="absolute right-7 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}

          {/* Tooltip */}
          {hasSelection && !open && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            >
              <div className="whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-md">
                <p className="text-xs text-muted-foreground">
                  {selectedClient?.name ? (
                    <>
                      {selectedClient.name}
                      <span className="mx-1">/</span>
                    </>
                  ) : null}
                  {selectedTask ? (
                    <>
                      {selectedTask.name}
                      <span className="mx-1">-</span>
                    </>
                  ) : null}
                  <span className="font-semibold text-foreground">
                    {selectedProject.name}
                  </span>
                </p>
              </div>
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-border" />
              <div className="absolute left-1/2 top-[calc(100%-1px)] -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-popover" />
            </div>
          )}
        </div>

        {/* Dropdown */}
        <PopoverContent
          align="start"
          sideOffset={4}
          collisionPadding={12}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
          className="max-h-[min(var(--radix-popover-content-available-height),calc(100dvh-1rem))] w-[min(24rem,calc(100vw-1rem))] gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 shadow-xl"
        >
          {/* Search */}
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients, projects or tasks…"
              aria-label="Search clients, projects or tasks"
              className="h-10 w-full scroll-mt-24 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary sm:h-8"
            />
          </div>

          {/* Results */}
          <div
            ref={listRef}
            className="max-h-[min(22rem,calc(100dvh-10rem))] min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]"
          >
            {rows.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No clients, projects or tasks found
              </p>
            ) : (
              rows.map((row, i) => {
                // ── Client header ──
                if (row.kind === 'client') {
                  const cCollapsed = collapsedClients.has(row.client.id)
                  return (
                    <button
                      key={`client-${row.client.id}`}
                      type="button"
                      onClick={() => toggleClient(row.client.id)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-accent/50',
                        i > 0 && 'mt-1 border-t border-border/50 pt-2',
                        'min-h-10 sm:min-h-0',
                      )}
                    >
                      {cCollapsed ? (
                        <ChevronRight className="size-3.5 shrink-0" />
                      ) : (
                        <ChevronDown className="size-3.5 shrink-0" />
                      )}
                      <Building2 className="size-3 shrink-0" />
                      <span className="truncate">{row.client.name}</span>
                    </button>
                  )
                }

                // ── Project row ──
                if (row.kind === 'project') {
                  const pCollapsed = collapsedProjects.has(row.project.id)
                  const pActive = row.project.id === projectId && !taskId
                  const hasTasks =
                    (tasksByProject.get(row.project.id)?.length ?? 0) > 0
                  return (
                    <div
                      key={`project-${row.project.id}`}
                      className={cn(
                        'flex min-h-10 w-full items-center gap-0.5 py-1.5 pl-7 pr-2 text-left text-xs transition-colors hover:bg-accent/30 sm:min-h-0',
                        pActive && 'bg-accent/50',
                      )}
                    >
                      {/* Chevron — only when there are tasks to show/hide */}
                      {hasTasks ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleProject(row.project.id)
                          }}
                          className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                          aria-label={pCollapsed ? 'Show tasks' : 'Hide tasks'}
                        >
                          {pCollapsed ? (
                            <ChevronRight className="size-3" />
                          ) : (
                            <ChevronDown className="size-3" />
                          )}
                        </button>
                      ) : (
                        <span className="w-5 shrink-0" />
                      )}

                      {/* Select project */}
                      <button
                        type="button"
                        data-selected={pActive ? 'true' : undefined}
                        onClick={() =>
                          handleSelect(row.client.id, row.project.id)
                        }
                        className={cn(
                          'flex flex-1 items-center gap-2 rounded py-0.5 -my-0.5',
                          pActive
                            ? 'font-medium text-foreground'
                            : 'font-normal text-muted-foreground',
                        )}
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: row.project.color }}
                        />
                        <span className="truncate">{row.project.name}</span>
                        {pActive && (
                          <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                      </button>

                      {/* Add-task icon — one click to expand + open inline textbox */}
                      {onCreateTask && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            openAddTaskFor(row.project.id)
                          }}
                          className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                          aria-label="Add task"
                          title="Add task"
                        >
                          <ListPlus className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )
                }

                // ── Task row ──
                if (row.kind === 'task') {
                  const tActive = row.task.id === taskId
                  return (
                    <div
                      key={`task-${row.task.id}`}
                      data-selected={tActive ? 'true' : undefined}
                      className={cn(
                        'group/task flex min-h-10 w-full items-center gap-2 py-1.5 pl-16 pr-3 text-left text-xs transition-colors hover:bg-accent sm:min-h-0',
                        tActive
                          ? 'bg-accent/50 text-foreground'
                          : 'font-normal text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          handleSelect(
                            row.project.clientId,
                            row.project.id,
                            row.task.id,
                          )
                        }
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-2 text-left',
                          tActive && 'font-medium',
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {row.task.name}
                        </span>
                        {tActive && (
                          <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                      </button>
                      {onDeleteTask && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteTarget(row.task)
                          }}
                          className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover/task:opacity-100"
                          aria-label={`Delete task ${row.task.name}`}
                          title="Delete task"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
                  )
                }

                // ── Inline add-task input ──
                {
                  const isAdding = addingTaskFor === row.project.id
                  if (isAdding) {
                    return (
                      <div
                        key={`add-task-${row.project.id}`}
                        className="flex items-center gap-1 py-1 pl-16 pr-3"
                      >
                        <input
                          ref={newTaskInputRef}
                          value={newTaskName}
                          onChange={(e) => setNewTaskName(e.target.value)}
                          placeholder="New task name…"
                          aria-label="New task name"
                          className="h-10 flex-1 scroll-mt-24 rounded border border-border bg-background px-2 text-sm focus:border-primary focus:outline-none sm:h-7 sm:text-xs"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter')
                              handleCreateTask(row.project.id)
                            if (e.key === 'Escape') {
                              setAddingTaskFor(null)
                              setNewTaskName('')
                            }
                          }}
                          onBlur={() => {
                            if (!submittingTask) {
                              setAddingTaskFor(null)
                              setNewTaskName('')
                            }
                          }}
                        />
                        <button
                          type="button"
                          disabled={submittingTask || !newTaskName.trim()}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            handleCreateTask(row.project.id)
                          }}
                          className="grid size-7 place-items-center rounded text-primary hover:bg-primary/10 disabled:opacity-40"
                          aria-label="Create task"
                        >
                          <ChevronRight className="size-3.5" />
                        </button>
                      </div>
                    )
                  }
                  return null
                }
              })
            )}
            {truncated && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Showing first {MAX_VISIBLE_PROJECTS} — type to narrow results.
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null)
        }}
      >
        <DialogContent showCloseButton={false} className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete task</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground">
                {deleteTarget?.name}
              </span>
              ? This will archive the task.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deletingTask}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteTask}
              disabled={deletingTask}
            >
              {deletingTask ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
