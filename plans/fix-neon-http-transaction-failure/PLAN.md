# Fix Broken `db.transaction()` on the neon-http Driver (Xendit Checkout + Payment Webhook)

> **Status:** 📋 Planned

## Status

- [ ] Verify the failure is real and currently reachable (see Verify First).
- [ ] Decide the `db.batch` vs. WebSocket-driver approach for each of the two call sites.
- [ ] Rewrite `createSubscriptionCheckout` persistence.
- [ ] Rewrite `processXenditWebhook` success branch.
- [ ] Add a regression test that would have caught this.
- [ ] Validate: typecheck, lint, tests, manual checkout smoke test.
- [ ] Confirm the Xendit sandbox end-to-end (session created → invoice row written → webhook activates subscription).

## Verify First (No Code Change)

Run these **before** writing any code. Items 1–2 are local and take a minute; items 3–4 need a decision or production access.

- [ ] **Confirm the driver has no interactive transactions (local, 10 seconds).**
      `bash
    grep -n -A 3 "async transaction" node_modules/drizzle-orm/neon-http/session.js
    `
      Expected: `throw new Error("No transactions support in neon-http driver");`

- [ ] **Confirm the app actually uses that driver and only these two call sites (local).**
      `bash
    grep -n "neon-http" src/db.ts
    grep -rn "db.transaction\|\.transaction(" src/ --include=*.ts --include=*.tsx
    `
      Expected: `import { drizzle } from 'drizzle-orm/neon-http'`, and exactly two hits, both in `src/lib/server/subscriptions.server.ts` (lines 323 and 402).

- [ ] **Verify `db.batch` is available on the instantiated client (local).**
      `drizzle-orm/neon-http/driver.js` exposes `batch(batch)` at line 65. Confirm it exists in the installed version before designing around it.

- [ ] **Decide whether the paths are live (needs a product answer, not a command).** Has any real customer ever completed a paid checkout, or is billing still pre-launch? If a paid subscription currently exists in the database, this bug is already causing silent revenue-state divergence and the investigation becomes an incident, not a bug fix. Relevant data check, if DB access is available:
      `sql
    SELECT status, count(*) FROM subscriptions GROUP BY status;
    SELECT count(*) FROM subscription_invoices;
    SELECT count(*) FROM subscription_payments;
    `
      A non-zero subscription count with a **zero** `subscription_payments` count is the signature of this bug.

- [ ] **Check whether Xendit has been retrying a failing webhook (needs Vercel access).** Look for repeated `500` responses on `POST /api/webhooks/xendit` in the function logs. `src/routes/api/webhooks/xendit.ts:29-32` converts the thrown error into a 500, so Xendit would retry forever and fail identically every time.

## 1. Goal

Restore the two payment-critical code paths that are currently 100% broken.

`src/db.ts` wires Drizzle to the **neon-http** driver, whose session implements interactive transactions as an unconditional throw. Both `db.transaction(...)` call sites in the codebase are payment operations, so:

- **Checkout never completes.** `createSubscriptionCheckout` calls the external Xendit API first, then throws before persisting the session id or the invoice row. A real hosted payment session exists at Xendit that Tickr has no record of, and the user never receives a URL.
- **Payments never activate a subscription.** `processXenditWebhook` throws before inserting the payment row and before the period-extension writes that follow.

The goal is that a customer can pay and have their subscription activate, with the database never holding a half-written checkout.

## 2. Context Summary

The failure was verified directly in the installed package. `node_modules/drizzle-orm/neon-http/session.js:151`:

```js
async transaction(_transaction, _config = {}) {
  throw new Error("No transactions support in neon-http driver");
}
```

And `src/db.ts` imports from that exact entry point:

```ts
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'

function createDb() {
  const sql = neon(process.env.DATABASE_URL!)
  return drizzle({ client: sql, schema })
}
```

**Why this survived review:** the codebase already knows about this limitation. `src/lib/server/tracker/timer.server.ts:307` carries the comment _"neon-http uses the HTTP driver which does not support interactive transactions. Run the writes as sequential HTTP queries instead."_ That lesson was applied in the tracker layer but never in the billing layer, which was written later.

**Call site 1 — `src/lib/server/subscriptions.server.ts:323`** (inside `createSubscriptionCheckout`, declared at line 272):

```ts
const session = await createXenditSession({
  /* ... */
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
    /* ... */
  })
})

return { checkoutUrl: paymentLinkUrl }
```

The ordering matters: the external Xendit session is created **before** the throw, so this is not merely a failed request — it leaves a real orphaned payment session on Xendit's side.

**Call site 2 — `src/lib/server/subscriptions.server.ts:402`** (inside `processXenditWebhook`, declared at line 358):

