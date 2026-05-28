import { useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react'
import type { DepartmentMemberBreakdown } from '#/lib/server/tracker/department-dashboard.server'
import { formatCurrency } from '#/lib/time-tracker/billing'

const PAGE_SIZE = 10

type SortKey = keyof Pick<
  DepartmentMemberBreakdown,
  'totalSeconds' | 'billableSeconds' | 'billableAmount' | 'entryCount'
>

function formatHours(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0 && m === 0) return '—'
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function SortButton({
  label,
  sortKey,
  currentKey,
  ascending,
  onSort,
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  ascending: boolean
  onSort: (key: SortKey) => void
}) {
  const active = currentKey === sortKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
    >
      {label}
      {active ? (
        ascending ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ChevronDown className="h-3 w-3 opacity-30" />
      )}
    </button>
  )
}

export function MemberBreakdownTable({
  members,
  currency,
}: {
  members: DepartmentMemberBreakdown[]
  currency: string
}) {
  const [sortKey, setSortKey] = useState<SortKey>('totalSeconds')
  const [ascending, setAscending] = useState(false)
  const [page, setPage] = useState(1)

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setAscending((a) => !a)
    } else {
      setSortKey(key)
      setAscending(false)
    }
    setPage(1)
  }

  const sorted = [...members].sort((a, b) => {
    const diff = a[sortKey] - b[sortKey]
    return ascending ? diff : -diff
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (members.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h2 className="m-0 text-base font-bold text-foreground">
            Member Breakdown
          </h2>
        </div>
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          No entries from department members in this period.
        </p>
      </section>
    )
  }

  const sortProps = { currentKey: sortKey, ascending, onSort: handleSort }

  return (
    <section className="rounded-lg border border-border bg-card shadow-sm">
      <div className="border-b border-border px-4 py-3">
        <h2 className="m-0 text-base font-bold text-foreground">
          Member Breakdown
        </h2>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">
          {members.length} member{members.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Member
              </th>
              <th className="px-4 py-2.5 text-right">
                <SortButton
                  label="Total Hrs"
                  sortKey="totalSeconds"
                  {...sortProps}
                />
              </th>
              <th className="px-4 py-2.5 text-right">
                <SortButton
                  label="Billable Hrs"
                  sortKey="billableSeconds"
                  {...sortProps}
                />
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Rate/hr
              </th>
              <th className="px-4 py-2.5 text-right">
                <SortButton
                  label="Amount"
                  sortKey="billableAmount"
                  {...sortProps}
                />
              </th>
              <th className="px-4 py-2.5 text-right">
                <SortButton
                  label="Entries"
                  sortKey="entryCount"
                  {...sortProps}
                />
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Utilization
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.map((member) => {
              const utilization =
                member.totalSeconds === 0
                  ? 0
                  : Math.round(
                      (member.billableSeconds / member.totalSeconds) * 100,
                    )
              return (
                <tr
                  key={member.memberId}
                  className="transition-colors hover:bg-muted/20"
                >
                  <td className="px-4 py-3">
                    <p className="m-0 text-sm font-semibold text-foreground">
                      {member.name}
                    </p>
                    <p className="m-0 text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono font-semibold text-foreground">
                    {formatHours(member.totalSeconds)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono text-foreground">
                    {formatHours(member.billableSeconds)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono text-muted-foreground">
                    {member.effectiveRate > 0
                      ? formatCurrency(member.effectiveRate, currency)
                      : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono font-semibold text-foreground">
                    {member.billableAmount > 0
                      ? formatCurrency(member.billableAmount, currency)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                    {member.entryCount}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                        utilization >= 80
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : utilization >= 50
                            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {utilization}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
