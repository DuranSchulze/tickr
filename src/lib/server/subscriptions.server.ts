import '@tanstack/react-start/server-only'
import { and, asc, desc, eq } from 'drizzle-orm'
import { getRequest } from '@tanstack/react-start/server'
import { db } from '#/db'
import {
  subscriptionInvoices,
  subscriptionPayments,
  subscriptionPlans,
  subscriptions,
  workspaces,
} from '#/db/schema'
import { deriveWorkspaceSubscriptionAccess } from '#/lib/subscriptions/access'
import { assertTrustedOrigin } from './csrf.server'
import { requireWorkspaceAccess } from './workspace-access.server'

export type PlanSlug = 'team' | 'business'

const TRIAL_DAYS = 14

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000)
}

function addMonth(date: Date) {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return next
}

export async function listPublicSubscriptionPlans() {
  return db
    .select()
    .from(subscriptionPlans)
    .where(
      and(
        eq(subscriptionPlans.isActive, true),
        eq(subscriptionPlans.isPublic, true),
      ),
    )
    .orderBy(asc(subscriptionPlans.sortOrder))
}

export async function createTrialSubscription(
  workspaceId: string,
  planSlug: PlanSlug = 'team',
) {
  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(
      and(
        eq(subscriptionPlans.slug, planSlug),
        eq(subscriptionPlans.isActive, true),
      ),
    )
    .limit(1)

  if (!plan) {
    throw new Error(
      `The ${planSlug} subscription plan is unavailable. Run the latest database migration.`,
    )
  }

  const now = new Date()
  const trialEndsAt = addDays(now, TRIAL_DAYS)
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      workspaceId,
      planId: plan.id,
      status: 'TRIALING',
      trialStartedAt: now,
      trialEndsAt,
      currentPeriodStartedAt: now,
      currentPeriodEndsAt: trialEndsAt,
    })
    .onConflictDoNothing({ target: subscriptions.workspaceId })
    .returning()

  return subscription
}

async function getSubscriptionRow(workspaceId: string) {
  const [row] = await db
    .select({
      subscription: subscriptions,
      plan: subscriptionPlans,
      billingExempt: workspaces.billingExempt,
    })
    .from(subscriptions)
    .innerJoin(
      subscriptionPlans,
      eq(subscriptions.planId, subscriptionPlans.id),
    )
    .innerJoin(workspaces, eq(subscriptions.workspaceId, workspaces.id))
    .where(eq(subscriptions.workspaceId, workspaceId))
    .limit(1)
  return row ?? null
}

export async function getWorkspaceSubscription(workspaceId: string) {
  const row = await getSubscriptionRow(workspaceId)
  if (!row) {
    throw new Error(
      'This workspace does not have a subscription. Run the latest database migration or ask its owner to create a new workspace.',
    )
  }

  const access = deriveWorkspaceSubscriptionAccess({
    ...row.subscription,
    billingExempt: row.billingExempt,
  })
  return {
    subscription: {
      ...row.subscription,
      trialStartedAt: row.subscription.trialStartedAt?.toISOString() ?? null,
      trialEndsAt: row.subscription.trialEndsAt?.toISOString() ?? null,
      currentPeriodStartedAt:
        row.subscription.currentPeriodStartedAt.toISOString(),
      currentPeriodEndsAt: row.subscription.currentPeriodEndsAt.toISOString(),
      canceledAt: row.subscription.canceledAt?.toISOString() ?? null,
      dataRetentionUntil:
        row.subscription.dataRetentionUntil?.toISOString() ?? null,
      createdAt: row.subscription.createdAt.toISOString(),
      updatedAt: row.subscription.updatedAt.toISOString(),
    },
    plan: row.plan,
    access,
  }
}

export async function getCurrentWorkspaceSubscription() {
  const access = await requireWorkspaceAccess(undefined, {
    skipSubscriptionGate: true,
  })
  const [state, invoices] = await Promise.all([
    getWorkspaceSubscription(access.workspace.id),
    db
      .select()
      .from(subscriptionInvoices)
      .where(eq(subscriptionInvoices.workspaceId, access.workspace.id))
      .orderBy(desc(subscriptionInvoices.createdAt))
      .limit(20),
  ])

  return {
    ...state,
    permissionLevel: access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE',
    invoices: invoices.map((invoice) => ({
      ...invoice,
      expiresAt: invoice.expiresAt?.toISOString() ?? null,
      paidAt: invoice.paidAt?.toISOString() ?? null,
      metadata: undefined,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
    })),
  }
}

