import '@tanstack/react-start/server-only'
import { db } from '#/db'
import { clients, departments, projects, tags } from '#/db/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { assertAtLeastManager } from './shared/role-gates.server'
import { getSheetsClient } from '../gsheets/auth.server'
import { extractSheetId } from '../gsheets/extract-sheet-id'
import {
  CATALOG_TAB_CLIENTS,
  CATALOG_TAB_DEPARTMENTS,
  CATALOG_TAB_PROJECTS,
  CATALOG_TAB_TAGS,
  buildClientRow,
  buildDepartmentRow,
  buildProjectRow,
  buildTagRow,
  parseClientRows,
  parseDepartmentRows,
  parseProjectRows,
  parseTagRows,
} from '../gsheets/catalog-tabs'
import {
  ensureCatalogTabs,
  ensureAllCatalogHeaders,
} from '../gsheets/catalog-sync.server'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImportItem = {
  name: string
  action:
    | 'created'
    | 'updated'
    | 'skipped'
    | 'synced'
    | 'exported'
    | 'archived'
    | 'warning'
  detail?: string
}

export type ImportPhase = 'clients' | 'projects' | 'tags' | 'departments'

export type ImportProgressEvent =
  | { type: 'phase'; phase: ImportPhase; total: number }
  | {
      type: 'phase_sub'
      phase: ImportPhase
      sub: 'archive' | 'export'
      current: number
      total: number
    }
  | {
      type: 'item'
      phase: ImportPhase
      item: ImportItem
      current: number
      total: number
    }
  | {
      type: 'phase_complete'
      phase: ImportPhase
      count: number
      warnings: string[]
      archived?: number
      exported?: number
    }
  | {
      type: 'complete'
      clients: number
      projects: number
      tags: number
      departments: number
      warnings: string[]
    }
  | { type: 'error'; message: string }

type Emitter = (event: ImportProgressEvent) => void

// ── Sheets helpers ────────────────────────────────────────────────────────────

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

// ── Streaming import: Clients ─────────────────────────────────────────────────

