# Fix Newsletter Subscribe Dedupe and Email Amplification

> **Status:** 📋 Planned

## Status

- [ ] Verify the dedupe guard is dead code (see Verify First).
- [ ] Decide whether both emails should be awaited or queued.
- [ ] Replace `onConflictDoUpdate` with a first-insert check.
- [ ] Remove the wildcard CORS header.
- [ ] Add rate limiting.
- [ ] Add a regression test proving a repeat subscribe sends no email.
- [ ] Validate: typecheck, lint, tests.

## Verify First (No Code Change)

- [ ] **Confirm the guard can never fire (local, instant).**
      `bash
    grep -n -B 4 -A 14 "onConflictDoUpdate" src/lib/server/newsletter.server.ts
    `
      Expected: `INSERT ... .onConflictDoUpdate({ target: newsletterSubscribers.email, set: { status: 'active' } }).returning({ id, email })` followed by `const alreadySubscribed = result.length === 0`.

      `ON CONFLICT DO UPDATE ... RETURNING` always returns the affected row, so `result.length` is always `1` and `alreadySubscribed` is permanently `false`. The `if (alreadySubscribed)` block below it is unreachable.

- [ ] **Confirm nothing else dedupes (local).**
      `bash
    grep -rn "alreadySubscribed\|newsletter_subscribers\|newsletterSubscribers" src/ --include=*.ts --include=*.tsx
    `

- [ ] **Confirm the endpoint is open and throttle-free (local).**
      `bash
    grep -rn "ratelimit\|rate-limit\|rateLimit\|429" src/routes/api/newsletter/ src/lib/server/newsletter.server.ts
    grep -n -A 6 "corsHeaders" src/routes/api/newsletter/subscribe.ts
    `
      Expected: no rate limiting anywhere, and `'Access-Control-Allow-Origin': '*'`.

- [ ] **Confirm the recipient is hardcoded (local).**
      `bash
    grep -n "info@\|NEWSLETTER_\|teamEmail\|to:" src/lib/server/newsletter.server.ts
    `
      This determines who receives the amplified internal notification flood.

- [ ] **Confirm the delivery path (local).**
      `bash
    grep -n "Resend\|resend\|nodemailer\|smtp" src/lib/server/mailer.ts
    `
      Establishes which provider quota the amplification would exhaust.

- [ ] **Size the exposure (needs DB access).** Count distinct subscribers and check for repeated subscribe activity that suggests the endpoint has already been driven:
      `sql
    SELECT count(*) FROM newsletter_subscribers;
    SELECT status, count(*) FROM newsletter_subscribers GROUP BY status;
    SELECT date_trunc('hour', subscribed_at) AS hour, count(*)
    FROM newsletter_subscribers GROUP BY 1 ORDER BY 1 DESC LIMIT 24;
    `
      If the hourly counts show spikes, the endpoint has already been exercised beyond normal signups.

- [ ] **Check provider quota usage (needs Resend/SMTP dashboard access).** Look for unusual send volume around any spike found above. If quota has been consumed, it affects password resets and workspace invites too, since they share `mailer.ts`.

## 1. Goal

Make the newsletter subscribe endpoint idempotent, and stop it being usable as an open email relay.

The endpoint's deduplication guard is unreachable, so every call sends both a welcome email to the submitted address and an internal notification. Because the endpoint is unauthenticated, unthrottled, and advertises `Access-Control-Allow-Origin: *`, it can be driven in a loop to send unbounded mail to arbitrary third-party addresses from the verified sending domain, and to flood the internal recipient.

## 2. Context Summary

**The dead guard.** `src/lib/server/newsletter.server.ts:37-64`:

