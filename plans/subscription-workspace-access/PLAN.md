# Subscription-Based Workspace Access with Xendit

> **Status:** ✅ Finished

## Status

- [x] Plan created, reviewed, and aligned with existing Tickr infrastructure.
- [x] Database migration generated: subscription plans, subscriptions, payment transactions, Xendit checkout records.
- [x] Backend: Zod schemas, server functions, Xendit Payment Session checkout, replay-safe webhook handling, subscription lifecycle.
- [x] Frontend: Public pricing page, homepage plan selection, in-app owner billing, billing history, trial/status banners, gating UI.
- [x] Navigation, routing, and access control integrated.
- [x] Validation: typecheck, lint, production build, unit tests, migration, and browser flow QA completed. Live Xendit payment verification requires deployment credentials.

### Implemented product decisions

- Two monthly USD plans supersede the original placeholder tiers: **Team ($20/month)** and **Business ($50/month)**.
- Every newly created workspace starts with a 14-day trial; existing workspaces receive the same trial through migration `0014`.
- Billing is workspace-based and OWNER-only.
- Hosted checkout uses Xendit's current Payment Sessions subscription flow instead of the legacy Invoice Payment Link API.
- Live payment E2E remains unchecked until `XENDIT_SECRET_KEY`, `XENDIT_WEBHOOK_VERIFICATION_TOKEN`, and a public HTTPS `APP_URL` are configured. `XENDIT_PUBLIC_KEY` is documented for future client-side card tokenization but is not used by hosted Payment Sessions.

---

## 1. Goal

Add subscription-based workspace access to Tickr so that each workspace must have an active paid subscription (or be in a valid trial) for its members to use the platform. The feature includes:

1. **Subscription plans** — define tiers (e.g., Starter, Professional, Enterprise) with different feature limits, member caps, and pricing cadences (monthly, quarterly, yearly).
2. **Xendit payment integration** — handle checkout via Xendit Invoices; process recurring billing through Xendit's recurring payment APIs.
3. **Workspace access gating** — enforce that only paid (or trialing) workspaces can be accessed; show an appropriate gating UI when the subscription lapses.
4. **In-app subscription management** — workspace owners/admins can view their current plan, billing history, update payment methods, and cancel/reactivate.
5. **Public pricing page** — a newly branded landing/page that shows available plans, pricing, and allows prospective workspace owners to start a trial or subscribe.

---

## 2. Assumptions & Decisions (Pending Stakeholder Confirmation)

Since the interview phase has not been completed, the following defaults are used. Each is noted as an assumption to confirm during review.

| #   | Decision                  | Chosen Default                                                                                        | Alternatives                                                    |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| A1  | **Who pays?**             | Workspace Owner subscribes; all members in that workspace gain access.                                | Per-member billing, hybrid seat-based model                     |
| A2  | **Plan tiers**            | Three tiers: **Starter** (small team), **Professional** (growing agency), **Enterprise** (unlimited). | Single plan, custom enterprise-only                             |
| A3  | **Free access**           | 14-day free trial on any plan; after trial, workspace is read-only until payment.                     | Freemium (feature-capped free forever), paid-only with no trial |
| A4  | **Billing cadences**      | Monthly, Quarterly (5% off), Yearly (15% off).                                                        | Monthly-only, only monthly + yearly                             |
| A5  | **Branding page scope**   | Both: a public pricing/landing page **and** in-app subscription management dashboard.                 | Public-only, in-app-only                                        |
| A6  | **Cancellation behavior** | Workspace becomes read-only at period end; data retained for 90 days grace period.                    | Immediate lockout, indefinite data retention                    |
| A7  | **Payment method**        | Xendit Invoice (hosted checkout) for initial sign-up; Xendit Recurring Payments for auto-renewal.     | Xendit Retail Outlet, Xendit e-Wallet only                      |

---

## 3. Scope