async function streamImportClients(
  emit: Emitter,
  {
    workspace,
    sheetId,
    sheets,
  }: Awaited<ReturnType<typeof resolveWorkspaceSheet>>,
): Promise<{
  count: number
  warnings: string[]
  archived: number
  exported: number
}> {
  await ensureCatalogTabs(sheets, sheetId)
  await ensureAllCatalogHeaders(sheets, sheetId)

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${CATALOG_TAB_CLIENTS}!A2:C`,
  })
  const rawValues = res.data.values ?? []

  // Collect all IDs from the raw sheet data (col C, index 2) for Phase 2
  const previousSheetIds = new Set<string>(
    rawValues.map((r) => r[2]?.trim()).filter(Boolean),
  )

  const parsed = parseClientRows(rawValues)
  if (parsed.length === 0 && previousSheetIds.size === 0) {
    emit({ type: 'phase', phase: 'clients', total: 0 })
    emit({
      type: 'phase_complete',
      phase: 'clients',
      count: 0,
      warnings: [],
      archived: 0,
      exported: 0,
    })
    return { count: 0, warnings: [], archived: 0, exported: 0 }
  }

  emit({ type: 'phase', phase: 'clients', total: parsed.length })

  // Build lookups
  const knownIds = parsed.map((c) => c.id).filter(Boolean)
  const [byIdRows, allRows] = await Promise.all([
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
      : Promise.resolve([] as (typeof clients.$inferSelect)[]),
    db.select().from(clients).where(eq(clients.workspaceId, workspace.id)),
  ])
  const byIdMap = new Map(byIdRows.map((c) => [c.id, c]))
  const byNameMap = new Map(allRows.map((c) => [c.name.toLowerCase(), c]))

  const warnings: string[] = []
  const resolvedIds = new Map<number, string>()
  const seenDbIds = new Set<string>()
  let current = 0

  // ── Phase 1: Sheet → Database ──────────────────────────────────────────

  for (const c of parsed) {
    current++
    const existing =
      (c.id ? byIdMap.get(c.id) : null) ??
      byNameMap.get(c.name.toLowerCase()) ??
      null

    if (!existing) {
      // Insert
      try {
        const [created] = await db
          .insert(clients)
          .values({
            workspaceId: workspace.id,
            name: c.name,
            clientStatus: c.clientStatus,
          })
          .onConflictDoUpdate({
            target: [clients.workspaceId, clients.name],
            set: { clientStatus: sql`excluded.client_status` },
          })
          .returning({ id: clients.id, name: clients.name })
        resolvedIds.set(c.sheetRow, created.id)
        seenDbIds.add(created.id)
        emit({
          type: 'item',
          phase: 'clients',
          item: { name: c.name, action: 'created' },
          current,
          total: parsed.length,
        })
      } catch (err) {
        warnings.push(
          `Client "${c.name}" — ${err instanceof Error ? err.message : 'insert failed'}`,
        )
        emit({
          type: 'item',
          phase: 'clients',
          item: { name: c.name, action: 'skipped', detail: 'Insert failed' },
          current,
          total: parsed.length,
        })
      }
      continue
    }

    // Existing record found
    seenDbIds.add(existing.id)

    if (c.id) {
      // Row has an ID — check if data matches DB exactly
      const fieldsMatch =
        existing.name === c.name && existing.clientStatus === c.clientStatus

      if (fieldsMatch) {
        // Fully synced — no DB write needed
        resolvedIds.set(c.sheetRow, existing.id)
        emit({
          type: 'item',
          phase: 'clients',
          item: { name: c.name, action: 'synced' },
          current,
          total: parsed.length,
        })
        continue
      }
    }

    // Data differs or row has no ID — update DB
    try {
      await db
        .update(clients)
        .set({ name: c.name, clientStatus: c.clientStatus })
        .where(eq(clients.id, existing.id))
      resolvedIds.set(c.sheetRow, existing.id)
      emit({
        type: 'item',
        phase: 'clients',
        item: { name: c.name, action: 'updated' },
        current,
        total: parsed.length,
      })
    } catch (err) {
      warnings.push(
        `Client "${c.name}" — ${err instanceof Error ? err.message : 'update failed'}`,
      )
      emit({
        type: 'item',
        phase: 'clients',
        item: { name: c.name, action: 'skipped', detail: 'Update failed' },
        current,
        total: parsed.length,
      })
    }
  }

  // Write back IDs to sheet for newly created / newly matched records
  const writebacks: Array<{ row: number; id: string }> = []
  for (const c of parsed) {
    const resultId = resolvedIds.get(c.sheetRow)
    if (resultId && c.id !== resultId) {
      writebacks.push({ row: c.sheetRow, id: resultId })
    }
  }
  if (writebacks.length > 0) {
    try {
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
    } catch (err) {
      warnings.push(
        `Failed to write back client IDs to sheet: ${err instanceof Error ? err.message : 'unknown error'}`,
      )
    }
  }

  // ── Phase 2: Archive deleted rows ──────────────────────────────────────

  let archivedCount = 0
  const currentSheetIds = new Set(parsed.map((c) => c.id).filter(Boolean))
  const deletedIds =
    previousSheetIds.size > 0
      ? [...previousSheetIds].filter((id) => !currentSheetIds.has(id))
      : []

  if (deletedIds.length > 0) {
    emit({
      type: 'phase_sub',
      phase: 'clients',
      sub: 'archive',
      current: 0,
      total: deletedIds.length,
    })

    for (let i = 0; i < deletedIds.length; i++) {
      emit({
        type: 'phase_sub',
        phase: 'clients',
        sub: 'archive',
        current: i + 1,
        total: deletedIds.length,
      })

      const id = deletedIds[i]
      const record = allRows.find((r) => r.id === id)

      if (!record) continue

      try {
        await db
          .update(clients)
          .set({ clientStatus: 'INACTIVE' })
          .where(eq(clients.id, id))
        seenDbIds.add(id)
        archivedCount++
        emit({
          type: 'item',
          phase: 'clients',
          item: { name: record.name, action: 'archived' },
          current: current + i + 1,
          total: current + deletedIds.length,
        })
      } catch {
        // Archive failed (likely FK dependencies) — re-add row with Warning label
        try {
          const warningName = `${record.name} (Warning)`
          const row = buildClientRow({
            name: warningName,
            clientStatus: 'ACTIVE',
            id,
          })
          await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: `${CATALOG_TAB_CLIENTS}!A:C`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: [row] },
          })
          warnings.push(
            `Client "${record.name}" could not be archived (has dependencies). Re-added with warning label.`,
          )
        } catch {
          warnings.push(
            `Client "${record.name}" (ID: ${id}) could not be archived or re-added to the sheet.`,
          )
        }
        emit({
          type: 'item',
          phase: 'clients',
          item: {
            name: record.name,
            action: 'warning',
            detail: 'Archive failed',
          },
          current: current + i + 1,
          total: current + deletedIds.length,
        })
      }
    }
  }

  // ── Phase 3: Export missing active DB records to sheet ─────────────────

  let exportedCount = 0
  const sheetNames = new Set(parsed.map((c) => c.name.toLowerCase()))

  const missingActive = allRows.filter(
    (r) =>
      r.clientStatus === 'ACTIVE' &&
      !seenDbIds.has(r.id) &&
      !sheetNames.has(r.name.toLowerCase()),
  )

  if (missingActive.length > 0) {
    const phase3Offset = current + deletedIds.length

    emit({
      type: 'phase_sub',
      phase: 'clients',
      sub: 'export',
      current: 0,
      total: missingActive.length,
    })

    for (let i = 0; i < missingActive.length; i++) {
      emit({
        type: 'phase_sub',
        phase: 'clients',
        sub: 'export',
        current: i + 1,
        total: missingActive.length,
      })

      const record = missingActive[i]
      try {
        const row = buildClientRow(record)
        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: `${CATALOG_TAB_CLIENTS}!A:C`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [row] },
        })
        exportedCount++
        emit({
          type: 'item',
          phase: 'clients',
          item: { name: record.name, action: 'exported' },
          current: phase3Offset + i + 1,
          total: phase3Offset + missingActive.length,
        })
      } catch (err) {
        warnings.push(
          `Client "${record.name}" — ${err instanceof Error ? err.message : 'export to sheet failed'}`,
        )
      }
    }
  }

  emit({
    type: 'phase_complete',
    phase: 'clients',
    count: parsed.length,
    warnings,
    archived: archivedCount,
    exported: exportedCount,
  })
  return {
    count: parsed.length,
    warnings,
    archived: archivedCount,
    exported: exportedCount,
  }
}

// ── Streaming import: Projects ────────────────────────────────────────────────

async function streamImportProjects(
  emit: Emitter,
  {
    workspace,
    sheetId,
    sheets,
  }: Awaited<ReturnType<typeof resolveWorkspaceSheet>>,
): Promise<{
  count: number
  warnings: string[]
  archived: number
  exported: number
}> {
  // Fetch all clients for name ↔ id resolution
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.workspaceId, workspace.id))
  const clientNameToId = new Map(
    allClients.map((c) => [c.name.toLowerCase(), c.id]),
  )
  const clientIdToName = new Map(allClients.map((c) => [c.id, c.name]))

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${CATALOG_TAB_PROJECTS}!A2:E`,
  })
  const rawValues = res.data.values ?? []

  // Collect all IDs from raw sheet data (col E, index 4) for Phase 2
  const previousSheetIds = new Set<string>(
    rawValues.map((r) => r[4]?.trim()).filter(Boolean),
  )

  const parsed = parseProjectRows(rawValues)
  if (parsed.length === 0 && previousSheetIds.size === 0) {
    emit({ type: 'phase', phase: 'projects', total: 0 })
    emit({
      type: 'phase_complete',
      phase: 'projects',
      count: 0,
      warnings: [],
      archived: 0,
      exported: 0,
    })
    return { count: 0, warnings: [], archived: 0, exported: 0 }
  }

  emit({ type: 'phase', phase: 'projects', total: parsed.length })

  // Build lookups
  const knownIds = parsed.map((p) => p.id).filter(Boolean)
  const [byIdRows, allRows] = await Promise.all([
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
      : Promise.resolve([] as (typeof projects.$inferSelect)[]),
    db.select().from(projects).where(eq(projects.workspaceId, workspace.id)),
  ])
  const byIdMap = new Map(byIdRows.map((p) => [p.id, p]))
  const byNameClientMap = new Map(
    allRows.map((p) => [`${p.name.toLowerCase()}::${p.clientId}`, p]),
  )

  const warnings: string[] = []
  const resolvedIds = new Map<number, string>()
  const seenDbIds = new Set<string>()
  let current = 0

  // ── Phase 1: Sheet → Database ──────────────────────────────────────────

  for (const p of parsed) {
    current++
    const sheetClientId = clientNameToId.get(p.clientName.toLowerCase())

    if (!sheetClientId) {
      warnings.push(
        `Project "${p.name}" skipped — client "${p.clientName}" not found.`,
      )
      emit({
        type: 'item',
        phase: 'projects',
        item: {
          name: p.name,
          action: 'skipped',
          detail: `Client "${p.clientName}" not found`,
        },
        current,
        total: parsed.length,
      })
      continue
    }

    const existing =
      (p.id ? byIdMap.get(p.id) : null) ??
      byNameClientMap.get(`${p.name.toLowerCase()}::${sheetClientId}`) ??
      null

    if (!existing) {
      // Insert
      try {
        const [created] = await db
          .insert(projects)
          .values({
            workspaceId: workspace.id,
            name: p.name,
            color: p.color,
            archived: p.archived,
            clientId: sheetClientId,
          })
          .onConflictDoUpdate({
            target: [projects.workspaceId, projects.clientId, projects.name],
            set: {
              color: sql`excluded.color`,
              archived: sql`excluded.archived`,
            },
          })
          .returning({ id: projects.id, name: projects.name })
        resolvedIds.set(p.sheetRow, created.id)
        seenDbIds.add(created.id)
        emit({
          type: 'item',
          phase: 'projects',
          item: {
            name: p.name,
            action: 'created',
            detail: `Client: ${p.clientName}`,
          },
          current,
          total: parsed.length,
        })
      } catch (err) {
        warnings.push(
          `Project "${p.name}" — ${err instanceof Error ? err.message : 'insert failed'}`,
        )
        emit({
          type: 'item',
          phase: 'projects',
          item: { name: p.name, action: 'skipped', detail: 'Insert failed' },
          current,
          total: parsed.length,
        })
      }
      continue
    }

    // Existing record found
    seenDbIds.add(existing.id)

    if (p.id) {
      // Row has an ID — check if data matches DB exactly
      const fieldsMatch =
        existing.name === p.name &&
        existing.color === p.color &&
        existing.archived === p.archived &&
        existing.clientId === sheetClientId

      if (fieldsMatch) {
        // Fully synced — no DB write needed
        resolvedIds.set(p.sheetRow, existing.id)
        emit({
          type: 'item',
          phase: 'projects',
          item: {
            name: p.name,
            action: 'synced',
            detail: `Client: ${p.clientName}`,
          },
          current,
          total: parsed.length,
        })
        continue
      }
    }

    // Data differs or row has no ID — update DB
    try {
      await db
        .update(projects)
        .set({
          name: p.name,
          color: p.color,
          archived: p.archived,
          clientId: sheetClientId,
        })
        .where(eq(projects.id, existing.id))
      resolvedIds.set(p.sheetRow, existing.id)
      emit({
        type: 'item',
        phase: 'projects',
        item: {
          name: p.name,
          action: 'updated',
          detail: `Client: ${p.clientName}`,
        },
        current,
        total: parsed.length,
      })
    } catch (err) {
      warnings.push(
        `Project "${p.name}" — ${err instanceof Error ? err.message : 'update failed'}`,
      )
      emit({
        type: 'item',
        phase: 'projects',
        item: { name: p.name, action: 'skipped', detail: 'Update failed' },
        current,
        total: parsed.length,
      })
    }
  }

  // Write back IDs
  const writebacks: Array<{ row: number; id: string }> = []
  for (const p of parsed) {
    const resultId = resolvedIds.get(p.sheetRow)
    if (resultId && p.id !== resultId) {
      writebacks.push({ row: p.sheetRow, id: resultId })
    }
  }
  if (writebacks.length > 0) {
    try {
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
    } catch (err) {
      warnings.push(
        `Failed to write back project IDs to sheet: ${err instanceof Error ? err.message : 'unknown error'}`,
      )
    }
  }

  // ── Phase 2: Archive deleted rows ──────────────────────────────────────

  let archivedCount = 0
  const currentSheetIds = new Set(parsed.map((p) => p.id).filter(Boolean))
  const deletedIds =
    previousSheetIds.size > 0
      ? [...previousSheetIds].filter((id) => !currentSheetIds.has(id))
      : []

  if (deletedIds.length > 0) {
    emit({
      type: 'phase_sub',
      phase: 'projects',
      sub: 'archive',
      current: 0,
      total: deletedIds.length,
    })

    for (let i = 0; i < deletedIds.length; i++) {
      emit({
        type: 'phase_sub',
        phase: 'projects',
        sub: 'archive',
        current: i + 1,
        total: deletedIds.length,
      })

      const id = deletedIds[i]
      const record = allRows.find((r) => r.id === id)

      if (!record) continue

      try {
        await db
          .update(projects)
          .set({ archived: true })
          .where(eq(projects.id, id))
        seenDbIds.add(id)
        archivedCount++
        emit({
          type: 'item',
          phase: 'projects',
          item: { name: record.name, action: 'archived' },
          current: current + i + 1,
          total: current + deletedIds.length,
        })
      } catch {
        // Archive failed — re-add row with Warning label
        try {
          const warningName = `${record.name} (Warning)`
          const clientName = clientIdToName.get(record.clientId) ?? ''
          const row = buildProjectRow({
            name: warningName,
            clientName,
            color: record.color,
            archived: false,
            id,
          })
          await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: `${CATALOG_TAB_PROJECTS}!A:E`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: [row] },
          })
          warnings.push(
            `Project "${record.name}" could not be archived (has dependencies). Re-added with warning label.`,
          )
        } catch {
          warnings.push(
            `Project "${record.name}" (ID: ${id}) could not be archived or re-added to the sheet.`,
          )
        }
        emit({
          type: 'item',
          phase: 'projects',
          item: {
            name: record.name,
            action: 'warning',
            detail: 'Archive failed',
          },
          current: current + i + 1,
          total: current + deletedIds.length,
        })
      }
    }
  }

  // ── Phase 3: Export missing active DB records to sheet ─────────────────

  let exportedCount = 0
  const sheetNameClientKeys = new Set(
    parsed.map(
      (p) =>
        `${p.name.toLowerCase()}::${clientNameToId.get(p.clientName.toLowerCase()) ?? '?'}`,
    ),
  )
  const sheetNames = new Set(parsed.map((p) => p.name.toLowerCase()))

  const missingActive = allRows.filter(
    (r) =>
      !r.archived &&
      !seenDbIds.has(r.id) &&
      !sheetNameClientKeys.has(`${r.name.toLowerCase()}::${r.clientId}`) &&
      !sheetNames.has(r.name.toLowerCase()),
  )

  if (missingActive.length > 0) {
    const phase3Offset = current + deletedIds.length

    emit({
      type: 'phase_sub',
      phase: 'projects',
      sub: 'export',
      current: 0,
      total: missingActive.length,
    })

    for (let i = 0; i < missingActive.length; i++) {
      emit({
        type: 'phase_sub',
        phase: 'projects',
        sub: 'export',
        current: i + 1,
        total: missingActive.length,
      })

      const record = missingActive[i]
      const clientName = clientIdToName.get(record.clientId) ?? ''

      try {
        const row = buildProjectRow({ ...record, clientName })
        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: `${CATALOG_TAB_PROJECTS}!A:E`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [row] },
        })
        exportedCount++
        emit({
          type: 'item',
          phase: 'projects',
          item: {
            name: record.name,
            action: 'exported',
            detail: `Client: ${clientName}`,
          },
          current: phase3Offset + i + 1,
          total: phase3Offset + missingActive.length,
        })
      } catch (err) {
        warnings.push(
          `Project "${record.name}" — ${err instanceof Error ? err.message : 'export to sheet failed'}`,
        )
      }
    }
  }

  emit({
    type: 'phase_complete',
    phase: 'projects',
    count: parsed.length,
    warnings,
    archived: archivedCount,
    exported: exportedCount,
  })
  return {
    count: parsed.length,
    warnings,
    archived: archivedCount,
    exported: exportedCount,
  }
}

