import { memo, useCallback, useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import type { TrackerState } from '#/lib/time-tracker/types'
import { cn } from '#/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { Combobox } from '#/components/ui/combobox'
import type { ComboboxOption } from '#/components/ui/combobox'
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

const FilterCombobox = memo(function FilterCombobox({
  label,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  className = '',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: ComboboxOption[]
  placeholder: string
  searchPlaceholder: string
  className?: string
}) {
  return (
    <div className={cn('min-w-0 flex flex-col gap-1', className)}>
      <span className="text-xs font-semibold text-muted-foreground">
        {label}
      </span>
      <Combobox
        options={options}
        value={value}
        onValueChange={onChange}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
        emptyText={`No ${label.toLowerCase()} found.`}
        className="h-9 rounded-lg sm:min-w-[200px]"
        contentClassName="z-[60]"
      />
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

  const filteredProjects = useMemo(
    () =>
      filters.clientId
        ? state.projects.filter((p) => p.clientId === filters.clientId)
        : state.projects,
    [filters.clientId, state.projects],
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

  const clientOptions = useMemo(
    () => [
      { value: '', label: 'All clients' },
      ...state.clients.map((c) => ({ value: c.id, label: c.name })),
    ],
    [state.clients],
  )

  const projectOptions = useMemo(
    () => [
      { value: '', label: 'All projects' },
      ...filteredProjects.map((p) => ({ value: p.id, label: p.name })),
    ],
    [filteredProjects],
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

  const handleClientChange = useCallback(
    (v: string) =>
      onChange({
        clientId: v || undefined,
        projectId: undefined,
        page: undefined,
      }),
    [onChange],
  )

  const handleProjectChange = useCallback(
    (v: string) => onChange({ projectId: v || undefined, page: undefined }),
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

      <FilterCombobox
        label="Client"
        value={filters.clientId ?? ''}
        onChange={handleClientChange}
        options={clientOptions}
        placeholder="All clients"
        searchPlaceholder="Search clients..."
        className="sm:min-w-[280px]"
      />

      <FilterCombobox
        label="Project"
        value={filters.projectId ?? ''}
        onChange={handleProjectChange}
        options={projectOptions}
        placeholder="All projects"
        searchPlaceholder="Search projects..."
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
