import { useMemo } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table'
import type { RowData } from '@tanstack/react-table'
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
import type { TrackerState } from '#/lib/time-tracker/types'
import { MemberRow } from './MemberRow'

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    headerClassName?: string
  }
}

type Member = TrackerState['members'][number]

export type MemberStat = {
  memberId: string
  totalSeconds: number
  billableSeconds: number
  entryCount: number
  thisWeekSeconds: number
  thisMonthSeconds: number
  topProjects: Array<{ projectId: string; seconds: number }>
}

export function MembersTable({
  members,
  state,
  canManage,
  statsMap,
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
}: {
  members: Member[]
  state: TrackerState
  canManage: boolean
  statsMap: Map<string, MemberStat>
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  const columns = useMembersColumns(canManage)
  const table = useReactTable({
    data: members,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (member) => member.id,
    manualPagination: true,
    pageCount: totalPages,
    state: {
      pagination: {
        pageIndex: page,
        pageSize,
      },
    },
  })
  const columnCount = table.getAllLeafColumns().length
  const firstItem = totalCount === 0 ? 0 : page * pageSize + 1
  const lastItem = Math.min((page + 1) * pageSize, totalCount)

  return (
    <div className="min-w-0 overflow-x-auto">
      <Table className="min-w-[900px]">
        <TableHeader className="whitespace-nowrap bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={header.column.columnDef.meta?.headerClassName}
                  style={{ width: header.column.getSize() }}
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
                colSpan={columnCount}
                className="px-5 py-8 text-center text-sm text-muted-foreground"
              >
                No members match your search.
              </TableCell>
            </TableRow>
          ) : (
            table
              .getRowModel()
              .rows.map((row) => (
                <MemberRow
                  key={row.id}
                  member={row.original}
                  state={state}
                  canManage={canManage}
                  columnCount={columnCount}
                  isSelf={row.original.id === state.currentMemberId}
                  stats={statsMap.get(row.original.id)}
                />
              ))
          )}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <span className="text-sm text-muted-foreground">
            Showing {firstItem}-{lastItem} of {totalCount} members
          </span>
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(event) => {
                    event.preventDefault()
                    if (page > 0) onPageChange(page - 1)
                  }}
                  aria-disabled={page === 0}
                  className={page === 0 ? 'pointer-events-none opacity-40' : ''}
                />
              </PaginationItem>
              {getVisiblePages(page, totalPages).map((pageNumber) => (
                <PaginationItem key={pageNumber}>
                  <PaginationLink
                    href="#"
                    isActive={pageNumber === page}
                    onClick={(event) => {
                      event.preventDefault()
                      onPageChange(pageNumber)
                    }}
                  >
                    {pageNumber + 1}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(event) => {
                    event.preventDefault()
                    if (page < totalPages - 1) onPageChange(page + 1)
                  }}
                  aria-disabled={page >= totalPages - 1}
                  className={
                    page >= totalPages - 1
                      ? 'pointer-events-none opacity-40'
                      : ''
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  )
}

function useMembersColumns(canManage: boolean) {
  return useMemo(() => {
    const columnHelper = createColumnHelper<Member>()
    const columns = [
      columnHelper.accessor('name', {
        id: 'member',
        header: 'Member',
        size: 220,
        meta: { headerClassName: 'whitespace-nowrap px-4 py-3' },
      }),
      columnHelper.accessor('roleName', {
        header: 'Role',
        size: 150,
        meta: { headerClassName: 'whitespace-nowrap px-4 py-3' },
      }),
      columnHelper.accessor('departmentId', {
        header: 'Department',
        size: 160,
        meta: { headerClassName: 'whitespace-nowrap px-4 py-3' },
      }),
      columnHelper.accessor('cohortIds', {
        header: 'Groups / cohorts',
        size: 220,
        meta: { headerClassName: 'whitespace-nowrap px-4 py-3' },
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        size: 120,
        meta: { headerClassName: 'whitespace-nowrap px-4 py-3' },
      }),
    ]

    if (!canManage) return columns

    return [
      ...columns,
      columnHelper.accessor('billableRate', {
        header: 'Rate',
        size: 160,
        meta: { headerClassName: 'whitespace-nowrap px-4 py-3 text-right' },
      }),
      columnHelper.display({
        id: 'thisWeek',
        header: 'This week',
        size: 110,
        meta: { headerClassName: 'whitespace-nowrap px-4 py-3 text-right' },
      }),
      columnHelper.display({
        id: 'total',
        header: 'Total',
        size: 110,
        meta: { headerClassName: 'whitespace-nowrap px-4 py-3 text-right' },
      }),
      columnHelper.display({
        id: 'billable',
        header: 'Billable',
        size: 110,
        meta: { headerClassName: 'px-4 py-3 text-right' },
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        size: 60,
        meta: { headerClassName: 'px-4 py-3' },
      }),
    ]
  }, [canManage])
}

function getVisiblePages(page: number, totalPages: number) {
  const start = Math.max(0, Math.min(page - 1, totalPages - 3))
  return Array.from({ length: Math.min(3, totalPages) }, (_, index) => {
    return start + index
  })
}
