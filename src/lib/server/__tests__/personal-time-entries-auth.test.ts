import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireExternalApiKey } from '../integrations/external-api-auth.server'

const { verify, membership, audit, select } = vi.hoisted(() => ({
  verify: vi.fn(),
  membership: vi.fn(),
  audit: vi.fn().mockResolvedValue(undefined),
  select: vi.fn(),
}))
vi.mock('#/db', () => ({ db: { select } }))
vi.mock('../integrations/external-api-jwt.server', () => ({
  looksLikeJwt: () => true,
  verifyExternalApiJwt: verify,
}))
vi.mock('../integrations/external-api-user-auth.server', () => ({
  resolveTracklyWorkspaceMembership: vi.fn(),
  verifyTracklyUserCredentials: vi.fn(),
}))
vi.mock('../integrations/api-keys.server', () => ({ hashApiKey: vi.fn() }))
vi.mock('../tracker/audit/audit-logger.server', () => ({
  createAuditLog: audit,
}))
beforeEach(() => {
  vi.clearAllMocks()
  const builder = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
    limit: membership,
  }
  builder.from.mockReturnValue(builder)
  builder.innerJoin.mockReturnValue(builder)
  builder.where.mockReturnValue(builder)
  select.mockReturnValue(builder)
  verify.mockResolvedValue({
    type: 'user_jwt',
    userId: 'self',
    workspaceId: 'origin',
  })
})
const request = () =>
  new Request('http://localhost/api/v1/time-entries', {
    headers: { Authorization: 'Bearer user.jwt.token' },
  })
describe('user JWT originating membership checks', () => {
  it('requires authentication before querying memberships', async () => {
    await expect(
      requireExternalApiKey(
        new Request('http://localhost/api/v1/time-entries'),
      ),
    ).rejects.toMatchObject({ status: 401 })
    expect(select).not.toHaveBeenCalled()
  })
  it('rejects tokens failing signature or expiry verification', async () => {
    verify.mockResolvedValue(null)
    await expect(requireExternalApiKey(request())).rejects.toMatchObject({
      status: 401,
    })
    expect(select).not.toHaveBeenCalled()
  })
  it('rejects a removed originating membership even when another membership exists', async () => {
    membership.mockResolvedValue([])
    await expect(requireExternalApiKey(request())).rejects.toMatchObject({
      status: 401,
      code: 'invalid_token',
    })
  })
  it.each(['DISABLED', 'INVITED'])(
    'rejects an inactive originating membership (%s)',
    async (status) => {
      membership.mockResolvedValue([
        {
          member: { id: 'member', userId: 'self', status },
          workspace: { id: 'origin' },
        },
      ])
      await expect(requireExternalApiKey(request())).rejects.toMatchObject({
        status: 403,
        code: 'workspace_access_denied',
      })
    },
  )
  it('provides authenticated identity only after the active membership check', async () => {
    membership.mockResolvedValue([
      {
        member: { id: 'member', userId: 'self', status: 'ACTIVE' },
        workspace: {
          id: 'origin',
          name: 'Origin',
          slug: 'origin',
          timezone: 'UTC',
          billableCurrency: 'PHP',
        },
      },
    ])
    expect(await requireExternalApiKey(request())).toMatchObject({
      userId: 'self',
      workspaceId: 'origin',
      keyId: null,
      developerId: null,
    })
  })
})
