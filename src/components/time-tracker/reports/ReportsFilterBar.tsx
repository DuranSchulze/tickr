import { memo, useCallback, useMemo, useRef, useState } from 'react'
import {
  Building2,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import type { TrackerState } from '#/lib/time-tracker/types'
import { cn } from '#/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { buildClientProjectFilterRows } from '#/components/time-tracker/analytics/AnalyticsFilterBar'
import type { ClientProjectFilterRow } from '#/components/time-tracker/analytics/AnalyticsFilterBar'

export type ReportsFilters = {
  departmentId?: string
  clientId?: string
  projectId?: string
  taskId?: string
  tagIds?: string // comma-separated
  memberIds?: string // comma-separated
  status?: 'all' | 'completed' | 'running'
  description?: string
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
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full cursor-pointer appearance-none rounded-lg border border-border bg-background pl-2.5 pr-8 text-sm text-foreground transition-colors hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  )
})

const ClientProjectFilter = memo(function ClientProjectFilter({
  clients,
  projects,
  clientId,
  projectId,
  onChange,
}: {
  clients: TrackerState['clients']
  projects: TrackerState['projects']
  clientId: string
  projectId: string
  onChange: (clientId: string, projectId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedProject = projects.find((p) => p.id === projectId)
  const selectedClient = clients.find(
    (c) => c.id === (selectedProject?.clientId || clientId),
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
    <div className="min-w-0 flex flex-col gap-1">
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
                    <span className="min-w-0 flex-1 truncate">
                      {row.project.name}
                    </span>
                  </button>
                )
              })
            )}
            {truncated && (
              <p className="m-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                Showing first projects. Search to narrow results.
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
            className="inline-flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary/40 data-[state=open]:bg-accent"
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

export function ReportsFilterBar({
  state,
  filters,
  onChange,
  onSearch,
  onClear,
  selectedMemberId: _selectedMemberId,
}: {
  state: TrackerState
  filters: ReportsFilters
  selectedMemberId?: string
  onChange: (updates: Partial<ReportsFilters>) => void
  onSearch: () => void
  onClear: () => void
}) {
  void _selectedMemberId
  const currentMember = state.members.find(
    (m) => m.id === state.currentMemberId,
  )
  const permissionLevel = currentMember?.permissionLevel ?? 'EMPLOYEE'
  const isManagerOrAbove = permissionLevel !== 'EMPLOYEE'
  const isOwnerOrAdmin =
    permissionLevel === 'OWNER' || permissionLevel === 'ADMIN'

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
    filters.departmentId ||
    filters.taskId ||
    filters.tagIds ||
    filters.memberIds ||
    filters.status ||
    filters.description ||
    filters.billable,
  )

  const activeFilterCount = useMemo(
    () =>
      [
        filters.projectId,
        filters.clientId,
        filters.departmentId,
        filters.taskId,
        filters.tagIds,
        filters.memberIds,
        filters.status,
        filters.description,
        filters.billable,
      ].filter(Boolean).length,
    [filters],
  )

  // ── Stabilized options ──

  const statusOptions = useMemo(
    () => [
      { value: '', label: 'All entries' },
      { value: 'completed', label: 'Completed only' },
      { value: 'running', label: 'Running only' },
    ],
    [],
  )

  const billableOptions = useMemo(
    () => [
      { value: '', label: 'All entries' },
      { value: 'true', label: 'Billable only' },
      { value: 'false', label: 'Non-billable only' },
    ],
    [],
  )

  const departmentOptions = useMemo(() => {
    const items: { value: string; label: string }[] = [
      { value: '', label: 'All departments' },
    ]
    for (const d of state.departments) {
      items.push({ value: d.id, label: d.name })
    }
    return items
  }, [state.departments])

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
        // When a department is selected, only offer members of that department.
        if (filters.departmentId && m.departmentId !== filters.departmentId) {
          return items
        }
        items.push({ value: m.id, label: m.name || m.email })
        return items
      }, []),
    [filters.departmentId, state.members],
  )

  // ── Stabilized handlers ──

  const handleDescriptionChange = useCallback(
    (v: string) =>
      onChange({
        description: v || undefined,
        page: undefined,
      }),
    [onChange],
  )

  const handleStatusChange = useCallback(
    (v: string) =>
      onChange({
        status:
          v === 'completed'
            ? 'completed'
            : v === 'running'
              ? 'running'
              : undefined,
        page: undefined,
      }),
    [onChange],
  )

  const handleBillableChange = useCallback(
    (v: string) =>
      onChange({
        billable: v === 'true' ? 'true' : v === 'false' ? 'false' : undefined,
        page: undefined,
      }),
    [onChange],
  )

  const handleDepartmentChange = useCallback(
    (v: string) => {
      const departmentId = v || undefined
      // Keep only member selections that belong to the newly chosen
      // department so the Members filter stays consistent with it.
      const nextMemberIds = departmentId
        ? memberIdList.filter((memberId) =>
            state.members.some(
              (m) => m.id === memberId && m.departmentId === departmentId,
            ),
          )
        : memberIdList
      onChange({
        departmentId,
        memberIds:
          nextMemberIds.length > 0 ? nextMemberIds.join(',') : undefined,
        page: undefined,
      })
    },
    [memberIdList, onChange, state.members],
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
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-xs">
      {/* Bar header — title + active count, actions on the right */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 px-4 py-2.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" />
          <h2 className="m-0 text-sm font-bold text-foreground">Filters</h2>
          {activeFilterCount > 0 && (
            <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
              {activeFilterCount} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onSearch}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-bold text-primary-foreground shadow-sm transition-all hover:brightness-110 active:translate-y-px"
          >
            <Search className="size-3.5" />
            Search
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="grid min-w-0 grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
        {/* Description — full width */}
        <div className="min-w-0 flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <label className="text-xs font-semibold text-muted-foreground">
            Description
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={filters.description ?? ''}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSearch()
              }}
              placeholder="Search by description…"
              className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-sm text-foreground placeholder:text-muted-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {filters.description && (
              <button
                type="button"
                onClick={() => handleDescriptionChange('')}
                aria-label="Clear description search"
                className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Status */}
        <FilterSelect
          label="Status"
          value={filters.status ?? ''}
          onChange={handleStatusChange}
          options={statusOptions}
        />

        {/* Department — only for managers and above */}
        {(isOwnerOrAdmin || (isManagerOrAbove && !filters.departmentId)) && (
          <FilterSelect
            label="Department"
            value={filters.departmentId ?? ''}
            onChange={handleDepartmentChange}
            options={departmentOptions}
          />
        )}

        {/* Client / Project */}
        <ClientProjectFilter
          clients={state.clients}
          projects={state.projects}
          clientId={filters.clientId ?? ''}
          projectId={filters.projectId ?? ''}
          onChange={handleClientProjectChange}
        />

        {/* Tags */}
        <MultiSelectCombobox
          label="Tags"
          values={tagIdList}
          onChange={handleTagsChange}
          options={tagOptions}
        />

        {/* Members — managers and above */}
        {isManagerOrAbove && (
          <MultiSelectCombobox
            label={
              filters.departmentId
                ? `Members · ${
                    state.departments.find((d) => d.id === filters.departmentId)
                      ?.name ?? ''
                  }`
                : 'Members'
            }
            values={memberIdList}
            onChange={handleMembersChange}
            options={memberOptions}
          />
        )}

        {/* Billable */}
        <FilterSelect
          label="Billable"
          value={filters.billable ?? ''}
          onChange={handleBillableChange}
          options={billableOptions}
        />
      </div>
    </div>
  )
}
