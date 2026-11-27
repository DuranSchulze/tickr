import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from 'pg'
import { isUniqueViolation } from '../tracker/shared/client-mutation.server'

/**
 * Offline-mode REQ-2, check C2: the database itself refuses a second entry
 * with the same (workspace, member, client_mutation_id). Runs only when
 * OFFLINE_DB_TEST_URL points at a non-production branch with migration 0030.
 * Everything happens inside one transaction that is always rolled back.
 */
const connectionString = process.env.OFFLINE_DB_TEST_URL
const client = new Client({ connectionString, connectionTimeoutMillis: 10000 })

describe.skipIf(!connectionString)('client_mutation_id on PostgreSQL', () => {
  beforeAll(async () => {
    await client.connect()
    await client.query('begin')
  })
  afterAll(async () => {
    await client.query('rollback').catch(() => undefined)
    await client.end()
  })

  it('allows one entry per mutation id and member', async () => {
    const member = await client.query<{ id: string; workspace_id: string }>(
      'select id, workspace_id from workspace_members limit 1',
    )
    expect(member.rows).toHaveLength(1)
    const { id: memberId, workspace_id: workspaceId } = member.rows[0]
    const mutationId = crypto.randomUUID()
    const insert = (entryId: string) =>
      client.query(
        `insert into time_entries (id, workspace_id, workspace_member_id, description, started_at, client_mutation_id)
         values ($1, $2, $3, 'offline dedupe test', now(), $4)`,
        [entryId, workspaceId, memberId, mutationId],
      )

    await insert('offline_dedupe_a')
    await client.query('savepoint second')
    const second = await insert('offline_dedupe_b').catch((err) => err)
    await client.query('rollback to savepoint second')

    expect(isUniqueViolation(second)).toBe(true)
    const count = await client.query<{ n: number }>(
      'select count(*)::int as n from time_entries where client_mutation_id = $1',
      [mutationId],
    )
    expect(count.rows[0].n).toBe(1)
  })

  it('does not constrain online entries without an id', async () => {
    const nulls = await client.query<{ n: number }>(
      'select count(*)::int as n from time_entries where client_mutation_id is null',
    )
    expect(nulls.rows[0].n).toBeGreaterThan(1)
  })
})
