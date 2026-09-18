// ── Types ──────────────────────────────────────────────────────────────────────

export type WritebackEntry = { row: number; id: string }

// ── Error formatting ──────────────────────────────────────────────────────────

export function friendlyDbError(err: unknown, entity: string): Error {
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

// ── Batch processing ──────────────────────────────────────────────────────────

/**
 * Run DB operations in parallel batches to avoid overwhelming the connection pool.
 */
export async function runInBatches<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  batchSize = 25,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    await Promise.all(items.slice(i, i + batchSize).map(fn))
  }
}

/**
 * Split an array into fixed-size chunks.
 *
 * PostgreSQL rejects any statement carrying more than 65,535 bind parameters,
 * so an `inArray(...)` built from an unbounded fetch is a latent hard failure
 * that only fires once a workspace has enough rows to succeed at scale. 1,000
 * keeps every statement far below the ceiling while still bounding round trips.
 */
export function chunkArray<T>(items: readonly T[], size = 1000): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

// ── Writeback ID computation ──────────────────────────────────────────────────

/**
 * Given parsed sheet rows and a map of sheetRow → database ID, compute which
 * rows need their ID column written back (rows that didn't have an ID, or whose
 * ID differed from the resolved database ID).
 */
export function computeWritebacks<
  T extends { sheetRow: number; id?: string | null },
>(parsed: readonly T[], resolvedIds: Map<number, string>): WritebackEntry[] {
  const writebacks: WritebackEntry[] = []
  for (const item of parsed) {
    const resultId = resolvedIds.get(item.sheetRow)
    if (resultId && item.id !== resultId) {
      writebacks.push({ row: item.sheetRow, id: resultId })
    }
  }
  return writebacks
}

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Deduplicate an array by case-insensitive name. Keeps the first occurrence of
 * each name. Useful for preventing duplicate-key conflicts on unique constraints
 * that include the name column.
 */
export function deduplicateByName<T extends { name: string }>(items: T[]): T[] {
  return [...new Map(items.map((r) => [r.name.toLowerCase(), r])).values()]
}

/**
 * Build a case-insensitive name → id lookup from a list of created records.
 */
export function createNameToIdMap(
  records: { id: string; name: string }[],
): Map<string, string> {
  return new Map(records.map((r) => [r.name.toLowerCase(), r.id]))
}
