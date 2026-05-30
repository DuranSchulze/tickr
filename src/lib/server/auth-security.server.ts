import { db } from '#/db'
import { sessions, users, workspaceMembers, auditLogs } from '#/db/schema'
import { and, eq, ne, desc, gte } from 'drizzle-orm'
import { sendEmail } from '#/lib/server/mailer'
import { renderSuspiciousLoginEmail } from '#/lib/server/email-templates/suspicious-login'
import type { KnownDevice } from '#/lib/server/email-templates/suspicious-login'
import { geolocateIp } from '#/lib/server/geoip'

const ALERT_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour

function getResetUrl(): string {
  if (process.env.BETTER_AUTH_URL) {
    return `${process.env.BETTER_AUTH_URL}/auth/forgot-password`
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL
    const base = host.startsWith('http') ? host : `https://${host}`
    return `${base}/auth/forgot-password`
  }
  return 'http://localhost:3000/auth/forgot-password'
}

export async function checkAndSendSuspiciousLoginAlert(session: {
  id: string
  userId: string
  ipAddress?: string | null
  userAgent?: string | null
}): Promise<void> {
  // Never block the login — wrap everything in a top-level try/catch
  try {
    if (!session.ipAddress) return

    // ── 1. Fetch previous sessions for this user ────────────────────────────
    const previousSessions = await db
      .select({
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .where(
        and(eq(sessions.userId, session.userId), ne(sessions.id, session.id)),
      )
      .orderBy(desc(sessions.createdAt))
      .limit(20)

    // ── 2. No previous sessions → first-ever login, no baseline to compare ──
    const knownIps = new Set(
      previousSessions
        .map((s) => s.ipAddress)
        .filter((ip): ip is string => ip !== null),
    )
    if (knownIps.size === 0) return

    // ── 3. IP already known → no alert needed ───────────────────────────────
    if (knownIps.has(session.ipAddress)) return

    // ── 4. Rate limit: skip if an alert was already sent in the last hour ───
    const cooldownCutoff = new Date(Date.now() - ALERT_COOLDOWN_MS)
    const [recentAlert] = await db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'SUSPICIOUS_LOGIN_ALERT'),
          eq(auditLogs.targetId, session.userId),
          gte(auditLogs.createdAt, cooldownCutoff),
        ),
      )
      .limit(1)
    if (recentAlert) return

    // ── 5. Fetch user details for the email ─────────────────────────────────
    const [user] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1)
    if (!user) return

    // ── 6. Get a workspace ID for the audit log ──────────────────────────────
    const [membership] = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, session.userId))
      .limit(1)

    // ── 7. Enrich IP with geolocation (optional, degrades gracefully) ────────
    const location = await geolocateIp(session.ipAddress)

    // ── 8. Build known-devices list (deduplicated, max 5) ───────────────────
    const knownDevices: KnownDevice[] = []
    for (const s of previousSessions) {
      if (!s.ipAddress) continue
      if (knownDevices.some((d) => d.ipAddress === s.ipAddress)) continue
      knownDevices.push({
        ipAddress: s.ipAddress,
        location: null, // skip geo calls for known devices to keep latency low
        lastSeen: s.createdAt.toISOString(),
      })
      if (knownDevices.length >= 5) break
    }

    // ── 9. Render and send the alert email ──────────────────────────────────
    const { subject, html, text } = renderSuspiciousLoginEmail({
      name: user.name,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent ?? null,
      location,
      timestamp: new Date().toISOString(),
      knownDevices,
      resetUrl: getResetUrl(),
    })

    await sendEmail({ to: user.email, subject, html, text })

    // ── 10. Record the alert in audit_logs for rate limiting ─────────────────
    if (membership) {
      await db.insert(auditLogs).values({
        workspaceId: membership.workspaceId,
        actorId: session.userId,
        action: 'SUSPICIOUS_LOGIN_ALERT',
        targetType: 'user',
        targetId: session.userId,
      })
    }
  } catch (err) {
    // Log but never surface — security alerts must not interrupt login
    console.error('[auth-security] suspicious login check failed:', err)
  }
}