- **Database:** 4 new tables (subscription plans, subscriptions, payment transactions, Xendit invoice records).
- **Server:** Zod schemas, CRUD for plans, subscription lifecycle management, Xendit API integration (create invoice, handle webhooks, recurring payment management), access-gating middleware.
- **Frontend:**
  - Public pricing page with new branding (plan comparison, trial sign-up, checkout flow).
  - In-app subscription management (current plan view, billing history, payment method, cancel/reactivate).
  - Workspace gating UI (trial countdown, subscription expired banner, locked workspace overlay).
  - Xendit checkout redirect/hosted invoice flow.
- **Navigation:** New public route for pricing; new in-app section under workspace settings for billing.
- **Access control:** Only OWNER can manage subscriptions. All members are gated by workspace subscription status.
- **Webhooks:** Xendit webhook handler for invoice paid, payment succeeded, subscription expired, payment failed events.
- **Email notifications:** Trial expiring, payment succeeded, payment failed, subscription canceled.

---

## 4. Out of Scope

- Per-member/per-seat billing (A1 default: workspace owner pays).
- Usage-based billing (charging by tracked hours / time entries).
- Multi-currency dynamic pricing (each plan has a single currency — PHP by default; future: USD).
- Coupon/discount codes and referral programs.
- Customer-facing invoice portal outside the app.
- Integration with payment gateways other than Xendit.
- Annual contract/commitment discounts beyond the standard yearly cadence.
- Refund processing through the UI (manual refunds via Xendit dashboard only).
- Migration tooling for existing free workspaces (they will be grandfathered into the free trial).
- White-label billing for enterprise customers.

---

## 5. Affected Files and Folders

```txt
drizzle/
  0003_add_subscriptions.sql                              (NEW migration)

src/
  db/
    schema.ts                                             (4 new tables + enums)

  lib/
    server/
      payments/
        xendit/
          xendit-client.server.ts                         (NEW: Xendit API client)
          xendit-invoice.server.ts                        (NEW: create/manage invoices)
          xendit-recurring.server.ts                      (NEW: recurring payment logic)
          xendit-webhook.server.ts                        (NEW: webhook verification/handler)
        plans.server.ts                                   (NEW: plan CRUD + queries)
        subscriptions.server.ts                           (NEW: subscription lifecycle)
        gating.server.ts                                  (NEW: workspace access gate)

    time-tracker/
      subscription-helpers.ts                             (NEW: client-side helpers)

  components/
    subscription/
      PricingPage.tsx                                     (NEW: public pricing with branding)
      PlanCard.tsx                                        (NEW: individual plan display)
      CheckoutFlow.tsx                                    (NEW: Xendit checkout integration)
      BillingSettings.tsx                                 (NEW: in-app subscription mgmt)
      BillingHistory.tsx                                  (NEW: payment history table)
      PaymentMethodForm.tsx                               (NEW: update payment method)
      TrialBanner.tsx                                     (NEW: trial countdown banner)
      WorkspaceGate.tsx                                   (NEW: locked workspace overlay)
      SubscriptionStatusBadge.tsx                         (NEW: plan badge/indicator)

  routes/
    pricing.tsx                                           (NEW: public pricing page)
    api/
      webhooks/
        xendit.ts                                         (NEW: Xendit webhook receiver)

    app/
      workspace/
        billing/
          index.tsx                                       (NEW: billing settings)
          history.tsx                                     (NEW: payment history)
        settings.tsx                                      (MODIFY: add billing nav item)
```

---

## 6. Database Design

### 6.1 New Enums

```typescript
// Subscription plan tiers
export const planTierEnum = pgEnum('plan_tier', [
  'starter',
  'professional',
  'enterprise',
])

// Subscription status
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'expired',
])

// Payment transaction status
export const paymentStatusEnum = pgEnum('payment_status', [
  'pending',
  'paid',
  'failed',
  'refunded',
])

// Billing cadence
export const billingCadenceEnum = pgEnum('billing_cadence', [
  'monthly',
  'quarterly',
  'yearly',
])
```

### 6.2 Subscription Plans (`subscriptionPlans`)

Defines the available plan tiers with pricing and feature limits.

