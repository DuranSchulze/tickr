import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import {
  BarChart2,
  CheckCircle,
  FileText,
  MoreHorizontal,
  Pencil,
  UserX,
} from 'lucide-react'
import { Input } from '#/components/ui/input'
import { Button } from '#/components/ui/button'
import { TableCell, TableRow } from '#/components/ui/table'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  setMemberClientBillableRateFn,
  unsetMemberClientBillableRateFn,
  updateMemberBillableRateFn,
} from '#/lib/server/tracker'
import { gooeyToast } from '#/lib/toast'
import {
  computeBillableRate,
  computeEffectiveRate,
  formatCurrency,
} from '#/lib/time-tracker/billing'
import { formatHours } from '#/lib/time-tracker/store'
import { MemberExportDialog } from '#/components/time-tracker/shared/MemberExportDialog'
import type { TrackerState } from '#/lib/time-tracker/types'
import type { MemberStat } from './MembersTable'
import { MemberAnalyticsRow } from './MemberAnalyticsRow'
import { useMemberRow } from './useMemberRow'
import { canAssignRoleLevel } from '#/lib/rbac/authorization'

type Member = TrackerState['members'][number]

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-primary/15 text-primary',
  INVITED:
    'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  DISABLED: 'bg-destructive/15 text-destructive',
}

