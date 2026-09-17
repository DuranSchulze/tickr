import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Eye,
} from 'lucide-react'
import type { DepartmentMemberBreakdown } from '#/lib/server/tracker/department-dashboard.server'
import { formatCurrency } from '#/lib/time-tracker/billing'
import { formatDuration } from '#/lib/time-tracker/store'
import { DepartmentSectionFrame } from './DepartmentSectionFrame'

const PAGE_SIZE = 10

type SortKey = keyof Pick<
  DepartmentMemberBreakdown,
  'totalSeconds' | 'billableSeconds' | 'billableAmount' | 'entryCount'
>

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
      className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-smoke hover:text-foreground"
    >
      {label}
      {active ? (
        ascending ? (
          <ChevronUp className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        )
      ) : (
        <ChevronDown className="size-3 opacity-30" />
      )}
    </button>
  )
}

export function MemberBreakdownTable({
  members,
  currency,
  onViewMember,
}: {
  members: DepartmentMemberBreakdown[]
  currency: string
  onViewMember: (member: DepartmentMemberBreakdown) => void
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

  const sorted = members.toSorted((a, b) => {
    const diff = a[sortKey] - b[sortKey]
    return ascending ? diff : -diff
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  if (members.length === 0) {
    return (
      <DepartmentSectionFrame title="Member Breakdown" subtitle="0 members">
        <p className="px-4 py-10 text-center text-sm text-smoke">
          No entries from department members in this period.
        </p>
      </DepartmentSectionFrame>
    )
  }

  const sortProps = { currentKey: sortKey, ascending, onSort: handleSort }

  return (
    <DepartmentSectionFrame
      title="Member Breakdown"
      subtitle={`${members.length} member${members.length !== 1 ? 's' : ''}`}
      bodyClassName="p-0"
    >
      <>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-stone bg-warm-taupe">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-smoke">
                  Member
                </th>
                <th className="px-4 py-2.5 text-right">
                  <SortButton
                    label="Tracked Hrs"
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
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-smoke">
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
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-smoke">
                  Utilization
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-smoke">
                  Action
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
                    className="transition-colors hover:bg-warm-taupe/20"
                  >
                    <td className="px-4 py-3">
                      <p className="m-0 text-sm font-semibold text-foreground">
                        {member.name}
                      </p>
                      <p className="m-0 text-xs text-smoke">{member.email}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono font-semibold text-foreground">
                      {formatDuration(member.totalSeconds)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono text-foreground">
                      {formatDuration(member.billableSeconds)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono text-smoke">
                      {member.effectiveRate > 0
                        ? formatCurrency(member.effectiveRate, currency)
                        : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs font-mono font-semibold text-foreground">
                      {member.billableAmount > 0
                        ? formatCurrency(member.billableAmount, currency)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-smoke">
                      {member.entryCount}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
                          utilization >= 80
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : utilization >= 50
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : 'bg-warm-taupe text-smoke'
                        }`}
                      >
                        {utilization}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onViewMember(member)}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-stone bg-eggshell px-3 text-xs font-bold text-foreground transition-colors hover:bg-accent"
                      >
                        <Eye className="size-3.5" />
                        View
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-stone px-4 py-3">
            <span className="text-xs text-smoke">
              Page {page} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="inline-flex size-8 items-center justify-center rounded-full border border-stone text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex size-8 items-center justify-center rounded-full border border-stone text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </>
    </DepartmentSectionFrame>
  )
}
