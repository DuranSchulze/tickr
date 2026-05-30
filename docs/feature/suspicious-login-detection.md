# Feature Plan — Suspicious Login Detection (New-IP Email Alert)

> **Status:** Draft  
> **Date:** 2026-05-30  
> **Priority:** Medium  
> **Effort:** Small (~5 files)

---

## 1. Problem Statement

Currently, Tickr sends an email only for password resets. There is no security notification when a user signs in from a new or unfamiliar IP address. If an account credential is compromised, the legitimate user has no way of knowing that someone else is accessing their account.

**Threat scenario:** An attacker obtains a user's email/password (e.g., via phishing, credential stuffing, or a third-party breach) and signs in from a different IP/location. The real user is never alerted.

---

## 2. Goal

When a user successfully signs in from an **IP address that differs from their previous sign-in IPs**, send them a notification email with contextual information about the login (IP address, approximate location, timestamp, device/user-agent). This gives the user a chance to take action if the login was unauthorized.

---

## 3. Current State Assessment

| Area                  | Current State                                                                         | Gap                                                           |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Session tracking**  | Better Auth stores `ipAddress` and `userAgent` on the `sessions` table                | No logic to compare new session IP against previous sessions  |
| **Email capability**  | `sendEmail()` in `src/lib/server/mailer.ts` supports SMTP and Resend                  | No suspicious-login email template exists                     |
| **Auth hooks**        | Better Auth `databaseHooks` are configured for `user.create.before` (domain blocking) | No `session.create.after` hook to inspect IP changes          |
| **IP enrichment**     | No IP geolocation service integrated                                                  | City/region/country data would make the alert more actionable |
| **User notification** | No opt-in/opt-out setting for security alerts                                         | Users may want control over which alerts they receive         |

---

## 4. Technical Design

### 4.1 High-Level Flow

```
User signs in
    │
    ▼
Better Auth creates a new session
    │
    ▼
session.create.after hook fires
    │
    ├── Extract new session's ipAddress
    ├── Query all previous sessions for the same userId
    ├── Collect distinct IPs from previous sessions
    │
    ├── If new IP is in the known set ──→ No alert (skip)
    │
    └── If new IP is NOT in the known set
            │
            ├── (Optional) Enrich IP with geolocation
            ├── Send suspicious-login email
            └── (Optional) Log the event
```

### 4.2 Architecture Decisions

| Decision                | Choice                                            | Rationale                                                                               |
| ----------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **When to check**       | On session creation (every sign-in)               | Catches all login events including new device logins and cookie-based re-authentication |
| **IP comparison scope** | All previous sessions for the user                | Accounts for users who rotate between a few known locations (home, office, VPN)         |
| **Geolocation**         | Optional — use free tier of ipapi.co or ipinfo.io | Adds rich context to the email (city, region) but works without it                      |
| **Rate limiting**       | Max 1 alert per user per hour                     | Prevents email flooding if a user has many new IPs in short succession                  |
| **Opt-out**             | No opt-out in v1; add later if users request it   | Security notifications should be non-optional for safety                                |

---

## 5. Implementation Plan

### Phase 1 — Core Detection & Email (3 files)

#### 5.1 Create email template

**New file:** `src/lib/server/email-templates/suspicious-login.ts`

```typescript
export type SuspiciousLoginEmailInput = {
  name: string | null
  ipAddress: string
  userAgent: string | null
  location: string | null // e.g. "Manila, Philippines" or null
  timestamp: string // ISO string
  knownLocations: KnownDevice[] // list of previously seen IPs/locations
}

export type KnownDevice = {
  ipAddress: string
  location: string | null
  lastSeen: string
}
```

- Renders a `RenderedEmail` (subject, html, text) in the same style as `reset-password.ts`
- Email body:
  - Greeting with user's name
  - Warning: "We detected a sign-in to your Tickr account from a new location"
  - Context table: IP address, approximate location, browser/device, timestamp
  - List of known recent sign-in locations for comparison
  - Action prompt: "If this was you, you can ignore this. If not, reset your password immediately."
  - Link to reset password: `<APP_URL>/auth/forgot-password`
- Subject: "New sign-in to your Tickr account"

#### 5.2 Add session creation hook

**Modified file:** `src/lib/auth.ts`

Add a `session.create.after` hook in the `databaseHooks` config:

