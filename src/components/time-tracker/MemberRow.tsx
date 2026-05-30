import { memo, useCallback, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  BarChart2,
  CheckCircle,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  UserX,
} from 'lucide-react'
import { gooeyToast } from 'goey-toast'
import { Button } from '#/components/ui/button'
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  computeEffectiveRate,
  formatCurrency,
} from '#/lib/time-tracker/billing'
import { formatHours } from '#/lib/time-tracker/store'
import { getMemberMonthlyReportFn } from '#/lib/server/tracker'
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
  const [exportStartDate, setExportStartDate] = useState('')
  const [exportEndDate, setExportEndDate] = useState('')
  const [exporting, setExporting] = useState(false)

  function openExportDialog() {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    setExportStartDate(`${y}-${m}-01`)
    setExportEndDate(`${y}-${m}-${d}`)
    setExportDialogOpen(true)
  }

  const handleExportReport = useCallback(
    async (startDate: string, endDate: string) => {
      setExportDialogOpen(false)
      setExporting(true)

      // Open before any await so popup blockers don't block it.
      const win = window.open('', '_blank')
      if (!win) {
        gooeyToast.error('Pop-ups blocked', {
          description: 'Allow pop-ups for this site to open the report.',
        })
        setExporting(false)
        return
      }

      try {
        const report = await getMemberMonthlyReportFn({
          data: { memberId: member.id, startDate, endDate },
        })

        const pad = (n: number) => String(n).padStart(2, '0')
        const fmtDate = (d: string) => {
          const date = new Date(d + 'T00:00:00')
          return date.toLocaleDateString('en-PH', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        }
        const fmtHrs = (s: number) => {
          const h = Math.floor(s / 3600)
          const m = Math.floor((s % 3600) / 60)
          return `${h}h ${pad(m)}m`
        }

        const fmtShort = (iso: string) =>
          new Date(iso + 'T00:00:00').toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        const dateRangeLabel = `${fmtShort(startDate)} – ${fmtShort(endDate)}`

        const totalHrs = fmtHrs(report.summary.totalSeconds)
        const billableHrs = fmtHrs(report.summary.billableSeconds)

        const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Time Report - ${report.memberName} - ${dateRangeLabel}</title>
  <style>
    @page { margin: 1.5cm; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #1a1a1a; }
    .header { text-align: center; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #2563eb; }
    .header h1 { margin: 0; font-size: 20px; color: #2563eb; }
    .header p { margin: 4px 0 0; color: #666; font-size: 13px; }
    .summary-row { display: flex; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .summary-card { flex: 1; min-width: 120px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
    .summary-card .label { font-size: 10px; text-transform: uppercase; color: #666; font-weight: 600; letter-spacing: 0.5px; }
    .summary-card .value { font-size: 18px; font-weight: 800; margin-top: 4px; }
    .summary-card .value.primary { color: #2563eb; }
    .summary-card .value.green { color: #16a34a; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f3f4f6; text-align: left; padding: 8px 10px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; border-bottom: 2px solid #e5e7eb; }
    td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.center { text-align: center; }
    .billable-badge { background: #dcfce7; color: #16a34a; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
    .nonbillable-badge { background: #f3f4f6; color: #9ca3af; padding: 1px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
    .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #9ca3af; text-align: center; }
    .total-row td { font-weight: 700; border-top: 2px solid #1a1a1a; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Time Entry Report</h1>
    <p>${report.memberName} &middot; ${report.memberEmail}</p>
    <p>${dateRangeLabel}</p>
  </div>

  <div class="summary-row">
    <div class="summary-card">
      <div class="label">Total Hours</div>
      <div class="value primary">${totalHrs}</div>
    </div>
    <div class="summary-card">
      <div class="label">Billable Hours</div>
      <div class="value green">${billableHrs}</div>
    </div>
    <div class="summary-card">
      <div class="label">Total Entries</div>
      <div class="value">${report.summary.entryCount}</div>
    </div>
    <div class="summary-card">
      <div class="label">Billable Amount</div>
      <div class="value green">${report.summary.totalBillableAmount > 0 ? formatCurrency(report.summary.totalBillableAmount, report.currency) : '—'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Project / Client</th>
        <th>Tags</th>
        <th>Description</th>
        <th>Hours</th>
        <th>Rate</th>
        <th class="num">Amount</th>
        <th class="center">Type</th>
      </tr>
    </thead>
    <tbody>
      ${report.entries
        .map(
          (e) => `
        <tr>
          <td>${fmtDate(e.date)}</td>
          <td>${[e.projectName, e.clientName].filter(Boolean).join(' · ') || '—'}</td>
          <td>${e.tagNames.join(', ') || '—'}</td>
          <td>${e.description || 'Untitled'}</td>
          <td class="num">${fmtHrs(e.durationSeconds)}</td>
          <td class="num">${e.billable ? formatCurrency(e.effectiveRate, report.currency) : '—'}</td>
          <td class="num">${e.billableAmount != null ? formatCurrency(e.billableAmount, report.currency) : '—'}</td>
          <td class="center">${e.billable ? '<span class="billable-badge">Billable</span>' : '<span class="nonbillable-badge">Non-billable</span>'}</td>
        </tr>
      `,
        )
        .join('')}
    </tbody>
  </table>

  <div class="footer">
    Generated on ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })} &middot; Tickr
  </div>

  <script>window.print()</script>
</body>
</html>`

        win.document.write(html)
        win.document.close()
      } catch (err) {
        win.close()
        gooeyToast.error('Export failed', {
          description:
            err instanceof Error ? err.message : 'Could not generate report.',
        })
      } finally {
        setExporting(false)
      }
    },
    [member.id],
  )

  const todayStr = (() => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  })()

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
                    disabled={pending || exporting}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                    aria-label="Member actions"
                  >
                    {exporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MoreHorizontal className="h-4 w-4" />
                    )}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setShowAnalytics((v) => !v)}
                    >
                      <BarChart2 className="mr-2 h-4 w-4" />
                      {showAnalytics ? 'Hide analytics' : 'View analytics'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={openExportDialog}
                      disabled={exporting}
                    >
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

      {/* Export date-range dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Export Time Report</DialogTitle>
            <DialogDescription>
              Choose a date range to include in the report for{' '}
              <span className="font-semibold text-foreground">
                {member.name}
              </span>
              .
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-foreground">
                Start date
              </label>
              <input
                type="date"
                value={exportStartDate}
                max={exportEndDate || todayStr}
                onChange={(e) => setExportStartDate(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-foreground">
                End date
              </label>
              <input
                type="date"
                value={exportEndDate}
                min={exportStartDate || undefined}
                max={todayStr}
                onChange={(e) => setExportEndDate(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              onClick={() => handleExportReport(exportStartDate, exportEndDate)}
              disabled={
                !exportStartDate ||
                !exportEndDate ||
                exportStartDate > exportEndDate
              }
            >
              <FileText className="mr-2 h-4 w-4" />
              Generate PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
})
