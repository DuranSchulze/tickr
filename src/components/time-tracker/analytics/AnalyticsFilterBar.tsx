import { memo, useCallback, useMemo, useRef, useState } from 'react'
import {
  Building2,
  Check,
  ChevronsUpDown,
  FolderKanban,
  Search,
  X,
} from 'lucide-react'
import type { TrackerState } from '#/lib/time-tracker/types'
import { cn } from '#/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { Button } from '#/components/ui/button'
import type { AnalyticsScopeSearch } from './analytics.utils'

export type AnalyticsFilters = {
  projectId?: string
  clientId?: string
  tagIds?: string // comma-separated
  memberIds?: string // comma-separated
  billable?: 'true' | 'false'
  page?: number
  pageSize?: number
}

const FilterSelect = memo(function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="min-w-0 flex flex-col gap-1">
      <label className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full min-w-0 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 sm:min-w-[200px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
})

type ClientProjectFilterClient = TrackerState['clients'][number]
type ClientProjectFilterProject = TrackerState['projects'][number]

export type ClientProjectFilterRow =
  | { kind: 'client'; client: ClientProjectFilterClient }
  | {
      kind: 'project'
      client: ClientProjectFilterClient
      project: ClientProjectFilterProject
    }

const MAX_VISIBLE_PROJECTS = 80

export function buildClientProjectFilterRows(
  clients: ClientProjectFilterClient[],
  projects: ClientProjectFilterProject[],
  search: string,
  maxVisibleProjects = MAX_VISIBLE_PROJECTS,
): { rows: ClientProjectFilterRow[]; truncated: boolean } {
  const tokens = search.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const projectsByClient = new Map<string, ClientProjectFilterProject[]>()

  for (const project of projects) {
    const clientProjects = projectsByClient.get(project.clientId)
    if (clientProjects) clientProjects.push(project)
    else projectsByClient.set(project.clientId, [project])
  }

  const matches = (...values: string[]) => {
    if (tokens.length === 0) return true
    const haystack = values.join(' ').toLowerCase()
    return tokens.every((token) => haystack.includes(token))
  }

  const rows: ClientProjectFilterRow[] = []
  let visibleProjectCount = 0
  let truncated = false

  for (const client of clients) {
    const clientProjects = projectsByClient.get(client.id) ?? []
    const clientMatches = matches(client.name)
    const matchingProjects =
      tokens.length === 0 || clientMatches
        ? clientProjects
        : clientProjects.filter((project) => matches(client.name, project.name))

    if (!clientMatches && matchingProjects.length === 0) continue
    if (
      matchingProjects.length > 0 &&
      visibleProjectCount >= maxVisibleProjects
    ) {
      truncated = true
      break
    }

    rows.push({ kind: 'client', client })
    for (const project of matchingProjects) {
      if (visibleProjectCount >= maxVisibleProjects) {
        truncated = true
        break
      }
      rows.push({ kind: 'project', client, project })
      visibleProjectCount++
    }
    if (truncated) break
  }

  return { rows, truncated }
}

