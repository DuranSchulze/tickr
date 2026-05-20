import { db } from '#/db'
import { clients, projects, tags, workspaces } from '#/db/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { assertAtLeastManager } from '../tracker/shared/role-gates.server'
import { createAuditLog } from '../tracker/audit/audit-logger.server'
import { getSheetsClient } from './auth.server'
import { extractSheetId } from './extract-sheet-id'
import {
  CATALOG_TAB_CLIENTS,
  CATALOG_TAB_PROJECTS,
  CATALOG_TAB_TAGS,
  CLIENTS_HEADERS,
  PROJECTS_HEADERS,
  TAGS_HEADERS,
  buildClientRow,
  buildProjectRow,
  buildTagRow,
  parseClientRows,
  parseProjectRows,
  parseTagRows,
} from './catalog-tabs'

type SheetsClient = Awaited<ReturnType<typeof getSheetsClient>>

export async function ensureCatalogTabs(
  sheets: SheetsClient,
  sheetId: string,
): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
  const existing = new Set(
    (meta.data.sheets ?? []).map((s) => s.properties?.title ?? ''),
  )

  const toCreate = [
    CATALOG_TAB_CLIENTS,
    CATALOG_TAB_PROJECTS,
    CATALOG_TAB_TAGS,
  ].filter((title) => !existing.has(title))

  if (toCreate.length === 0) return

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      requests: toCreate.map((title) => ({
        addSheet: { properties: { title } },
      })),
    },
  })
}

