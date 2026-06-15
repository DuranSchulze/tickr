import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, ChevronDown, X } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { cn } from '#/lib/utils'

export type ClientItem = { id: string; name: string }
export type ProjectItem = {
  id: string
  name: string
  color: string
  clientId: string
}

interface Props {
  clients: ClientItem[]
  projects: ProjectItem[]
  clientId: string
  projectId: string
  onChange: (clientId: string, projectId: string) => void
  disabled?: boolean
  placeholder?: string
  /** Borderless variant for use inside the unified timer bar / table rows. */
  bare?: boolean
}

type GroupedRow =
  | { kind: 'client'; client: ClientItem }
  | { kind: 'project'; project: ProjectItem; client: ClientItem }

// Cap how many projects mount at once. Opening the popover commits every row
// synchronously, so an uncapped list is what makes a large catalog slow.
const MAX_VISIBLE_PROJECTS = 50

export function ClientProjectPicker({
  clients,
  projects,
  clientId,
  projectId,
  onChange,
  disabled = false,
  placeholder = 'Client / Project',
  bare = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Reset the search whenever the popover closes.
  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  // Scroll the selected project into view when the dropdown opens.
  useEffect(() => {
    if (!open || !projectId) return
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(
        '[data-selected="true"]',
      )
      el?.scrollIntoView({ block: 'nearest' })
    })
  }, [open, projectId])

  const selectedClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId],
  )
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  )

  const hasSelection = !!clientId && !!projectId && !!selectedProject

  // Index projects once per catalog change instead of re-filtering the whole
  // project list for every client on every render.
  const projectsByClient = useMemo(() => {
    const map = new Map<string, ProjectItem[]>()
    for (const project of projects) {
      const list = map.get(project.clientId)
      if (list) list.push(project)
      else map.set(project.clientId, [project])
    }
    return map
  }, [projects])

  // Build grouped rows filtered by search — only while the dropdown is open,
  // so closed pickers cost nothing when the parent re-renders. The result is
  // capped: mounting every project at once is what makes opening the popover
  // slow on large catalogs (all nodes commit synchronously and Radix's
  // FocusScope/Popper run over the whole subtree). The search box narrows the
  // rest.
  const { rows, truncated } = useMemo<{
    rows: GroupedRow[]
    truncated: boolean
  }>(() => {
    if (!open) return { rows: [], truncated: false }
    const q = search.toLowerCase()
    const result: GroupedRow[] = []
    let projectCount = 0
    let cut = false

    for (const client of clients) {
      if (projectCount >= MAX_VISIBLE_PROJECTS) {
        cut = true
        break
      }
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
        if (projectCount >= MAX_VISIBLE_PROJECTS) {
          cut = true
          break
        }
        result.push({ kind: 'project', project, client })
        projectCount++
      }
    }
    return { rows: result, truncated: cut }
  }, [open, search, clients, projectsByClient])

  function handleSelect(nextClientId: string, nextProjectId: string) {
    onChange(nextClientId, nextProjectId)
    setOpen(false)
  }

  function handleClear(e: React.MouseEvent | React.KeyboardEvent) {
    e.stopPropagation()
    onChange('', '')
  }

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      {/* Trigger — wrapped in a group so the tooltip can use group-hover */}
      <div className={bare ? 'group relative h-full' : 'group relative'}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={
              bare
                ? 'flex h-full w-full items-center gap-2 px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent/50 disabled:cursor-not-allowed disabled:text-muted-foreground'
                : 'flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:border-border/80 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground'
            }
          >
            <div className="flex flex-1 items-center gap-1.5 overflow-hidden">
              {hasSelection ? (
                <>
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: selectedProject.color }}
                  />
                  <div
                    className="min-w-0 truncate text-left"
                    title={`${selectedClient?.name ?? ''} › ${selectedProject.name}`}
                  >
                    {selectedClient?.name ?? ''}
                    <span className="text-muted-foreground">
                      {' '}
                      ›{' '}
                      <span className="text-foreground">
                        {selectedProject.name}
                      </span>
                    </span>
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {hasSelection && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={handleClear}
                  onKeyDown={(e) => e.key === 'Enter' && handleClear(e)}
                  aria-label="Clear client and project"
                  className={cn(
                    'grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                  )}
                >
                  <X className="size-3" />
                </span>
              )}
              <ChevronDown className="size-3.5 text-muted-foreground" />
            </div>
          </button>
        </PopoverTrigger>

        {/* Tooltip — only shows when something is selected and dropdown is closed */}
        {hasSelection && !open && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
          >
            <div className="whitespace-nowrap rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-md">
              <p className="text-xs text-muted-foreground">
                {selectedClient?.name}
                <span className="mx-1">›</span>
                <span className="font-semibold text-foreground">
                  {selectedProject.name}
                </span>
              </p>
            </div>
            {/* Arrow pointing down */}
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-border" />
            <div className="absolute left-1/2 top-[calc(100%-1px)] -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-popover" />
          </div>
        )}
      </div>

      {/* Dropdown — rendered in a portal so it's never clipped by an
          overflow-hidden ancestor (timer bar) or overflow-x-auto table. */}
      <PopoverContent
        align="start"
        sideOffset={4}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
        className="w-72 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 shadow-xl"
      >
        {/* Search */}
        <div className="border-b border-border p-2">
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients or projects…"
            aria-label="Search clients or projects"
            className="h-8 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-56 overflow-y-auto py-1">
          {rows.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No clients or projects found
            </p>
          ) : (
            rows.map((row, i) => {
              if (row.kind === 'client') {
                return (
                  <div
                    key={`client-${row.client.id}`}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground',
                      i > 0 && 'mt-1 border-t border-border/50 pt-2',
                    )}
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
                  data-selected={isActive ? 'true' : undefined}
                  onClick={() => handleSelect(row.client.id, row.project.id)}
                  className={cn(
                    'flex w-full items-center gap-2 py-1.5 pl-7 pr-3 text-left text-xs transition-colors hover:bg-accent',
                    isActive
                      ? 'bg-accent/50 font-medium text-foreground'
                      : 'font-normal text-muted-foreground hover:text-foreground',
                  )}
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
          {truncated && (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Showing first {MAX_VISIBLE_PROJECTS} — type to narrow results.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
