import { db } from '#/db'
import {
  workspaces,
  workspaceMembers,
  projects,
  tags,
  timeEntries,
  timeEntryTags,
  users,
  departments,
} from '#/db/schema'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { createAuditLog } from '../tracker/audit/audit-logger.server'
import type { AuditAction } from '../tracker/audit/audit-logger.server'
import { extractSheetId } from './extract-sheet-id'
import { getSheetsClient } from './auth.server'
import { buildSyncRows, SHEET_HEADERS } from './build-rows'
import type { SyncEntry, SyncMember } from './build-rows'
import { sanitizeTabName } from './sanitize-tab-name'

const ALLOWED_ROLES = new Set(['OWNER', 'ADMIN', 'MANAGER'])

function mapApiError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  if (/permission|forbidden|403/i.test(message)) {
    return new Error(
      'The service account does not have edit access to this sheet. Share the sheet with the service-account email as Editor.',
    )
  }
  if (/not found|404/i.test(message)) {
    return new Error(
      'Sheet not found. Check the URL and that the sheet is not in the trash.',
    )
  }
  if (/invalid_grant|JWT|key/i.test(message)) {
    return new Error(
      'Service-account credentials are invalid. Check GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON.',
    )
  }
  return new Error(`Google Sheets sync failed: ${message}`)
}

export interface SyncWorkspaceByIdParams {
  workspaceId: string
  syncedByName: string
  syncedByValue: string
  actorId?: string | null
  actorEmail?: string | null
  auditAction?: AuditAction
}

