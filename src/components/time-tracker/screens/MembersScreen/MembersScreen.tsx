import { useMemo, useState } from 'react'
import { UserPlus, X } from 'lucide-react'
import type { Member, TrackerState } from '#/lib/time-tracker/types'
import { exportMembersCsvFn } from '#/lib/server/tracker'
import {
  ExportMenu,
  downloadCsv,
} from '#/components/time-tracker/shared/ExportMenu'
import { InviteMemberForm } from '../../InviteMemberForm'
import { MembersTable } from '../../MembersTable'
import type { MemberStat } from '../../MembersTable'
import { PendingInvitesPanel } from '../../PendingInvitesPanel'
import { WorkspaceBillingPanel } from '../../WorkspaceBillingPanel'
import {
  getWorkspaceMembersSummary,
  WorkspaceMembersSummary,
} from '../../WorkspaceMembersSummary'
import { Page } from '../shared/Page'
import { MembersFilterBar } from './MembersFilterBar'

interface MembersScreenProps {
  state: TrackerState
  memberStats?: MemberStat[]
  members: Member[]
  totalCount: number
  totalPages: number
  page: number
  pageSize: number
  search: string
  roleFilter: string
  deptFilter: string
  cohortFilter: string
  statusFilter: string
  onFilterChange: (updates: Record<string, string | undefined>) => void
  onPageChange: (page: number) => void
}

export function MembersScreen({
  state,
  memberStats = [],
  members,
  totalCount,
  totalPages,
  page,
  pageSize,
  search,
  roleFilter,
  deptFilter,
  cohortFilter,
  statusFilter,
  onFilterChange,
  onPageChange,
}: MembersScreenProps) {
  const currentMember = state.members.find(
    (m) => m.id === state.currentMemberId,
  )!
  const canManage =
    currentMember.permissionLevel === 'OWNER' ||
    currentMember.permissionLevel === 'ADMIN'
  const canView = canManage || currentMember.permissionLevel === 'MANAGER'

  const [showForm, setShowForm] = useState(false)

  const statsMap = useMemo(() => {
    const map = new Map<string, MemberStat>()
    for (const s of memberStats) map.set(s.memberId, s)
    return map
  }, [memberStats])

  const workspaceSummary = useMemo(
    () => (canManage ? getWorkspaceMembersSummary(memberStats) : null),
    [memberStats, canManage],
  )

  const cohortFilterOptions = state.cohorts.filter(
    (c) => !deptFilter || c.departmentId === deptFilter,
  )

  const hasActiveFilters = Boolean(
    search || roleFilter || deptFilter || cohortFilter || statusFilter,
  )

  return (
    <Page
      title="Workspace members"
      eyebrow={canManage ? 'Owner/Admin' : 'Manager — read only'}
    >
      {canManage && workspaceSummary && (
        <WorkspaceMembersSummary summary={workspaceSummary} />
      )}

      {canManage && <WorkspaceBillingPanel workspace={state.workspace} />}

      {canManage && <PendingInvitesPanel />}

      <section className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <h2 className="m-0 text-lg font-bold text-foreground">
              Managed user list
            </h2>
            <p className="m-0 mt-1 text-sm text-muted-foreground">
              Employees join this private workspace when their account email
              matches this list.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ExportMenu
              onExportCsv={async () => {
                const csv = await exportMembersCsvFn()
                downloadCsv(
                  csv,
                  `members-${new Date().toISOString().slice(0, 10)}.csv`,
                )
              }}
            />
            {canManage && (
              <button
                type="button"
                onClick={() => setShowForm((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110"
              >
                {showForm ? (
                  <X className="h-4 w-4" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                {showForm ? 'Cancel' : 'Invite member'}
              </button>
            )}
          </div>
        </div>

        {showForm && (
          <InviteMemberForm
            roles={state.roles}
            departments={state.departments}
            onInvited={() => setShowForm(false)}
          />
        )}

        <MembersFilterBar
          state={state}
          search={search}
          onSearchChange={(v) => onFilterChange({ search: v || undefined })}
          filterRole={roleFilter}
          onFilterRoleChange={(v) => onFilterChange({ role: v || undefined })}
          filterDept={deptFilter}
          onFilterDeptChange={(v) => {
            const updates: Record<string, string | undefined> = {
              dept: v || undefined,
            }
            if (cohortFilter) {
              const cohort = state.cohorts.find((c) => c.id === cohortFilter)
              if (cohort && cohort.departmentId !== v) {
                updates.cohort = undefined
              }
            }
            onFilterChange(updates)
          }}
          filterCohort={cohortFilter}
          onFilterCohortChange={(v) =>
            onFilterChange({ cohort: v || undefined })
          }
          filterStatus={statusFilter}
          onFilterStatusChange={(v) =>
            onFilterChange({ status: v || undefined })
          }
          cohortFilterOptions={cohortFilterOptions}
          hasActiveFilters={hasActiveFilters}
          onClear={() =>
            onFilterChange({
              search: undefined,
              role: undefined,
              dept: undefined,
              cohort: undefined,
              status: undefined,
            })
          }
        />

        <MembersTable
          members={members}
          state={state}
          canManage={canManage}
          canView={canView}
          statsMap={statsMap}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      </section>
    </Page>
  )
}