export async function ensureAllCatalogHeaders(
  sheets: SheetsClient,
  sheetId: string,
): Promise<void> {
  const configs = [
    { tab: CATALOG_TAB_CLIENTS, headers: CLIENTS_HEADERS },
    { tab: CATALOG_TAB_PROJECTS, headers: PROJECTS_HEADERS },
    { tab: CATALOG_TAB_TAGS, headers: TAGS_HEADERS },
  ]

  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId })
  const numericIdByTitle = new Map(
    (meta.data.sheets ?? []).map((s) => [
      s.properties?.title ?? '',
      s.properties?.sheetId ?? 0,
    ]),
  )

  for (const { tab, headers } of configs) {
    const numericSheetId = numericIdByTitle.get(tab)
    if (numericSheetId == null) continue

    try {
      const lastCol = String.fromCharCode(
        'A'.charCodeAt(0) + headers.length - 1,
      )
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: `${tab}!A1:${lastCol}1`,
      })
      const existing = res.data.values?.[0] ?? []
      const needsWrite = headers.some((h, i) => existing[i]?.trim() !== h)

      if (!needsWrite) continue

      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `${tab}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers as unknown as string[]] },
      })

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          requests: [
            {
              updateSheetProperties: {
                properties: {
                  sheetId: numericSheetId,
                  gridProperties: { frozenRowCount: 1 },
                },
                fields: 'gridProperties.frozenRowCount',
              },
            },
            {
              repeatCell: {
                range: {
                  sheetId: numericSheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: headers.length,
                },
                cell: { userEnteredFormat: { textFormat: { bold: true } } },
                fields: 'userEnteredFormat.textFormat.bold',
              },
            },
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: numericSheetId,
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: headers.length,
                },
              },
            },
          ],
        },
      })
    } catch {
      // Tab may not exist yet or sheet permissions error — skip silently
    }
  }
}

export async function ensureCatalogTabsForWorkspace(): Promise<void> {
  const access = await requireWorkspaceAccess()
  if (!access.workspace.googleSheetUrl) return
  try {
    const sheetId = extractSheetId(access.workspace.googleSheetUrl)
    const sheets = await getSheetsClient()
    await ensureCatalogTabs(sheets, sheetId)
    await ensureAllCatalogHeaders(sheets, sheetId)
  } catch {
    // Silent — don't surface sheet errors on a background page-load call
  }
}

export type ImportStepResult = {
  count: number
  warnings: string[]
}

function friendlyDbError(err: unknown, entity: string): Error {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('unique') || msg.includes('duplicate')) {
    return new Error(
      `Duplicate ${entity} names detected in your sheet. ` +
        `Remove duplicate rows (same name, different rows) and try again.`,
    )
  }
  if (msg.includes('foreign key') || msg.includes('violates')) {
    return new Error(
      `A ${entity} row references a record that does not exist. Check related columns and try again.`,
    )
  }
  return new Error(`${entity} import error: ${msg}`)
}

// Run DB operations in parallel batches to avoid overwhelming the connection pool
async function runInBatches<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  batchSize = 25,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn))
  }
}

async function resolveWorkspaceSheet() {
  const access = await requireWorkspaceAccess()
  assertAtLeastManager(access)
  const workspace = access.workspace
  if (!workspace.googleSheetUrl) {
    throw new Error(
      'No Google Sheet URL is set. Add one in workspace settings first.',
    )
  }
  const sheetId = extractSheetId(workspace.googleSheetUrl)
  const sheets = getSheetsClient()
  return { access, workspace, sheetId, sheets }
}

// ── Step 1: Clients ───────────────────────────────────────────────────────────

export async function importClientsFromSheet(): Promise<ImportStepResult> {
  const { workspace, sheetId, sheets } = await resolveWorkspaceSheet()

  await ensureCatalogTabs(sheets, sheetId)
  await ensureAllCatalogHeaders(sheets, sheetId)

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${CATALOG_TAB_CLIENTS}!A2:C`,
  })
  const parsed = parseClientRows(res.data.values ?? [])
  if (parsed.length === 0) return { count: 0, warnings: [] }

  const knownIds = parsed.map((c) => c.id).filter((id): id is string => !!id)
  const [byId, all] = await Promise.all([
    knownIds.length > 0
      ? db
          .select()
          .from(clients)
          .where(
            and(
              inArray(clients.id, knownIds),
              eq(clients.workspaceId, workspace.id),
            ),
          )
      : Promise.resolve([]),
    db.select().from(clients).where(eq(clients.workspaceId, workspace.id)),
  ])
  const byIdMap = new Map(byId.map((c) => [c.id, c]))
  const byNameMap = new Map(all.map((c) => [c.name.toLowerCase(), c]))

  type ToUpdate = {
    id: string
    name: string
    clientStatus: 'ACTIVE' | 'INACTIVE'
  }
  type ToInsert = {
    workspaceId: string
    name: string
    clientStatus: 'ACTIVE' | 'INACTIVE'
    sheetRow: number
  }
  type WritebackEntry = { row: number; id: string }

  const toUpdate: ToUpdate[] = []
  const toInsert: ToInsert[] = []
  const resolvedIds = new Map<number, string>() // sheetRow → resultId

  for (const c of parsed) {
    const { sheetRow } = c
    const existing =
      (c.id ? byIdMap.get(c.id) : null) ??
      byNameMap.get(c.name.toLowerCase()) ??
      null
    if (existing) {
      toUpdate.push({
        id: existing.id,
        name: c.name,
        clientStatus: c.clientStatus,
      })
      resolvedIds.set(sheetRow, existing.id)
    } else {
      toInsert.push({
        workspaceId: workspace.id,
        name: c.name,
        clientStatus: c.clientStatus,
        sheetRow,
      })
    }
  }

  // Parallel bulk updates
  await runInBatches(toUpdate, ({ id, name, clientStatus }) =>
    db
      .update(clients)
      .set({ name, clientStatus })
      .where(eq(clients.id, id))
      .then(() => undefined),
  )

  // Single bulk insert — deduplicate by name first, upsert to survive race conditions
  if (toInsert.length > 0) {
    const deduped = [
      ...new Map(toInsert.map((r) => [r.name.toLowerCase(), r])).values(),
    ]
    let created: { id: string; name: string }[]
    try {
      created = await db
        .insert(clients)
        .values(
          deduped.map(({ workspaceId, name, clientStatus }) => ({
            workspaceId,
            name,
            clientStatus,
          })),
        )
        .onConflictDoUpdate({
          target: [clients.workspaceId, clients.name],
          set: { clientStatus: sql`excluded.client_status` },
        })
        .returning({ id: clients.id, name: clients.name })
    } catch (err) {
      throw friendlyDbError(err, 'client')
    }
    const createdByName = new Map(
      created.map((c) => [c.name.toLowerCase(), c.id]),
    )
    for (const row of toInsert) {
      const newId = createdByName.get(row.name.toLowerCase())
      if (newId) resolvedIds.set(row.sheetRow, newId)
    }
  }

  // Collect write-backs for rows where the ID in the sheet was missing/wrong
  const writebacks: WritebackEntry[] = []
  for (const c of parsed) {
    const resultId = resolvedIds.get(c.sheetRow)
    if (resultId && c.id !== resultId) {
      writebacks.push({ row: c.sheetRow, id: resultId })
    }
  }

  if (writebacks.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: writebacks.map(({ row, id }) => ({
          range: `${CATALOG_TAB_CLIENTS}!C${row}`,
          values: [[id]],
        })),
      },
    })
  }

  return { count: parsed.length, warnings: [] }
}

// ── Step 2: Projects ──────────────────────────────────────────────────────────

