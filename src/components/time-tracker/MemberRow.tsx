import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { BarChart2, Pencil } from 'lucide-react'
import { Input } from '#/components/ui/input'
import { TableCell, TableRow } from '#/components/ui/table'
import {
  computeEffectiveRate,
  formatCurrency,
} from '#/lib/time-tracker/billing'
import { formatHours } from '#/lib/time-tracker/store'
import type { TrackerState } from '#/lib/time-tracker/types'
import type { MemberStat } from './MembersTable'
import { MemberAnalyticsRow } from './MemberAnalyticsRow'
import { useMemberRow } from './useMemberRow'

type Member = TrackerState['members'][number]

function IconBtn({
  onClick,
  title,
  children,
  className = '',
}: {
  onClick: () => void
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`rounded p-1 text-muted-foreground transition-colors hover:text-foreground ${className}`}
    >
      {children}
    </button>
  )
}

function MemberStatusControl({
  status,
  canToggle,
  pending,
  onToggle,
}: {
  status: string
  canToggle: boolean
  pending: boolean
  onToggle: () => void
}) {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-primary/15 text-primary',
    INVITED:
      'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    DISABLED: 'bg-destructive/15 text-destructive',
  }
  const className = `rounded-lg px-2 py-1 text-xs font-bold ${styles[status] ?? 'bg-muted text-foreground'}`

  if (!canToggle) {
    return <span className={className}>{status}</span>
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      title={status === 'DISABLED' ? 'Reactivate member' : 'Disable member'}
      className={`${className} transition-colors hover:bg-accent disabled:opacity-50`}
    >
      {pending ? 'UPDATING' : status}
    </button>
  )
}

