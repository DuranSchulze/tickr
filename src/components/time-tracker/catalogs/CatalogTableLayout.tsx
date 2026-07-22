import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, Check, Plus, Search, X } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'

import type { ColumnDef } from '@tanstack/react-table'
import { Combobox } from '#/components/ui/combobox'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '#/components/ui/pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'

export { CatalogFormDialog } from './CatalogFormDialog'

// ─── Search Bar ───────────────────────────────────────────────────────────────

export function CatalogSearchBar({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [inputValue, setInputValue] = useState(value)

  // Sync local state when the URL value changes externally (e.g. browser back, clear from parent)
  useEffect(() => {
    setInputValue(value)
  }, [value])

  // Debounce: only push to URL 300 ms after the user stops typing
  useEffect(() => {
    if (inputValue === value) return
    const timer = setTimeout(() => onChange(inputValue), 300)
    return () => clearTimeout(timer)
  }, [inputValue])

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
      />
      {inputValue && (
        <button
          type="button"
          onClick={() => {
            setInputValue('')
            onChange('')
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

// ─── Staged Filter Bar ────────────────────────────────────────────────────────

export type CatalogFilterField = {
  key: string
  label: string
  /** Value treated as "no filter" — not emitted to the URL and not counted as active. */
  defaultValue?: string
  options: Array<{ value: string; label: string }>
  /** Enables text filtering for catalog-backed option lists. */
  searchable?: boolean
  searchPlaceholder?: string
  emptyText?: string
}

/**
 * A filter toolbar whose inputs are *staged*: typing and changing dropdowns only
 * updates local draft state. Nothing navigates (and therefore nothing re-fetches
 * from the server) until the user clicks Search. This avoids a server round-trip
 * per keystroke — the old debounced-navigate behavior that felt laggy.
 *
 * `appliedValues` is the currently-active filter set (from the URL). When it
 * changes externally (browser back/forward, Clear), the draft re-syncs.
 */
export function CatalogFilterBar({
  searchKey = 'search',
  searchPlaceholder = 'Search…',
  filters = [],
  appliedValues,
  onApply,
  extra,
}: {
  searchKey?: string
  searchPlaceholder?: string
  filters?: CatalogFilterField[]
  appliedValues: Record<string, string>
  onApply: (next: Record<string, string | undefined>) => void
  extra?: ReactNode
}) {
  const [draft, setDraft] = useState<Record<string, string>>(appliedValues)

  // Re-sync the draft whenever the applied values change from outside this bar.
  const appliedKey = JSON.stringify(appliedValues)
  useEffect(() => {
    setDraft(appliedValues)
  }, [appliedKey, appliedValues])

  const fieldKeys = useMemo(
    () => [searchKey, ...filters.map((f) => f.key)],
    [searchKey, filters],
  )

  const isDefault = (key: string, value: string | undefined) => {
    const def = key === searchKey ? '' : (defaultFor(key) ?? '')
    return !value || value === def
  }
  function defaultFor(key: string) {
    return filters.find((f) => f.key === key)?.defaultValue
  }

  const draftKey = JSON.stringify(draft)
  const isDirty = draftKey !== appliedKey
  const hasActiveFilters = fieldKeys.some(
    (k) => !isDefault(k, appliedValues[k]),
  )

  function buildUpdates(source: Record<string, string>) {
    const updates: Record<string, string | undefined> = {}
    for (const k of fieldKeys) {
      updates[k] = isDefault(k, source[k]) ? undefined : source[k]
    }
    return updates
  }

  function apply() {
    onApply(buildUpdates(draft))
  }

  function clear() {
    setDraft({})
    const updates: Record<string, string | undefined> = {}
    for (const k of fieldKeys) updates[k] = undefined
    onApply(updates)
  }

  const searchValue = draft[searchKey] ?? ''

  return (
    <div className="flex flex-wrap items-center gap-3 w-full">
      {/* Search box */}
      <div className="relative w-full max-w-xs">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) =>
            setDraft((d) => ({ ...d, [searchKey]: e.target.value }))
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') apply()
          }}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => setDraft((d) => ({ ...d, [searchKey]: '' }))}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search text"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Filter dropdowns */}
      {filters.map((f) => {
        const value = draft[f.key] || f.defaultValue || ''

        return f.searchable ? (
          <Combobox
            key={f.key}
            options={f.options}
            value={value}
            onValueChange={(nextValue) =>
              setDraft((d) => ({ ...d, [f.key]: nextValue }))
            }
            placeholder={f.options[0]?.label ?? `Select ${f.label}`}
            searchPlaceholder={
              f.searchPlaceholder ?? `Search ${f.label.toLowerCase()}…`
            }
            emptyText={f.emptyText ?? `No ${f.label.toLowerCase()} found.`}
            className="h-9 w-auto min-w-40 rounded-lg"
            contentClassName="z-[60]"
          />
        ) : (
          <select
            key={f.key}
            value={value}
            onChange={(e) =>
              setDraft((d) => ({ ...d, [f.key]: e.target.value }))
            }
            aria-label={f.label}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )
      })}

      {/* Apply / Clear */}
      <button
        type="button"
        onClick={apply}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110"
      >
        <Search className="size-4" />
        Search
        {isDirty && (
          <span className="size-1.5 rounded-full bg-primary-foreground/80" />
        )}
      </button>
      {(hasActiveFilters || isDirty) && (
        <button
          type="button"
          onClick={clear}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
          Clear
        </button>
      )}

      {extra && <div className="ml-auto flex items-center gap-2">{extra}</div>}
    </div>
  )
}

// ─── Selection Checkbox ───────────────────────────────────────────────────────

function SelectionCheckbox({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation()
        onChange()
      }}
      className={`grid size-5 place-items-center rounded border transition-colors ${
        checked
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background hover:border-primary/50'
      }`}
    >
      {checked && <Check className="size-3" />}
    </button>
  )
}