export async function importProjectsFromSheet(): Promise<ImportStepResult> {
  const { workspace, sheetId, sheets } = await resolveWorkspaceSheet()

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${CATALOG_TAB_PROJECTS}!A2:E`,
  })
  const parsed = parseProjectRows(res.data.values ?? [])
  if (parsed.length === 0) return { count: 0, warnings: [] }

  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.workspaceId, workspace.id))
  const clientNameToId = new Map(
    allClients.map((c) => [c.name.toLowerCase(), c.id]),
  )

  const knownIds = parsed.map((p) => p.id).filter((id): id is string => !!id)
  const [byId, all] = await Promise.all([
    knownIds.length > 0
      ? db
          .select()
          .from(projects)
          .where(
            and(
              inArray(projects.id, knownIds),
              eq(projects.workspaceId, workspace.id),
            ),
          )
      : Promise.resolve([]),
    db.select().from(projects).where(eq(projects.workspaceId, workspace.id)),
  ])
  const byIdMap = new Map(byId.map((p) => [p.id, p]))
  const byNameMap = new Map(all.map((p) => [p.name.toLowerCase(), p]))

  const warnings: string[] = []
  type ToUpdate = {
    id: string
    name: string
    color: string
    archived: boolean
    clientId: string
  }
  type ToInsert = {
    workspaceId: string
    name: string
    color: string
    archived: boolean
    clientId: string
    sheetRow: number
  }
  const toUpdate: ToUpdate[] = []
  const toInsert: ToInsert[] = []
  const resolvedIds = new Map<number, string>()

  for (const p of parsed) {
    const { sheetRow } = p

    // Check existence FIRST so that existing records can be updated even if the
    // client name in the sheet doesn't match exactly (we fall back to the stored
    // clientId in that case). The clientId check is only a hard requirement for
    // new inserts because the column is NOT NULL.
    const existing =
      (p.id ? byIdMap.get(p.id) : null) ??
      byNameMap.get(p.name.toLowerCase()) ??
      null

    const clientId = clientNameToId.get(p.clientName.toLowerCase())

    if (existing) {
      toUpdate.push({
        id: existing.id,
        name: p.name,
        color: p.color,
        archived: p.archived,
        clientId: clientId ?? existing.clientId,
      })
      resolvedIds.set(sheetRow, existing.id)
    } else {
      if (!clientId) {
        warnings.push(
          `Project "${p.name}" skipped — client "${p.clientName}" not found.`,
        )
        continue
      }
      toInsert.push({
        workspaceId: workspace.id,
        name: p.name,
        color: p.color,
        archived: p.archived,
        clientId,
        sheetRow,
      })
    }
  }

  await runInBatches(toUpdate, ({ id, name, color, archived }) =>
    db
      .update(projects)
      .set({ name, color, archived })
      .where(eq(projects.id, id))
      .then(() => undefined),
  )

  if (toInsert.length > 0) {
    // Deduplicate by (name, clientId) combo — same name under different clients is allowed
    const dedupKey = (r: (typeof toInsert)[number]) =>
      `${r.name.toLowerCase()}::${r.clientId}`
    const deduped = [...new Map(toInsert.map((r) => [dedupKey(r), r])).values()]
    let created: { id: string; name: string; clientId: string }[]
    try {
      created = await db
        .insert(projects)
        .values(
          deduped.map(({ workspaceId, name, color, archived, clientId }) => ({
            workspaceId,
            name,
            color,
            archived,
            clientId,
          })),
        )
        .onConflictDoUpdate({
          target: [projects.workspaceId, projects.clientId, projects.name],
          set: {
            color: sql`excluded.color`,
            archived: sql`excluded.archived`,
          },
        })
        .returning({
          id: projects.id,
          name: projects.name,
          clientId: projects.clientId,
        })
    } catch (err) {
      throw friendlyDbError(err, 'project')
    }
    const createdByKey = new Map(
      created.map((p) => [`${p.name.toLowerCase()}::${p.clientId}`, p.id]),
    )
    for (const row of toInsert) {
      const newId = createdByKey.get(dedupKey(row))
      if (newId) resolvedIds.set(row.sheetRow, newId)
    }
  }

  const writebacks: Array<{ row: number; id: string }> = []
  for (const p of parsed) {
    const resultId = resolvedIds.get(p.sheetRow)
    if (resultId && p.id !== resultId) {
      writebacks.push({ row: p.sheetRow, id: resultId })
    }
  }
  if (writebacks.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: writebacks.map(({ row, id }) => ({
          range: `${CATALOG_TAB_PROJECTS}!E${row}`,
          values: [[id]],
        })),
      },
    })
  }

  return { count: parsed.length - warnings.length, warnings }
}

// ── Step 3: Tags ──────────────────────────────────────────────────────────────

export async function importTagsFromSheet(): Promise<ImportStepResult> {
  const { access, workspace, sheetId, sheets } = await resolveWorkspaceSheet()

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${CATALOG_TAB_TAGS}!A2:D`,
  })
  const parsed = parseTagRows(res.data.values ?? [])
  if (parsed.length === 0) return { count: 0, warnings: [] }

  const knownIds = parsed.map((t) => t.id).filter((id): id is string => !!id)
  const [byId, all] = await Promise.all([
    knownIds.length > 0
      ? db
          .select()
          .from(tags)
          .where(
            and(inArray(tags.id, knownIds), eq(tags.workspaceId, workspace.id)),
          )
      : Promise.resolve([]),
    db.select().from(tags).where(eq(tags.workspaceId, workspace.id)),
  ])
  const byIdMap = new Map(byId.map((t) => [t.id, t]))
  const byNameMap = new Map(all.map((t) => [t.name.toLowerCase(), t]))

  type ToUpdate = { id: string; name: string; color: string; archived: boolean }
  type ToInsert = {
    workspaceId: string
    name: string
    color: string
    archived: boolean
    sheetRow: number
  }
  const toUpdate: ToUpdate[] = []
  const toInsert: ToInsert[] = []
  const resolvedIds = new Map<number, string>()

  for (const t of parsed) {
    const { sheetRow } = t
    const existing =
      (t.id ? byIdMap.get(t.id) : null) ??
      byNameMap.get(t.name.toLowerCase()) ??
      null
    if (existing) {
      toUpdate.push({
        id: existing.id,
        name: t.name,
        color: t.color,
        archived: t.archived,
      })
      resolvedIds.set(sheetRow, existing.id)
    } else {
      toInsert.push({
        workspaceId: workspace.id,
        name: t.name,
        color: t.color,
        archived: t.archived,
        sheetRow,
      })
    }
  }

  await runInBatches(toUpdate, ({ id, name, color, archived }) =>
    db
      .update(tags)
      .set({ name, color, archived })
      .where(eq(tags.id, id))
      .then(() => undefined),
  )

  if (toInsert.length > 0) {
    const deduped = [
      ...new Map(toInsert.map((r) => [r.name.toLowerCase(), r])).values(),
    ]
    let created: { id: string; name: string }[]
    try {
      created = await db
        .insert(tags)
        .values(
          deduped.map(({ workspaceId, name, color, archived }) => ({
            workspaceId,
            name,
            color,
            archived,
          })),
        )
        .onConflictDoUpdate({
          target: [tags.workspaceId, tags.name],
          set: { color: sql`excluded.color`, archived: sql`excluded.archived` },
        })
        .returning({ id: tags.id, name: tags.name })
    } catch (err) {
      throw friendlyDbError(err, 'tag')
    }
    const createdByName = new Map(
      created.map((t) => [t.name.toLowerCase(), t.id]),
    )
    for (const row of toInsert) {
      const newId = createdByName.get(row.name.toLowerCase())
      if (newId) resolvedIds.set(row.sheetRow, newId)
    }
  }

  const writebacks: Array<{ row: number; id: string }> = []
  for (const t of parsed) {
    const resultId = resolvedIds.get(t.sheetRow)
    if (resultId && t.id !== resultId) {
      writebacks.push({ row: t.sheetRow, id: resultId })
    }
  }
  if (writebacks.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: sheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: writebacks.map(({ row, id }) => ({
          range: `${CATALOG_TAB_TAGS}!D${row}`,
          values: [[id]],
        })),
      },
    })
  }

  void createAuditLog({
    workspaceId: workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'GSHEET_IMPORT',
    targetType: 'workspace',
    targetId: workspace.id,
    details: `tags step completed: ${parsed.length} tags`,
  })

  return { count: parsed.length, warnings: [] }
}

