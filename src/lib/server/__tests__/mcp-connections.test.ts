import { beforeEach, describe, expect, it, vi } from 'vitest'

const batched: Array<{ toSQL: () => { sql: string; params: unknown[] } }> = []
const session: { current: unknown } = { current: null }

vi.mock('#/db', async () => {
  const { neon } = await import('@neondatabase/serverless')
  const { drizzle } = await import('drizzle-orm/neon-http')
  const schema = await import('#/db/schema')
  // Never connects: queries are only built, then captured by `batch`.
  const real = drizzle({
    client: neon('postgresql://user:pass@localhost/none'),
    schema,
  })
  return {
    db: {
      delete: real.delete.bind(real),
      batch: vi.fn(async (queries: typeof batched) => {
        batched.push(...queries)
        return []
      }),
    },
  }
})

vi.mock('../session.server', () => ({
  getSession: async () => session.current,
}))

const { disconnectApp } = await import('../mcp-connections.server')

beforeEach(() => {
  batched.length = 0
  session.current = { user: { id: 'user-a', name: 'A', email: 'a@x.co' } }
})

describe('disconnectApp · REQ-2', () => {
  it('deletes access tokens, refresh tokens and the consent for this user and app only', async () => {
    await disconnectApp('client-1')
    const statements = batched.map((query) => query.toSQL())
    expect(statements.map((s) => s.sql.split(' where ')[0])).toEqual([
      'delete from "oauth_access_tokens"',
      'delete from "oauth_refresh_tokens"',
      'delete from "oauth_consents"',
    ])
    for (const statement of statements) {
      expect(statement.sql).toMatch(/"user_id" = \$1 and .*"client_id" = \$2/)
      expect(statement.params).toEqual(['user-a', 'client-1'])
    }
  })

  it('refuses without a session and deletes nothing', async () => {
    session.current = null
    await expect(disconnectApp('client-1')).rejects.toThrow('UNAUTHORIZED')
    expect(batched).toHaveLength(0)
  })
})
