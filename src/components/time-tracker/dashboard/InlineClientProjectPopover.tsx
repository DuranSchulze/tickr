import { useMemo, useState } from 'react'
import { Building2, ChevronDown } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'

type ClientItem = { id: string; name: string }
type ProjectItem = { id: string; name: string; color: string; clientId: string }

type GroupedRow =
  | { kind: 'client'; client: ClientItem }
  | { kind: 'project'; project: ProjectItem; client: ClientItem }

export function InlineClientProjectPopover({
  clients,
  projects,
  clientId,
  projectId,
  onChange,
  disabled,
}: {
  clients: ClientItem[]
  projects: ProjectItem[]
  clientId: string
  projectId: string
  onChange: (clientId: string, projectId: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId],
  )
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  )
  const hasSelection = !!clientId && !!projectId

  // Build grouped rows filtered by search — only while the popover is open.
  // This component renders in every entry row, so doing this work per render
  // while closed multiplied across the whole list.
  const rows = useMemo<GroupedRow[]>(() => {
    if (!open) return []
    const q = query.toLowerCase()
    const projectsByClient = new Map<string, ProjectItem[]>()
    for (const project of projects) {
      const list = projectsByClient.get(project.clientId)
      if (list) list.push(project)
      else projectsByClient.set(project.clientId, [project])
    }

    const result: GroupedRow[] = []
    for (const client of clients) {
      const clientMatches = client.name.toLowerCase().includes(q)
      const clientProjects = projectsByClient.get(client.id) ?? []
      const matchingProjects = q
        ? clientMatches
          ? clientProjects
          : clientProjects.filter((p) => p.name.toLowerCase().includes(q))
        : clientProjects

      if (matchingProjects.length === 0 && !clientMatches) continue

      result.push({ kind: 'client', client })
      for (const project of matchingProjects) {
        result.push({ kind: 'project', project, client })
      }
    }
    return result
  }, [open, query, clients, projects])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex items-center gap-1.5 rounded px-1.5 py-1 text-sm text-left transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50 max-w-[180px]"
        >
          {hasSelection ? (
            <>
              <span
                className="size-2 rounded-full shrink-0"
                style={{ backgroundColor: selectedProject!.color }}
              />
              <span className="truncate text-foreground">
                {selectedClient?.name}
                <span className="text-muted-foreground">
                  {' '}
                  ›{' '}
                  <span className="text-foreground">
                    {selectedProject!.name}
                  </span>
                </span>
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">Client / Project</span>
          )}
          <ChevronDown className="size-3 shrink-0 text-muted-foreground/60" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        {/* Search */}
        <div className="mb-2">
          <input
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
            placeholder="Search clients or projects…"
            aria-label="Search clients or projects"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* Results */}
        <div className="max-h-56 overflow-y-auto">
          {rows.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">
              No clients or projects found
            </p>
          ) : (
            rows.map((row, i) => {
              if (row.kind === 'client') {
                return (
                  <div
                    key={`client-${row.client.id}`}
                    className={`flex items-center gap-2 px-2 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground ${
                      i > 0 ? 'mt-1 border-t border-border/50 pt-2' : ''
                    }`}
                  >
                    <Building2 className="size-3 shrink-0" />
                    <span className="truncate">{row.client.name}</span>
                  </div>
                )
              }

              const isActive = row.project.id === projectId
              return (
                <button
                  key={`project-${row.project.id}`}
                  type="button"
                  onClick={() => {
                    onChange(row.client.id, row.project.id)
                    setOpen(false)
                    setQuery('')
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 pl-7 text-sm text-left transition-colors hover:bg-accent ${
                    isActive
                      ? 'bg-accent font-semibold text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: row.project.color }}
                  />
                  <span className="flex-1 truncate">{row.project.name}</span>
                  {isActive && (
                    <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                  )}
                </button>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