```typescript
export const subscriptionPlans = pgTable('subscription_plans', {
  id: varchar({ length: 16 })
    .primaryKey()
    .$defaultFn(() => createId()),
  name: varchar({ length: 100 }).notNull(), // "Starter", "Professional", "Enterprise"
  slug: varchar({ length: 50 }).notNull().unique(), // "starter", "professional", "enterprise"
  tier: planTierEnum().notNull(),
  description: text('description'),
  tagline: varchar({ length: 255 }),

  // Feature limits (null = unlimited for enterprise)
  maxMembers: integer('max_members'), // null = unlimited
  maxProjects: integer('max_projects'),
  maxClients: integer('max_clients'),
  features: jsonb('features').$type<string[]>(), // ["analytics", "api_access", "priority_support", ...]

  // Pricing in smallest currency unit (centavos for PHP, cents for USD)
  currency: varchar({ length: 3 }).notNull().default('PHP'),
  priceMonthly: integer('price_monthly').notNull(),
  priceQuarterly: integer('price_quarterly').notNull(),
  priceYearly: integer('price_yearly').notNull(),

  // Metadata
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  isPublic: boolean('is_public').notNull().default(true), // visible on pricing page

  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
```

### 6.3 Subscriptions (`subscriptions`)

Tracks a workspace's subscription lifecycle.

```typescript
export const subscriptions = pgTable('subscriptions', {
  id: varchar({ length: 16 })
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: varchar({ length: 16 })
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  planId: varchar({ length: 16 })
    .notNull()
    .references(() => subscriptionPlans.id),

  status: subscriptionStatusEnum().notNull().default('trialing'),
  billingCadence: billingCadenceEnum().notNull().default('monthly'),

  // Period tracking
  trialStartAt: timestamp({ withTimezone: true }),
  trialEndAt: timestamp({ withTimezone: true }),
  currentPeriodStart: timestamp({ withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp({ withTimezone: true }).notNull(),

  // Xendit references
  xenditSubscriptionId: varchar({ length: 100 }),
  xenditCustomerId: varchar({ length: 100 }),

  // Cancellation
  canceledAt: timestamp({ withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),

  // Grace period for expired/canceled workspaces (data retention)
  dataRetentionUntil: timestamp({ withTimezone: true }),

  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
```

### 6.4 Xendit Invoices (`subscriptionInvoices`)

Records Xendit-created invoices for the workspace.

```typescript
export const subscriptionInvoices = pgTable('subscription_invoices', {
  id: varchar({ length: 16 })
    .primaryKey()
    .$defaultFn(() => createId()),
  subscriptionId: varchar({ length: 16 })
    .notNull()
    .references(() => subscriptions.id, { onDelete: 'cascade' }),
  workspaceId: varchar({ length: 16 })
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),

  xenditInvoiceId: varchar({ length: 100 }).notNull().unique(),
  xenditInvoiceUrl: varchar({ length: 500 }), // hosted invoice URL for checkout
  xenditPaymentMethod: varchar({ length: 50 }),

  amount: integer('amount').notNull(), // in smallest currency unit
  currency: varchar({ length: 3 }).notNull(),
  status: paymentStatusEnum().notNull().default('pending'),
  description: varchar({ length: 500 }),

  dueDate: timestamp({ withTimezone: true }).notNull(),
  paidAt: timestamp({ withTimezone: true }),

  // Raw Xendit metadata for debugging
  xenditMetadata: jsonb('xendit_metadata'),

  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
})
```

### 6.5 Payment Transactions (`paymentTransactions`)

Normalized payment records from Xendit callbacks.

