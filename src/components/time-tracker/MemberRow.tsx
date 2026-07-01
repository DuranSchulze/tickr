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
import { Combobox } from '#/components/ui/combobox'
import { TableCell, TableRow } from '#/components/ui/table'
import {
  Dialog,
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
} from '#/lib/server/tracker'
import { gooeyToast } from '#/lib/toast'
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

function todayKey(timeZone?: string) {
  if (!timeZone) return new Date().toISOString().slice(0, 10)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
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
  const activeClients = state.clients.filter(
    (client) => client.clientStatus === 'ACTIVE',
  )
  const clientById = useMemo(
    () => new Map(state.clients.map((client) => [client.id, client])),
    [state.clients],
  )
  const clientOptions = activeClients.map((client) => ({
    value: client.id,
    label: client.name,
  }))
  const [clientId, setClientId] = useState(activeClients[0]?.id ?? '')
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
  const [clientRate, setClientRate] = useState('')
  const [pending, setPending] = useState(false)

  const savedClientRates = useMemo(() => {
    return Object.entries(clientRates)
      .map(([savedClientId, billableRate]) => ({
        clientId: savedClientId,
        clientName: clientById.get(savedClientId)?.name ?? 'Unknown client',
        billableRate,
      }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName))
  }, [clientById, clientRates])

  const syncClientDraft = useCallback(
    (nextClientId: string, rates: Partial<Record<string, number>>) => {
      const rate = rates[nextClientId]
      setClientRate(rate == null ? '' : String(rate))
    },
    [],
  )

  const clientRateInput = clientRate.trim()
  const parsedClientRate =
    clientRateInput === '' ? null : Number(clientRateInput)
  const clientRateInvalid =
    parsedClientRate !== null &&
    (!Number.isFinite(parsedClientRate) || parsedClientRate < 0)
  const previewRate = computeEffectiveRate(
    parsedClientRate,
    state.workspace.defaultBillableRate,
  )

  useEffect(() => {
    if (!open) return
    const rates = initialClientRates()
    setClientRates(rates)
  }, [initialClientRates, open])

  useEffect(() => {
    if (!open) return
    syncClientDraft(clientId, clientRates)
  }, [clientId, clientRates, open, syncClientDraft])

  function selectClient(nextClientId: string) {
    setClientId(nextClientId)
    syncClientDraft(nextClientId, clientRates)
  }

  async function saveClientRate() {
    if (!clientId) {
      gooeyToast.error('Select a client')
      return
    }
    if (parsedClientRate === null || clientRateInvalid) {
      gooeyToast.error('Enter a valid client rate', {
        description: 'Use a positive number before saving an override.',
      })
      return
    }
    setPending(true)
    try {
      await setMemberClientBillableRateFn({
        data: {
          memberId: member.id,
          clientId,
          billableRate: parsedClientRate,
          effectiveFrom: todayKey(timezone),
        },
      })
      setClientRates((current) => ({
        ...current,
        [clientId]: parsedClientRate,
      }))
      void router.invalidate()
      gooeyToast.success('Client rate updated')
    } catch (err) {
      gooeyToast.error('Could not update client rate', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  async function clearClientRate() {
    if (!clientId) return
    setPending(true)
    try {
      await unsetMemberClientBillableRateFn({
        data: {
          memberId: member.id,
          clientId,
          effectiveFrom: todayKey(timezone),
        },
      })
      setClientRate('')
      setClientRates((current) => {
        const next = { ...current }
        delete next[clientId]
        return next
      })
      void router.invalidate()
      gooeyToast.success('Client rate cleared')
    } catch (err) {
      gooeyToast.error('Could not clear client rate', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-visible sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Client billing rates for {member.name}</DialogTitle>
          <DialogDescription>
            Manage the client-specific hourly rates for this member.
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[calc(100dvh-12rem)] gap-4 overflow-y-auto pr-1 lg:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.2fr)]">
          <section className="rounded-lg border border-border">
            <div className="border-b border-border px-4 py-3">
              <h3 className="m-0 text-sm font-bold text-foreground">
                Saved client rates
              </h3>
              <p className="m-0 mt-1 text-xs text-muted-foreground">
                {savedClientRates.length} configured
              </p>
            </div>
            <div className="max-h-[22rem] overflow-y-auto p-2">
              {savedClientRates.length === 0 ? (
                <p className="m-0 px-2 py-6 text-sm text-muted-foreground">
                  No client-specific rates yet.
                </p>
              ) : (
                <div className="grid gap-1.5">
                  {savedClientRates.map((rate) => (
                    <button
                      key={rate.clientId}
                      type="button"
                      onClick={() => selectClient(rate.clientId)}
                      className={`rounded-md border px-3 py-2 text-left transition-colors ${
                        rate.clientId === clientId
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-muted'
                      }`}
                    >
                      <span className="block truncate text-sm font-semibold text-foreground">
                        {rate.clientName}
                      </span>
                      <span className="mt-1 block text-sm tabular-nums text-muted-foreground">
                        {formatCurrency(
                          rate.billableRate,
                          state.workspace.billableCurrency,
                        )}
                        /hr
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-border p-4">
            <h3 className="m-0 text-sm font-bold text-foreground">
              Add or edit rate
            </h3>
            <div className="grid gap-3">
              <label className="mt-3 space-y-1.5 text-xs font-semibold text-foreground">
                <span>Client</span>
                <Combobox
                  options={clientOptions}
                  value={clientId}
                  onValueChange={selectClient}
                  placeholder="Select client"
                  searchPlaceholder="Search clients..."
                  emptyText="No clients found."
                  disabled={activeClients.length === 0}
                  contentClassName="z-[60]"
                />
              </label>
              <label className="space-y-1.5 text-xs font-semibold text-foreground">
                <span>Client hourly rate</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={clientRate}
                  onChange={(event) => setClientRate(event.target.value)}
                  placeholder="Uses member/workspace fallback"
                  aria-invalid={clientRateInvalid}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={pending || !clientId || clientRateInvalid}
                  onClick={() => void saveClientRate()}
                >
                  Save client rate
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    pending || !clientId || clientRates[clientId] == null
                  }
                  onClick={() => void clearClientRate()}
                >
                  Use fallback
                </Button>
              </div>
            </div>
            <p className="m-0 mt-3 text-sm text-muted-foreground">
              Effective rate preview:{' '}
              <span className="font-semibold text-foreground">
                {formatCurrency(previewRate, state.workspace.billableCurrency)}
                /hr
              </span>
            </p>
          </section>
        </div>

        <DialogFooter showCloseButton />
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
        <TableCell className="overflow-hidden px-5 py-4 align-top">
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
              {state.departments.map((d) => (
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
        <TableCell className="whitespace-nowrap px-5 py-4 align-top">
          <span
            className={`rounded-lg px-2 py-1 text-xs font-bold ${STATUS_STYLES[member.status] ?? 'bg-muted text-foreground'}`}
          >
            {member.status}
          </span>
        </TableCell>

        {canManage && (
          <>
            {/* Billable Rate */}
            <TableCell className="overflow-hidden px-5 py-4 align-top">
              <button
                type="button"
                onClick={() => !pending && setRateDialogOpen(true)}
                title="Click to edit billing rates"
                className="group flex w-full cursor-pointer items-start justify-end gap-1 rounded px-1 -mx-1 text-right hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block text-sm tabular-nums text-foreground">
                    {formatCurrency(
                      effectiveRate,
                      state.workspace.billableCurrency,
                    )}
                  </span>
                  <span
                    className={`mt-1 inline-flex max-w-full rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-none ${
                      memberClientRateCount > 0
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border bg-muted text-muted-foreground'
                    }`}
                  >
                    <span className="truncate">{rateStatusLabel}</span>
                  </span>
                </span>
                <Pencil className="mt-0.5 size-3 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
              </button>
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
                    className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
                    aria-label="Member actions"
                  >
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setShowAnalytics((v) => !v)}
                    >
                      <BarChart2 className="mr-2 size-4" />
                      {showAnalytics ? 'Hide analytics' : 'View analytics'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setExportDialogOpen(true)}>
                      <FileText className="mr-2 size-4" />
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
                              <CheckCircle className="mr-2 size-4" />
                              Enable member
                            </>
                          ) : (
                            <>
                              <UserX className="mr-2 size-4" />
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