// ── Sync (sheet is source of truth) ──────────────────────────────────────────
// Reads every row from the sheet, upserts into the DB using the ID column as
// the link, and writes back any newly-generated IDs for rows that had none.
// The sheet content is never overwritten — only the ID cells are filled in.

export type SyncResult = {
  clients: number
  projects: number
  tags: number
  warnings: string[]
}

export async function syncCatalogsWithSheet(): Promise<SyncResult> {
  const { access, workspace } = await resolveWorkspaceSheet()

  // importClientsFromSheet ensures tabs/headers exist, then does the upsert
  const clientsResult = await importClientsFromSheet()
  const projectsResult = await importProjectsFromSheet()
  const tagsResult = await importTagsFromSheet()

  void createAuditLog({
    workspaceId: workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'GSHEET_SYNC',
    targetType: 'workspace',
    targetId: workspace.id,
    details: `sync: ${clientsResult.count} clients, ${projectsResult.count} projects, ${tagsResult.count} tags`,
  })

  return {
    clients: clientsResult.count,
    projects: projectsResult.count,
    tags: tagsResult.count,
    warnings: [
      ...clientsResult.warnings,
      ...projectsResult.warnings,
      ...tagsResult.warnings,
    ],
  }
}

// ── Legacy single-call wrapper (kept for backward compat) ────────────────────