// ── Streaming import: Tags ────────────────────────────────────────────────────

async function streamImportTags(
  emit: Emitter,
  {
    workspace,
    sheetId,
    sheets,
  }: Awaited<ReturnType<typeof resolveWorkspaceSheet>>,
): Promise<{
  count: number
  warnings: string[]
  archived: number
  exported: number
}> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${CATALOG_TAB_TAGS}!A2:D`,
  })
  const rawValues = res.data.values ?? []

  // Collect all IDs from raw sheet data (col D, index 3) for Phase 2
  const previousSheetIds = new Set<string>(
    rawValues.map((r) => r[3]?.trim()).filter(Boolean),
  )

  const parsed = parseTagRows(rawValues)
  if (parsed.length === 0 && previousSheetIds.size === 0) {
    emit({ type: 'phase', phase: 'tags', total: 0 })
    emit({
      type: 'phase_complete',
      phase: 'tags',
      count: 0,
      warnings: [],
      archived: 0,
      exported: 0,
    })
    return { count: 0, warnings: [], archived: 0, exported: 0 }
  }

  emit({ type: 'phase', phase: 'tags', total: parsed.length })

  // Build lookups
  const knownIds = parsed.map((t) => t.id).filter(Boolean)
  const [byIdRows, allRows] = await Promise.all([
    knownIds.length > 0
      ? db
          .select()
          .from(tags)
          .where(
            and(inArray(tags.id, knownIds), eq(tags.workspaceId, workspace.id)),
          )
      : Promise.resolve([] as (typeof tags.$inferSelect)[]),
    db.select().from(tags).where(eq(tags.workspaceId, workspace.id)),
  ])
  const byIdMap = new Map(byIdRows.map((t) => [t.id, t]))
  const byNameMap = new Map(allRows.map((t) => [t.name.toLowerCase(), t]))

  const warnings: string[] = []
  const resolvedIds = new Map<number, string>()
  const seenDbIds = new Set<string>()
  let current = 0

  // ── Phase 1: Sheet → Database ──────────────────────────────────────────

  for (const t of parsed) {
    current++
    const existing =
      (t.id ? byIdMap.get(t.id) : null) ??
      byNameMap.get(t.name.toLowerCase()) ??
      null

    if (!existing) {
      // Insert
      try {
        const [created] = await db
          .insert(tags)
          .values({
            workspaceId: workspace.id,
            name: t.name,
            color: t.color,
            archived: t.archived,
          })
          .onConflictDoUpdate({
            target: [tags.workspaceId, tags.name],
            set: {
              color: sql`excluded.color`,
              archived: sql`excluded.archived`,
            },
          })
          .returning({ id: tags.id, name: tags.name })
        resolvedIds.set(t.sheetRow, created.id)
        seenDbIds.add(created.id)
        emit({
          type: 'item',
          phase: 'tags',
          item: { name: t.name, action: 'created' },
          current,
          total: parsed.length,
        })
      } catch (err) {
        warnings.push(
          `Tag "${t.name}" — ${err instanceof Error ? err.message : 'insert failed'}`,
        )
        emit({
          type: 'item',
          phase: 'tags',
          item: { name: t.name, action: 'skipped', detail: 'Insert failed' },
          current,
          total: parsed.length,
        })
      }
      continue
    }

    // Existing record found
    seenDbIds.add(existing.id)

    if (t.id) {
      // Row has an ID — check if data matches DB exactly
      const fieldsMatch =
        existing.name === t.name &&
        existing.color === t.color &&
        existing.archived === t.archived

      if (fieldsMatch) {
        // Fully synced — no DB write needed
        resolvedIds.set(t.sheetRow, existing.id)
        emit({
          type: 'item',
          phase: 'tags',
          item: { name: t.name, action: 'synced' },
          current,
          total: parsed.length,
        })
        continue
      }
    }

    // Data differs or row has no ID — update DB
    try {
      await db
        .update(tags)
        .set({ name: t.name, color: t.color, archived: t.archived })
        .where(eq(tags.id, existing.id))
      resolvedIds.set(t.sheetRow, existing.id)
      emit({
        type: 'item',
        phase: 'tags',
        item: { name: t.name, action: 'updated' },
        current,
        total: parsed.length,
      })
    } catch (err) {
      warnings.push(
        `Tag "${t.name}" — ${err instanceof Error ? err.message : 'update failed'}`,
      )
      emit({
        type: 'item',
        phase: 'tags',
        item: { name: t.name, action: 'skipped', detail: 'Update failed' },
        current,
        total: parsed.length,
      })
    }
  }

  // Write back IDs
  const writebacks: Array<{ row: number; id: string }> = []
  for (const t of parsed) {
    const resultId = resolvedIds.get(t.sheetRow)
    if (resultId && t.id !== resultId) {
      writebacks.push({ row: t.sheetRow, id: resultId })
    }
  }
  if (writebacks.length > 0) {
    try {
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
    } catch (err) {
      warnings.push(
        `Failed to write back tag IDs to sheet: ${err instanceof Error ? err.message : 'unknown error'}`,
      )
    }
  }

  // ── Phase 2: Archive deleted rows ──────────────────────────────────────

  let archivedCount = 0
  const currentSheetIds = new Set(parsed.map((t) => t.id).filter(Boolean))
  const deletedIds =
    previousSheetIds.size > 0
      ? [...previousSheetIds].filter((id) => !currentSheetIds.has(id))
      : []

  if (deletedIds.length > 0) {
    emit({
      type: 'phase_sub',
      phase: 'tags',
      sub: 'archive',
      current: 0,
      total: deletedIds.length,
    })

    for (let i = 0; i < deletedIds.length; i++) {
      emit({
        type: 'phase_sub',
        phase: 'tags',
        sub: 'archive',
        current: i + 1,
        total: deletedIds.length,
      })

      const id = deletedIds[i]
      const record = allRows.find((r) => r.id === id)

      if (!record) continue

      try {
        await db.update(tags).set({ archived: true }).where(eq(tags.id, id))
        seenDbIds.add(id)
        archivedCount++
        emit({
          type: 'item',
          phase: 'tags',
          item: { name: record.name, action: 'archived' },
          current: current + i + 1,
          total: current + deletedIds.length,
        })
      } catch {
        // Archive failed — re-add row with Warning label
        try {
          const warningName = `${record.name} (Warning)`
          const row = buildTagRow({
            name: warningName,
            color: record.color,
            archived: false,
            id,
          })
          await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: `${CATALOG_TAB_TAGS}!A:D`,
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            requestBody: { values: [row] },
          })
          warnings.push(
            `Tag "${record.name}" could not be archived (has dependencies). Re-added with warning label.`,
          )
        } catch {
          warnings.push(
            `Tag "${record.name}" (ID: ${id}) could not be archived or re-added to the sheet.`,
          )
        }
        emit({
          type: 'item',
          phase: 'tags',
          item: {
            name: record.name,
            action: 'warning',
            detail: 'Archive failed',
          },
          current: current + i + 1,
          total: current + deletedIds.length,
        })
      }
    }
  }

  // ── Phase 3: Export missing active DB records to sheet ─────────────────

  let exportedCount = 0
  const sheetNames = new Set(parsed.map((t) => t.name.toLowerCase()))

  const missingActive = allRows.filter(
    (r) =>
      !r.archived &&
      !seenDbIds.has(r.id) &&
      !sheetNames.has(r.name.toLowerCase()),
  )

  if (missingActive.length > 0) {
    const phase3Offset = current + deletedIds.length

    emit({
      type: 'phase_sub',
      phase: 'tags',
      sub: 'export',
      current: 0,
      total: missingActive.length,
    })

    for (let i = 0; i < missingActive.length; i++) {
      emit({
        type: 'phase_sub',
        phase: 'tags',
        sub: 'export',
        current: i + 1,
        total: missingActive.length,
      })

      const record = missingActive[i]
      try {
        const row = buildTagRow(record)
        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: `${CATALOG_TAB_TAGS}!A:D`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [row] },
        })
        exportedCount++
        emit({
          type: 'item',
          phase: 'tags',
          item: { name: record.name, action: 'exported' },
          current: phase3Offset + i + 1,
          total: phase3Offset + missingActive.length,
        })
      } catch (err) {
        warnings.push(
          `Tag "${record.name}" — ${err instanceof Error ? err.message : 'export to sheet failed'}`,
        )
      }
    }
  }

  emit({
    type: 'phase_complete',
    phase: 'tags',
    count: parsed.length,
    warnings,
    archived: archivedCount,
    exported: exportedCount,
  })
  return {
    count: parsed.length,
    warnings,
    archived: archivedCount,
    exported: exportedCount,
  }
}

// ── Streaming import: Departments ─────────────────────────────────────────────

async function streamImportDepartments(
  emit: Emitter,
  {
    workspace,
    sheetId,
    sheets,
  }: Awaited<ReturnType<typeof resolveWorkspaceSheet>>,
): Promise<{
  count: number
  warnings: string[]
  archived: number
  exported: number
}> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${CATALOG_TAB_DEPARTMENTS}!A2:D`,
  })
  const rawValues = res.data.values ?? []

  // Collect all IDs from raw sheet data (col D, index 3) for Phase 2
  const previousSheetIds = new Set<string>(
    rawValues.map((r) => r[3]?.trim()).filter(Boolean),
  )

  const parsed = parseDepartmentRows(rawValues)
  if (parsed.length === 0 && previousSheetIds.size === 0) {
    emit({ type: 'phase', phase: 'departments', total: 0 })
    emit({
      type: 'phase_complete',
      phase: 'departments',
      count: 0,
      warnings: [],
      archived: 0,
      exported: 0,
    })
    return { count: 0, warnings: [], archived: 0, exported: 0 }
  }

  emit({ type: 'phase', phase: 'departments', total: parsed.length })

  // Build lookups
  const knownIds = parsed.map((d) => d.id).filter(Boolean)
  const [byIdRows, allRows] = await Promise.all([
    knownIds.length > 0
      ? db
          .select()
          .from(departments)
          .where(
            and(
              inArray(departments.id, knownIds),
              eq(departments.workspaceId, workspace.id),
            ),
          )
      : Promise.resolve([] as (typeof departments.$inferSelect)[]),
    db
      .select()
      .from(departments)
      .where(eq(departments.workspaceId, workspace.id)),
  ])
  const byIdMap = new Map(byIdRows.map((d) => [d.id, d]))
  const byNameMap = new Map(allRows.map((d) => [d.name.toLowerCase(), d]))

  const warnings: string[] = []
  const resolvedIds = new Map<number, string>()
  const seenDbIds = new Set<string>()
  let current = 0

  // ── Phase 1: Sheet → Database ──────────────────────────────────────────

  for (const d of parsed) {
    current++
    const existing =
      (d.id ? byIdMap.get(d.id) : null) ??
      byNameMap.get(d.name.toLowerCase()) ??
      null

    if (!existing) {
      // Insert
      try {
        const [created] = await db
          .insert(departments)
          .values({
            workspaceId: workspace.id,
            name: d.name,
            color: d.color,
            description: d.description || null,
          })
          .onConflictDoUpdate({
            target: [departments.workspaceId, departments.name],
            set: {
              color: sql`excluded.color`,
              description: sql`excluded.description`,
            },
          })
          .returning({ id: departments.id, name: departments.name })
        resolvedIds.set(d.sheetRow, created.id)
        seenDbIds.add(created.id)
        emit({
          type: 'item',
          phase: 'departments',
          item: { name: d.name, action: 'created' },
          current,
          total: parsed.length,
        })
      } catch (err) {
        warnings.push(
          `Department "${d.name}" — ${err instanceof Error ? err.message : 'insert failed'}`,
        )
        emit({
          type: 'item',
          phase: 'departments',
          item: { name: d.name, action: 'skipped', detail: 'Insert failed' },
          current,
          total: parsed.length,
        })
      }
      continue
    }

    // Existing record found
    seenDbIds.add(existing.id)

    if (d.id) {
      // Row has an ID — check if data matches DB exactly
      const fieldsMatch =
        existing.name === d.name &&
        existing.color === d.color &&
        (existing.description ?? '') === (d.description ?? '')

      if (fieldsMatch) {
        // Fully synced — no DB write needed
        resolvedIds.set(d.sheetRow, existing.id)
        emit({
          type: 'item',
          phase: 'departments',
          item: { name: d.name, action: 'synced' },
          current,
          total: parsed.length,
        })
        continue
      }
    }

    // Data differs or row has no ID — update DB
    try {
      await db
        .update(departments)
        .set({
          name: d.name,
          color: d.color,
          description: d.description || null,
        })
        .where(eq(departments.id, existing.id))
      resolvedIds.set(d.sheetRow, existing.id)
      emit({
        type: 'item',
        phase: 'departments',
        item: { name: d.name, action: 'updated' },
        current,
        total: parsed.length,
      })
    } catch (err) {
      warnings.push(
        `Department "${d.name}" — ${err instanceof Error ? err.message : 'update failed'}`,
      )
      emit({
        type: 'item',
        phase: 'departments',
        item: { name: d.name, action: 'skipped', detail: 'Update failed' },
        current,
        total: parsed.length,
      })
    }
  }

  // Write back IDs
  const writebacks: Array<{ row: number; id: string }> = []
  for (const d of parsed) {
    const resultId = resolvedIds.get(d.sheetRow)
    if (resultId && d.id !== resultId) {
      writebacks.push({ row: d.sheetRow, id: resultId })
    }
  }
  if (writebacks.length > 0) {
    try {
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
          valueInputOption: 'RAW',
          data: writebacks.map(({ row, id }) => ({
            range: `${CATALOG_TAB_DEPARTMENTS}!D${row}`,
            values: [[id]],
          })),
        },
      })
    } catch (err) {
      warnings.push(
        `Failed to write back department IDs to sheet: ${err instanceof Error ? err.message : 'unknown error'}`,
      )
    }
  }

  // ── Phase 2: Archive deleted rows ──────────────────────────────────────
  // Departments have no archive mechanism; skip Phase 2 for departments.
  // If a row was removed from the sheet, the DB record is left as-is.
  // Phase 3 may re-add it if it's still considered active.

  const archivedCount = 0

  // ── Phase 3: Export missing DB records to sheet ────────────────────────

  let exportedCount = 0
  const sheetNames = new Set(parsed.map((d) => d.name.toLowerCase()))

  const missing = allRows.filter(
    (r) => !seenDbIds.has(r.id) && !sheetNames.has(r.name.toLowerCase()),
  )

  if (missing.length > 0) {
    emit({
      type: 'phase_sub',
      phase: 'departments',
      sub: 'export',
      current: 0,
      total: missing.length,
    })

    for (let i = 0; i < missing.length; i++) {
      emit({
        type: 'phase_sub',
        phase: 'departments',
        sub: 'export',
        current: i + 1,
        total: missing.length,
      })

      const record = missing[i]
      try {
        const row = buildDepartmentRow(record)
        await sheets.spreadsheets.values.append({
          spreadsheetId: sheetId,
          range: `${CATALOG_TAB_DEPARTMENTS}!A:D`,
          valueInputOption: 'RAW',
          insertDataOption: 'INSERT_ROWS',
          requestBody: { values: [row] },
        })
        exportedCount++
        emit({
          type: 'item',
          phase: 'departments',
          item: { name: record.name, action: 'exported' },
          current: current + i + 1,
          total: current + missing.length,
        })
      } catch (err) {
        warnings.push(
          `Department "${record.name}" — ${err instanceof Error ? err.message : 'export to sheet failed'}`,
        )
      }
    }
  }

  emit({
    type: 'phase_complete',
    phase: 'departments',
    count: parsed.length,
    warnings,
    archived: archivedCount,
    exported: exportedCount,
  })
  return {
    count: parsed.length,
    warnings,
    archived: archivedCount,
    exported: exportedCount,
  }
}

