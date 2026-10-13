import { beforeAll, describe, expect, it } from 'vitest'
import { SignJWT } from 'jose'
import {
  looksLikeJwt,
  signApiKeyJwt,
  signDeveloperJwt,
  signUserJwt,
  verifyExternalApiJwt,
} from '../integrations/external-api-jwt.server'
import {
  externalApiLoginSchema,
  externalApiRegisterSchema,
  externalApiSignInSchema,
} from '../integrations/external-api.shared'

const TEST_SECRET = 'test-secret-for-external-api-jwt-tests'

beforeAll(() => {
  process.env.EXTERNAL_API_JWT_SECRET = TEST_SECRET
})

describe('external API JWT', () => {
  it('signs and verifies a token round trip', async () => {
    const { token, expiresInSeconds, expiresAt } = await signApiKeyJwt({
      keyId: 'key_123',
      workspaceId: 'ws_456',
    })

    expect(expiresInSeconds).toBe(3600)
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now())

    const payload = await verifyExternalApiJwt(token)
    expect(payload).toEqual({
      keyId: 'key_123',
      workspaceId: 'ws_456',
      type: 'api_key_jwt',
    })
  })

  it('rejects a tampered token', async () => {
    const { token } = await signApiKeyJwt({
      keyId: 'key_123',
      workspaceId: 'ws_456',
    })
    const tampered = `${token.slice(0, -2)}xx`
    expect(await verifyExternalApiJwt(tampered)).toBeNull()
  })

  it('rejects an expired token', async () => {
    const expired = await new SignJWT({
      keyId: 'key_123',
      workspaceId: 'ws_456',
      type: 'api_key_jwt',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(TEST_SECRET))

    expect(await verifyExternalApiJwt(expired)).toBeNull()
  })

  it('rejects a token with unexpected claims', async () => {
    const wrongType = await new SignJWT({
      sub: 'someone-else',
      type: 'session',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(new TextEncoder().encode(TEST_SECRET))

    expect(await verifyExternalApiJwt(wrongType)).toBeNull()
  })

  it('rejects a token signed with a different secret', async () => {
    const foreign = await new SignJWT({
      keyId: 'key_123',
      workspaceId: 'ws_456',
      type: 'api_key_jwt',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(new TextEncoder().encode('some-other-secret'))

    expect(await verifyExternalApiJwt(foreign)).toBeNull()
  })

  it('distinguishes JWTs from raw API keys', () => {
    expect(looksLikeJwt('tickr_abc.def.ghi')).toBe(true)
    expect(looksLikeJwt('tickr_abcdefghijklmnopqrstuvwxyz')).toBe(false)
  })

  it('refuses to sign with the auth master secret when the dedicated secret is missing', async () => {
    const originalExternal = process.env.EXTERNAL_API_JWT_SECRET
    const originalAuth = process.env.BETTER_AUTH_SECRET
    delete process.env.EXTERNAL_API_JWT_SECRET
    process.env.BETTER_AUTH_SECRET = 'auth-master-secret'

    try {
      await expect(
        signApiKeyJwt({ keyId: 'key_123', workspaceId: 'ws_456' }),
      ).rejects.toThrow('EXTERNAL_API_JWT_SECRET is not configured')
    } finally {
      if (originalExternal === undefined) {
        delete process.env.EXTERNAL_API_JWT_SECRET
      } else {
        process.env.EXTERNAL_API_JWT_SECRET = originalExternal
      }
      if (originalAuth === undefined) {
        delete process.env.BETTER_AUTH_SECRET
      } else {
        process.env.BETTER_AUTH_SECRET = originalAuth
      }
    }
  })

  it('signs and verifies a developer token with high-level access', async () => {
    const { token } = await signDeveloperJwt({
      developerId: 'dev_123',
      workspaceId: 'ws_456',
      permissionLevel: 'OWNER',
    })
    expect(await verifyExternalApiJwt(token)).toEqual({
      developerId: 'dev_123',
      workspaceId: 'ws_456',
      permissionLevel: 'OWNER',
      type: 'developer_jwt',
    })
  })

  it('rejects a developer token with an invalid permission level', async () => {
    const bad = await new SignJWT({
      developerId: 'dev_123',
      workspaceId: 'ws_456',
      permissionLevel: 'EMPLOYEE',
      type: 'developer_jwt',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(new TextEncoder().encode(TEST_SECRET))

    expect(await verifyExternalApiJwt(bad)).toBeNull()
  })

  it('signs and verifies a user token', async () => {
    const { token } = await signUserJwt({
      userId: 'usr_123',
      workspaceId: 'ws_456',
    })
    expect(await verifyExternalApiJwt(token)).toEqual({
      userId: 'usr_123',
      workspaceId: 'ws_456',
      type: 'user_jwt',
    })
  })

  it('rejects a user token missing its identifier', async () => {
    const bad = await new SignJWT({
      workspaceId: 'ws_456',
      type: 'user_jwt',
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(new TextEncoder().encode(TEST_SECRET))

    expect(await verifyExternalApiJwt(bad)).toBeNull()
  })
})

describe('external API sign-in validation', () => {
  it('accepts a valid API key body', () => {
    expect(
      externalApiSignInSchema.parse({
        apiKey: ' tickr_abcdefghijklmnopqrstuvwxyz0123456789 ',
      }),
    ).toEqual({
      apiKey: 'tickr_abcdefghijklmnopqrstuvwxyz0123456789',
    })
  })

  it('rejects missing, empty, or short keys', () => {
    expect(() => externalApiSignInSchema.parse({})).toThrow()
    expect(() => externalApiSignInSchema.parse({ apiKey: '' })).toThrow()
    expect(() => externalApiSignInSchema.parse({ apiKey: 'short' })).toThrow()
  })
})

describe('external API account auth validation', () => {
  it('normalizes and accepts a valid login body', () => {
    expect(
      externalApiLoginSchema.parse({
        email: '  Jane@Acme.com ',
        password: 'correct horse battery',
      }),
    ).toEqual({
      email: 'jane@acme.com',
      password: 'correct horse battery',
      workspaceSlug: undefined,
    })
  })

  it('rejects a login without email or password', () => {
    expect(() => externalApiLoginSchema.parse({})).toThrow()
    expect(() =>
      externalApiLoginSchema.parse({ email: 'jane@acme.com' }),
    ).toThrow()
    expect(() =>
      externalApiLoginSchema.parse({ email: 'not-an-email', password: 'x' }),
    ).toThrow()
  })

  it('accepts a valid registration body and trims the name', () => {
    expect(
      externalApiRegisterSchema.parse({
        name: '  Jane Doe ',
        email: 'JANE@acme.com',
        password: 'longenough',
      }),
    ).toEqual({
      name: 'Jane Doe',
      email: 'jane@acme.com',
      password: 'longenough',
      workspaceSlug: undefined,
    })
  })

  it('rejects a registration with a short password or name', () => {
    expect(() =>
      externalApiRegisterSchema.parse({
        name: 'J',
        email: 'jane@acme.com',
        password: 'longenough',
      }),
    ).toThrow()
    expect(() =>
      externalApiRegisterSchema.parse({
        name: 'Jane Doe',
        email: 'jane@acme.com',
        password: 'short',
      }),
    ).toThrow()
  })
})