function todayKey(timeZone?: string) {
  if (!timeZone) return new Date().toISOString().slice(0, 10)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

type Client = TrackerState['clients'][number]

type RateSource = 'override' | 'client' | 'member' | 'workspace'

const RATE_SOURCE_LABELS: Record<RateSource, string> = {
  override: 'Override',
  client: 'Client default',
  member: 'Member default',
  workspace: 'Workspace default',
}

const CLIENT_STATUS_BADGES: Record<string, string> = {
  SUSPENDED:
    'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  INACTIVE: 'bg-muted text-muted-foreground',
}

const RATE_INPUT_CLASS =
  'text-right tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

function isRate(value: number | null) {
  return value != null && Number.isFinite(value) && value >= 0
}

function parseRateInput(value: string) {
  const trimmed = value.trim()
  if (trimmed === '') return { parsed: null as number | null, invalid: false }
  const parsed = Number(trimmed)
  return { parsed, invalid: !Number.isFinite(parsed) || parsed < 0 }
}

function listBillableClients(
  clients: Client[],
  clientRates: Partial<Record<string, number>>,
) {
  const overridden = new Set(Object.keys(clientRates))
  return clients
    .filter(
      (client) => client.clientStatus === 'ACTIVE' || overridden.has(client.id),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

function buildClientDrafts(
  clients: Client[],
  clientRates: Partial<Record<string, number>>,
) {
  const drafts: Record<string, string> = {}
  for (const client of clients) {
    const rate = clientRates[client.id]
    drafts[client.id] = rate == null ? '' : String(rate)
  }
  return drafts
}

function MemberRateDialog({
  open,
  onOpenChange,
  member,
  state,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  member: Member
  state: TrackerState
}) {
  const router = useRouter()
  const timezone = state.workspace.timezone
  const currency = state.workspace.billableCurrency
  const workspaceDefaultRate = state.workspace.defaultBillableRate

  const initialClientRates = useCallback(() => {
    return Object.fromEntries(
      state.memberClientBillableRates
        .filter(
          (rate) =>
            rate.workspaceMemberId === member.id && rate.effectiveTo == null,
        )
        .map((rate) => [rate.clientId, rate.billableRate]),
    )
  }, [member.id, state.memberClientBillableRates])

  const [clientRates, setClientRates] =
    useState<Partial<Record<string, number>>>(initialClientRates)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [defaultRate, setDefaultRate] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    const rates = initialClientRates()
    setClientRates(rates)
    setDrafts(
      buildClientDrafts(listBillableClients(state.clients, rates), rates),
    )
    setDefaultRate(
      member.billableRate == null ? '' : String(member.billableRate),
    )
  }, [initialClientRates, member.billableRate, open, state.clients])

  const clientList = useMemo(
    () => listBillableClients(state.clients, clientRates),
    [clientRates, state.clients],
  )

  const { parsed: parsedDefaultRate, invalid: defaultRateInvalid } =
    parseRateInput(defaultRate)

  const rows = useMemo(() => {
    return clientList.map((client) => {
      const { parsed, invalid } = parseRateInput(drafts[client.id] ?? '')
      const effectiveRate = computeBillableRate({
        memberClientRate: parsed,
        clientDefaultRate: client.defaultBillableRate,
        memberRate: parsedDefaultRate,
        workspaceDefaultRate,
      })
      const source: RateSource = isRate(parsed)
        ? 'override'
        : isRate(client.defaultBillableRate)
          ? 'client'
          : isRate(parsedDefaultRate)
            ? 'member'
            : 'workspace'
      return {
        client,
        savedRate: clientRates[client.id] ?? null,
        draft: drafts[client.id] ?? '',
        parsedDraft: parsed,
        invalid,
        effectiveRate,
        source,
      }
    })
  }, [clientList, clientRates, drafts, parsedDefaultRate, workspaceDefaultRate])

  const changedRows = rows.filter((row) => row.parsedDraft !== row.savedRate)
  const overrideCount = rows.filter((row) => row.parsedDraft != null).length
  const anyInvalid = defaultRateInvalid || rows.some((row) => row.invalid)
  const dirty =
    parsedDefaultRate !== member.billableRate || changedRows.length > 0
  const effectiveDefaultRate = computeEffectiveRate(
    parsedDefaultRate,
    workspaceDefaultRate,
  )

  function setClientDraft(clientId: string, value: string) {
    setDrafts((current) => ({ ...current, [clientId]: value }))
  }

  async function saveAll() {
    if (!dirty || anyInvalid || pending) return
    setPending(true)
    try {
      let changes = 0
      if (parsedDefaultRate !== member.billableRate) {
        await updateMemberBillableRateFn({
          data: { memberId: member.id, billableRate: parsedDefaultRate },
        })
        changes += 1
      }
      const nextRates = { ...clientRates }
      for (const row of changedRows) {
        if (row.parsedDraft == null) {
          await unsetMemberClientBillableRateFn({
            data: {
              memberId: member.id,
              clientId: row.client.id,
              effectiveFrom: todayKey(timezone),
            },
          })
          delete nextRates[row.client.id]
        } else {
          await setMemberClientBillableRateFn({
            data: {
              memberId: member.id,
              clientId: row.client.id,
              billableRate: row.parsedDraft,
              effectiveFrom: todayKey(timezone),
            },
          })
          nextRates[row.client.id] = row.parsedDraft
        }
        changes += 1
      }
      setClientRates(nextRates)
      setDefaultRate(parsedDefaultRate == null ? '' : String(parsedDefaultRate))
      setDrafts(buildClientDrafts(clientList, nextRates))
      void router.invalidate()
      gooeyToast.success('Billing rates updated', {
        description:
          changes === 1 ? '1 change saved.' : `${changes} changes saved.`,
      })
    } catch (err) {
      gooeyToast.error('Could not save billing rates', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-visible sm:max-w-lg">
        <DialogHeader className="pr-8">
          <DialogTitle>Billing rates for {member.name}</DialogTitle>
          <DialogDescription>
            Set this member's default hourly rate and optional per-client rates.
            Clients without a specific rate use the default.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
          <section className="shrink-0 rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="m-0 text-sm font-bold text-foreground">
                Default rate
              </h3>
              <p className="m-0 text-xs text-muted-foreground">
                Effective{' '}
                <span className="font-semibold tabular-nums text-foreground">
                  {formatCurrency(effectiveDefaultRate, currency)}/hr
                </span>
              </p>
            </div>
            <label className="mt-3 block text-xs font-semibold text-foreground">
              Default hourly rate
              <span className="relative mt-1.5 block w-full sm:max-w-44">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={defaultRate}
                  onChange={(event) => setDefaultRate(event.target.value)}
                  placeholder="Workspace default"
                  aria-invalid={defaultRateInvalid}
                  className={`${RATE_INPUT_CLASS} pr-11`}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-muted-foreground">
                  /hr
                </span>
              </span>
            </label>
            <p className="m-0 mt-2 text-xs text-muted-foreground">
              Applies to clients without a specific rate. Leave empty to use the
              workspace default (
              {formatCurrency(workspaceDefaultRate, currency)}/hr).
            </p>
          </section>

          <section className="shrink-0 overflow-hidden rounded-lg border border-border">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3">
              <h3 className="m-0 text-sm font-bold text-foreground">
                Client rates
              </h3>
              {rows.length > 0 && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  {overrideCount} of {rows.length} overridden
                </span>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="m-0 px-4 py-6 text-sm text-muted-foreground">
                No clients yet. Client-specific rates will appear here once
                clients are added.
              </p>
            ) : (
              <ul className="m-0 list-none divide-y divide-border">
                {rows.map((row) => (
                  <li
                    key={row.client.id}
                    className={`flex items-center gap-3 px-4 py-2.5 ${
                      row.parsedDraft != null ? 'bg-primary/5' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">
                          {row.client.name}
                        </span>
                        {row.client.clientStatus !== 'ACTIVE' && (
                          <span
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                              CLIENT_STATUS_BADGES[row.client.clientStatus] ??
                              'bg-muted text-muted-foreground'
                            }`}
                          >
                            {row.client.clientStatus}
                          </span>
                        )}
                      </div>
                      <p
                        className={`m-0 mt-0.5 truncate text-xs tabular-nums ${
                          row.source === 'override'
                            ? 'text-primary'
                            : 'text-muted-foreground'
                        }`}
                      >
                        {formatCurrency(row.effectiveRate, currency)}/hr ·{' '}
                        {RATE_SOURCE_LABELS[row.source]}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={row.draft}
                      onChange={(event) =>
                        setClientDraft(row.client.id, event.target.value)
                      }
                      placeholder="Default"
                      aria-label={`Hourly rate for ${row.client.name}`}
                      aria-invalid={row.invalid}
                      className={`${RATE_INPUT_CLASS} w-24 shrink-0 sm:w-28`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={pending}>
              Close
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={pending || !dirty || anyInvalid}
            onClick={() => void saveAll()}
          >
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
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
  const actorMember = state.members.find(
    (candidate) => candidate.id === state.currentMemberId,
  )
  const actorLevel = actorMember?.permissionLevel ?? 'EMPLOYEE'
  const assignableRoles = state.roles.filter((role) =>
    canAssignRoleLevel(actorLevel, role.permissionLevel),
  )
  const actorDepartmentId = actorMember?.departmentId
  const manageableDepartments =
    actorLevel === 'MANAGER'
      ? state.departments.filter(
          (candidate) => candidate.id === actorDepartmentId,
        )
      : state.departments
  const effectiveRate = computeEffectiveRate(
    member.billableRate,
    state.workspace.defaultBillableRate,
  )
  const memberClientRateCount = state.memberClientBillableRates.filter(
    (rate) => rate.workspaceMemberId === member.id && rate.effectiveTo == null,
  ).length
  const rateStatusLabel =
    memberClientRateCount > 0
      ? `${memberClientRateCount} client ${memberClientRateCount === 1 ? 'rate' : 'rates'}`
      : member.billableRate == null
        ? 'Workspace default'
        : 'Member default'

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
    pending,
    cancelEdit,
    saveMemberFields,
    handleToggleStatus,
    toggleCohort,
  } = useMemberRow(member)

  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [rateDialogOpen, setRateDialogOpen] = useState(false)

  const assignableCohorts = state.cohorts.filter(
    (cohort) => deptId && cohort.departmentId === deptId,
  )

  return (
    <>
      <TableRow className="border-t border-border">
        {/* Member — links to detail page */}
        <TableCell className="overflow-hidden px-5 py-4 align-middle">
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
        <TableCell className="overflow-hidden px-5 py-4 align-middle">
          {editingField === 'role' && canManage ? (
            <select
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
              {assignableRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => canManage && !pending && setEditingField('role')}
              title={canManage ? 'Click to edit role' : undefined}
              className={`group inline-flex max-w-full items-center gap-1.5 text-sm font-semibold text-foreground ${canManage ? 'cursor-pointer rounded px-1 -mx-1 hover:bg-accent' : ''}`}
            >
              <span
                className="inline-block size-2.5 flex-shrink-0 rounded-full"
                style={{
                  backgroundColor:
                    state.roles.find((r) => r.id === member.workspaceRoleId)
                      ?.color ?? '#94a3b8',
                }}
              />
              <span className="truncate">{member.roleName || 'No role'}</span>
              {canManage && (
                <Pencil className="size-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-40" />
              )}
            </button>
          )}
        </TableCell>

        {/* Department — inline editable for canManage */}
        <TableCell className="overflow-hidden px-5 py-4 align-middle">
          {editingField === 'dept' && canManage ? (
            <select
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
              {manageableDepartments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => canManage && !pending && setEditingField('dept')}
              title={canManage ? 'Click to edit department' : undefined}
              className={`group flex max-w-full items-center gap-1 text-sm text-foreground ${canManage ? 'cursor-pointer rounded px-1 -mx-1 hover:bg-accent' : ''}`}
            >
              <span className="truncate">
                {department?.name || 'Unassigned'}
              </span>
              {canManage && (
                <Pencil className="size-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-40" />
              )}
            </button>
          )}
        </TableCell>

        {/* Groups / Cohorts — inline editable for canManage */}
        <TableCell className="overflow-hidden px-5 py-4 align-middle">
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
            <button
              type="button"
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
                <Pencil className="size-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-40" />
              )}
            </button>
          )}
        </TableCell>

        {/* Status — display-only badge; toggle lives in the actions dropdown */}
        <TableCell className="whitespace-nowrap px-5 py-4 align-middle">
          <span
            className={`rounded-lg px-2 py-1 text-xs font-bold ${STATUS_STYLES[member.status] ?? 'bg-muted text-foreground'}`}
          >
            {member.status}
          </span>
        </TableCell>

        {canManage && (
          <>
            {/* Billable Rate */}
            <TableCell className="overflow-hidden px-5 py-4 align-middle">
              <button
                type="button"
                onClick={() => !pending && setRateDialogOpen(true)}
                title="Click to edit billing rates"
                className={`group flex w-full cursor-pointer items-center justify-end gap-2 rounded-lg border px-3 py-1.5 text-right transition-colors ${
                  memberClientRateCount > 0
                    ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
                    : 'border-border bg-muted/60 text-foreground hover:bg-accent'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold tabular-nums">
                    {formatCurrency(
                      effectiveRate,
                      state.workspace.billableCurrency,
                    )}
                  </span>
                  <span className="block text-[11px] font-semibold leading-tight opacity-70">
                    {rateStatusLabel}
                  </span>
                </span>
                <Pencil className="size-3.5 shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
              </button>
            </TableCell>

            {/* Stats */}
            <TableCell className="whitespace-nowrap px-5 py-4 text-right align-middle text-sm tabular-nums text-muted-foreground">
              {formatHours(stats?.thisWeekSeconds ?? 0)}
            </TableCell>
            <TableCell className="whitespace-nowrap px-5 py-4 text-right align-middle text-sm tabular-nums text-muted-foreground">
              {formatHours(stats?.totalSeconds ?? 0)}
            </TableCell>
            <TableCell className="whitespace-nowrap px-5 py-4 text-right align-middle text-sm tabular-nums text-muted-foreground">
              {formatHours(stats?.billableSeconds ?? 0)}
            </TableCell>

            {/* Actions — MoreHorizontal dropdown matching the catalog pattern */}
            <TableCell className="px-5 py-4 align-middle">
              <div className="flex justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    disabled={pending}
                    className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                    aria-label="Member actions"
                  >
                    <MoreHorizontal className="size-5" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44 p-1.5">
                    <DropdownMenuItem
                      onClick={() => setShowAnalytics((v) => !v)}
                      className="gap-2.5 px-3 py-2"
                    >
                      <BarChart2 className="size-5" />
                      {showAnalytics ? 'Hide analytics' : 'View analytics'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => setExportDialogOpen(true)}
                      className="gap-2.5 px-3 py-2"
                    >
                      <FileText className="size-5" />
                      Export report
                    </DropdownMenuItem>
                    {!isSelf && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={handleToggleStatus}
                          disabled={pending}
                          className={`gap-2.5 px-3 py-2 ${
                            member.status !== 'DISABLED'
                              ? 'text-destructive focus:text-destructive'
                              : ''
                          }`}
                        >
                          {member.status === 'DISABLED' ? (
                            <>
                              <CheckCircle className="size-5" />
                              Enable member
                            </>
                          ) : (
                            <>
                              <UserX className="size-5" />
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
      <MemberRateDialog
        open={rateDialogOpen}
        onOpenChange={setRateDialogOpen}
        member={member}
        state={state}
      />
    </>
  )
})
