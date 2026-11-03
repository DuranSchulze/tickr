import { describe, expect, it } from 'vitest'
import { assertVerifiedMembershipClaim } from '../membership-verification'
import { externalApiRegisterSchema } from '../integrations/external-api.shared'

describe('invitation email ownership', () => {
  it.each([false, null, undefined])(
    'rejects an unverified claim (%s)',
    (verified) => {
      expect(() =>
        assertVerifiedMembershipClaim(verified, {
          userId: null,
          status: 'INVITED',
        }),
      ).toThrow('Verify your email')
      expect(() =>
        assertVerifiedMembershipClaim(verified, {
          userId: 'user',
          status: 'INVITED',
        }),
      ).toThrow('Verify your email')
    },
  )
  it('allows verified claims and keeps linked active members signed in', () => {
    expect(() =>
      assertVerifiedMembershipClaim(true, { userId: null, status: 'INVITED' }),
    ).not.toThrow()
    expect(() =>
      assertVerifiedMembershipClaim(false, {
        userId: 'user',
        status: 'ACTIVE',
      }),
    ).not.toThrow()
  })
})
describe('public API password policy', () => {
  it.each(['password1', 'Password1', 'PASSWORD1!', 'Password!', 'Aa1!'])(
    'rejects %s on the server',
    (password) => {
      expect(
        externalApiRegisterSchema.safeParse({
          name: 'Test',
          email: 'user@example.com',
          password,
        }).success,
      ).toBe(false)
    },
  )
  it('accepts the existing UI password policy', () => {
    expect(
      externalApiRegisterSchema.safeParse({
        name: 'Test',
        email: 'user@example.com',
        password: 'StrongPassword1!',
      }).success,
    ).toBe(true)
  })
})