```ts
const result = await db
  .insert(newsletterSubscribers)
  .values({ email: normalized })
  .onConflictDoUpdate({
    target: newsletterSubscribers.email,
    set: { status: 'active' },
  })
  .returning({
    id: newsletterSubscribers.id,
    email: newsletterSubscribers.email,
  })

const alreadySubscribed = result.length === 0

if (alreadySubscribed) {
  const [existing] = await db
    .select({ id: newsletterSubscribers.id })
    .from(newsletterSubscribers)
    .where(sql`lower(${newsletterSubscribers.email}) = ${normalized}`)
    .limit(1)

  if (existing) {
    return { success: true as const, alreadySubscribed: true as const }
  }
}
```

With `ON CONFLICT DO UPDATE`, PostgreSQL returns the row whether it was inserted or updated. `result.length` is therefore always `1`, `alreadySubscribed` is always `false`, and the early return — including its redundant follow-up `SELECT` — never executes. The intent was clearly "only send on first insert"; the implementation cannot express it.

**What runs instead.** `:66-73`:

```ts
// Fire-and-forget: send welcome email to subscriber + notify the team.
// We never block the API response on email delivery.
void sendWelcomeEmail(normalized).catch((err) =>
  console.error('[newsletter] Failed to send welcome email:', err),
)
void sendTeamNotification(normalized).catch((err) =>
  console.error('[newsletter] Failed to send team notification:', err),
)
```

Note this is also an instance of the fire-and-forget class of defect in `plans/await-serverless-background-writes`: on Vercel the isolate can be frozen when the response returns, so these emails may not complete at all. The observable, provable bug is the broken dedupe; the delivery reliability issue is a separate finding that happens to live in the same lines.

**The exposure.** `src/routes/api/newsletter/subscribe.ts:10-14` sets `'Access-Control-Allow-Origin': '*'` with `POST, OPTIONS` allowed, and there is no rate limiting in the repository — a grep for rate-limit constructs returns only the Better Auth configuration, which covers `/api/auth/*` and not this route.

**Relevant schema.** `src/db/schema.ts:1325-1332` — `newsletterSubscribers` has `email` `varchar(255) NOT NULL UNIQUE` and `status varchar(20) NOT NULL DEFAULT 'active'`. The unique constraint is what makes the correct fix possible.

**Contrast with a correct implementation.** `src/lib/server/workspace-invites.server.ts:242-267` uses `onConflictDoUpdate` appropriately for invite creation — but it inspects the returned row rather than inferring "was this new" from a row count, which is why it works. That is the pattern to follow for intent, and `.onConflictDoNothing().returning()` is the cleaner tool when the question is genuinely "was a row inserted".

**Assumptions to confirm:** that the newsletter form posts same-origin (it does — `NewsletterSection.tsx:20` posts to a relative URL), which is why the wildcard CORS header is unnecessary.

## 3. Scope

- `[FIX]` Replace the insert so a repeat subscribe is genuinely detected and returns early without sending anything.
- `[FIX]` Delete the now-redundant follow-up `SELECT` inside the unreachable branch.
- `[FIX]` Remove `Access-Control-Allow-Origin: '*'` from the route.
- `[FIX]` Add rate limiting to the endpoint (per-IP at minimum).
- `[FIX]` Add a regression test asserting a second subscribe for the same address sends no email.
- `[CHECK]` Confirm the newsletter form is same-origin before removing CORS.
- `[CHECK]` Confirm the `status` transition semantics — if `onConflictDoUpdate` was deliberately used to _reactivate_ an unsubscribed address, that behaviour must be preserved while still not re-sending.
- `[CHECK]` Determine whether either email should be awaited (cross-reference `plans/await-serverless-background-writes`).

## 4. Out of Scope

- The general fire-and-forget pattern across the other ~40 call sites — that is `plans/await-serverless-background-writes`. This plan decides only what happens to these two emails.
- Any redesign of the welcome or team-notification email content.
- Full double-opt-in confirmation flow, unless the decision in Section 13 goes that way.
- Unsubscribe handling.
- The `subscribeToNewsletter` email-normalisation rules beyond what the unique constraint already handles.

## 5. Affected Files and Folders

