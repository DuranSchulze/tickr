import { Client } from 'pg'
import { ENTRY_SOURCE_ERROR_MARGIN_SECONDS } from '../src/lib/time-tracker/entry-source'

const applyChanges = process.argv.includes('--apply')
const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.')
}

const client = new Client({ connectionString })

async function getClassificationSummary() {
  const result = await client.query<{
    completed_without_source: number
    ongoing_without_source: number
    would_be_timer: number
    would_be_manual: number
    existing_timer: number
    existing_manual: number
  }>(
    `
      SELECT
        count(*) FILTER (
          WHERE entry_source IS NULL AND ended_at IS NOT NULL
        )::int AS completed_without_source,
        count(*) FILTER (
          WHERE entry_source IS NULL AND ended_at IS NULL
        )::int AS ongoing_without_source,
        count(*) FILTER (
          WHERE entry_source IS NULL
            AND ended_at IS NOT NULL
            AND abs(extract(epoch FROM (created_at - started_at))) <= $1
            AND abs(extract(epoch FROM (updated_at - ended_at))) <= $1
        )::int AS would_be_timer,
        count(*) FILTER (
          WHERE entry_source IS NULL
            AND ended_at IS NOT NULL
            AND (
              abs(extract(epoch FROM (created_at - started_at))) > $1
              OR abs(extract(epoch FROM (updated_at - ended_at))) > $1
            )
        )::int AS would_be_manual,
        count(*) FILTER (WHERE entry_source = 'TIMER')::int AS existing_timer,
        count(*) FILTER (WHERE entry_source = 'MANUAL')::int AS existing_manual
      FROM time_entries
    `,
    [ENTRY_SOURCE_ERROR_MARGIN_SECONDS],
  )

  return result.rows[0]
}

async function main() {
  await client.connect()

  const before = await getClassificationSummary()
  console.log('Time-entry source backfill preview')
  console.table(before)
  console.log(
    `Rule: TIMER when created/start and updated/end are both within ${ENTRY_SOURCE_ERROR_MARGIN_SECONDS}s; otherwise MANUAL.`,
  )

  if (!applyChanges) {
    console.log(
      'Dry run only. Re-run with --apply to update completed records.',
    )
    return
  }

  await client.query('BEGIN')
  try {
    const updated = await client.query<{
      updated: number
      timers: number
      manuals: number
    }>(
      `
        WITH classified AS (
          UPDATE time_entries
          SET entry_source = (
            CASE
              WHEN abs(extract(epoch FROM (created_at - started_at))) <= $1
                AND abs(extract(epoch FROM (updated_at - ended_at))) <= $1
              THEN 'TIMER'
              ELSE 'MANUAL'
            END
          )::"TimeEntrySource"
          WHERE entry_source IS NULL
            AND ended_at IS NOT NULL
          RETURNING entry_source
        )
        SELECT
          count(*)::int AS updated,
          count(*) FILTER (WHERE entry_source = 'TIMER')::int AS timers,
          count(*) FILTER (WHERE entry_source = 'MANUAL')::int AS manuals
        FROM classified
      `,
      [ENTRY_SOURCE_ERROR_MARGIN_SECONDS],
    )
    await client.query('COMMIT')
    console.table(updated.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }

  const after = await getClassificationSummary()
  console.log('Backfill complete')
  console.table(after)
}

try {
  await main()
} finally {
  await client.end()
}