// ── Public entry points ───────────────────────────────────────────────────────

export type ImportType = 'clients' | 'projects' | 'tags' | 'departments' | 'all'

export async function runStreamingImport(
  type: ImportType,
  emit: Emitter,
): Promise<void> {
  try {
    const sheet = await resolveWorkspaceSheet()

    let totalClients = 0
    let totalProjects = 0
    let totalTags = 0
    let totalDepartments = 0
    const allWarnings: string[] = []

    if (type === 'all' || type === 'clients') {
      try {
        const result = await streamImportClients(emit, sheet)
        totalClients = result.count
        allWarnings.push(...result.warnings)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(
          '[streaming-import] Clients sync failed:',
          err instanceof Error ? err.stack : err,
        )
        const warning = `Clients sync error: ${msg}`
        allWarnings.push(warning)
        emit({
          type: 'phase_complete',
          phase: 'clients',
          count: 0,
          warnings: [warning],
        })
      }
    }

    if (type === 'all' || type === 'projects') {
      try {
        const result = await streamImportProjects(emit, sheet)
        totalProjects = result.count
        allWarnings.push(...result.warnings)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(
          '[streaming-import] Projects sync failed:',
          err instanceof Error ? err.stack : err,
        )
        const warning = `Projects sync error: ${msg}`
        allWarnings.push(warning)
        emit({
          type: 'phase_complete',
          phase: 'projects',
          count: 0,
          warnings: [warning],
        })
      }
    }

    if (type === 'all' || type === 'tags') {
      try {
        const result = await streamImportTags(emit, sheet)
        totalTags = result.count
        allWarnings.push(...result.warnings)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(
          '[streaming-import] Tags sync failed:',
          err instanceof Error ? err.stack : err,
        )
        const warning = `Tags sync error: ${msg}`
        allWarnings.push(warning)
        emit({
          type: 'phase_complete',
          phase: 'tags',
          count: 0,
          warnings: [warning],
        })
      }
    }

    if (type === 'all' || type === 'departments') {
      try {
        const result = await streamImportDepartments(emit, sheet)
        totalDepartments = result.count
        allWarnings.push(...result.warnings)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(
          '[streaming-import] Departments sync failed:',
          err instanceof Error ? err.stack : err,
        )
        const warning = `Departments sync error: ${msg}`
        allWarnings.push(warning)
        emit({
          type: 'phase_complete',
          phase: 'departments',
          count: 0,
          warnings: [warning],
        })
      }
    }

    emit({
      type: 'complete',
      clients: totalClients,
      projects: totalProjects,
      tags: totalTags,
      departments: totalDepartments,
      warnings: allWarnings,
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Import failed unexpectedly'
    console.error(
      '[streaming-import] runStreamingImport failed:',
      err instanceof Error ? err.stack : err,
    )
    emit({ type: 'error', message })
  }
}