const ClientProjectFilter = memo(function ClientProjectFilter({
  clients,
  projects,
  clientId,
  projectId,
  onChange,
}: {
  clients: ClientProjectFilterClient[]
  projects: ClientProjectFilterProject[]
  clientId: string
  projectId: string
  onChange: (clientId: string, projectId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedProject = projects.find((project) => project.id === projectId)
  const selectedClient = clients.find(
    (client) => client.id === (selectedProject?.clientId || clientId),
  )
  const triggerLabel = selectedProject
    ? `${selectedClient?.name ?? 'Unknown client'} / ${selectedProject.name}`
    : (selectedClient?.name ?? 'All clients & projects')

  const { rows, truncated } = useMemo(
    () =>
      open
        ? buildClientProjectFilterRows(clients, projects, search)
        : { rows: [] as ClientProjectFilterRow[], truncated: false },
    [clients, open, projects, search],
  )

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) setSearch('')
  }

  function handleSelect(nextClientId: string, nextProjectId: string) {
    onChange(nextClientId, nextProjectId)
    setOpen(false)
    setSearch('')
  }

  return (
    <div className="min-w-0 flex flex-col gap-1 sm:col-span-2 lg:min-w-[320px]">
      <span className="text-xs font-semibold text-muted-foreground">
        Client / Project
      </span>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 text-left text-sm text-foreground outline-none transition-colors hover:bg-muted/50 focus:ring-2 focus:ring-primary/40 data-[state=open]:bg-muted/50"
          >
            <span
              className={cn(
                'min-w-0 flex-1 truncate',
                !selectedClient && 'text-muted-foreground',
              )}
            >
              {triggerLabel}
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          collisionPadding={8}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
          className="z-[60] max-h-[min(var(--radix-popover-content-available-height),24rem)] w-[var(--radix-popover-trigger-width)] min-w-[min(22rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-md border border-border bg-popover p-0 shadow-none"
        >
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={inputRef}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search clients or projects..."
              aria-label="Search clients or projects"
              className="h-8 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-[min(calc(var(--radix-popover-content-available-height)-3.5rem),20rem)] overflow-y-auto overscroll-contain py-1 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
            {!search && (
              <button
                type="button"
                onClick={() => handleSelect('', '')}
                className={cn(
                  'flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted',
                  !clientId && !projectId && 'font-semibold text-foreground',
                )}
              >
                <Check
                  className={cn(
                    'size-4 shrink-0 text-primary',
                    (clientId || projectId) && 'opacity-0',
                  )}
                />
                <span>All clients &amp; projects</span>
              </button>
            )}

            {rows.length === 0 ? (
              <p className="m-0 px-3 py-4 text-center text-sm text-muted-foreground">
                No clients or projects found.
              </p>
            ) : (
              rows.map((row) => {
                if (row.kind === 'client') {
                  const selected = row.client.id === clientId && !projectId
                  return (
                    <button
                      key={`client-${row.client.id}`}
                      type="button"
                      onClick={() => handleSelect(row.client.id, '')}
                      className={cn(
                        'mt-1 flex min-h-10 w-full items-center gap-2 border-t border-border/60 px-3 py-2 text-left text-sm font-semibold transition-colors first:mt-0 first:border-t-0 hover:bg-muted',
                        selected && 'text-foreground',
                      )}
                    >
                      <Check
                        className={cn(
                          'size-4 shrink-0 text-primary',
                          !selected && 'opacity-0',
                        )}
                      />
                      <Building2 className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {row.client.name}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Client
                      </span>
                    </button>
                  )
                }

                const selected = row.project.id === projectId
                return (
                  <button
                    key={`project-${row.project.id}`}
                    type="button"
                    onClick={() => handleSelect(row.client.id, row.project.id)}
                    className={cn(
                      'flex min-h-9 w-full items-center gap-2 py-1.5 pl-9 pr-3 text-left text-sm transition-colors hover:bg-muted',
                      selected && 'font-semibold text-foreground',
                    )}
                  >
                    <Check
                      className={cn(
                        'size-4 shrink-0 text-primary',
                        !selected && 'opacity-0',
                      )}
                    />
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: row.project.color }}
                    />
                    <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">
                      {row.project.name}
                    </span>
                  </button>
                )
              })
            )}
            {truncated && (
              <p className="m-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                Showing first {MAX_VISIBLE_PROJECTS} projects. Search to narrow
                results.
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
})

const MultiSelectCombobox = memo(function MultiSelectCombobox({
  label,
  values,
  onChange,
  options,
}: {
  label: string
  values: string[]
  onChange: (ids: string[]) => void
  options: { value: string; label: string; color?: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  function toggle(id: string) {
    if (values.includes(id)) {
      onChange(values.filter((v) => v !== id))
    } else {
      onChange([...values, id])
    }
  }

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  const buttonLabel =
    values.length === 0
      ? label
      : values.length === 1
        ? (options.find((o) => o.value === values[0])?.label ?? label)
        : `${label} · ${values.length}`

  return (
    <div className="min-w-0 flex flex-col gap-1">
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen) setQuery('')
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-expanded={open}
            className="inline-flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary/40 data-[state=open]:bg-accent sm:min-w-[200px]"
          >
            <span className="truncate">{buttonLabel}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="z-[60] max-h-[min(var(--radix-popover-content-available-height),20rem)] w-[var(--radix-popover-trigger-width)] min-w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-md border border-border bg-popover p-0 shadow-none"
        >
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={`Search ${label.toLowerCase()}...`}
              aria-label={`Search ${label.toLowerCase()}`}
              className="h-8 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          {/* Scrollable list */}
          <div className="max-h-[min(calc(var(--radix-popover-content-available-height)-3.5rem),16rem)] overflow-y-auto overscroll-contain py-1 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No results
              </div>
            ) : (
              filtered.map((o) => {
                const selected = values.includes(o.value)
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border',
                      )}
                    >
                      {selected && <Check className="size-3" />}
                    </span>
                    {o.color && (
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: o.color }}
                      />
                    )}
                    <span className="truncate">{o.label}</span>
                  </button>
                )
              })
            )}
          </div>

          {/* Selected count footer */}
          {values.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {values.length} selected
              </span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
})