```ts
if (isSuccess) {
  const now = new Date()
  const periodEnd = addMonth(now)
  await db.transaction(async (tx) => {
    const [createdPayment] = await tx
      .insert(subscriptionPayments)
      .values({
        /* ... */
      })
      .onConflictDoNothing({ target: subscriptionPayments.xenditPaymentId })
      .returning({ id: subscriptionPayments.id })
    if (!createdPayment) return
    await tx
      .update(subscriptionInvoices)
      .set({ status: 'PAID', paidAt: now })
      .where(/* ... */)
    await tx
      .update(subscriptions)
      .set({
        /* extend period */
      })
      .where(/* ... */)
  })
}
```

Note that this branch has a **conditional read-after-write** (`if (!createdPayment) return`), which is what makes a plain `db.batch` insufficient here and drives the approach decision in Section 7.

**Relevant schema** (all in `src/db/schema.ts`): `subscriptions` (unique on `workspaceId`), `subscriptionInvoices` (indexed on `(workspaceId, createdAt)`, unique on `xenditSession`), `subscriptionPayments` (unique on `xenditPaymentId`, indexed on `(workspaceId, createdAt)`).

**Known-good patterns already in the repo:** `catalog-sync.server.ts` batches independent writes and uses one multi-row `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`; the `webhooks/xendit.ts` route already does constant-time token comparison; `createSubscriptionCheckout`'s `getSubscriptionRow` / `createTrialSubscription` helpers already tolerate being called in sequence.

**Assumptions to confirm:** that no paid subscription exists in production yet (Verify First item 4), and that switching to the WebSocket driver is acceptable if `batch` proves insufficient — the WebSocket driver adds connection management that the HTTP driver deliberately avoids.

## 3. Scope

- `[FIX]` Replace the `db.transaction` block in `createSubscriptionCheckout` with a driver-appropriate atomic write.
- `[FIX]` Replace the `db.transaction` block in `processXenditWebhook`'s `isSuccess` branch, preserving the `createdPayment` idempotency guard.
- `[FIX]` Move the ordering so that no external side effect (the Xendit session) happens before the local write that records it, or add compensating cleanup for the orphaned-session case.
- `[FIX]` Add a regression test that fails if any future code path calls `db.transaction` on this driver.
- `[CHECK]` Confirm whether the two write pairs genuinely need atomicity, or whether each is safe as sequential statements with an idempotency key (this decides whether `batch` is even required).
- `[CHECK]` Confirm Xendit's webhook retry semantics so the error-response behaviour can be chosen deliberately rather than inherited.

## 4. Out of Scope

- The webhook's other defects. `processXenditWebhook` also discards an unknown invoice with a 200 (`:369-386`, so Xendit never retries and the payment is lost) and its `paymentId` fallback collides across recurring cycles. Those are separate findings and should get their own plan; this plan must not silently absorb them.
- Changing the Neon driver for the whole application. Only the billing path is in scope unless the WebSocket driver is chosen.
- The subscription UI, plan pricing, or trial logic.
- Any migration of existing subscription rows.

## 5. Affected Files and Folders

```txt
plans/fix-neon-http-transaction-failure/
  PLAN.md                                                     (NEW)

src/
  lib/server/
    subscriptions.server.ts                                   (MODIFY)
      - createSubscriptionCheckout ~:307-345  → replace the
        db.transaction block; consider reordering the Xendit
        session creation to after (or compensating for) the write
      - processXenditWebhook ~:399-434        → replace the
        db.transaction block; preserve the createdPayment guard
    __tests__/
      subscriptions-transaction.test.ts                       (NEW)
        - asserts no neon-http transaction is reachable, and
          covers the two write sequences with a mocked client

  db.ts                                                       (MODIFY, only if
                                                                 the driver changes)

Possible additional file, only if the WebSocket driver is chosen:
  lib/server/billing-db.server.ts                             (NEW)
    - an isolated Pool-based client used only by the billing path
```

## 6. Database Design

N/A — no schema change. The existing constraints already provide the idempotency keys this fix depends on: `subscriptionPayments.xenditPaymentId` (unique) and `subscriptions.workspaceId` (unique). Confirm both exist in the generated migrations before relying on `ON CONFLICT` behaviour.

## 7. Backend Implementation

Two viable approaches. Decide per call site rather than globally.

**Option A — `db.batch` (recommended for call site 1).** The neon-http driver sends multiple statements in one HTTP round trip inside an implicit transaction (`driver.js:65`). `createSubscriptionCheckout`'s two writes are independent of each other's results, so they fit directly:

- Describe both statements as a batched update + insert, replacing `tx` with the top-level `db`.
- Keep the two writes in one batch so a failure cannot persist the subscription's session id without its invoice row.

