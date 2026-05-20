export const CATALOG_TAB_CLIENTS = 'Clients'
export const CATALOG_TAB_PROJECTS = 'Projects'
export const CATALOG_TAB_TAGS = 'Tags'

export const CLIENTS_HEADERS = ['Name', 'Status', 'ID'] as const
export const PROJECTS_HEADERS = [
  'Name',
  'Client Name',
  'Color',
  'Archived',
  'ID',
] as const
export const TAGS_HEADERS = ['Name', 'Color', 'Archived', 'ID'] as const

// --- Row builders (DB → Sheet) ---

export function buildClientRow(c: {
  name: string
  clientStatus: string
  id?: string
}): string[] {
  return [c.name, c.clientStatus, c.id ?? '']
}

export function buildProjectRow(p: {
  name: string
  clientName: string
  color: string
  archived: boolean
  id?: string
}): string[] {
  return [
    p.name,
    p.clientName,
    p.color,
    p.archived ? 'true' : 'false',
    p.id ?? '',
  ]
}

export function buildTagRow(t: {
  name: string
  color: string
  archived: boolean
  id?: string
}): string[] {
  return [t.name, t.color, t.archived ? 'true' : 'false', t.id ?? '']
}

// --- Row parsers (Sheet → DB) ---

export type ParsedClientRow = {
  name: string
  clientStatus: 'ACTIVE' | 'INACTIVE'
  id: string
  sheetRow: number
}

export type ParsedProjectRow = {
  name: string
  clientName: string
  color: string
  archived: boolean
  id: string
  sheetRow: number
}

export type ParsedTagRow = {
  name: string
  color: string
  archived: boolean
  id: string
  sheetRow: number
}

function isValidColor(v: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(v.trim())
}

// headerOffset is the 1-based sheet row of the first data row (default 2 = row after header).
// Tracking rawIndex preserves the correct sheet row even when blank rows are filtered out.

export function parseClientRows(
  rows: string[][],
  headerOffset = 2,
): ParsedClientRow[] {
  return rows
    .map((r, i) => ({ r, rawIndex: i }))
    .filter(({ r }) => r[0]?.trim())
    .map(({ r, rawIndex }) => ({
      name: r[0].trim(),
      clientStatus:
        r[1]?.trim().toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      id: r[2]?.trim() ?? '',
      sheetRow: rawIndex + headerOffset,
    }))
}

export function parseProjectRows(
  rows: string[][],
  headerOffset = 2,
): ParsedProjectRow[] {
  return rows
    .map((r, i) => ({ r, rawIndex: i }))
    .filter(({ r }) => r[0]?.trim())
    .map(({ r, rawIndex }) => ({
      name: r[0].trim(),
      clientName: r[1]?.trim() ?? '',
      color: isValidColor(r[2] ?? '') ? r[2].trim() : '#2563eb',
      archived: r[3]?.trim().toLowerCase() === 'true',
      id: r[4]?.trim() ?? '',
      sheetRow: rawIndex + headerOffset,
    }))
}

export function parseTagRows(
  rows: string[][],
  headerOffset = 2,
): ParsedTagRow[] {
  return rows
    .map((r, i) => ({ r, rawIndex: i }))
    .filter(({ r }) => r[0]?.trim())
    .map(({ r, rawIndex }) => ({
      name: r[0].trim(),
      color: isValidColor(r[1] ?? '') ? r[1].trim() : '#14b8a6',
      archived: r[2]?.trim().toLowerCase() === 'true',
      id: r[3]?.trim() ?? '',
      sheetRow: rawIndex + headerOffset,
    }))
}