```typescript
export const paymentTransactions = pgTable('payment_transactions', {
  id: varchar({ length: 16 })
    .primaryKey()
    .$defaultFn(() => createId()),
  workspaceId: varchar({ length: 16 })
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  subscriptionId: varchar({ length: 16 })
    .notNull()
    .references(() => subscriptions.id),
  invoiceId: varchar({ length: 16 }).references(() => subscriptionInvoices.id),

  xenditPaymentId: varchar({ length: 100 }).notNull().unique(),
  xenditInvoiceId: varchar({ length: 100 }),
  xenditPaymentMethod: varchar({ length: 50 }),
  xenditPaymentChannel: varchar({ length: 50 }),

  amount: integer('amount').notNull(),
  currency: varchar({ length: 3 }).notNull(),
  status: paymentStatusEnum().notNull(),
  fee: integer('fee'), // Xendit processing fee

  paidAt: timestamp({ withTimezone: true }),
  xenditMetadata: jsonb('xendit_metadata'),

  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})
```

### 6.6 Workspace Extension

Add a column to the `workspaces` table to link the active subscription (denormalized for fast gate checks).

```typescript
// ADD to existing workspaces table:
subscriptionId: varchar({ length: 16 }), // nullable — workspaces without a subscription are in trial
```

### 6.7 Type Exports

```typescript
export type PlanTier = (typeof planTierEnum.enumValues)[number]
export type SubscriptionStatus =
  (typeof subscriptionStatusEnum.enumValues)[number]
export type PaymentStatus = (typeof paymentStatusEnum.enumValues)[number]
export type BillingCadence = (typeof billingCadenceEnum.enumValues)[number]
```

### 6.8 Seed Data — Default Plans

```typescript
const defaultPlans = [
  {
    name: 'Starter',
    slug: 'starter',
    tier: 'starter',
    description:
      'For freelancers and small teams getting started with time tracking.',
    tagline: 'Everything you need to start tracking',
    maxMembers: 5,
    maxProjects: 10,
    maxClients: 10,
    features: [
      'time_tracking',
      'basic_reports',
      'csv_export',
      'google_calendar',
    ],
    currency: 'PHP',
    priceMonthly: 49900, // ₱499.00
    priceQuarterly: 142200, // ₱1,422.00 (5% off)
    priceYearly: 508900, // ₱5,089.00 (15% off)
    sortOrder: 1,
  },
  {
    name: 'Professional',
    slug: 'professional',
    tier: 'professional',
    description: 'For growing agencies and teams that need advanced features.',
    tagline: 'Scale your team with confidence',
    maxMembers: 25,
    maxProjects: 50,
    maxClients: 50,
    features: [
      'time_tracking',
      'advanced_analytics',
      'pdf_export',
      'csv_export',
      'api_access',
      'google_calendar',
      'invoicing',
      'department_analytics',
    ],
    currency: 'PHP',
    priceMonthly: 99900, // ₱999.00
    priceQuarterly: 284700, // ₱2,847.00 (5% off)
    priceYearly: 1018900, // ₱10,189.00 (15% off)
    sortOrder: 2,
  },
  {
    name: 'Enterprise',
    slug: 'enterprise',
    tier: 'enterprise',
    description:
      'For large organizations with unlimited needs and priority support.',
    tagline: 'Unlimited power for your organization',
    maxMembers: null, // unlimited
    maxProjects: null,
    maxClients: null,
    features: [
      'time_tracking',
      'advanced_analytics',
      'pdf_export',
      'csv_export',
      'api_access',
      'google_calendar',
      'invoicing',
      'department_analytics',
      'audit_logs',
      'priority_support',
      'sso',
      'custom_branding',
    ],
    currency: 'PHP',
    priceMonthly: 249900, // ₱2,499.00
    priceQuarterly: 712200, // ₱7,122.00 (5% off)
    priceYearly: 2548900, // ₱25,489.00 (15% off)
    sortOrder: 3,
  },
]
```

---

## 7. Backend Implementation

### 7.1 Xendit API Client (`xendit-client.server.ts`)

```typescript
// Encapsulates Xendit API authentication and base request handling.
// Uses XENDIT_API_KEY from environment — should be the secret key (not public).
// Endpoints:
//   - POST /v2/invoices — create invoice
//   - GET /v2/invoices/:id — get invoice status
//   - POST /recurring/plans — create recurring plan
//   - POST /recurring/subscriptions — create recurring subscription
//   - PATCH /recurring/subscriptions/:id — update subscription
//   - GET /v2/invoices/:id/payments — list invoice payments
```

