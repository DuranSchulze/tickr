import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ABUSE_ACCOUNT_IP_LIMIT,
  ABUSE_ACCOUNT_LIMIT,
  ABUSE_IP_LIMIT,
  ABUSE_WINDOW_SECONDS,
  buildAbuseBuckets,
  evaluateAdmission,
  recordAuthResult,
  resolveAuthAbuseMode,
  reserveAuthAttempt,
} from '../auth-abuse.server'

const SECRET = 'test-secret-with-at-least-32-characters'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('abuse mode resolution', () => {
  it('defaults to enforcement in production, including invalid configuration', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AUTH_ABUSE_MODE', '')
    expect(resolveAuthAbuseMode()).toBe('enforce')
    vi.stubEnv('AUTH_ABUSE_MODE', 'typo')
    expect(resolveAuthAbuseMode()).toBe('enforce')
  })
  it('defaults to shadow so a missing variable still collects signal', () => {
    vi.stubEnv('AUTH_ABUSE_MODE', '')
    expect(resolveAuthAbuseMode()).toBe('shadow')
  })

  it('accepts the documented modes case-insensitively', () => {
    vi.stubEnv('AUTH_ABUSE_MODE', ' OFF ')
    expect(resolveAuthAbuseMode()).toBe('off')
    vi.stubEnv('AUTH_ABUSE_MODE', 'Enforce')
    expect(resolveAuthAbuseMode()).toBe('enforce')
  })

  it('falls back to shadow for an unrecognized value instead of enforcing', () => {
    vi.stubEnv('AUTH_ABUSE_MODE', 'enabled')
    expect(resolveAuthAbuseMode()).toBe('shadow')
  })
})

describe('abuse bucket derivation', () => {
  const base = {
    secret: SECRET,
    operation: 'login' as const,
    email: 'User@Example.com',
    ip: '203.0.113.7',
  }

  it('produces stable 64-character hex keys', () => {
    const first = buildAbuseBuckets(base)
    const second = buildAbuseBuckets(base)
    expect(first).toEqual(second)
    for (const key of [first.accountIp, first.account, first.ip]) {
      expect(key).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  it('never embeds the raw email or IP in the key', () => {
    const buckets = buildAbuseBuckets(base)
    const serialized = JSON.stringify(buckets).toLowerCase()
    expect(serialized).not.toContain('user@example.com')
    expect(serialized).not.toContain('203.0.113.7')
  })

  it('isolates operations so one route cannot exhaust another route budget', () => {
    const login = buildAbuseBuckets(base)
    const register = buildAbuseBuckets({ ...base, operation: 'register' })
    expect(login.account).not.toBe(register.account)
  })

  it('changes with the secret and with the source IP', () => {
    const buckets = buildAbuseBuckets(base)
    expect(
      buildAbuseBuckets({ ...base, secret: `${SECRET}-rotated` }).account,
    ).not.toBe(buckets.account)
    expect(
      buildAbuseBuckets({ ...base, ip: '198.51.100.9' }).accountIp,
    ).not.toBe(buckets.accountIp)
  })

  it('drops account buckets without an email and the IP bucket for invalid input', () => {
    const buckets = buildAbuseBuckets({
      secret: SECRET,
      operation: 'login',
      email: null,
      ip: 'not-an-ip',
    })
    expect(buckets).toEqual({ accountIp: null, account: null, ip: null })
  })
})

describe('admission policy', () => {
  const under = { accountIp: 1, account: 1, ip: 1 }

  it('admits everyone when tracking is off', () => {
    expect(
      evaluateAdmission('off', {
        accountIp: ABUSE_ACCOUNT_IP_LIMIT + 1,
        account: ABUSE_ACCOUNT_LIMIT + 1,
        ip: ABUSE_IP_LIMIT + 1,
      }),
    ).toMatchObject({ admitted: true, reason: 'disabled', wouldBlock: false })
  })

  it('admits attempts below every threshold', () => {
    expect(evaluateAdmission('enforce', under)).toMatchObject({
      admitted: true,
      reason: 'ok',
      wouldBlock: false,
      retryAfterSeconds: 0,
    })
  })

  it('shadow mode reports a breach without ever denying it', () => {
    const decision = evaluateAdmission('shadow', {
      accountIp: ABUSE_ACCOUNT_IP_LIMIT + 1,
      account: 1,
      ip: 1,
    })
    expect(decision).toMatchObject({
      admitted: true,
      reason: 'shadow',
      wouldBlock: true,
      retryAfterSeconds: ABUSE_WINDOW_SECONDS,
    })
  })

  it('enforce mode denies at the account-plus-IP limit for the observation window', () => {
    expect(
      evaluateAdmission('enforce', {
        accountIp: ABUSE_ACCOUNT_IP_LIMIT + 1,
        account: 1,
        ip: 1,
      }),
    ).toMatchObject({
      admitted: false,
      reason: 'account_ip',
      retryAfterSeconds: ABUSE_WINDOW_SECONDS,
    })
  })

  it('enforce mode denies at the account-wide limit', () => {
    expect(
      evaluateAdmission('enforce', {
        accountIp: 1,
        account: ABUSE_ACCOUNT_LIMIT + 1,
        ip: 1,
      }),
    ).toMatchObject({ admitted: false, reason: 'account' })
  })

  it('enforce mode denies at the IP budget and holds for the full window', () => {
    expect(
      evaluateAdmission('enforce', {
        accountIp: 1,
        account: 1,
        ip: ABUSE_IP_LIMIT + 1,
      }),
    ).toMatchObject({
      admitted: false,
      reason: 'ip',
      retryAfterSeconds: ABUSE_WINDOW_SECONDS,
    })
  })
})

describe('recording outcomes', () => {
  it('does nothing when tracking is disabled', async () => {
    await expect(
      recordAuthResult(
        {
          admitted: true,
          mode: 'off',
          reason: 'disabled',
          wouldBlock: false,
          retryAfterSeconds: 0,
          resetBuckets: [],
        },
        'success',
      ),
    ).resolves.toBeUndefined()
  })

  it('ignores failures, which are already reflected by the reservation', async () => {
    await expect(
      recordAuthResult(
        {
          admitted: false,
          mode: 'enforce',
          reason: 'account_ip',
          wouldBlock: true,
          retryAfterSeconds: ABUSE_WINDOW_SECONDS,
          resetBuckets: ['a'.repeat(64)],
        },
        'failure',
      ),
    ).resolves.toBeUndefined()
  })
})

describe('fail-closed configuration', () => {
  it('does not bypass enforcement when the hashing secret is missing', async () => {
    vi.stubEnv('AUTH_ABUSE_HMAC_SECRET', '')
    vi.stubEnv('BETTER_AUTH_SECRET', '')
    const attempt = await reserveAuthAttempt({
      operation: 'login',
      request: new Request('https://app.example.com'),
      email: 'user@example.com',
      mode: 'enforce',
    })
    expect(attempt).toMatchObject({ admitted: false, reason: 'unavailable' })
  })
})
