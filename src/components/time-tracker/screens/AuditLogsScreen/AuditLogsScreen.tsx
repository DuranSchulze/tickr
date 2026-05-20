import { useNavigate } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
import type { GetAuditLogsResult } from '#/lib/server/tracker/audit/audit-logger.server'
import { Page } from '../shared/Page'
import { AuditLogsFilterBar } from './AuditLogsFilterBar'
import type { AuditLogsFilters } from './AuditLogsFilterBar'

// ─── Action metadata ──────────────────────────────────────────────────────────

type ActionMeta = { label: string; color: string }

const ACTION_META: Record<string, ActionMeta> = {
  // Members
  MEMBER_INVITE: {
    label: 'Member invited',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  MEMBER_INVITE_RESEND: {
    label: 'Invite resent',
    color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  MEMBER_INVITE_REVOKE: {
    label: 'Invite revoked',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400',
  },
  MEMBER_INVITE_ACCEPT: {
    label: 'Invite accepted',
    color: 'bg-green-500/10 text-green-600 dark:text-green-400',
  },
  MEMBER_ROLE_CHANGE: {
    label: 'Role changed',
    color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  MEMBER_DEPT_CHANGE: {
    label: 'Dept. changed',
    color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  MEMBER_STATUS_CHANGE: {
    label: 'Status changed',
    color: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  },
  // Catalogs — clients
  CLIENT_CREATE: {
    label: 'Client added',
    color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  CLIENT_EDIT: {
    label: 'Client edited',
    color: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  },
  CLIENT_ARCHIVE: {
    label: 'Client archived',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400',
  },
  // Catalogs — projects
  PROJECT_CREATE: {
    label: 'Project added',
    color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  },
  PROJECT_EDIT: {
    label: 'Project edited',
    color: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400',
  },
  PROJECT_ARCHIVE: {
    label: 'Project archived',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400',
  },
  // Catalogs — tags
  TAG_CREATE: {
    label: 'Tag added',
    color: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  },
  TAG_EDIT: {
    label: 'Tag edited',
    color: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  },
  TAG_ARCHIVE: {
    label: 'Tag archived',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400',
  },
  // Catalogs — departments
  DEPT_CREATE: {
    label: 'Dept. added',
    color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  },
  DEPT_EDIT: {
    label: 'Dept. edited',
    color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  },
  DEPT_DELETE: {
    label: 'Dept. deleted',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400',
  },
  // Catalogs — roles & cohorts
  ROLE_CREATE: {
    label: 'Role created',
    color: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  },
  COHORT_CREATE: {
    label: 'Cohort added',
    color: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400',
  },
  COHORT_EDIT: {
    label: 'Cohort edited',
    color: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400',
  },
  COHORT_DELETE: {
    label: 'Cohort deleted',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400',
  },
  // Time entries
  ENTRY_CREATE: {
    label: 'Entry created',
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  ENTRY_EDIT: {
    label: 'Entry edited',
    color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  ENTRY_DELETE: {
    label: 'Entry deleted',
    color: 'bg-red-500/10 text-red-600 dark:text-red-400',
  },
  // Workspace & Sheets
  WORKSPACE_UPDATE: {
    label: 'Workspace updated',
    color: 'bg-gray-500/10 text-gray-600 dark:text-gray-400',
  },
  GSHEET_URL_UPDATE: {
    label: 'Sheet URL changed',
    color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  },
  GSHEET_SYNC: {
    label: 'Sheet synced',
    color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  },
  GSHEET_IMPORT: {
    label: 'Catalogs imported',
    color: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
  },
  // Exports
  EXPORT_MEMBERS: {
    label: 'Members exported',
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
  EXPORT_ANALYTICS: {
    label: 'Analytics exported',
    color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  },
}

const TARGET_LABELS: Record<string, string> = {
  workspace: 'Workspace',
  member: 'Member',
  invite: 'Invite',
  time_entry: 'Time entry',
  client: 'Client',
  project: 'Project',
  tag: 'Tag',
  department: 'Department',
  role: 'Role',
  cohort: 'Cohort',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(value: Date | string): string {
  const ms = Date.now() - new Date(value).getTime()
  const s = Math.floor(ms / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function absoluteTime(value: Date | string): string {
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? {
    label: action.replace(/_/g, ' '),
    color: 'bg-muted text-muted-foreground',
  }
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${meta.color}`}
    >
      {meta.label}
    </span>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function AuditLogsScreen({
  result,
  filters,
}: {
  result: GetAuditLogsResult
  filters: AuditLogsFilters & { page?: number }
}) {
  const navigate = useNavigate()
  const currentPage = filters.page ?? 0
  const hasFilters = !!(
    filters.action ||
    filters.actorEmail ||
    filters.fromDate ||
    filters.toDate
  )

  function applyFilters(next: AuditLogsFilters) {
    void navigate({
      to: '/app/audit-logs',
      search: { ...next, page: undefined },
    })
  }

  function goToPage(page: number) {
    void navigate({
      to: '/app/audit-logs',
      search: { ...filters, page: page === 0 ? undefined : page },
    })
  }

  return (
    <Page title="Audit Log" eyebrow="Owner / Admin">
      <div className="flex flex-col gap-5">
        {/* Stats strip */}
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card px-5 py-3 text-sm">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">
              {result.totalCount}
            </span>
            <span className="text-muted-foreground">
              {hasFilters ? 'matching events' : 'total events'}
            </span>
          </div>
          {result.totalPages > 1 && (
            <span className="text-muted-foreground">
              Page {currentPage + 1} of {result.totalPages}
            </span>
          )}
        </div>

        <AuditLogsFilterBar filters={filters} onChange={applyFilters} />

        {/* Table */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/60 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 whitespace-nowrap">Time</th>
                <th className="px-4 py-3 whitespace-nowrap">Event</th>
                <th className="px-4 py-3 whitespace-nowrap">Who</th>
                <th className="px-4 py-3 whitespace-nowrap">Target</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {result.logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ClipboardList className="h-8 w-8 opacity-30" />
                      <p className="font-medium">No events found</p>
                      {hasFilters && (
                        <p className="text-xs">
                          Try adjusting or clearing the filters above.
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                result.logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    {/* Time */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className="cursor-default text-xs font-medium text-foreground"
                        title={absoluteTime(log.createdAt)}
                      >
                        {relativeTime(log.createdAt)}
                      </span>
                      <p className="text-[11px] text-muted-foreground">
                        {absoluteTime(log.createdAt)}
                      </p>
                    </td>

                    {/* Event */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ActionBadge action={log.action} />
                    </td>

                    {/* Who */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {log.actorEmail ? (
                        <span className="font-medium text-foreground">
                          {log.actorEmail}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">System</span>
                      )}
                    </td>

                    {/* Target */}
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-muted-foreground">
                      {log.targetType ? (
                        <span className="inline-flex items-center gap-1">
                          <span className="text-xs font-medium text-foreground">
                            {TARGET_LABELS[log.targetType] ?? log.targetType}
                          </span>
                          {log.targetId && (
                            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {log.targetId.slice(-6)}
                            </code>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Details */}
                    <td
                      className="max-w-[260px] truncate px-4 py-3 text-muted-foreground"
                      title={log.details ?? undefined}
                    >
                      {log.details ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {result.totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Showing {currentPage * 25 + 1}–
              {Math.min((currentPage + 1) * 25, result.totalCount)} of{' '}
              {result.totalCount} events
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => goToPage(0)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                First
              </button>
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => goToPage(currentPage - 1)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-3 text-sm font-medium text-foreground">
                {currentPage + 1} / {result.totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= result.totalPages - 1}
                onClick={() => goToPage(currentPage + 1)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
              <button
                type="button"
                disabled={currentPage >= result.totalPages - 1}
                onClick={() => goToPage(result.totalPages - 1)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                Last
              </button>
            </div>
          </div>
        )}
      </div>
    </Page>
  )
}