### 7.2 Zod Schemas (`schemas.ts`)

```typescript
// createCheckoutSession schema
const createCheckoutSessionSchema = z.object({
  planId: z.string().length(16),
  billingCadence: z.enum(['monthly', 'quarterly', 'yearly']),
})

// cancelSubscription schema
const cancelSubscriptionSchema = z.object({
  subscriptionId: z.string().length(16),
  immediateCancel: z.boolean().default(false),
})

// changePlan schema
const changePlanSchema = z.object({
  newPlanId: z.string().length(16),
  billingCadence: z.enum(['monthly', 'quarterly', 'yearly']).optional(),
  prorate: z.boolean().default(true),
})

// changeBillingCadence schema
const changeBillingCadenceSchema = z.object({
  subscriptionId: z.string().length(16),
  newCadence: z.enum(['monthly', 'quarterly', 'yearly']),
})
```

### 7.3 Plan Queries (`plans.server.ts`)

Server functions for reading subscription plans:

- `getPublicPlansFn()` — returns all `isPublic: true` plans for the pricing page.
- `getAllPlansFn()` — admin-only; returns all plans including inactive ones.
- `getPlanBySlugFn(slug)` — resolve plan by slug.

### 7.4 Subscription Lifecycle (`subscriptions.server.ts`)

Core subscription management:

- `getWorkspaceSubscriptionFn()` — returns the current subscription for the active workspace.
- `createTrialSubscriptionFn(workspaceId, planId)` — creates a 14-day trial subscription on workspace creation.
- `createCheckoutSessionFn(planId, billingCadence)` — creates a Xendit Invoice and returns the hosted invoice URL.
- `handlePaymentSuccess(workspaceId, xenditInvoiceId)` — called by webhook; activates the subscription.
- `cancelSubscriptionFn(subscriptionId, immediateCancel)` — cancels subscription; workspace becomes read-only at period end.
- `changePlanFn(subscriptionId, newPlanId, prorate)` — switches plan tier; handles prorated billing.
- `reactivateSubscriptionFn(subscriptionId)` — reactivates a canceled subscription before the period ends.

### 7.5 Workspace Access Gating (`gating.server.ts`)

Middleware/utility to enforce subscription access:

```typescript
// Returns the workspace's access state
function getWorkspaceAccessState(workspaceId: string): {
  canAccess: boolean
  status: SubscriptionStatus
  reason?: string
  trialDaysLeft?: number
  isReadOnly: boolean
}

// Conditions that restrict access:
// - status = 'past_due'  → workspace is read-only with payment prompt
// - status = 'expired'   → workspace is fully locked
// - status = 'canceled' and cancelAtPeriodEnd = true → locked after period end
// - trialEndAt < now and no active subscription → locked, prompt to subscribe
```

### 7.6 Xendit Webhook Handler (`xendit-webhook.server.ts`)

```typescript
// POST /api/webhooks/xendit
// Verifies webhook signature using XENDIT_WEBHOOK_VERIFICATION_TOKEN
// Supported events:
//   - invoice.paid          → activate subscription, record payment
//   - invoice.expired       → mark payment as failed, set past_due if retries exhausted
//   - invoice.payment_failed → notify user, set past_due after grace period
//   - recurring.subscription_created → link xendit subscription ID
//   - recurring.subscription_updated → sync status changes
//   - recurring.subscription_canceled → set workspace to expired

// Webhook verification uses xendit-node SDK's Webhook.verifyEvent() or manual HMAC.
```

### 7.7 Email Notifications

Trigger emails on key subscription events:

| Event                   | Recipient       | Template                                      |
| ----------------------- | --------------- | --------------------------------------------- |
| Trial starts            | Workspace owner | Welcome + trial end date                      |
| Trial expiring (3 days) | Workspace owner | "Your trial is ending soon" + upgrade CTA     |
| Trial expired           | Workspace owner | "Trial ended — subscribe to continue"         |
| Payment succeeded       | Workspace owner | Receipt + next billing date                   |
| Payment failed          | Workspace owner | "Payment failed — update billing" + retry CTA |
| Subscription canceled   | Workspace owner | Confirmation + data retention date            |

