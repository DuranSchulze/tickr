import { db } from '#/db'
import { auditLogs } from '#/db/schema'
import { and, eq, gte, lte, ilike, desc, count } from 'drizzle-orm'

export type AuditAction =
  // Members
  | 'MEMBER_INVITE'
  | 'MEMBER_INVITE_RESEND'
  | 'MEMBER_INVITE_REVOKE'
  | 'MEMBER_INVITE_ACCEPT'
  | 'MEMBER_ROLE_CHANGE'
  | 'MEMBER_STATUS_CHANGE'
  | 'MEMBER_DEPT_CHANGE'
  // Time entries (admin-visible data mutations)
  | 'ENTRY_CREATE'
  | 'ENTRY_EDIT'
  | 'ENTRY_DELETE'
  // Catalogs
  | 'CLIENT_CREATE'
  | 'CLIENT_EDIT'
  | 'CLIENT_ARCHIVE'
  | 'CLIENT_ACTIVATE'
  | 'PROJECT_CREATE'
  | 'PROJECT_EDIT'
  | 'PROJECT_ARCHIVE'
  | 'PROJECT_ACTIVATE'
  | 'TAG_CREATE'
  | 'TAG_EDIT'
  | 'TAG_ARCHIVE'
  | 'TAG_ACTIVATE'
  | 'DEPT_CREATE'
  | 'DEPT_EDIT'
  | 'DEPT_DELETE'
  | 'ROLE_CREATE'
  | 'COHORT_CREATE'
  | 'COHORT_EDIT'
  | 'COHORT_DELETE'
  // Workspace & settings
  | 'WORKSPACE_UPDATE'
  | 'GSHEET_URL_UPDATE'
  | 'GSHEET_SYNC'
  | 'GSHEET_AUTO_SYNC'
  | 'GSHEET_IMPORT'
  // Exports
  | 'EXPORT_MEMBERS'
  | 'EXPORT_ANALYTICS'

export interface CreateAuditLogInput {
  workspaceId: string
  actorId?: string | null
  actorEmail?: string | null
  action: AuditAction
  targetType?: string | null
  targetId?: string | null
  details?: string | null
}

export async function createAuditLog(
  input: CreateAuditLogInput,
): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      actorEmail: input.actorEmail ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      details: input.details ?? null,
    })
  } catch {
    // Audit log failures must never break the main operation
  }
}

export type AuditLogFilters = {
  workspaceId: string
  action?: string
  actorEmail?: string
  startDate?: Date
  endDate?: Date
  page?: number
  pageSize?: number
}

export type AuditLogEntry = {
  id: string
  actorId: string | null
  actorEmail: string | null
  action: string
  targetType: string | null
  targetId: string | null
  details: string | null
  createdAt: Date
}

export type GetAuditLogsResult = {
  logs: AuditLogEntry[]
  totalCount: number
  totalPages: number
}

export type AuditLogQuery = {
  action?: string
  actorEmail?: string
  fromDate?: string
  toDate?: string
  page?: number
}

export async function getWorkspaceAuditLogs(
  query: AuditLogQuery,
): Promise<GetAuditLogsResult> {
  const { requireWorkspaceAccess } =
    await import('../../workspace-access.server')
  const { assertOwnerOrAdmin } = await import('../shared/role-gates.server')
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const endDate = query.toDate
    ? new Date(new Date(query.toDate).getTime() + 86_400_000 - 1)
    : undefined

  return getAuditLogs({
    workspaceId: access.workspace.id,
    action: query.action,
    actorEmail: query.actorEmail,
    startDate: query.fromDate ? new Date(query.fromDate) : undefined,
    endDate,
    page: query.page,
  })
}

export async function getAuditLogs(
  filters: AuditLogFilters,
): Promise<GetAuditLogsResult> {
  const {
    workspaceId,
    action,
    actorEmail,
    startDate,
    endDate,
    page = 0,
    pageSize = 25,
  } = filters

  const conditions = [eq(auditLogs.workspaceId, workspaceId)]
  if (action) conditions.push(eq(auditLogs.action, action))
  if (actorEmail)
    conditions.push(ilike(auditLogs.actorEmail, `%${actorEmail}%`))
  if (startDate) conditions.push(gte(auditLogs.createdAt, startDate))
  if (endDate) conditions.push(lte(auditLogs.createdAt, endDate))

  const where = and(...conditions)

  const [logs, [countRow]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        actorId: auditLogs.actorId,
        actorEmail: auditLogs.actorEmail,
        action: auditLogs.action,
        targetType: auditLogs.targetType,
        targetId: auditLogs.targetId,
        details: auditLogs.details,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset(page * pageSize),
    db.select({ count: count() }).from(auditLogs).where(where),
  ])

  const totalCount = Number(countRow?.count ?? 0)

  return {
    logs,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
  }
}
