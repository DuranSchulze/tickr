import '@tanstack/react-start/server-only'
import { db } from '#/db'
import { clients, projects, tags } from '#/db/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { assertAtLeastManager } from './shared/role-gates.server'
import { getSheetsClient } from '../gsheets/auth.server'
import { extractSheetId } from '../gsheets/extract-sheet-id'
import {
  CATALOG_TAB_CLIENTS,
  CATALOG_TAB_PROJECTS,
  CATALOG_TAB_TAGS,
  parseClientRows,
  parseProjectRows,
  parseTagRows,
} from '../gsheets/catalog-tabs'
import {
  ensureCatalogTabs,
  ensureAllCatalogHeaders,
} from '../gsheets/catalog-sync.server'

export type ImportItem = {
  name: string
  action: 'created' | 'updated' | 'skipped'
  detail?: string
}

export type ImportPhase = 'clients' | 'projects' | 'tags'

export type ImportProgressEvent =
  | { type: 'phase'; phase: ImportPhase; total: number }
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
    }
  | {
      type: 'complete'
      clients: number
      projects: number
      tags: number
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
): Promise<{ count: number; warnings: string[] }> {
  await ensureCatalogTabs(sheets, sheetId)
  await ensureAllCatalogHeaders(sheets, sheetId)

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${CATALOG_TAB_CLIENTS}!A2:C`,
  })
  const parsed = parseClientRows(res.data.values ?? [])
  if (parsed.length === 0) {
    emit({ type: 'phase', phase: 'clients', total: 0 })
    emit({ type: 'phase_complete', phase: 'clients', count: 0, warnings: [] })
    return { count: 0, warnings: [] }
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
  let current = 0

  for (const c of parsed) {
    current++
    const existing =
      (c.id ? byIdMap.get(c.id) : null) ??
      byNameMap.get(c.name.toLowerCase()) ??
      null

    if (existing) {
      // Update
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
    } else {
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
    }
  }

  // Write back IDs to sheet
  const writebacks: Array<{ row: number; id: string }> = []
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

  emit({
    type: 'phase_complete',
    phase: 'clients',
    count: parsed.length,
    warnings,
  })
  return { count: parsed.length, warnings }
}

// ── Streaming import: Projects ────────────────────────────────────────────────

async function streamImportProjects(
  emit: Emitter,
  {
    workspace,
    sheetId,
    sheets,
  }: Awaited<ReturnType<typeof resolveWorkspaceSheet>>,
): Promise<{ count: number; warnings: string[] }> {
  // Fetch all clients for name → id lookup
  const allClients = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.workspaceId, workspace.id))
  const clientNameToId = new Map(
    allClients.map((c) => [c.name.toLowerCase(), c.id]),
  )

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${CATALOG_TAB_PROJECTS}!A2:E`,
  })
  const parsed = parseProjectRows(res.data.values ?? [])
  if (parsed.length === 0) {
    emit({ type: 'phase', phase: 'projects', total: 0 })
    emit({ type: 'phase_complete', phase: 'projects', count: 0, warnings: [] })
    return { count: 0, warnings: [] }
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
  // Build (name, clientId) combo map for lookup — same name under different clients is allowed
  const byNameClientMap = new Map(
    allRows.map((p) => [`${p.name.toLowerCase()}::${p.clientId}`, p]),
  )

  const warnings: string[] = []
  const resolvedIds = new Map<number, string>()
  let current = 0

  for (const p of parsed) {
    current++
    const clientId = clientNameToId.get(p.clientName.toLowerCase())
    if (!clientId) {
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

    // Look up by ID first (if sheet has one), then by (name, clientId) combo
    const existing =
      (p.id ? byIdMap.get(p.id) : null) ??
      byNameClientMap.get(`${p.name.toLowerCase()}::${clientId}`) ??
      null

    if (existing) {
      // Found — update color/archived, keep same client
      await db
        .update(projects)
        .set({ name: p.name, color: p.color, archived: p.archived })
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
    } else {
      try {
        const [created] = await db
          .insert(projects)
          .values({
            workspaceId: workspace.id,
            name: p.name,
            color: p.color,
            archived: p.archived,
            clientId,
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

  emit({
    type: 'phase_complete',
    phase: 'projects',
    count: parsed.length,
    warnings,
  })
  return { count: parsed.length, warnings }
}

// ── Streaming import: Tags ────────────────────────────────────────────────────

async function streamImportTags(
  emit: Emitter,
  {
    workspace,
    sheetId,
    sheets,
  }: Awaited<ReturnType<typeof resolveWorkspaceSheet>>,
): Promise<{ count: number; warnings: string[] }> {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: `${CATALOG_TAB_TAGS}!A2:D`,
  })
  const parsed = parseTagRows(res.data.values ?? [])
  if (parsed.length === 0) {
    emit({ type: 'phase', phase: 'tags', total: 0 })
    emit({ type: 'phase_complete', phase: 'tags', count: 0, warnings: [] })
    return { count: 0, warnings: [] }
  }

  emit({ type: 'phase', phase: 'tags', total: parsed.length })

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
  let current = 0

  for (const t of parsed) {
    current++
    const existing =
      (t.id ? byIdMap.get(t.id) : null) ??
      byNameMap.get(t.name.toLowerCase()) ??
      null

    if (existing) {
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
    } else {
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

  emit({
    type: 'phase_complete',
    phase: 'tags',
    count: parsed.length,
    warnings,
  })
  return { count: parsed.length, warnings }
}

// ── Public entry points ───────────────────────────────────────────────────────

export type ImportType = 'clients' | 'projects' | 'tags' | 'all'

export async function runStreamingImport(
  type: ImportType,
  emit: Emitter,
): Promise<void> {
  try {
    const sheet = await resolveWorkspaceSheet()

    let totalClients = 0
    let totalProjects = 0
    let totalTags = 0
    const allWarnings: string[] = []

    if (type === 'all' || type === 'clients') {
      const result = await streamImportClients(emit, sheet)
      totalClients = result.count
      allWarnings.push(...result.warnings)
    }

    if (type === 'all' || type === 'projects') {
      const result = await streamImportProjects(emit, sheet)
      totalProjects = result.count
      allWarnings.push(...result.warnings)
    }

    if (type === 'all' || type === 'tags') {
      const result = await streamImportTags(emit, sheet)
      totalTags = result.count
      allWarnings.push(...result.warnings)
    }

    emit({
      type: 'complete',
      clients: totalClients,
      projects: totalProjects,
      tags: totalTags,
      warnings: allWarnings,
    })
  } catch (err) {
    emit({
      type: 'error',
      message:
        err instanceof Error ? err.message : 'Import failed unexpectedly',
    })
  }
}
