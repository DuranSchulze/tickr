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

// ─── Form Dialog ──────────────────────────────────────────────────────────────

export function CatalogFormDialog({
  title,
  open,
  onClose,
  children,
}: {
  title: string
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

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
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        placeholder={placeholder}
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
          <X className="h-3.5 w-3.5" />
        </button>
      )}
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
      className={`grid h-5 w-5 place-items-center rounded border transition-colors ${
        checked
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background hover:border-primary/50'
      }`}
    >
      {checked && <Check className="h-3 w-3" />}
    </button>
  )
}

// ─── Generic Catalog Table ────────────────────────────────────────────────────

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
  onBulkAction?: (
    action: 'activate' | 'archive',
    ids: string[],
  ) => Promise<void>
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
  onBulkAction,
}: CatalogTablePageProps<TData>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkPending, setBulkPending] = useState(false)

  // Clear selection when data/page changes
  useEffect(() => {
    setSelectedIds(new Set())
  }, [data, page])

  const allIds = useMemo(
    () => (getRowId ? data.map((row) => getRowId(row)) : []),
    [data, getRowId],
  )

  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.has(id))
  const selectionCount = selectedIds.size

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allIds))
    }
  }

  function clearSelection() {
    setSelectedIds(new Set())
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

  async function handleBulk(action: 'activate' | 'archive') {
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
          <ArrowLeft className="h-3.5 w-3.5" />
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
                  <Plus className="h-4 w-4" />
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
          <button
            type="button"
            onClick={() => handleBulk('activate')}
            disabled={bulkPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-bold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check className="h-4 w-4 text-emerald-500" />
            Activate
          </button>
          <button
            type="button"
            onClick={() => handleBulk('archive')}
            disabled={bulkPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-3 py-1.5 text-sm font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-4 w-4" />
            Archive
          </button>
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