### 7.8 Server Function Exports

```typescript
// src/lib/server/payments/index.ts
export { createCheckoutSessionFn } from './subscriptions.server'
export { getWorkspaceSubscriptionFn } from './subscriptions.server'
export { cancelSubscriptionFn } from './subscriptions.server'
export { changePlanFn } from './subscriptions.server'
export { reactivateSubscriptionFn } from './subscriptions.server'
export { getPublicPlansFn } from './plans.server'
export { getBillingHistoryFn } from './billing-history.server'
export { getWorkspaceAccessStateFn } from './gating.server'
```

---

## 8. Frontend Implementation

### 8.1 Public Pricing Page (`/pricing`)

New route accessible to unauthenticated and authenticated users. Implements the new branding.

**Components:**

- `PricingPage.tsx` — Page layout with hero section, plan comparison grid, FAQ accordion.
- `PlanCard.tsx` — Individual plan card showing name, price (toggle between monthly/quarterly/yearly), feature list, CTA button.
- `CheckoutFlow.tsx` — Handles plan selection → create checkout session → redirect to Xendit hosted invoice.

**Behavior:**

- Cadence toggle switches displayed prices.
- "Start Free Trial" on any plan triggers workspace creation + trial subscription.
- "Subscribe" for logged-in workspace owners creates a Xendit invoice and redirects.
- Unauthenticated users clicking CTA are redirected to sign-up with plan slug in query params.

### 8.2 In-App Billing Settings (`/app/workspace/billing`)

Available only to workspace OWNER. Shows current subscription details.

**Components:**

- `BillingSettings.tsx` — Current plan card, billing cadence, next billing date, usage against limits (members/projects/clients count), change plan / cancel buttons.
- `BillingHistory.tsx` — Table of past invoices with status, amount, date, and download link.
- `PaymentMethodForm.tsx` — For Xendit recurring payments: show current payment method, initiate update.
- `SubscriptionStatusBadge.tsx` — Badge showing "Active", "Trialing", "Past Due", etc.

### 8.3 Trial & Gating UI

**Components:**

- `TrialBanner.tsx` — Shown at the top of the app during the trial period. Shows "X days left in your trial" with upgrade CTA. Appears for all workspace members.
- `WorkspaceGate.tsx` — Full-screen overlay when subscription has lapsed. Shows "Your workspace subscription has ended" with options to resubscribe. Only workspace OWNER sees the payment flow; other members see "Contact your workspace owner."

**Integration:**

- `AppShell` component reads `getWorkspaceAccessStateFn()` on load.
- If `canAccess` is false, the gate overlay renders instead of the normal app shell.
- If `isReadOnly` is true, interactive features (timer start, member invite, settings changes) are disabled with tooltips linking to billing.

### 8.4 Navigation Updates

- **Public pricing page:** Linked from:
  - Landing page `/` CTA
  - Login/sign-up page `/auth`
  - Workspace gate overlay
  - Trial banner
- **In-app billing:** Linked from:
  - Workspace settings sidebar (`SettingsScreen`)
  - Trial banner CTA
  - Workspace gate overlay CTA

---

## 9. Routes

```typescript
// NEW — public
routes / pricing.tsx // Public pricing page with new branding

// NEW — webhook (no UI, server-only)
routes / api / webhooks / xendit.ts // Xendit webhook receiver (no auth, signature-verified)

// NEW — in-app billing
routes / app / workspace / billing / index.tsx // Billing settings (OWNER only)
routes / app / workspace / billing / history.tsx // Payment/invoice history (OWNER only)

// MODIFIED — add billing nav item
routes / app / workspace / settings.tsx // Add "Billing" to settings navigation
```

---

## 10. Access Control