**Option B — the `neon-serverless` WebSocket driver, scoped to billing.** `db.batch` cannot express call site 2's shape, because it reads `createdPayment` back and branches on it. Either:

- isolate a Pool-based client for the billing module so interactive transactions are available there and nowhere else, or
- restructure call site 2 into a single idempotent `INSERT ... ON CONFLICT DO NOTHING RETURNING` followed by a second batched extension, accepting that the extension is applied unconditionally when the insert reports a pre-existing row.

**Also required regardless of option:**

- Handle the external-call ordering at call site 1. Either create the Xendit session **after** the local invoice row exists (with a placeholder session id, updated on success), or keep the current order and add explicit compensation that expires or voids the Xendit session when the local write fails. Record which was chosen in Section 13.
- Add a guard test that greps the source for `db.transaction` and fails, so this class of bug cannot return while the HTTP driver is in use. This is the highest-value part of the plan: the fix is small, but the failure mode was invisible.

## 8. Frontend Implementation

N/A — the checkout panel already surfaces a thrown error via the existing toast path. Verify only that a failed checkout does not leave a spinner stuck on, and that the user is not told a subscription succeeded when the persist failed.

## 9. Access Control

N/A — `createSubscriptionCheckout` already calls `assertTrustedOrigin()` plus `assertPermission(access, 'billing.manage')`, and the webhook already verifies a timing-safe token before parsing the body. No permission changes are needed; do not weaken either check while editing these functions.

## 10. Validation

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> Note: `pnpm <script>` currently fails in this environment with `EPERM: operation not permitted, mkdir '~/Library/pnpm/.tools/...'`. Use the direct binaries above.

> There is one pre-existing failing test, `src/lib/time-tracker/payroll-periods.test.ts` (date-dependent). Do not mistake it for a regression caused by this work; it is tracked separately in `plans/fix-payroll-period-test-time-bomb`.

Additional manual validation, in a Xendit sandbox:

1. Load the billing panel and start a checkout. Expect `checkoutUrl` to be returned and a `subscription_invoices` row to exist with a populated `xenditPaymentSessionId`.
2. Complete the sandbox payment. Expect exactly one `subscription_payments` row with `status = 'PAID'`, the invoice flipped to `PAID`, and the subscription's period extended.
3. Replay the same webhook. Expect no second payment row and no double period extension.
4. Force the local write to fail (e.g. temporarily break the constraint) and confirm no orphaned Xendit session is left unbilled, or that compensation ran.

## 11. Sequencing

- [ ] Phase 1 — Verify First items 1–4; establish whether this is a latent bug or a live incident.
- [ ] Phase 2 — Fix call site 1 (checkout). Independently shippable and unblocks revenue.
- [ ] Phase 3 — Fix call site 2 (webhook success branch). Independently shippable.
- [ ] Phase 4 — Add the `db.transaction` guard test.
- [ ] Phase 5 — Sandbox end-to-end validation.

Phases 2 and 3 can ship separately; phase 4 should not be deferred past the same release.

## 12. Risks & Considerations

| Risk                                                                                               | Mitigation                                                                                                                    |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Switching to the WebSocket driver changes connection behaviour app-wide                            | Scope it to the billing module in a separate client, or avoid it entirely by using `batch` and restructuring                  |
| Restructuring the webhook loses the `createdPayment` idempotency guard and double-extends a period | Add the replay test (validation step 3) before changing the branch; assert on period end, not just on row counts              |
| The external Xendit session is created before the local write, so a failure orphans it             | Decide the ordering explicitly; add compensation if the order stays                                                           |
| A customer was already charged against an orphaned session                                         | Verify First item 4; if `subscription_payments` is empty while `subscriptions` is non-empty, stop and treat as an incident    |
| Real money is involved                                                                             | Validate in the Xendit sandbox first; keep the existing timing-safe webhook token check and `assertPermission` call untouched |

**Rollback:** this change is code-only with no schema change, so rollback is a redeploy of the previous build. That is only safe if the previous build's checkout was not already creating orphaned sessions — check Verify First item 4 before assuming rollback is a neutral action.

## 13. Open Questions

- [ ] Is billing live? Has any real payment ever succeeded? (Determines bug fix vs. incident.)
- [ ] For call site 1, do we reorder the Xendit call after the local write, or keep the order and add compensation?
- [ ] For call site 2, is `db.batch` with a restructuring acceptable, or do we adopt the WebSocket driver just for billing?
- [ ] Should the webhook return a non-2xx on an unknown invoice so Xendit retries? (Related finding; decide here so the two fixes do not conflict.)
- [ ] Should the `db.transaction` guard run as a unit test, a lint rule, or a CI grep step?
