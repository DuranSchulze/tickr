import '@tanstack/react-start/server-only'
import { db } from '#/db'
import { newsletterSubscribers } from '#/db/schema'
import { sql } from 'drizzle-orm'
import { BRAND } from '#/lib/brand'

function html(text: string) {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 20px;color:#1a1a1a"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding-bottom:24px"><h1 style="margin:0;font-size:20px;font-weight:800;color:#0f766e">${BRAND.name}</h1></td></tr><tr><td style="padding-bottom:16px;font-size:15px;line-height:1.6">${text}</td></tr><tr><td style="padding-top:24px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">${BRAND.name} &mdash; ${BRAND.tagline}</td></tr></table></body></html>`
}

async function sendWelcomeEmail(to: string) {
  const { sendEmail } = await import('#/lib/server/mailer')

  await sendEmail({
    to,
    subject: `You're on the list — ${BRAND.name}`,
    html: html(
      `<p>Thanks for subscribing to ${BRAND.name} updates!</p><p>We'll let you know about new features, tips for your team, and any changes that matter. No spam — and you can unsubscribe anytime.</p><p>In the meantime, <a href="https://tickr-nu.vercel.app" style="color:#0f766e;font-weight:600">open Trackly</a> and start tracking.</p>`,
    ),
    text: `Thanks for subscribing to ${BRAND.name} updates!\n\nWe'll let you know about new features, tips for your team, and any changes that matter. No spam — and you can unsubscribe anytime.\n\nOpen Trackly: https://tickr-nu.vercel.app`,
  })
}

async function sendTeamNotification(email: string) {
  const { sendEmail } = await import('#/lib/server/mailer')

  await sendEmail({
    to: 'info@filepino.com',
    subject: `New newsletter subscriber — ${BRAND.name}`,
    html: html(
      `<p>A new subscriber joined the ${BRAND.name} newsletter:</p><p style="font-size:18px;font-weight:700;margin:16px 0">${email}</p><p style="font-size:12px;color:#9ca3af">Database record created. Subscribed at ${new Date().toISOString()}.</p>`,
    ),
    text: `New newsletter subscriber: ${email}\n\nSubscribed at ${new Date().toISOString()}\n\nView in database.`,
  })
}

export async function subscribeToNewsletter(email: string) {
  const normalized = email.trim().toLowerCase()

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

  // Fire-and-forget: send welcome email to subscriber + notify the team.
  // We never block the API response on email delivery.
  void sendWelcomeEmail(normalized).catch((err) =>
    console.error('[newsletter] Failed to send welcome email:', err),
  )
  void sendTeamNotification(normalized).catch((err) =>
    console.error('[newsletter] Failed to send team notification:', err),
  )

  return { success: true as const, alreadySubscribed: false as const }
}