export function MemberRow({
  member,
  state,
  canManage,
  columnCount,
  isSelf,
  stats,
}: {
  member: Member
  state: TrackerState
  canManage: boolean
  columnCount: number
  isSelf: boolean
  stats?: MemberStat
}) {
  const department = state.departments.find((d) => d.id === member.departmentId)
  const cohorts = state.cohorts.filter((c) => member.cohortIds.includes(c.id))
  const effectiveRate = computeEffectiveRate(
    member.billableRate,
    state.workspace.defaultBillableRate,
  )

  const {
    editing,
    setEditing,
    showAnalytics,
    setShowAnalytics,
    roleId,
    setRoleId,
    deptId,
    setDeptId,
    cohortIds,
    setCohortIds,
    rate,
    setRate,
    pending,
    rateInputInvalid,
    resetEditState,
    handleSave,
    handleToggleStatus,
    toggleCohort,
  } = useMemberRow(member)

  const assignableCohorts = state.cohorts.filter(
    (cohort) => deptId && cohort.departmentId === deptId,
  )

  if (editing && canManage) {
    return (
      <TableRow className="border-t border-border bg-muted">
        <TableCell className="px-5 py-4 align-top">
          <p className="m-0 whitespace-nowrap font-semibold text-foreground">
            {member.name}
          </p>
          <p className="m-0 mt-0.5 whitespace-nowrap text-xs text-muted-foreground">
            {member.email}
          </p>
        </TableCell>
        <TableCell className="px-5 py-4 align-top">
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="h-8 w-full min-w-[130px] rounded border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary"
          >
            <option value="">No role</option>
            {state.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </TableCell>
        <TableCell className="px-5 py-4 align-top">
          <select
            value={deptId}
            onChange={(e) => {
              const nextDepartmentId = e.target.value
              setDeptId(nextDepartmentId)
              setCohortIds((current) =>
                current.filter((cohortId) =>
                  state.cohorts.some(
                    (cohort) =>
                      cohort.id === cohortId &&
                      cohort.departmentId === nextDepartmentId,
                  ),
                ),
              )
            }}
            className="h-8 w-full min-w-[140px] rounded border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary"
          >
            <option value="">Unassigned</option>
            {state.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </TableCell>
        <TableCell className="px-5 py-4 align-top">
          <div className="flex min-w-[200px] flex-wrap gap-1.5">
            {assignableCohorts.length === 0 && (
              <span className="text-xs text-muted-foreground">
                {deptId ? 'No cohorts in this department' : 'Select department'}
              </span>
            )}
            {assignableCohorts.map((c) => (
              <label
                key={c.id}
                className="flex cursor-pointer items-center gap-1 whitespace-nowrap text-xs text-foreground"
              >
                <input
                  type="checkbox"
                  checked={cohortIds.includes(c.id)}
                  onChange={() => toggleCohort(c.id)}
                  className="rounded"
                />
                {c.name}
              </label>
            ))}
          </div>
        </TableCell>
        <TableCell className="whitespace-nowrap px-5 py-4 align-top">
          <MemberStatusControl
            status={member.status}
            canToggle={!isSelf}
            pending={pending}
            onToggle={handleToggleStatus}
          />
        </TableCell>
        <TableCell className="px-5 py-4 text-right align-top text-sm text-muted-foreground">
          <div className="ml-auto grid min-w-[140px] gap-1">
            <Input
              type="number"
              min="0"
              step="0.01"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              placeholder={`Default: ${state.workspace.defaultBillableRate}`}
              aria-invalid={rateInputInvalid}
              className="h-8 text-right text-xs"
            />
            <span className="whitespace-nowrap text-[11px] text-muted-foreground">
              Blank uses default
            </span>
          </div>
        </TableCell>
        <TableCell className="whitespace-nowrap px-5 py-4 text-right align-top text-sm text-muted-foreground">
          {formatHours(stats?.thisWeekSeconds ?? 0)}
        </TableCell>
        <TableCell className="whitespace-nowrap px-5 py-4 text-right align-top text-sm text-muted-foreground">
          {formatHours(stats?.totalSeconds ?? 0)}
        </TableCell>
        <TableCell className="whitespace-nowrap px-5 py-4 text-right align-top text-sm text-muted-foreground">
          {formatHours(stats?.billableSeconds ?? 0)}
        </TableCell>
        <TableCell className="px-5 py-4 align-top">
          <div className="flex whitespace-nowrap gap-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={pending || rateInputInvalid}
              className="h-7 rounded bg-primary px-3 text-xs font-bold text-primary-foreground hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
            >
              {pending ? '...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={resetEditState}
              className="h-7 rounded border border-border px-2 text-xs text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
          </div>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <>
      <TableRow className="border-t border-border">
        <TableCell className="px-5 py-4 align-top">
          <Link
            to="/app/workspace/members/$memberId"
            params={{ memberId: member.id }}
            className="whitespace-nowrap font-semibold text-foreground no-underline hover:text-primary"
          >
            {member.name}
          </Link>
          <p className="m-0 mt-1 whitespace-nowrap text-xs text-muted-foreground">
            {member.email}
          </p>
        </TableCell>
        <TableCell className="px-5 py-4 align-top">
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-foreground">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor:
                  state.roles.find((r) => r.id === member.workspaceRoleId)
                    ?.color ?? '#94a3b8',
              }}
            />
            {member.roleName}
          </span>
        </TableCell>
        <TableCell className="px-5 py-4 align-top text-foreground">
          <span className="whitespace-nowrap">
            {department?.name || 'Unassigned'}
          </span>
        </TableCell>
        <TableCell className="px-5 py-4 align-top text-foreground">
          <span className="inline-block min-w-[180px] whitespace-nowrap">
            {cohorts.map((c) => c.name).join(', ') || 'None'}
          </span>
        </TableCell>
        <TableCell className="whitespace-nowrap px-5 py-4 align-top">
          <MemberStatusControl
            status={member.status}
            canToggle={canManage && !isSelf}
            pending={pending}
            onToggle={handleToggleStatus}
          />
        </TableCell>
        {canManage && (
          <>
            <TableCell className="whitespace-nowrap px-5 py-4 text-right align-top text-sm tabular-nums text-muted-foreground">
              {formatCurrency(effectiveRate, state.workspace.billableCurrency)}
              {member.billableRate == null && (
                <span className="ml-1 text-xs">(default)</span>
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap px-5 py-4 text-right align-top text-sm tabular-nums text-muted-foreground">
              {formatHours(stats?.thisWeekSeconds ?? 0)}
            </TableCell>
            <TableCell className="whitespace-nowrap px-5 py-4 text-right align-top text-sm tabular-nums text-muted-foreground">
              {formatHours(stats?.totalSeconds ?? 0)}
            </TableCell>
            <TableCell className="whitespace-nowrap px-5 py-4 text-right align-top text-sm tabular-nums text-muted-foreground">
              {formatHours(stats?.billableSeconds ?? 0)}
            </TableCell>
            <TableCell className="px-5 py-4 align-top">
              <div className="flex items-center gap-1 whitespace-nowrap">
                <IconBtn
                  onClick={() => setShowAnalytics((v) => !v)}
                  title="View analytics"
                  className={showAnalytics ? 'bg-primary/10 text-primary' : ''}
                >
                  <BarChart2 className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn onClick={() => setEditing(true)} title="Edit member">
                  <Pencil className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            </TableCell>
          </>
        )}
      </TableRow>

      {canManage && showAnalytics && (
        <MemberAnalyticsRow
          member={member}
          columnCount={columnCount}
          stats={stats}
          state={state}
        />
      )}
    </>
  )
}
