# Newsletter Email Capture

> **Status:** ✅ Done

## Status

- [x] Plan created and reviewed.
- [x] Database migration generated: `newsletterSubscribers` table.
- [x] Backend: Zod schema, server function, duplicate detection.
- [x] Frontend: Newsletter section component with email input, success/error states.
- [x] Integrated into landing page between CTA band and footer.
- [x] Validation: typecheck, lint, manual submission test.

---

## 1. Goal

Add a newsletter email capture section to the public landing page so visitors can subscribe for product updates, and include a visible way to contact the Tickr team. This gives potential customers a low-commitment way to stay connected before they're ready to sign up.

---

## 2. Scope

- **Database:** `newsletterSubscribers` table — email, subscribed at, status.
- **Backend:** Single server function: `subscribeToNewsletterFn(email)` with Zod validation and duplicate detection.
- **Frontend:** `NewsletterSection` component — email input, submit button, success confirmation, "Contact us" secondary link.
- **Placement:** Landing page, between CTA band and Footer.

## 3. Out of Scope

- Full contact form with message body.
- Email automation / Mailchimp / Resend integration (store-only for now).
- Double opt-in / confirmation emails.
- Unsubscribe flow.
- Admin panel to view/manage subscribers.
- Rate limiting beyond what better-auth already provides.

---

## 4. Affected Files

```txt
drizzle/
  0004_add_newsletter.sql                          (NEW migration)

src/
  db/
    schema.ts                                      (MODIFY: new table)

  lib/
    server/
      newsletter.server.ts                         (NEW: server function)

  components/
    marketing/
      NewsletterSection.tsx                        (NEW: section component)

  routes/
    index.tsx                                      (MODIFY: add section)

  lib/
    landing-content.ts                             (MODIFY: add copy)
```

---

## 5. Database Design

```typescript
export const newsletterSubscribers = pgTable('newsletter_subscribers', {
  id: varchar({ length: 16 })
    .primaryKey()
    .$defaultFn(() => createId()),
  email: varchar({ length: 255 }).notNull().unique(),
  status: varchar({ length: 20 }).notNull().default('active'), // active | unsubscribed
  subscribedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
})
```

---

## 6. Backend

```typescript
// src/lib/server/newsletter.server.ts
const subscribeSchema = z.object({
  email: z.string().email().max(255),
})

export const subscribeToNewsletterFn = createServerFn({ method: 'POST' })
  .validator(subscribeSchema)
  .handler(async ({ data }) => {
    // Check for existing subscriber
    // Insert with ON CONFLICT DO NOTHING (idempotent)
    // Return { success: true, alreadySubscribed: boolean }
  })
```

---

## 7. Frontend

Section layout:

```
┌─────────────────────────────────────────────┐
│          ✉️  Stay in the loop                │
│                                              │
│   Product updates, early access, and          │
│   tips for your team — straight to your       │
│   inbox. No spam, unsubscribe anytime.        │
│                                              │
│  ┌─────────────────────────┐ ┌────────────┐ │
│  │ your@email.com           │ │  Subscribe  │ │
│  └─────────────────────────┘ └────────────┘ │
│                                              │
│       Prefer to talk? Contact us →           │
└─────────────────────────────────────────────┘
```

States:

- **Idle**: Email input + subscribe button + contact link
- **Loading**: Submit button shows spinner, input disabled
- **Success**: "You're in! Thanks for subscribing." + checkmark animation
- **Error**: "Something went wrong. Try again or contact us."
- **Already subscribed**: "You're already on the list!"

---

## 8. Open Questions

- [ ] Team contact email — use a general `hello@tickr.example.com` or something else?
- [ ] Should the newsletter section also appear on the `/pricing` page?
- [ ] Do we want to connect this to an email provider (Resend, Mailchimp) now or later?