```typescript
databaseHooks: {
  user: {
    create: {
      before: async (user) => {
        if (isBlockedDomain(user.email)) {
          return false
        }
      },
    },
  },
  session: {
    create: {
      after: async (session) => {
        // Only proceed if we have an IP address
        if (!session.ipAddress) return

        // Get all previous sessions for this user (excluding the new one)
        const previousSessions = await db
          .select({
            ipAddress: schema.sessions.ipAddress,
            createdAt: schema.sessions.createdAt,
            userAgent: schema.sessions.userAgent,
          })
          .from(schema.sessions)
          .where(
            and(
              eq(schema.sessions.userId, session.userId),
              ne(schema.sessions.id, session.id),
            ),
          )
          .orderBy(desc(schema.sessions.createdAt))
          .limit(20)

        // Collect distinct IPs from previous sessions
        const knownIps = new Set(
          previousSessions
            .map((s) => s.ipAddress)
            .filter((ip): ip is string => ip !== null),
        )

        // If the new IP is already known, no alert needed
        if (knownIps.has(session.ipAddress)) return

        // Rate-limit: check if an alert was already sent within the last hour
        const recentAlert = await checkRecentAlert(session.userId)
        if (recentAlert) return

        // Fetch user info for the email
        const [user] = await db
          .select({ name: schema.users.name, email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.id, session.userId))
          .limit(1)

        if (!user) return

        // (Optional) Enrich IP with geolocation
        const location = await geolocateIp(session.ipAddress)

        // Send notification email
        const { subject, html, text } = renderSuspiciousLoginEmail({
          name: user.name,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          location,
          timestamp: new Date().toISOString(),
          knownLocations: buildKnownLocations(previousSessions),
        })

        await sendEmail({ to: user.email, subject, html, text })
      },
    },
  },
},
```

**New imports needed in `auth.ts`:**

```typescript
import { and, eq, ne, desc } from 'drizzle-orm'
import { renderSuspiciousLoginEmail } from './server/email-templates/suspicious-login'
```

#### 5.3 Add SQL imports

**Modified file:** `src/lib/auth.ts`

The `ne` operator needs to be imported from drizzle-orm (currently likely not imported).

### Phase 2 — IP Geolocation (Optional — 1 file)

#### 5.4 Create IP geolocation utility

**New file:** `src/lib/server/geoip.ts`

```typescript
export async function geolocateIp(ip: string): Promise<string | null> {
  // Skip private/internal IPs
  if (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.')
  ) {
    return null
  }

  const token = process.env.IPINFO_TOKEN
  if (!token) return null

  try {
    const res = await fetch(`https://ipinfo.io/${ip}?token=${token}`)
    if (!res.ok) return null
    const data = await res.json()
    // e.g. "Manila, National Capital Region, PH"
    const parts = [data.city, data.region, data.country].filter(Boolean)
    return parts.length > 0 ? parts.join(', ') : null
  } catch {
    return null
  }
}
```

### Phase 3 — Rate Limiting & Known Devices Helpers (1 file)

#### 5.5 Known-location helpers & rate limiting

**New file or inline in auth.ts:**

Helper to build known-location list from previous sessions:

```typescript
async function buildKnownLocations(
  sessions: Array<{
    ipAddress: string | null
    createdAt: Date | null
    userAgent: string | null
  }>,
): Promise<KnownDevice[]> {
  const results: KnownDevice[] = []
  for (const s of sessions) {
    if (!s.ipAddress) continue
    // Avoid duplicates
    if (results.some((r) => r.ipAddress === s.ipAddress)) continue
    const location = s.ipAddress ? await geolocateIp(s.ipAddress) : null
    results.push({
      ipAddress: s.ipAddress,
      location,
      lastSeen: s.createdAt?.toISOString() ?? '',
    })
  }
  return results.slice(0, 5) // Show up to 5 known devices
}
```

Rate limiter:

```typescript
const ALERT_COOLDOWN_MS = 60 * 60 * 1000 // 1 hour

async function checkRecentAlert(userId: string): Promise<boolean> {
  const oneHourAgo = new Date(Date.now() - ALERT_COOLDOWN_MS)
  // We can store alert timestamps in a new table or use the audit_logs table
  // For v1, keep it simple with an in-memory Map (volatile on server restart)
  // OR store in audit_logs with action='SUSPICIOUS_LOGIN_ALERT'
  ...
}
```

**Recommendation:** Use the existing `audit_logs` table rather than creating a new table. Store the alert event with `action: 'SUSPICIOUS_LOGIN_ALERT'`, `targetId: userId`. Then check:

```typescript
const recentAlert = await db
  .select({ id: auditLogs.id })
  .from(auditLogs)
  .where(
    and(
      eq(auditLogs.action, 'SUSPICIOUS_LOGIN_ALERT' as AuditAction),
      eq(auditLogs.targetId, userId),
      gte(auditLogs.createdAt, oneHourAgo),
    ),
  )
  .limit(1)