```txt
plans/newsletter-subscribe-dedupe/
  PLAN.md                                                    (NEW)

src/
  lib/server/
    newsletter.server.ts                                     (MODIFY)
      - :37-64  replace onConflictDoUpdate + result.length
                inference with an explicit "was inserted" check
      - :54-64  delete the unreachable follow-up SELECT
      - :66-73  decide await vs queue for the two sends
  routes/api/newsletter/
    subscribe.ts                                             (MODIFY)
      - :10-14  remove the wildcard CORS header
      - add per-IP rate limiting before the DB write
  lib/server/__tests__/
    newsletter-subscribe.test.ts                             (NEW)
      - first subscribe sends once
      - second subscribe for the same address sends nothing
      - re-subscribe after unsubscribe reactivates without emailing
      - rate limit returns 429 past the threshold

Possible additional file:
  lib/server/rate-limit.server.ts                            (NEW, if no
                                                              shared limiter
                                                              exists yet)
```

## 6. Database Design

N/A — no schema change. The existing `email` unique constraint provides the conflict target. Confirm `newsletter_subscribers.email` is still declared `.unique()` and that the constraint exists in the generated migrations before relying on `ON CONFLICT` (a partial/inconsistent constraint would make the conflict target invalid).

## 7. Backend Implementation

**Correct the insert.** The question being asked is "was a row inserted?", which `ON CONFLICT DO NOTHING ... RETURNING` answers directly:

- Use `.onConflictDoNothing({ target: newsletterSubscribers.email }).returning({ id: newsletterSubscribers.id })`.
- If nothing is returned, the address already existed: return the `alreadySubscribed: true` result immediately and send no email.
- If a row is returned, it is a genuine first insert: proceed to the sends.

If reactivating an unsubscribed address is required (Section 3), handle it as an explicit second step — a targeted `UPDATE ... SET status = 'active' WHERE email = ?` — rather than by relying on `onConflictDoUpdate` and then trying to infer insert-vs-update from a row count. Keep the reactivation and the "should we email" decision as two separate, readable steps.

**Delete the redundant query.** The `if (alreadySubscribed)` block's follow-up `SELECT` exists only to compensate for the broken inference. Once the branch is driven by a real signal, the `SELECT` is dead.

**Remove the wildcard CORS.** The form posts same-origin (Verify First), so the header is unnecessary. Removing it also means a cross-origin attempt needs a preflight, which the route will refuse.

**Rate limit.** No shared limiter exists in the repository, so either introduce a small server-side limiter (per-IP, using the existing `readClientIp` helper — noting its own trust caveat) or reuse Better Auth's limiter if it is practical to call from a custom route. Bound it tightly: the endpoint performs one DB write and up to two emails, so a low ceiling (for example a handful per hour per IP) is appropriate. Record the chosen limit in Section 13. Note that in-memory limiter state is per-instance on Vercel — if a durable limit is required, it needs a shared store, and that trade-off should be stated rather than assumed.

**Sends.** Decide per Section 13, but the default recommendation is to await both with `Promise.allSettled` so a delivery failure is logged within the request rather than lost when the isolate freezes — and to treat email failure as non-fatal to the subscribe result, since the subscription itself has already been recorded.

## 8. Frontend Implementation

N/A — no user-visible change. Verify only that:

- the success message still appears on a first subscribe,
- a repeat subscribe still shows a success state rather than an error (the current intent of `alreadySubscribed: true` is a friendly "you're already with us" message — preserve it),
- a 429 from the new rate limit surfaces as a readable message rather than a silent failure.

## 9. Access Control

N/A — the endpoint is intentionally public (it is a marketing signup form). This plan adds volume controls, not authentication.

| Actor                              | Before                        | After               |
| ---------------------------------- | ----------------------------- | ------------------- |
| First-time subscriber, same-origin | recorded + 2 emails           | recorded + 2 emails |
| Repeat subscriber, same-origin     | recorded + 2 emails **(bug)** | no emails           |
| Cross-origin caller                | allowed (wildcard CORS)       | refused             |
| Looping caller                     | unlimited                     | rate limited        |