export async function syncWorkspaceById({
  workspaceId,
  syncedByName,
  syncedByValue,
  actorId,
  actorEmail,
  auditAction = 'GSHEET_SYNC',
}: SyncWorkspaceByIdParams) {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  })

  if (!workspace?.googleSheetUrl) {
    throw new Error(
      'No Google Sheet URL is set. Add one in workspace settings first.',
    )
  }

  const sheetId = extractSheetId(workspace.googleSheetUrl)

  const [memberRows, projectRows, tagRows, entryRows] = await Promise.all([
    db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspace.id)),
    db.select().from(projects).where(eq(projects.workspaceId, workspace.id)),
    db.select().from(tags).where(eq(tags.workspaceId, workspace.id)),
    db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspace.id),
          isNotNull(timeEntries.endedAt),
        ),
      )
      .orderBy(timeEntries.startedAt),
  ])

  const entryIds = entryRows.map((e) => e.id)
  const userIds = memberRows
    .map((m) => m.userId)
    .filter((id): id is string => id != null)

  const [usersData, departmentsData, entryTagsData] = await Promise.all([
    userIds.length > 0
      ? db.select().from(users).where(inArray(users.id, userIds))
      : Promise.resolve([]),
    db
      .select()
      .from(departments)
      .where(eq(departments.workspaceId, workspace.id)),
    entryIds.length > 0
      ? db
          .select()
          .from(timeEntryTags)
          .where(inArray(timeEntryTags.timeEntryId, entryIds))
      : Promise.resolve([]),
  ])

  const userMap = new Map(usersData.map((u) => [u.id, u]))
  const deptMap = new Map(departmentsData.map((d) => [d.id, d]))
  const tagsByEntry = new Map<string, string[]>()
  for (const et of entryTagsData) {
    const list = tagsByEntry.get(et.timeEntryId) ?? []
    list.push(et.tagId)
    tagsByEntry.set(et.timeEntryId, list)
  }

  const syncMembers: SyncMember[] = memberRows.map((m) => {
    const user = m.userId ? userMap.get(m.userId) : null
    const dept = m.departmentId ? deptMap.get(m.departmentId) : null
    return {
      id: m.id,
      name: user?.name ?? m.email,
      email: user?.email ?? m.email,
      departmentName: dept?.name ?? null,
      billableRate: m.billableRate == null ? null : Number(m.billableRate),
    }
  })

  const syncEntries: SyncEntry[] = entryRows.map((e) => ({
    id: e.id,
    description: e.description,
    notes: e.notes,
    startedAt: e.startedAt,
    endedAt: e.endedAt,
    durationSeconds: e.durationSeconds,
    billable: e.billable,
    projectId: e.projectId,
    tagIds: tagsByEntry.get(e.id) ?? [],
    workspaceMemberId: e.workspaceMemberId,
  }))

  const syncedAtIso = new Date().toISOString()
  const { departments: syncDepts, totalRowCount } = buildSyncRows({
    entries: syncEntries,
    members: syncMembers,
    projects: projectRows.map((p) => ({ id: p.id, name: p.name })),
    tags: tagRows.map((t) => ({ id: t.id, name: t.name })),
    workspace: {
      defaultBillableRate: Number(workspace.defaultBillableRate),
      billableCurrency: workspace.billableCurrency,
    },
    syncedAtIso,
    syncedByName,
  })

  const sheets = getSheetsClient()

  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
    const existingTabs = new Map<string, number>()
    for (const sheet of meta.data.sheets ?? []) {
      const title = sheet.properties?.title
      const id = sheet.properties?.sheetId
      if (title && typeof id === 'number') existingTabs.set(title, id)
    }

    const sanitizedDepartments = syncDepts.map((d) => ({
      ...d,
      tabName: sanitizeTabName(d.tabName),
    }))

    const tabsToAdd = sanitizedDepartments
      .map((d) => d.tabName)
      .filter((name) => !existingTabs.has(name))

    if (tabsToAdd.length > 0) {
      const addResp = await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: tabsToAdd.map((title) => ({
            addSheet: { properties: { title } },
          })),
        },
      })
      for (const reply of addResp.data.replies ?? []) {
        const props = reply.addSheet?.properties
        if (props?.title && typeof props.sheetId === 'number') {
          existingTabs.set(props.title, props.sheetId)
        }
      }
    }

    for (const dept of sanitizedDepartments) {
      const range = `${dept.tabName}!A1:Z`
      await sheets.spreadsheets.values.clear({ spreadsheetId: sheetId, range })
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${dept.tabName}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: dept.rows },
      })
    }

    const formatRequests = sanitizedDepartments.flatMap((dept) => {
      const sheetIdNum = existingTabs.get(dept.tabName)
      if (sheetIdNum == null) return []
      return [
        {
          updateSheetProperties: {
            properties: {
              sheetId: sheetIdNum,
              gridProperties: { frozenRowCount: 2 },
            },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        {
          repeatCell: {
            range: {
              sheetId: sheetIdNum,
              startRowIndex: 1,
              endRowIndex: 2,
              startColumnIndex: 0,
              endColumnIndex: SHEET_HEADERS.length,
            },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        },
        {
          autoResizeDimensions: {
            dimensions: {
              sheetId: sheetIdNum,
              dimension: 'COLUMNS',
              startIndex: 0,
              endIndex: SHEET_HEADERS.length,
            },
          },
        },
      ]
    })

    if (formatRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { requests: formatRequests },
      })
    }
  } catch (err) {
    throw mapApiError(err)
  }

  await db
    .update(workspaces)
    .set({
      googleSheetSyncedAt: new Date(syncedAtIso),
      googleSheetSyncedBy: syncedByValue,
    })
    .where(eq(workspaces.id, workspace.id))

  void createAuditLog({
    workspaceId: workspace.id,
    actorId: actorId ?? null,
    actorEmail: actorEmail ?? null,
    action: auditAction,
    targetType: 'workspace',
    targetId: workspace.id,
    details: `${syncDepts.length} dept(s), ${totalRowCount} row(s)`,
  })

  return {
    syncedAt: syncedAtIso,
    departmentCount: syncDepts.length,
    rowCount: totalRowCount,
  }
}

export async function syncWorkspaceToGoogleSheets() {
  const access = await requireWorkspaceAccess()
  const level = access.member.workspaceRole?.permissionLevel
  if (!level || !ALLOWED_ROLES.has(level)) {
    throw new Error(
      'Only Owners, Admins, and Managers can sync to Google Sheets.',
    )
  }

  return syncWorkspaceById({
    workspaceId: access.workspace.id,
    syncedByName: access.user.name,
    syncedByValue: access.member.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    auditAction: 'GSHEET_SYNC',
  })
}
