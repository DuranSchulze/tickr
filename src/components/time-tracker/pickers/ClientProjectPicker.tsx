import { useEffect, useRef, useState } from 'react'
import { Building2, ChevronDown, X } from 'lucide-react'
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
}

type GroupedRow =
  | { kind: 'client'; client: ClientItem }
  | { kind: 'project'; project: ProjectItem; client: ClientItem }

export function ClientProjectPicker({
  clients,
  projects,
  clientId,
  projectId,
  onChange,
  disabled = false,
  placeholder = 'Client / Project',
}: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0)
    } else {
      setSearch('')
    }
  }, [open])

  // Scroll the selected project into view when dropdown opens
  useEffect(() => {
    if (!open || !projectId) return
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector<HTMLElement>(
        '[data-selected="true"]',
      )
      el?.scrollIntoView({ block: 'nearest' })
    })
  }, [open, projectId])

  const selectedClient = clients.find((c) => c.id === clientId)
  const selectedProject = projects.find((p) => p.id === projectId)

  const hasSelection = !!clientId && !!projectId

  // Build grouped rows filtered by search
  const rows: GroupedRow[] = []
  const q = search.toLowerCase()

  for (const client of clients) {
    const clientMatches = client.name.toLowerCase().includes(q)
    const clientProjects = projects.filter((p) => p.clientId === client.id)
    const matchingProjects = q
      ? clientMatches
        ? clientProjects
        : clientProjects.filter((p) => p.name.toLowerCase().includes(q))
      : clientProjects

    if (matchingProjects.length === 0 && !clientMatches) continue

    rows.push({ kind: 'client', client })
    for (const project of matchingProjects) {
      rows.push({ kind: 'project', project, client })
    }
  }

  function handleSelect(nextClientId: string, nextProjectId: string) {
    onChange(nextClientId, nextProjectId)
    setOpen(false)
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    onChange('', '')
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger — wrapped in a group so the tooltip can use group-hover */}
      <div className="group relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((o) => !o)}
          className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:border-border/80 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          <div className="flex flex-1 items-center gap-1.5 overflow-hidden">
            {hasSelection ? (
              <>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: selectedProject!.color }}
                />
                <span className="truncate text-left">
                  {selectedClient?.name ?? ''}
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
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {hasSelection && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                onKeyDown={(e) => e.key === 'Enter' && handleClear(e as never)}
                aria-label="Clear client and project"
                className={cn(
                  'grid h-5 w-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                )}
              >
                <X className="h-3 w-3" />
              </span>
            )}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </button>

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
                  {selectedProject?.name}
                </span>
              </p>
            </div>
            {/* Arrow pointing down */}
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-border" />
            <div className="absolute left-1/2 top-[calc(100%-1px)] -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-popover" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          {/* Search */}
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients or projects…"
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
                      <Building2 className="h-3 w-3 shrink-0" />
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
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: row.project.color }}
                    />
                    <span className="flex-1 truncate">{row.project.name}</span>
                    {isActive && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
