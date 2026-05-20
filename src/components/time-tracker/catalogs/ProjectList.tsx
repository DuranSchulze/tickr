import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { archiveProjectFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import {
  ColorDot,
  DangerButton,
  EditButton,
  EditPanel,
  EmptyCatalog,
  ListRow,
  SelectionBar,
} from './CatalogListParts'
import { EditProjectForm } from './EditProjectForm'
import { useCatalogListSelection } from './useCatalogListSelection'

export function ProjectList({
  projects,
  clients,
  canManage,
}: {
  projects: TrackerState['projects']
  clients: TrackerState['clients']
  canManage: boolean
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [collapsedClientIds, setCollapsedClientIds] = useState<Set<string>>(
    new Set(),
  )
  const {
    selectedIds,
    bulkDeleting,
    setBulkDeleting,
    toggleSelect,
    toggleAll,
    clearSelection,
  } = useCatalogListSelection()

  const grouped = useMemo(() => {
    const clientMap = new Map(clients.map((c) => [c.id, c]))
    const groups = new Map<
      string,
      {
        client: TrackerState['clients'][number]
        projects: TrackerState['projects']
      }
    >()
    for (const project of projects) {
      const client = clientMap.get(project.clientId)
      if (!client) continue
      if (!groups.has(project.clientId)) {
        groups.set(project.clientId, { client, projects: [] })
      }
      groups.get(project.clientId)!.projects.push(project)
    }
    return [...groups.values()]
  }, [projects, clients])

  function toggleCollapse(clientId: string) {
    setCollapsedClientIds((prev) => {
      const next = new Set(prev)
      next.has(clientId) ? next.delete(clientId) : next.add(clientId)
      return next
    })
  }

  async function handleBulkDelete() {
    setBulkDeleting(true)
    const ids = [...selectedIds]
    const results = await Promise.allSettled(
      ids.map((id) => archiveProjectFn({ data: { id } })),
    )
    await router.invalidate()
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    if (succeeded > 0)
      gooeyToast.success(
        `${succeeded} project${succeeded > 1 ? 's' : ''} archived${failed > 0 ? `, ${failed} failed` : ''}`,
      )
    else gooeyToast.error('Could not archive projects')
    clearSelection()
    setBulkDeleting(false)
  }

  if (projects.length === 0) return <EmptyCatalog label="No projects yet." />

  return (
    <div className="grid gap-1">
      {canManage && (
        <div className="mb-1">
          <SelectionBar
            total={projects.length}
            selectedCount={selectedIds.size}
            onToggleAll={() => toggleAll(projects.map((p) => p.id))}
            onBulkDelete={handleBulkDelete}
            deleting={bulkDeleting}
          />
        </div>
      )}
      {grouped.map(({ client, projects: clientProjects }) => {
        const isCollapsed = collapsedClientIds.has(client.id)
        return (
          <div key={client.id} className="grid gap-1">
            <button
              type="button"
              onClick={() => toggleCollapse(client.id)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-accent"
            >
              <ChevronRight
                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
              />
              <span className="flex-1 truncate text-sm font-bold text-foreground">
                {client.name}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {clientProjects.length}
              </span>
            </button>

            {!isCollapsed && (
              <div className="ml-5 grid gap-1 border-l border-border pl-3">
                {clientProjects.map((project) =>
                  editingId === project.id ? (
                    <EditPanel
                      key={project.id}
                      title={`Editing "${project.name}"`}
                      onClose={() => setEditingId(null)}
                    >
                      <EditProjectForm
                        project={project}
                        clients={clients}
                        onDone={() => setEditingId(null)}
                      />
                    </EditPanel>
                  ) : (
                    <ListRow key={project.id}>
                      {canManage && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(project.id)}
                          onChange={() => toggleSelect(project.id)}
                          className="h-4 w-4 shrink-0 accent-primary"
                        />
                      )}
                      <ColorDot color={project.color} />
                      <div className="min-w-0 flex-1">
                        <p className="m-0 truncate text-sm font-bold text-foreground">
                          {project.name}
                        </p>
                      </div>
                      {canManage && (
                        <>
                          <EditButton
                            onClick={() => setEditingId(project.id)}
                          />
                          <DangerButton
                            title="Archive project"
                            pending={pendingId === project.id}
                            onClick={async () => {
                              setPendingId(project.id)
                              try {
                                await archiveProjectFn({
                                  data: { id: project.id },
                                })
                                await router.invalidate()
                                gooeyToast.success(`"${project.name}" archived`)
                              } finally {
                                setPendingId(null)
                              }
                            }}
                          />
                        </>
                      )}
                    </ListRow>
                  ),
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
