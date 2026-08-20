import { describe, expect, it } from 'vitest'
import {
  hashPassword,
  verifyPassword,
} from '../integrations/developer-accounts.server'
import {
  createDeveloperAccountSchema,
  developerSignInSchema,
} from '../integrations/developer-accounts.shared'

describe('developer account password hashing', () => {
  it('verifies the correct password', () => {
    const stored = hashPassword('a-strong-password-123')
    expect(verifyPassword('a-strong-password-123', stored)).toBe(true)
  })

  it('rejects a wrong password', () => {
    const stored = hashPassword('a-strong-password-123')
    expect(verifyPassword('wrong-password', stored)).toBe(false)
  })

  it('produces unique salts per hash', () => {
    const first = hashPassword('same-password')
    const second = hashPassword('same-password')
    expect(first).not.toBe(second)
    expect(verifyPassword('same-password', second)).toBe(true)
  })

  it('rejects malformed stored hashes', () => {
    expect(verifyPassword('anything', 'not-a-hash')).toBe(false)
    expect(verifyPassword('anything', '')).toBe(false)
  })
})

describe('developer account validation', () => {
  it('accepts a valid create payload with OWNER default', () => {
    expect(
      createDeveloperAccountSchema.parse({
        name: '  Payroll Integration  ',
        email: 'Dev@Example.com',
        password: 'a-strong-password',
      }),
    ).toEqual({
      name: 'Payroll Integration',
      email: 'dev@example.com',
      password: 'a-strong-password',
      permissionLevel: 'OWNER',
    })
  })

  it('rejects weak passwords and bad emails', () => {
    expect(() =>
      createDeveloperAccountSchema.parse({
        name: 'Dev',
        email: 'dev@example.com',
        password: 'short',
      }),
    ).toThrow()
    expect(() =>
      createDeveloperAccountSchema.parse({
        name: 'Dev',
        email: 'not-an-email',
        password: 'a-strong-password',
      }),
    ).toThrow()
  })

  it('accepts and normalizes developer sign-in payloads', () => {
    expect(
      developerSignInSchema.parse({
        email: '  DEV@Example.com  ',
        password: 'a-strong-password',
      }),
    ).toEqual({
      email: 'dev@example.com',
      password: 'a-strong-password',
    })
  })
})