export function AnalyticsFilterBar({
  state,
  filters,
  selectedScope,
  onChange,
  onSearch,
  onClear,
}: {
  state: TrackerState
  filters: AnalyticsFilters
  selectedScope: AnalyticsScopeSearch
  onChange: (updates: Partial<AnalyticsFilters>) => void
  onSearch: () => void
  onClear: () => void
}) {
  const currentMember = state.members.find(
    (m) => m.id === state.currentMemberId,
  )
  const permissionLevel = currentMember?.permissionLevel ?? 'EMPLOYEE'

  const tagIdList = useMemo(
    () => (filters.tagIds ? filters.tagIds.split(',').filter(Boolean) : []),
    [filters.tagIds],
  )
  const memberIdList = useMemo(
    () =>
      filters.memberIds ? filters.memberIds.split(',').filter(Boolean) : [],
    [filters.memberIds],
  )

  const hasActiveFilters = Boolean(
    filters.projectId ||
    filters.clientId ||
    filters.tagIds ||
    filters.memberIds ||
    filters.billable,
  )

  const showMemberFilter =
    selectedScope !== 'personal' &&
    (permissionLevel === 'OWNER' ||
      permissionLevel === 'ADMIN' ||
      permissionLevel === 'MANAGER')

  // ── Stabilized references so FilterSelect / MultiSelectDropdown can memo ──

  const billableOptions = useMemo(
    () => [
      { value: '', label: 'All entries' },
      { value: 'true', label: 'Billable only' },
      { value: 'false', label: 'Non-billable only' },
    ],
    [],
  )

  const tagOptions = useMemo(
    () =>
      state.tags.map((t) => ({
        value: t.id,
        label: t.name,
        color: t.color,
      })),
    [state.tags],
  )

  const memberOptions = useMemo(
    () =>
      state.members.reduce<{ value: string; label: string }[]>((items, m) => {
        if (m.status !== 'ACTIVE') return items
        items.push({ value: m.id, label: m.name || m.email })
        return items
      }, []),
    [state.members],
  )

  const handleBillableChange = useCallback(
    (v: string) =>
      onChange({
        billable: v === 'true' ? 'true' : v === 'false' ? 'false' : undefined,
        page: undefined,
      }),
    [onChange],
  )

  const handleClientProjectChange = useCallback(
    (clientId: string, projectId: string) =>
      onChange({
        clientId: clientId || undefined,
        projectId: projectId || undefined,
        page: undefined,
      }),
    [onChange],
  )

  const handleTagsChange = useCallback(
    (ids: string[]) =>
      onChange({
        tagIds: ids.length > 0 ? ids.join(',') : undefined,
        page: undefined,
      }),
    [onChange],
  )

  const handleMembersChange = useCallback(
    (ids: string[]) =>
      onChange({
        memberIds: ids.length > 0 ? ids.join(',') : undefined,
        page: undefined,
      }),
    [onChange],
  )

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-2 sm:p-4 lg:flex lg:flex-wrap lg:items-end">
      <FilterSelect
        label="Billable"
        value={filters.billable ?? ''}
        onChange={handleBillableChange}
        options={billableOptions}
      />

      <ClientProjectFilter
        clients={state.clients}
        projects={state.projects}
        clientId={filters.clientId ?? ''}
        projectId={filters.projectId ?? ''}
        onChange={handleClientProjectChange}
      />

      <MultiSelectCombobox
        label="Tags"
        values={tagIdList}
        onChange={handleTagsChange}
        options={tagOptions}
      />

      {showMemberFilter && (
        <MultiSelectCombobox
          label="Members"
          values={memberIdList}
          onChange={handleMembersChange}
          options={memberOptions}
        />
      )}

      {hasActiveFilters && (
        <Button
          type="button"
          variant="ghost"
          onClick={onClear}
          className="h-9 self-end"
        >
          <X className="size-3.5" />
          Clear filters
        </Button>
      )}

      {/* Search / Apply button — commits draft filters to URL */}
      <button
        type="button"
        onClick={onSearch}
        className="inline-flex h-9 w-full items-center justify-center gap-1.5 self-end rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:brightness-110 sm:w-auto"
      >
        <Search className="size-3.5" />
        Search
      </button>
    </div>
  )
}