export type ImportResult = {
  clients: number
  projects: number
  tags: number
  warnings: string[]
}

export async function importCatalogsFromSheet(): Promise<ImportResult> {
  const [clientsResult, projectsResult, tagsResult] = await [
    importClientsFromSheet(),
  ]
    .reduce<Promise<ImportStepResult[]>>(async (accP, step) => {
      const acc = await accP
      acc.push(await step)
      return acc
    }, Promise.resolve([]))
    .then(async (acc) => {
      acc.push(await importProjectsFromSheet())
      acc.push(await importTagsFromSheet())
      return acc
    })

  return {
    clients: clientsResult.count,
    projects: projectsResult.count,
    tags: tagsResult.count,
    warnings: [...projectsResult.warnings],
  }
}

async function getSheetIdForWorkspace(
  workspaceId: string,
): Promise<string | null> {
  const [workspace] = await db
    .select({ googleSheetUrl: workspaces.googleSheetUrl })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
  if (!workspace?.googleSheetUrl) return null
  try {
    return extractSheetId(workspace.googleSheetUrl)
  } catch {
    return null
  }
}

// Find a row by the record's ID stored in the ID column (last column).
// Falls back to searching the Name column if not found.
async function getRowIndexForRecord(
  sheets: SheetsClient,
  sheetId: string,
  tabName: string,
  id: string,
  name: string,
  idColLetter: string,
): Promise<number | null> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:${idColLetter}`,
    })
    const rows = res.data.values ?? []
    const idColIndex = idColLetter.charCodeAt(0) - 'A'.charCodeAt(0)

    for (let i = 1; i < rows.length; i++) {
      const rowId = rows[i]?.[idColIndex]?.trim() ?? ''
      if (rowId && rowId === id) return i + 1
    }
    // Fallback: search by name
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]?.[0]?.trim().toLowerCase() === name.toLowerCase()) {
        return i + 1
      }
    }
    return null
  } catch {
    return null
  }
}

export async function exportClientToSheet(
  workspaceId: string,
  client: { id: string; name: string; clientStatus: string },
): Promise<void> {
  const sheetId = await getSheetIdForWorkspace(workspaceId)
  if (!sheetId) return

  const sheets = await getSheetsClient()
  const row = buildClientRow(client)
  const rowIndex = await getRowIndexForRecord(
    sheets,
    sheetId,
    CATALOG_TAB_CLIENTS,
    client.id,
    client.name,
    'C',
  )

  if (rowIndex !== null) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${CATALOG_TAB_CLIENTS}!A${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    })
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${CATALOG_TAB_CLIENTS}!A:C`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    })
  }
}

export async function exportProjectToSheet(
  workspaceId: string,
  project: {
    id: string
    name: string
    clientName: string
    color: string
    archived: boolean
  },
): Promise<void> {
  const sheetId = await getSheetIdForWorkspace(workspaceId)
  if (!sheetId) return

  const sheets = await getSheetsClient()
  const row = buildProjectRow(project)
  const rowIndex = await getRowIndexForRecord(
    sheets,
    sheetId,
    CATALOG_TAB_PROJECTS,
    project.id,
    project.name,
    'E',
  )

  if (rowIndex !== null) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${CATALOG_TAB_PROJECTS}!A${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    })
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${CATALOG_TAB_PROJECTS}!A:E`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    })
  }
}

export async function exportTagToSheet(
  workspaceId: string,
  tag: { id: string; name: string; color: string; archived: boolean },
): Promise<void> {
  const sheetId = await getSheetIdForWorkspace(workspaceId)
  if (!sheetId) return

  const sheets = await getSheetsClient()
  const row = buildTagRow(tag)
  const rowIndex = await getRowIndexForRecord(
    sheets,
    sheetId,
    CATALOG_TAB_TAGS,
    tag.id,
    tag.name,
    'D',
  )

  if (rowIndex !== null) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `${CATALOG_TAB_TAGS}!A${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    })
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: `${CATALOG_TAB_TAGS}!A:D`,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    })
  }
}