| Operation               | OWNER            | ADMIN              | MANAGER            | EMPLOYEE           |
| ----------------------- | ---------------- | ------------------ | ------------------ | ------------------ |
| View billing settings   | ✅               | ❌                 | ❌                 | ❌                 |
| Start trial / subscribe | ✅               | ❌                 | ❌                 | ❌                 |
| Change plan             | ✅               | ❌                 | ❌                 | ❌                 |
| Cancel subscription     | ✅               | ❌                 | ❌                 | ❌                 |
| View billing history    | ✅               | ❌                 | ❌                 | ❌                 |
| Update payment method   | ✅               | ❌                 | ❌                 | ❌                 |
| Reactivate subscription | ✅               | ❌                 | ❌                 | ❌                 |
| View trial banner       | ✅               | ✅                 | ✅                 | ✅                 |
| Workspace gate (locked) | ✅ (resubscribe) | ✅ (contact owner) | ✅ (contact owner) | ✅ (contact owner) |

---

## 11. Xendit Integration Details

### 11.1 Environment Variables

```bash
XENDIT_API_KEY=xnd_development_xxx        # or xnd_production_xxx
XENDIT_WEBHOOK_VERIFICATION_TOKEN=xxx     # from Xendit dashboard
XENDIT_SUCCESS_REDIRECT_URL=https://tickr.example.com/app/workspace/billing?checkout=success
XENDIT_FAILURE_REDIRECT_URL=https://tickr.example.com/app/workspace/billing?checkout=canceled
```

### 11.2 Checkout Flow

```
1. Owner selects plan + cadence on pricing page (or in-app billing)
2. Frontend calls createCheckoutSessionFn({ planId, billingCadence })
3. Server calls POST /v2/invoices on Xendit with:
     - amount, currency, payer_email, success_redirect_url, failure_redirect_url
     - external_id = `${workspaceId}_${subscriptionId}`
     - items: [{ name: "Tickr Professional - Monthly", price, quantity: 1 }]
4. Server stores subscriptionInvoices record with status: 'pending'
5. Server returns { xenditInvoiceUrl } to frontend
6. Frontend redirects user to Xendit hosted invoice page
7. User completes payment on Xendit
8. Xendit sends webhook: invoice.paid
9. Server verifies webhook, activates subscription, records payment transaction
10. Server sends payment confirmation email
11. User is redirected back to app (success URL) where they see active subscription
```

### 11.3 Recurring Billing (Future Phase)

For auto-renewal, Xendit Recurring Payments API:

1. After first successful payment, create a Xendit recurring plan + subscription
2. Xendit auto-charges at the billing cadence
3. On `recurring.charge_succeeded` webhook → extend `currentPeriodEnd`, record payment
4. On `recurring.charge_failed` webhook → set `past_due`, notify owner, retry after 3/7 days
5. On repeated failures → cancel subscription, lock workspace

### 11.4 Webhook Security

```typescript
// Verify all incoming webhooks
function verifyXenditWebhook(req: Request): boolean {
  const token = req.headers.get('x-callback-token')
  return token === process.env.XENDIT_WEBHOOK_VERIFICATION_TOKEN
  // OR use HMAC: compare x-callback-token with computed HMAC of request body
}
```

---

## 12. Validation

| Check                                 | Command            | Expected                            |
| ------------------------------------- | ------------------ | ----------------------------------- |
| TypeScript compilation                | `pnpm typecheck`   | 0 errors                            |
| Lint                                  | `pnpm lint`        | 0 warnings                          |
| Database migration dry-run            | `pnpm db:generate` | Migration file created              |
| Unit tests: gating logic              | `pnpm test`        | All gating scenarios pass           |
| E2E: trial → subscribe → active       | Playwright         | Full lifecycle passes               |
| E2E: cancel → read-only → resubscribe | Playwright         | Full lifecycle passes               |
| E2E: past-due workspace gate          | Playwright         | Locked UI renders correctly         |
| Manual: Xendit sandbox checkout       | Manual QA          | Payment processed, webhook received |

---

## 13. Sequencing (Implementation Order)