function cleanName(value: string, fallback: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9 ]/g, ' ').trim()
  return cleaned.slice(0, 50) || fallback
}

function getPublicAppUrl() {
  const configured = process.env.APP_URL || process.env.BETTER_AUTH_URL
  const origin = configured || new URL(getRequest().url).origin
  if (!origin.startsWith('https://')) {
    throw new Error(
      'Xendit checkout requires a public HTTPS APP_URL. Set APP_URL to your deployed site or HTTPS development tunnel.',
    )
  }
  return origin.replace(/\/$/, '')
}

type XenditSessionResponse = {
  payment_session_id: string
  payment_link_url: string | null
  reference_id: string
  customer_id?: string
  expires_at?: string
}

async function createXenditSession(input: {
  referenceId: string
  planName: string
  amount: number
  workspaceId: string
  subscriptionId: string
  email: string
  name: string
}) {
  const apiKey = process.env.XENDIT_SECRET_KEY
  if (!apiKey) {
    throw new Error(
      'Xendit checkout is not configured. Add XENDIT_SECRET_KEY to the server environment.',
    )
  }

  const appUrl = getPublicAppUrl()
  const [given, ...surnameParts] = cleanName(
    input.name,
    'Workspace Owner',
  ).split(/\s+/)
  const now = new Date()
  const anchor = new Date(now)
  if (anchor.getUTCDate() > 28) {
    anchor.setUTCMonth(anchor.getUTCMonth() + 1, 1)
  }

  const response = await fetch('https://api.xendit.co/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      reference_id: input.referenceId,
      session_type: 'SUBSCRIPTION',
      mode: 'PAYMENT_LINK',
      amount: input.amount,
      currency: 'USD',
      country: 'PH',
      customer: {
        reference_id: `owner${input.workspaceId.replace(/[^a-zA-Z0-9]/g, '')}`,
        type: 'INDIVIDUAL',
        email: input.email.slice(0, 50),
        individual_detail: {
          given_names: given,
          surname: surnameParts.join(' ').slice(0, 50) || undefined,
        },
      },
      locale: 'en',
      description: `Trackly ${input.planName} monthly workspace plan`,
      subscription: {
        schedule: {
          interval: 'MONTH',
          interval_count: 1,
          total_recurrence: 120,
          anchor_date: anchor.toISOString(),
          retry_interval: 'DAY',
          retry_interval_count: 1,
          total_retry: 3,
          failed_attempt_notifications: [1, 2, 3],
          payment_link_for_failed_attempt: true,
        },
        failed_cycle_action: 'RESUME',
      },
      success_return_url: `${appUrl}/app/workspace/billing?checkout=success`,
      cancel_return_url: `${appUrl}/app/workspace/billing?checkout=canceled`,
      metadata: {
        workspace_id: input.workspaceId,
        subscription_id: input.subscriptionId,
      },
    }),
  })

  const body = (await response.json()) as
    | XenditSessionResponse
    | { message?: string; error_code?: string }
  if (!response.ok) {
    const error = body as { message?: string; error_code?: string }
    throw new Error(
      `Xendit checkout failed: ${error.message || error.error_code || response.statusText}`,
    )
  }
  return body as XenditSessionResponse
}

export async function createSubscriptionCheckout(planSlug: PlanSlug) {
  assertTrustedOrigin()
  const access = await requireWorkspaceAccess(undefined, {
    skipSubscriptionGate: true,
  })
  if (access.member.workspaceRole?.permissionLevel !== 'OWNER') {
    throw new Error('Only a workspace owner can choose or pay for a plan.')
  }
  if (access.workspace.billingExempt) {
    throw new Error(
      'This workspace is permanently billing-exempt and does not need checkout.',
    )
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(
      and(
        eq(subscriptionPlans.slug, planSlug),
        eq(subscriptionPlans.isActive, true),
        eq(subscriptionPlans.isPublic, true),
      ),
    )
    .limit(1)
  if (!plan) throw new Error('That subscription plan is unavailable.')

  let state = await getSubscriptionRow(access.workspace.id)
  if (!state) {
    await createTrialSubscription(access.workspace.id, planSlug)
    state = await getSubscriptionRow(access.workspace.id)
  }
  if (!state) throw new Error('Could not initialize the subscription.')

  const referenceId = `tickr_${access.workspace.id}_${Date.now()}`.slice(0, 64)
  const session = await createXenditSession({
    referenceId,
    planName: plan.name,
    amount: plan.monthlyPriceCents / 100,
    workspaceId: access.workspace.id,
    subscriptionId: state.subscription.id,
    email: access.user.email,
    name: access.user.name,
  })
  if (!session.payment_link_url) {
    throw new Error('Xendit did not return a hosted checkout URL.')
  }
  const paymentLinkUrl = session.payment_link_url

  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({
        planId: plan.id,
        xenditPaymentSessionId: session.payment_session_id,
        xenditCustomerId: session.customer_id,
      })
      .where(eq(subscriptions.id, state.subscription.id))
    await tx.insert(subscriptionInvoices).values({
      subscriptionId: state.subscription.id,
      workspaceId: access.workspace.id,
      xenditPaymentSessionId: session.payment_session_id,
      xenditReferenceId: referenceId,
      paymentLinkUrl,
      amountCents: plan.monthlyPriceCents,
      currency: plan.currency,
      expiresAt: session.expires_at ? new Date(session.expires_at) : null,
      metadata: { planSlug },
    })
  })

  return { checkoutUrl: paymentLinkUrl }
}