// ─── Generic Catalog Table ────────────────────────────────────────────────────

export type CatalogBulkAction = {
  value: string
  label: string
  icon?: ReactNode
  className?: string
}

const DEFAULT_BULK_ACTIONS: CatalogBulkAction[] = [
  {
    value: 'activate',
    label: 'Activate',
    icon: <Check className="size-4 text-emerald-500" />,
    className: 'border-border bg-background text-foreground hover:bg-accent',
  },
  {
    value: 'archive',
    label: 'Archive',
    icon: <X className="size-4" />,
    className:
      'border-destructive/40 bg-background text-destructive hover:bg-destructive/10',
  },
]

interface CatalogTablePageProps<TData> {
  title: string
  description: string
  backHref?: string
  data: TData[]

  columns: ColumnDef<TData, any>[]
  totalCount: number
  totalPages: number
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  canManage: boolean
  onCreate?: () => void
  createLabel?: string
  headerActions?: ReactNode
  toolbar?: ReactNode
  emptyMessage?: string

  // Bulk selection
  getRowId?: (row: TData) => string
  bulkActions?: CatalogBulkAction[]
  onBulkAction?: (action: string, ids: string[]) => Promise<void>
}

export function CatalogTablePage<TData>({
  title,
  description,
  backHref = '/app/workspace/catalogs',
  data,
  columns,
  totalCount,
  totalPages,
  page,
  pageSize,
  onPageChange,
  canManage,
  onCreate,
  createLabel = 'New',
  headerActions,
  toolbar,
  emptyMessage = 'No records found.',
  getRowId,
  bulkActions = DEFAULT_BULK_ACTIONS,
  onBulkAction,
}: CatalogTablePageProps<TData>) {
  // Track selection per-page — when page changes, selection resets automatically
  const [selectionState, setSelectionState] = useState<{
    page: number
    ids: Set<string>
  }>({ page: 0, ids: new Set() })
  const [bulkPending, setBulkPending] = useState(false)

  // Derive selectedIds — returns empty set when page changes (no effect needed)
  const selectedIds =
    selectionState.page === page ? selectionState.ids : new Set<string>()

  const allIds = useMemo(
    () => (getRowId ? data.map((row) => getRowId(row)) : []),
    [data, getRowId],
  )

  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.has(id))
  const selectionCount = selectedIds.size

  function toggleSelect(id: string) {
    setSelectionState((prev) => {
      const next = new Set(prev.ids)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { page, ids: next }
    })
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectionState(() => ({ page, ids: new Set() }))
    } else {
      setSelectionState(() => ({ page, ids: new Set(allIds) }))
    }
  }

  function clearSelection() {
    setSelectionState((prev) => ({ page: prev.page, ids: new Set() }))
  }

  // Inject checkbox column when bulk selection is enabled
  const allColumns = useMemo(() => {
    if (!getRowId || !onBulkAction) return columns
    const checkboxCol: ColumnDef<TData, any> = {
      id: '_selection',
      header: () => (
        <SelectionCheckbox checked={allSelected} onChange={toggleSelectAll} />
      ),
      cell: ({ row }) => (
        <SelectionCheckbox
          checked={selectedIds.has(getRowId(row.original))}
          onChange={() => toggleSelect(getRowId(row.original))}
        />
      ),
      enableSorting: false,
      meta: { headerClassName: 'w-10' },
    }
    return [checkboxCol, ...columns]
  }, [columns, getRowId, onBulkAction, allSelected, selectedIds])

  const table = useReactTable({
    data,
    columns: allColumns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
    state: {
      pagination: {
        pageIndex: page,
        pageSize,
      },
    },
    onPaginationChange: () => {},
  })

  const start = totalCount === 0 ? 0 : page * pageSize + 1
  const end = Math.min((page + 1) * pageSize, totalCount)

  async function handleBulk(action: string) {
    if (!onBulkAction || selectionCount === 0) return
    setBulkPending(true)
    try {
      await onBulkAction(action, [...selectedIds])
      clearSelection()
    } finally {
      setBulkPending(false)
    }
  }

  return (
    <div className="grid min-w-0 gap-6">
      {/* Header */}
      <header>
        <Link
          to={backHref}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Catalogs
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="m-0 text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="m-0 mt-1 text-sm text-muted-foreground">
              {description}
            </p>
          </div>
          {(headerActions || (canManage && onCreate)) && (
            <div className="flex items-center gap-2">
              {headerActions}
              {canManage && onCreate && (
                <button
                  type="button"
                  onClick={onCreate}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110"
                >
                  <Plus className="size-4" />
                  {createLabel}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Card */}
      <div className="rounded-lg border border-border bg-card shadow-sm">
        {/* Toolbar */}
        {toolbar && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
            {toolbar}
          </div>
        )}

        {/* Table */}
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="hover:bg-transparent">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={
                      (header.column.columnDef.meta as any)?.headerClassName ??
                      ''
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={allColumns.length}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={
                    getRowId && selectedIds.has(getRowId(row.original))
                      ? 'bg-primary/5'
                      : undefined
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Footer: count + pagination */}
        {totalCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {start}–{end} of {totalCount}
            </p>
            {totalPages > 1 && (
              <Pagination className="w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => onPageChange(Math.max(0, page - 1))}
                      aria-disabled={page === 0}
                      className={
                        page === 0
                          ? 'pointer-events-none opacity-50'
                          : 'cursor-pointer'
                      }
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }, (_, i) => {
                    if (
                      i === 0 ||
                      i === totalPages - 1 ||
                      Math.abs(i - page) <= 1
                    ) {
                      return (
                        <PaginationItem key={i}>
                          <PaginationLink
                            isActive={i === page}
                            onClick={() => onPageChange(i)}
                            className="cursor-pointer"
                          >
                            {i + 1}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    }
                    if (Math.abs(i - page) === 2) {
                      return (
                        <PaginationItem key={i}>
                          <span className="px-2 text-muted-foreground">…</span>
                        </PaginationItem>
                      )
                    }
                    return null
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() =>
                        onPageChange(Math.min(totalPages - 1, page + 1))
                      }
                      aria-disabled={page >= totalPages - 1}
                      className={
                        page >= totalPages - 1
                          ? 'pointer-events-none opacity-50'
                          : 'cursor-pointer'
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {canManage && onBulkAction && selectionCount > 0 && (
        <div className="sticky bottom-6 z-30 mx-auto flex items-center gap-4 rounded-xl border border-border bg-card px-5 py-3 shadow-lg backdrop-blur-sm">
          <p className="text-sm font-bold text-foreground whitespace-nowrap">
            {selectionCount} selected
          </p>
          <div className="h-5 w-px bg-border" />
          {bulkActions.map((action) => (
            <button
              key={action.value}
              type="button"
              onClick={() => handleBulk(action.value)}
              disabled={bulkPending}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${action.className ?? 'border-border bg-background text-foreground hover:bg-accent'}`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
          <button
            type="button"
            onClick={clearSelection}
            disabled={bulkPending}
            className="ml-auto text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            Clear selection
          </button>
        </div>
      )}
    </div>
  )
}
