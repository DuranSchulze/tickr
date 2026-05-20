import { useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import type { TrackerState } from '#/lib/time-tracker/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import type { AnalyticsScopeSearch } from './analytics.utils'

export type AnalyticsFilters = {
  projectId?: string
  clientId?: string
  tagIds?: string // comma-separated
  memberIds?: string // comma-separated
  billable?: 'true' | 'false'
  page?: number
}

function FilterSelect({
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
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-[140px] rounded-lg border border-border bg-background px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function MultiSelectDropdown({
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
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-muted-foreground">
        {label}
      </label>
      <DropdownMenu
        onOpenChange={(open) => {
          if (!open) setQuery('')
        }}
      >
        <DropdownMenuTrigger className="inline-flex h-9 min-w-[140px] items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-primary/40 data-[state=open]:bg-accent">
          <span className="truncate">{buttonLabel}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 p-0">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
              placeholder={`Search ${label.toLowerCase()}…`}
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Scrollable list */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                No results
              </div>
            ) : (
              filtered.map((o) => {
                const selected = values.includes(o.value)
                return (
                  <DropdownMenuItem
                    key={o.value}
                    onSelect={(e) => {
                      e.preventDefault()
                      toggle(o.value)
                    }}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border'
                      }`}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    {o.color && (
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: o.color }}
                      />
                    )}
                    <span className="truncate">{o.label}</span>
                  </DropdownMenuItem>
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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function AnalyticsFilterBar({
  state,
  filters,
  selectedScope,
  onChange,
  onClear,
}: {
  state: TrackerState
  filters: AnalyticsFilters
  selectedScope: AnalyticsScopeSearch
  onChange: (updates: Partial<AnalyticsFilters>) => void
  onClear: () => void
}) {
  const currentMember = state.members.find(
    (m) => m.id === state.currentMemberId,
  )
  const permissionLevel = currentMember?.permissionLevel ?? 'EMPLOYEE'

  const tagIdList = filters.tagIds
    ? filters.tagIds.split(',').filter(Boolean)
    : []
  const memberIdList = filters.memberIds
    ? filters.memberIds.split(',').filter(Boolean)
    : []

  const filteredProjects = filters.clientId
    ? state.projects.filter((p) => p.clientId === filters.clientId)
    : state.projects

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

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
      <FilterSelect
        label="Billable"
        value={filters.billable ?? ''}
        onChange={(v) =>
          onChange({
            billable:
              v === 'true' ? 'true' : v === 'false' ? 'false' : undefined,
            page: undefined,
          })
        }
        options={[
          { value: '', label: 'All entries' },
          { value: 'true', label: 'Billable only' },
          { value: 'false', label: 'Non-billable only' },
        ]}
      />

      <FilterSelect
        label="Client"
        value={filters.clientId ?? ''}
        onChange={(v) =>
          onChange({
            clientId: v || undefined,
            projectId: undefined,
            page: undefined,
          })
        }
        options={[
          { value: '', label: 'All clients' },
          ...state.clients.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />

      <FilterSelect
        label="Project"
        value={filters.projectId ?? ''}
        onChange={(v) =>
          onChange({ projectId: v || undefined, page: undefined })
        }
        options={[
          { value: '', label: 'All projects' },
          ...filteredProjects.map((p) => ({ value: p.id, label: p.name })),
        ]}
      />

      <MultiSelectDropdown
        label="Tags"
        values={tagIdList}
        onChange={(ids) =>
          onChange({
            tagIds: ids.length > 0 ? ids.join(',') : undefined,
            page: undefined,
          })
        }
        options={state.tags.map((t) => ({
          value: t.id,
          label: t.name,
          color: t.color,
        }))}
      />

      {showMemberFilter && (
        <MultiSelectDropdown
          label="Members"
          values={memberIdList}
          onChange={(ids) =>
            onChange({
              memberIds: ids.length > 0 ? ids.join(',') : undefined,
              page: undefined,
            })
          }
          options={state.members
            .filter((m) => m.status === 'ACTIVE')
            .map((m) => ({ value: m.id, label: m.name || m.email }))}
        />
      )}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-9 items-center gap-1.5 self-end rounded-lg border border-border px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
          Clear filters
        </button>
      )}
    </div>
  )
}