type WebhookData = Record<string, unknown>

function readString(data: WebhookData, ...keys: string[]) {
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'string' && value) return value
  }
  return null
}

export async function processXenditWebhook(payload: unknown) {
  if (!payload || typeof payload !== 'object') return
  const envelope = payload as { event?: unknown; data?: unknown }
  const event = typeof envelope.event === 'string' ? envelope.event : ''
  const data =
    envelope.data && typeof envelope.data === 'object'
      ? (envelope.data as WebhookData)
      : (payload as WebhookData)
  const sessionId = readString(data, 'payment_session_id', 'id')
  const referenceId = readString(data, 'reference_id', 'external_id')

  const [invoice] = sessionId
    ? await db
        .select()
        .from(subscriptionInvoices)
        .where(eq(subscriptionInvoices.xenditPaymentSessionId, sessionId))
        .limit(1)
    : referenceId
      ? await db
          .select()
          .from(subscriptionInvoices)
          .where(eq(subscriptionInvoices.xenditReferenceId, referenceId))
          .limit(1)
      : []
  if (!invoice) return

  const paymentId =
    readString(data, 'payment_id', 'payment_request_id', 'cycle_id') ||
    `${event}:${sessionId || referenceId}`
  const isSuccess =
    event === 'payment_session.completed' ||
    event === 'payment.succeeded' ||
    event === 'recurring.cycle.succeeded' ||
    (data.status === 'PAID' && typeof data.status === 'string')
  const isFailure =
    event === 'recurring.cycle.failed' ||
    event === 'payment.failure' ||
    event === 'payment.failed'
  const isExpired =
    event === 'payment_session.expired' || data.status === 'EXPIRED'

  if (isSuccess) {
    const now = new Date()
    const periodEnd = addMonth(now)
    await db.transaction(async (tx) => {
      const [createdPayment] = await tx
        .insert(subscriptionPayments)
        .values({
          subscriptionId: invoice.subscriptionId,
          invoiceId: invoice.id,
          workspaceId: invoice.workspaceId,
          xenditPaymentId: paymentId,
          amountCents: invoice.amountCents,
          currency: invoice.currency,
          status: 'PAID',
          paymentMethod: readString(data, 'payment_method', 'channel_code'),
          paidAt: now,
          metadata: data,
        })
        .onConflictDoNothing({ target: subscriptionPayments.xenditPaymentId })
        .returning({ id: subscriptionPayments.id })
      if (!createdPayment) return

      await tx
        .update(subscriptionInvoices)
        .set({ status: 'PAID', paidAt: now })
        .where(eq(subscriptionInvoices.id, invoice.id))
      await tx
        .update(subscriptions)
        .set({
          status: 'ACTIVE',
          currentPeriodStartedAt: now,
          currentPeriodEndsAt: periodEnd,
          cancelAtPeriodEnd: false,
        })
        .where(eq(subscriptions.id, invoice.subscriptionId))
    })
  } else if (isFailure) {
    await db
      .update(subscriptions)
      .set({ status: 'PAST_DUE' })
      .where(eq(subscriptions.id, invoice.subscriptionId))
  } else if (isExpired) {
    await db
      .update(subscriptionInvoices)
      .set({ status: 'FAILED' })
      .where(eq(subscriptionInvoices.id, invoice.id))
  }
}
