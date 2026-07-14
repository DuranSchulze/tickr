import { describe, expect, it } from 'vitest'
import { deriveWorkspaceSubscriptionAccess } from '#/lib/subscriptions/access'

const NOW = new Date('2026-07-14T00:00:00.000Z')

function state(
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'EXPIRED',
  end: string,
) {
  return deriveWorkspaceSubscriptionAccess(
    {
      status,
      trialEndsAt: status === 'TRIALING' ? end : null,
      currentPeriodEndsAt: end,
      cancelAtPeriodEnd: status === 'CANCELED',
    },
    NOW,
  )
}

describe('deriveWorkspaceSubscriptionAccess', () => {
  it('always allows a permanently billing-exempt workspace', () => {
    expect(
      deriveWorkspaceSubscriptionAccess(
        {
          billingExempt: true,
          status: 'EXPIRED',
          trialEndsAt: null,
          currentPeriodEndsAt: '2020-01-01T00:00:00.000Z',
          cancelAtPeriodEnd: false,
        },
        NOW,
      ),
    ).toEqual({
      canAccess: true,
      isReadOnly: false,
      reason: 'exempt',
      daysRemaining: 0,
    })
  })

  it('allows an unexpired trial and reports rounded-up days remaining', () => {
    expect(state('TRIALING', '2026-07-15T12:00:00.000Z')).toEqual({
      canAccess: true,
      isReadOnly: false,
      reason: 'trial',
      daysRemaining: 2,
    })
  })

  it('locks an expired trial', () => {
    expect(state('TRIALING', '2026-07-13T23:59:59.000Z')).toMatchObject({
      canAccess: false,
      isReadOnly: true,
      reason: 'expired',
    })
  })

  it('keeps an active paid period writable', () => {
    expect(state('ACTIVE', '2026-08-14T00:00:00.000Z')).toMatchObject({
      canAccess: true,
      isReadOnly: false,
      reason: 'active',
    })
  })

  it('makes a past-due workspace read-only', () => {
    expect(state('PAST_DUE', '2026-07-13T00:00:00.000Z')).toEqual({
      canAccess: true,
      isReadOnly: true,
      reason: 'past_due',
      daysRemaining: 0,
    })
  })

  it('allows a canceled plan through its paid period, then locks it', () => {
    expect(state('CANCELED', '2026-07-20T00:00:00.000Z').canAccess).toBe(true)
    expect(state('CANCELED', '2026-07-13T00:00:00.000Z').canAccess).toBe(false)
  })
})