```

This requires adding `'SUSPICIOUS_LOGIN_ALERT'` to the `AuditAction` type.

---

## 6. Files to Create / Modify

| Type       | File                                                  | Action                                               |
| ---------- | ----------------------------------------------------- | ---------------------------------------------------- |
| **New**    | `src/lib/server/email-templates/suspicious-login.ts`  | Email template for the alert                         |
| **Modify** | `src/lib/auth.ts`                                     | Add `session.create.after` hook, new imports         |
| **New**    | `src/lib/server/geoip.ts`                             | IP geolocation helper (optional but recommended)     |
| **New**    | `src/lib/server/auth-log.ts`                          | Rate-limiting check and known-devices helper         |
| **Modify** | `src/lib/server/tracker/audit/audit-logger.server.ts` | Add `'SUSPICIOUS_LOGIN_ALERT'` to `AuditAction` type |

**Total: 3 new files, 2 modified files**

---

## 7. Dependencies

### Required

- None — uses existing Better Auth hooks and Drizzle queries

### Optional (for IP geo)

- [ipinfo.io](https://ipinfo.io) free tier (no API key cost for basic usage)  
  Or [ipapi.co](https://ipapi.co) (free for up to 1k req/day)
- Environment variable: `IPINFO_TOKEN` (if using ipinfo.io) — free tier works without a token but has rate limits

---

## 8. Edge Cases & Considerations

| Edge Case                                            | Handling                                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **No previous sessions** (first-time login)          | Don't send alert — there's no baseline to compare against                                                                  |
| **Private IPs** (localhost, LAN)                     | Skip geolocation, but still send alert with "Private network" label                                                        |
| **VPN or NAT** (legitimate IP changes)               | The alert is still useful — user can recognize their VPN exit IP                                                           |
| **Alert fatigue**                                    | Rate-limited to 1 email per hour per user                                                                                  |
| **User has no email**                                | All Tickr users have an email — no issue                                                                                   |
| **Rate limiter on serverless**                       | If using Vercel serverless, the in-memory Map won't persist across cold starts. Use the audit_logs table approach instead. |
| **Concurrent sign-ins** (same IP, multiple sessions) | Only first session triggers the check; the IP is already "known" for subsequent sessions                                   |
| **Email sending failure**                            | Log the error but don't block the login — security alert is advisory                                                       |
| **Cookies cleared / re-login from same IP**          | IP is already known from previous sessions — no alert                                                                      |

---

## 9. Security & Privacy

- IP addresses are only stored in the sessions table (already happening via Better Auth)
- Geolocation data is fetched on-the-fly and not stored permanently
- The email contains the user's own login activity data
- If geolocation is used, consider anonymizing: city/region/country is sufficient; no need for lat/lng or street-level data
- The feature does not block logins — it only notifies. A future iteration could optionally require 2FA on first login from a new IP.

---

## 10. Future Iterations

| Feature                | Description                                                           | Priority |
| ---------------------- | --------------------------------------------------------------------- | -------- |
| **User opt-out**       | Settings toggle to disable suspicious login alerts                    | Low      |
| **Known devices list** | A UI page showing all recent sessions with "Trust this device" action | Medium   |
| **2FA / MFA**          | Time-based one-time password (TOTP) on first login from new IP        | High     |
| **Push notification**  | In-app notification in addition to email                              | Low      |
| **Alert dashboard**    | Admin view of recent suspicious login attempts across the workspace   | Medium   |

---

## 11. Testing Plan

| Test Case                                         | Expected Result                                                |
| ------------------------------------------------- | -------------------------------------------------------------- |
| User signs in from a new IP                       | Email sent with IP, location, and timestamp                    |
| User signs in from a previously used IP           | No email sent                                                  |
| User signs in for the first time ever             | No email sent (no baseline)                                    |
| Multiple sign-ins from new IP in short succession | Only first email sent; subsequent ones blocked by rate limiter |
| Email sending fails                               | Login still proceeds; error logged but no crash                |
| Private IP (127.0.0.1)                            | Alert sent but location shows "Private network"                |
| User signs in after 1 hour cooldown               | New alert sent if IP is still unknown                          |
| Session from Chrome extension (cross-origin)      | Treated like any other session — new IP triggers alert         |
