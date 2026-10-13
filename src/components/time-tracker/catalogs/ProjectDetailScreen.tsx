import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Loader2, Pencil, Plus } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { getProjectTasksPageFn } from '#/lib/server/tracker/catalogs/project-detail'
import type { getProjectDetail } from '#/lib/server/tracker/catalogs/project-detail.server'
import { CatalogFormDialog } from './CatalogFormDialog'
import { EditProjectForm } from './EditProjectForm'
import { ProjectTaskForm } from './ProjectTaskForm'

type Cursor = { name: string; id: string }
type ProjectDetail = NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>

export function ProjectDetailScreen({
  project,
  workspaceId,
  canManage,
}: {
  project: ProjectDetail
  workspaceId: string
  canManage: boolean
}) {
  const queryClient = useQueryClient()
  const [cursors, setCursors] = useState<Array<Cursor | undefined>>([undefined])
  const [taskForm, setTaskForm] = useState<
    { id: string; name: string } | 'create' | null
  >(null)
  const [editingProject, setEditingProject] = useState(false)
  const cursor = cursors.at(-1)
  const tasks = useQuery({
    queryKey: ['project-tasks', workspaceId, project.id, cursor ?? null],
    queryFn: () =>
      getProjectTasksPageFn({ data: { projectId: project.id, cursor } }),
    staleTime: 30_000,
  })
  async function refresh() {
    setCursors([undefined])
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['project-tasks', workspaceId, project.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ['client-related', workspaceId, project.clientId],
      }),
    ])
  }
  return (
    <div className="grid min-w-0 gap-6">
      <Link
        to="/app/workspace/catalogs/projects"
        className="inline-flex items-center gap-2 text-sm text-smoke hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All projects
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 flex items-center gap-3 text-2xl font-bold">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <span className="break-words">{project.name}</span>
          </h1>
          <p className="mt-2 text-sm text-smoke">
            {project.clientName} · {project.archived ? 'Archived' : 'Active'}
          </p>
        </div>
        {canManage && (
          <Button variant="outline" onClick={() => setEditingProject(true)}>
            <Pencil className="mr-2 size-4" />
            Edit Project
          </Button>
        )}
      </header>
      <section
        className="min-w-0 rounded-xl border border-stone bg-popover p-4 sm:p-6"
        aria-labelledby="project-tasks-heading"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="project-tasks-heading" className="m-0 text-lg font-semibold">
            Project tasks
          </h2>
          {canManage &&
            !project.archived &&
            project.clientStatus === 'ACTIVE' && (
              <Button onClick={() => setTaskForm('create')}>
                <Plus className="mr-2 size-4" />
                New Task
              </Button>
            )}
        </div>
        {tasks.isPending && (
          <p role="status" className="flex items-center gap-2 text-smoke">
            <Loader2 className="size-4 animate-spin" />
            Loading tasks…
          </p>
        )}
        {tasks.isError && (
          <div role="alert">
            <p>Unable to load tasks.</p>
            <Button variant="outline" onClick={() => void tasks.refetch()}>
              Retry
            </Button>
          </div>
        )}
        {tasks.data && (
          <>
            {tasks.data.items.length === 0 && (
              <p className="py-8 text-center text-smoke">
                {cursors.length === 1
                  ? 'No tasks under this project yet.'
                  : 'No tasks on this page.'}
              </p>
            )}
            <ul className="m-0 divide-y divide-stone p-0">
              {tasks.data.items.map((task) => (
                <li key={task.id} className="flex items-center gap-3 py-3">
                  <span className="min-w-0 flex-1 break-words font-medium">
                    {task.name}
                  </span>
                  <span className="text-xs text-smoke">
                    {task.archived ? 'Archived' : 'Active'}
                  </span>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit ${task.name}`}
                      onClick={() => setTaskForm(task)}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone pt-4">
          <span role="status" className="text-sm text-smoke">
            Page {cursors.length} · Up to 20 tasks per page
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={cursors.length === 1 || tasks.isFetching}
              onClick={() => setCursors((previous) => previous.slice(0, -1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={
                !tasks.data?.nextCursor || tasks.isFetching || tasks.isError
              }
              onClick={() => {
                if (tasks.data?.nextCursor)
                  setCursors((previous) => [...previous, tasks.data.nextCursor])
              }}
            >
              Next
            </Button>
          </div>
        </div>
      </section>
      {canManage && taskForm && (
        <CatalogFormDialog
          title={
            taskForm === 'create'
              ? `New Task for ${project.name}`
              : `Edit "${taskForm.name}"`
          }
          open
          onClose={() => setTaskForm(null)}
        >
          <ProjectTaskForm
            project={project}
            task={taskForm === 'create' ? undefined : taskForm}
            onCancel={() => setTaskForm(null)}
            onSaved={async () => {
              await refresh()
              setTaskForm(null)
            }}
          />
        </CatalogFormDialog>
      )}
      {canManage && editingProject && (
        <CatalogFormDialog
          title={`Edit "${project.name}"`}
          open
          onClose={() => setEditingProject(false)}
        >
          <EditProjectForm
            project={project}
            clients={[]}
            fixedClient={{ id: project.clientId, name: project.clientName }}
            onSaved={refresh}
            onDone={() => setEditingProject(false)}
          />
        </CatalogFormDialog>
      )}
    </div>
  )
}
