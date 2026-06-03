import { memo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  BarChart2,
  CheckCircle,
  FileText,
  MoreHorizontal,
  Pencil,
  UserX,
} from 'lucide-react'
import { Input } from '#/components/ui/input'
import { TableCell, TableRow } from '#/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  computeEffectiveRate,
  formatCurrency,
} from '#/lib/time-tracker/billing'
import { formatHours } from '#/lib/time-tracker/store'
import { MemberExportDialog } from '#/components/time-tracker/shared/MemberExportDialog'
import type { TrackerState } from '#/lib/time-tracker/types'
import type { MemberStat } from './MembersTable'
import { MemberAnalyticsRow } from './MemberAnalyticsRow'
import { useMemberRow } from './useMemberRow'

type Member = TrackerState['members'][number]

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-primary/15 text-primary',
  INVITED:
    'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  DISABLED: 'bg-destructive/15 text-destructive',
}

export const MemberRow = memo(function MemberRow({
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
    editingField,
    setEditingField,
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
    cancelEdit,
    saveMemberFields,
    saveRate,
    handleToggleStatus,
    toggleCohort,
  } = useMemberRow(member)

  const [exportDialogOpen, setExportDialogOpen] = useState(false)

  const assignableCohorts = state.cohorts.filter(
    (cohort) => deptId && cohort.departmentId === deptId,
  )

  return (
    <>
      <TableRow className="border-t border-border">
        {/* Member — links to detail page */}
        <TableCell className="overflow-hidden px-5 py-4 align-top">
          <Link
            to="/app/workspace/members/$memberId"
            params={{ memberId: member.id }}
            className="block truncate font-semibold text-foreground no-underline hover:text-primary"
          >
            {member.name}
          </Link>
          <p className="m-0 mt-1 truncate text-xs text-muted-foreground">
            {member.email}
          </p>
        </TableCell>

        {/* Role — inline editable for canManage */}
        <TableCell className="overflow-hidden px-5 py-4 align-top">
          {editingField === 'role' && canManage ? (
            <select
              autoFocus
              value={roleId}
              onChange={(e) => {
                const newRoleId = e.target.value
                setRoleId(newRoleId)
                setEditingField(null)
                void saveMemberFields({ roleId: newRoleId })
              }}
              onBlur={() => setEditingField(null)}
              disabled={pending}
              className="h-8 w-full rounded border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary"
            >
              <option value="">No role</option>
              {state.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            <span
              onClick={() => canManage && !pending && setEditingField('role')}
              title={canManage ? 'Click to edit role' : undefined}
              className={`group inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-foreground ${canManage ? 'cursor-pointer rounded px-1 -mx-1 hover:bg-accent' : ''}`}
            >
              <span
                className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    state.roles.find((r) => r.id === member.workspaceRoleId)
                      ?.color ?? '#94a3b8',
                }}
              />
              <span className="truncate">{member.roleName || 'No role'}</span>
              {canManage && (
                <Pencil className="h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-40" />
              )}
            </span>
          )}
        </TableCell>

        {/* Department — inline editable for canManage */}
        <TableCell className="overflow-hidden px-5 py-4 align-top">
          {editingField === 'dept' && canManage ? (
            <select
              autoFocus
              value={deptId}
              onChange={(e) => {
                const newDeptId = e.target.value
                const newCohortIds = cohortIds.filter((cId) =>
                  state.cohorts.some(
                    (c) => c.id === cId && c.departmentId === newDeptId,
                  ),
                )
                setDeptId(newDeptId)
                setCohortIds(newCohortIds)
                setEditingField(null)
                void saveMemberFields({
                  deptId: newDeptId,
                  cohortIds: newCohortIds,
                })
              }}
              onBlur={() => setEditingField(null)}
              disabled={pending}
              className="h-8 w-full rounded border border-border bg-card px-2 text-xs text-foreground outline-none focus:border-primary"
            >
              <option value="">Unassigned</option>
              {state.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <span
              onClick={() => canManage && !pending && setEditingField('dept')}
              title={canManage ? 'Click to edit department' : undefined}
              className={`group flex max-w-full items-center gap-1 text-sm text-foreground ${canManage ? 'cursor-pointer rounded px-1 -mx-1 hover:bg-accent' : ''}`}
            >
              <span className="truncate">
                {department?.name || 'Unassigned'}
              </span>
              {canManage && (
                <Pencil className="h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-40" />
              )}
            </span>
          )}
        </TableCell>

        {/* Groups / Cohorts — inline editable for canManage */}
        <TableCell className="overflow-hidden px-5 py-4 align-top">
          {editingField === 'cohorts' && canManage ? (
            <div className="grid gap-2">
              {assignableCohorts.length === 0 ? (
                <span className="text-xs text-muted-foreground">
                  {deptId
                    ? 'No cohorts in this department'
                    : 'Select a department first'}
                </span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
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
              )}
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditingField(null)
                    void saveMemberFields({ cohortIds })
                  }}
                  disabled={pending}
                  className="h-6 rounded bg-primary px-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
                >
                  {pending ? '...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="h-6 rounded border border-border px-2 text-xs text-muted-foreground hover:bg-accent"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <span
              onClick={() =>
                canManage && !pending && setEditingField('cohorts')
              }
              title={canManage ? 'Click to edit groups' : undefined}
              className={`group flex max-w-full items-center gap-1 text-sm text-foreground ${canManage ? 'cursor-pointer rounded px-1 -mx-1 hover:bg-accent' : ''}`}
            >
              <span className="truncate">
                {cohorts.map((c) => c.name).join(', ') || 'None'}
              </span>
              {canManage && (
                <Pencil className="h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-40" />
              )}
            </span>
          )}
        </TableCell>

        {/* Status — display-only badge; toggle lives in the actions dropdown */}
        <TableCell className="whitespace-nowrap px-5 py-4 align-top">
          <span
            className={`rounded-lg px-2 py-1 text-xs font-bold ${STATUS_STYLES[member.status] ?? 'bg-muted text-foreground'}`}
          >
            {member.status}
          </span>
        </TableCell>

        {canManage && (
          <>
            {/* Billable Rate — inline editable */}
            <TableCell className="overflow-hidden px-5 py-4 align-top">
              {editingField === 'rate' ? (
                <div className="grid gap-1">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    autoFocus
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder={String(state.workspace.defaultBillableRate)}
                    aria-invalid={rateInputInvalid}
                    className="h-8 w-full text-right text-xs"
                    onBlur={() => {
                      setEditingField(null)
                      void saveRate()
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setEditingField(null)
                        void saveRate()
                      }
                      if (e.key === 'Escape') cancelEdit()
                    }}
                  />
                  <span className="text-right text-[10px] text-muted-foreground">
                    Blank = default
                  </span>
                </div>
              ) : (
                <span
                  onClick={() => !pending && setEditingField('rate')}
                  title="Click to edit rate"
                  className="group flex cursor-pointer items-center justify-end gap-1 rounded px-1 -mx-1 text-right text-sm tabular-nums text-muted-foreground hover:bg-accent"
                >
                  <span>
                    {formatCurrency(
                      effectiveRate,
                      state.workspace.billableCurrency,
                    )}
                    {member.billableRate == null && (
                      <span className="ml-1 text-xs">(default)</span>
                    )}
                  </span>
                  <Pencil className="h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-40" />
                </span>
              )}
            </TableCell>

            {/* Stats */}
            <TableCell className="whitespace-nowrap px-5 py-4 text-right align-top text-sm tabular-nums text-muted-foreground">
              {formatHours(stats?.thisWeekSeconds ?? 0)}
            </TableCell>
            <TableCell className="whitespace-nowrap px-5 py-4 text-right align-top text-sm tabular-nums text-muted-foreground">
              {formatHours(stats?.totalSeconds ?? 0)}
            </TableCell>
            <TableCell className="whitespace-nowrap px-5 py-4 text-right align-top text-sm tabular-nums text-muted-foreground">
              {formatHours(stats?.billableSeconds ?? 0)}
            </TableCell>

            {/* Actions — MoreHorizontal dropdown matching the catalog pattern */}
            <TableCell className="px-5 py-4 align-top">
              <div className="flex justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={pending}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                    aria-label="Member actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setShowAnalytics((v) => !v)}
                    >
                      <BarChart2 className="mr-2 h-4 w-4" />
                      {showAnalytics ? 'Hide analytics' : 'View analytics'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setExportDialogOpen(true)}>
                      <FileText className="mr-2 h-4 w-4" />
                      Export report
                    </DropdownMenuItem>
                    {!isSelf && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={handleToggleStatus}
                          disabled={pending}
                          className={
                            member.status !== 'DISABLED'
                              ? 'text-destructive focus:text-destructive'
                              : ''
                          }
                        >
                          {member.status === 'DISABLED' ? (
                            <>
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Enable member
                            </>
                          ) : (
                            <>
                              <UserX className="mr-2 h-4 w-4" />
                              Disable member
                            </>
                          )}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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

      {/* Export date-range dialog (PDF / CSV) */}
      <MemberExportDialog
        memberId={member.id}
        memberName={member.name}
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
      />
    </>
  )
})