## 10. Validation

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> Note: `pnpm <script>` currently fails here with `EPERM ... ~/Library/pnpm/.tools/...`. Use the direct binaries.

> One pre-existing failure, `src/lib/time-tracker/payroll-periods.test.ts` — not a regression from this work.

Manual checks:

1. Subscribe with a fresh address. Expect one welcome email and one team notification.
2. Subscribe again with the same address. Expect **no** new emails and a friendly already-subscribed response. Count sends in the provider dashboard to confirm, not just the response body.
3. Subscribe with the same address in different case and with surrounding whitespace. Expect it to be treated as a repeat (the code lowercases and trims).
4. Issue rapid repeated requests. Expect a 429 past the threshold.
5. From a different origin, attempt a credentialed POST. Expect it to be blocked by CORS now that the wildcard is gone.
6. Confirm the `newsletter_subscribers` table has exactly one row per distinct address after all of the above.

## 11. Sequencing

- [ ] Phase 1 — Verify First; confirm the dead guard and check whether the endpoint has already been abused (DB + provider dashboard).
- [ ] Phase 2 — Fix the insert and delete the redundant query. This alone stops the amplification of _repeat_ requests.
- [ ] Phase 3 — Remove the wildcard CORS header.
- [ ] Phase 4 — Add rate limiting.
- [ ] Phase 5 — Decide and apply the send strategy (await vs queue), coordinated with `plans/await-serverless-background-writes`.
- [ ] Phase 6 — Regression tests.

Phase 2 is the highest-value single change. Phases 3 and 4 are independent and small.

## 12. Risks & Considerations

| Risk                                                                                                                       | Mitigation                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Removing wildcard CORS breaks an integration that posts cross-origin                                                       | Verify First confirms the form is same-origin; grep for any other caller before removing                                                   |
| Fixing the dedupe means legitimate re-subscribers stop receiving the welcome email they expect                             | This is the intended behaviour; confirm the UI copy for the `alreadySubscribed` case is friendly rather than an error                      |
| Reactivation semantics are lost if `onConflictDoUpdate` is dropped naively                                                 | Implement reactivation as an explicit `UPDATE` step and test the subscribe → unsubscribe → re-subscribe path                               |
| Awaiting the sends increases endpoint latency                                                                              | Use `Promise.allSettled` and keep the result non-fatal; the subscription is already persisted, so a mail failure must not fail the request |
| The rate limiter is per-instance in memory on Vercel, so it is only partially effective                                    | State the limitation explicitly; if a hard limit is required, use a shared store and note the added dependency                             |
| Email quota exhaustion affects password resets and invites, which share `mailer.ts`                                        | Check provider quota in Verify First; if already consumed, treat as an incident affecting those flows                                      |
| The endpoint can be used to send mail to arbitrary third-party addresses from the verified domain (phishing amplification) | Rate limiting reduces but does not eliminate this; consider double opt-in (Section 13) as the durable fix                                  |

**Rollback:** code-only, no schema change; revert the commit. Rolling back re-opens the amplification, so prefer fixing forward if a rollback is needed for unrelated reasons.

## 13. Open Questions

- [ ] Should subscription require double opt-in (confirm-by-email) rather than a single request? This is the only fix that fully removes the ability to send mail to arbitrary third-party addresses, at the cost of a confirmation step.
- [ ] What is the rate-limit threshold, keyed on what (IP, and/or normalized email), and is per-instance in-memory limiting acceptable or is a shared store required?
- [ ] Should an unsubscribed address be reactivated by a new subscribe, and should reactivation send the welcome email? (If yes, the welcome email is no longer strictly "first insert only".)
- [ ] Are the two emails best awaited or handed to a queue? Cross-reference `plans/await-serverless-background-writes` so the two plans agree rather than each deciding separately.
- [ ] Should a failed email be retried, or is it acceptable to log and drop given the subscription is already recorded?
