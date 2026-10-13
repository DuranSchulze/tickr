import { lazy, Suspense, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Loader2, Pencil, Plus } from 'lucide-react'
import { gooeyToast } from '#/lib/toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { getClientRelatedFn } from '#/lib/server/tracker/catalogs/client-related'
import {
  formatClientRelatedList,
  writeClipboardText,
} from './client-related-clipboard'
import type { ClientRelatedClipboardItem } from './client-related-clipboard'

import { CatalogFormDialog } from './CatalogFormDialog'

const ProjectForm = lazy(() =>
  import('./ProjectForm').then((module) => ({ default: module.ProjectForm })),
)
const EditProjectForm = lazy(() =>
  import('./EditProjectForm').then((module) => ({
    default: module.EditProjectForm,
  })),
)

type EditableProject = {
  id: string
  name: string
  color: string
  clientId: string
}

type Cursor = { name: string; id: string }

export function ClientDetailsDialog({
  client,
  workspaceId,
  canManage = false,
  onClose,
}: {
  client: { id: string; name: string; clientStatus?: string }
  workspaceId: string
  canManage?: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editingProject, setEditingProject] = useState<EditableProject | null>(
    null,
  )
  const [kind, setKind] = useState<'projects' | 'tasks' | 'tags'>('projects')
  const [cursors, setCursors] = useState<Array<Cursor | undefined>>([undefined])
  const [copying, setCopying] = useState(false)
  const cursor = cursors.at(-1)
  const query = useQuery({
    queryKey: ['client-related', workspaceId, client.id, kind, cursor ?? null],
    queryFn: () =>
      getClientRelatedFn({ data: { clientId: client.id, kind, cursor } }),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  })

  async function refreshRelated() {
    setCursors([undefined])
    await queryClient.invalidateQueries({
      queryKey: ['client-related', workspaceId, client.id],
    })
  }

  // Copies every item for the active section (not just the visible page) so a
  // paste always contains the client's complete list, formatted as a layered
  // outline rooted at the client name.
  async function handleCopy() {
    setCopying(true)
    try {
      const items: ClientRelatedClipboardItem[] = []
      let nextCursor: Cursor | undefined
      for (let page = 0; page < 50; page += 1) {
        const result = await getClientRelatedFn({
          data: { clientId: client.id, kind, cursor: nextCursor },
        })
        items.push(...result.items)
        if (!result.nextCursor) break
        nextCursor = result.nextCursor
      }
      await writeClipboardText(
        formatClientRelatedList({ clientName: client.name, kind, items }),
      )
      gooeyToast.success(`Copied ${items.length} ${kind}`)
    } catch {
      gooeyToast.error(`Could not copy ${kind}`)
    } finally {
      setCopying(false)
    }
  }

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
      >
        <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-xl">
          <DialogHeader className="pr-8">
            <DialogTitle className="break-words text-xl">
              {client.name}
            </DialogTitle>
            <DialogDescription>
              Browse projects, project tasks, and tags used on this client’s
              time entries.
            </DialogDescription>
          </DialogHeader>
          <div
            className="flex flex-wrap items-center gap-2"
            aria-label="Client details sections"
          >
            {(['projects', 'tasks', 'tags'] as const).map((section) => (
              <Button
                key={section}
                variant={section === kind ? 'default' : 'outline'}
                aria-pressed={section === kind}
                onClick={() => {
                  setKind(section)
                  setCursors([undefined])
                }}
              >
                {section === 'projects'
                  ? 'Projects'
                  : section === 'tasks'
                    ? 'Tasks'
                    : 'Tags'}
              </Button>
            ))}
            <Button
              variant="outline"
              className="ml-auto"
              disabled={copying || query.isPending}
              aria-busy={copying}
              onClick={() => void handleCopy()}
            >
              {copying ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Copy className="mr-1.5 size-4" />
              )}
              Copy
            </Button>
          </div>
          {canManage &&
            kind === 'projects' &&
            (!client.clientStatus || client.clientStatus === 'ACTIVE') && (
              <Button
                className="self-start"
                onClick={() => setShowCreate(true)}
              >
                <Plus className="mr-1.5 size-4" />
                New Project
              </Button>
            )}
          <div
            className="min-h-48 overflow-y-auto"
            aria-busy={query.isFetching}
          >
            {query.isPending && (
              <p role="status" className="flex items-center gap-2 text-smoke">
                <Loader2 className="size-4 animate-spin" />
                Loading {kind}…
              </p>
            )}
            {query.isError && (
              <div role="alert" className="grid gap-3">
                <p>Unable to load {kind}. Please try again.</p>
                <Button variant="outline" onClick={() => void query.refetch()}>
                  Retry
                </Button>
              </div>
            )}
            {query.data && (
              <>
                {query.data.items.length === 0 && (
                  <p className="py-8 text-center text-smoke">
                    {kind === 'projects'
                      ? 'No projects under this client yet.'
                      : kind === 'tasks'
                        ? 'No tasks under this client’s projects yet.'
                        : 'No tags used on this client’s time entries yet.'}
                  </p>
                )}
                <ul className="m-0 divide-y divide-stone p-0">
                  {query.data.items.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 py-3">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="min-w-0 flex-1 break-words font-medium">
                        {kind === 'projects' ? (
                          <Link
                            to="/app/workspace/catalogs/projects/$projectId"
                            params={{ projectId: item.id }}
                            preload={false}
                            onClick={onClose}
                            className="text-foreground no-underline hover:text-primary hover:underline"
                          >
                            {item.name}
                          </Link>
                        ) : (
                          item.name
                        )}
                        {item.projectName && (
                          <span className="block text-xs font-normal text-smoke">
                            {item.projectName}
                          </span>
                        )}
                      </span>
                      <span className="text-xs text-smoke">
                        {item.archived ? 'Archived' : 'Active'}
                      </span>
                      {canManage && kind === 'projects' && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${item.name}`}
                          onClick={() =>
                            setEditingProject({
                              id: item.id,
                              name: item.name,
                              color: item.color,
                              clientId: client.id,
                            })
                          }
                        >
                          <Pencil className="size-4" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-stone pt-4">
            <span className="text-sm text-smoke" role="status">
              Page {cursors.length} · Up to 20 {kind} per page
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={cursors.length === 1 || query.isFetching}
                onClick={() => setCursors((previous) => previous.slice(0, -1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={
                  !query.data?.nextCursor || query.isFetching || query.isError
                }
                onClick={() => {
                  if (query.data?.nextCursor)
                    setCursors((previous) => [
                      ...previous,
                      query.data.nextCursor,
                    ])
                }}
              >
                Next
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {canManage && showCreate && (
        <CatalogFormDialog
          title={`New Project for ${client.name}`}
          open
          onClose={() => setShowCreate(false)}
        >
          <Suspense fallback={<p role="status">Loading form…</p>}>
            <ProjectForm
              clients={[]}
              fixedClient={client}
              onSuccess={async () => {
                setShowCreate(false)
                await refreshRelated()
              }}
            />
          </Suspense>
        </CatalogFormDialog>
      )}
      {canManage && editingProject && (
        <CatalogFormDialog
          title={`Edit "${editingProject.name}"`}
          open
          onClose={() => setEditingProject(null)}
        >
          <Suspense fallback={<p role="status">Loading form…</p>}>
            <EditProjectForm
              project={editingProject}
              clients={[]}
              fixedClient={client}
              onSaved={refreshRelated}
              onDone={() => setEditingProject(null)}
            />
          </Suspense>
        </CatalogFormDialog>
      )}
    </>
  )
}