### Phase 1: Foundation (Database + Plans)

1. Create database migration: enums, `subscriptionPlans`, `subscriptions`, `subscriptionInvoices`, `paymentTransactions`
2. Add `subscriptionId` column to `workspaces`
3. Seed default plans (Starter, Professional, Enterprise)
4. Implement `plans.server.ts` — getPublicPlans, getAllPlans

### Phase 2: Xendit Integration

5. Implement `xendit-client.server.ts` — API client with auth
6. Implement `xendit-invoice.server.ts` — create invoice
7. Implement `xendit-webhook.server.ts` — webhook verification + event routing
8. Implement `subscriptions.server.ts` — createCheckoutSession, handlePaymentSuccess

### Phase 3: Trial + Gating

9. Implement `gating.server.ts` — getWorkspaceAccessState
10. Implement `createTrialSubscription` — auto-create trial on workspace creation
11. Create `TrialBanner.tsx` — trial countdown
12. Create `WorkspaceGate.tsx` — locked workspace overlay
13. Integrate into `AppShell` — gating check on app load

### Phase 4: Public Pricing Page

14. Create `/pricing` route — public pricing page
15. Create `PricingPage.tsx` with new branding
16. Create `PlanCard.tsx` — plan display
17. Create `CheckoutFlow.tsx` — checkout integration
18. Add navigation links to pricing page

### Phase 5: In-App Billing

19. Create `/app/workspace/billing` route
20. Create `BillingSettings.tsx` — current plan + change/cancel
21. Create `BillingHistory.tsx` — invoice/payment history
22. Create `PaymentMethodForm.tsx` — update payment method
23. Add "Billing" to workspace settings sidebar

### Phase 6: Polish + Recurring

24. Implement recurring billing with Xendit Recurring Payments API
25. Add email notifications (trial expiring, payment failed, etc.)
26. Implement cancel/reactivate/change-plan flows
27. E2E tests for full subscription lifecycle
28. Audit logging for all subscription changes

---

## 14. Risks & Considerations

| Risk                                 | Impact                                         | Mitigation                                                                          |
| ------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Xendit API changes**               | Breaking changes could disrupt billing         | Pin API version; use webhook idempotency keys; monitor Xendit changelog             |
| **Webhook delivery failures**        | Missed payments → workspace incorrectly locked | Implement webhook retry reconciliation; add manual "check payment status" button    |
| **Existing free workspaces**         | Sudden lockout angers users                    | Grandfather existing workspaces into 14-day trial; send advance notice              |
| **Proration complexity**             | Mid-cycle plan changes may be incorrect        | Start with no-proration (change takes effect next cycle); add proration later       |
| **Xendit sandbox → production**      | Different behavior in production               | Thoroughly test in sandbox with all event types; review Xendit production checklist |
| **Pricing page SEO**                 | New public page must be indexed                | Ensure SSR rendering; add meta tags, Open Graph, canonical URL                      |
| **Data retention after cancelation** | Legal/compliance implications                  | Default 90 days; add "export all data" option for canceling workspaces              |
| **Xendit region support**            | Xendit is primarily PH/SEA                     | Verify PHP currency support; plan for future multi-currency if expanding            |

---

## 15. Open Questions

- [ ] **A1–A7** — Confirm all assumptions in Section 2 with stakeholders.
- [ ] **Pricing amounts** — Confirm plan prices (currently using PHP ₱499 / ₱999 / ₱2,499 monthly).
- [ ] **Multi-currency** — Is PHP-only sufficient for launch, or is USD support needed from day one?
- [ ] **Xendit account** — Has the Xendit business account been set up? Do we have API keys?
- [ ] **Grandfathering** — How many existing workspaces exist? What communication plan?
- [ ] **Recurring billing** — Should recurring (auto-renewal) be in the MVP, or is Phase 1 manual invoice-only acceptable?
- [ ] **Proration** — Is prorated plan switching required for MVP?
- [ ] **Branding assets** — Do we have the new branding design/figma files to implement the pricing page?
