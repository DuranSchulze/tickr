import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '#/db'
import * as schema from '#/db/schema'
import { sendEmail } from '#/lib/server/mailer'
import { renderResetPasswordEmail } from '#/lib/server/email-templates/reset-password'
import { isBlockedDomain } from '#/lib/auth-validation'
import { checkAndSendSuspiciousLoginAlert } from '#/lib/server/auth-security.server'
import { getTrustedOrigins } from '#/lib/server/trusted-origins.server'

const RESET_PASSWORD_EXPIRES_IN_SECONDS = 60 * 15
const REMEMBERED_SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30
const REMEMBERED_SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: getTrustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    resetPasswordTokenExpiresIn: RESET_PASSWORD_EXPIRES_IN_SECONDS,
    sendResetPassword: async ({ user, url }) => {
      const { subject, html, text } = renderResetPasswordEmail({
        name: user.name,
        url,
        expiresInMinutes: RESET_PASSWORD_EXPIRES_IN_SECONDS / 60,
      })
      await sendEmail({ to: user.email, subject, html, text })
    },
  },
  session: {
    expiresIn: REMEMBERED_SESSION_EXPIRES_IN_SECONDS,
    updateAge: REMEMBERED_SESSION_UPDATE_AGE_SECONDS,
  },
  advanced: {
    database: {
      generateId: () => {
        const bytes = new Uint8Array(12)
        crypto.getRandomValues(bytes)
        return Array.from(bytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
      },
    },
    // SameSite=None is required for cookies to be sent inside the Chrome
    // extension iframe (cross-site context). Must be HTTPS-only (Secure flag).
    ...(process.env.NODE_ENV === 'production'
      ? {
          cookies: {
            session_token: {
              attributes: { sameSite: 'none' as const, secure: true },
            },
          },
        }
      : {}),
  },
  // Rate limiting prevents brute-force attacks on auth endpoints.
  // better-auth enables this automatically in production (window: 60 s,
  // max: 100 req) with a built-in stricter rule for /sign-in/email
  // (window: 10 s, max: 3 req). Configuring it explicitly makes the
  // policy visible to developers and enables testing in dev mode.
  //
  // Storage is "memory" for now — switch to "database" if you deploy
  // across multiple instances (Vercel/serverless) so rate-limit state
  // is shared.  Run `npx @better-auth/cli migrate` afterwards to create
  // the rateLimit table.
  rateLimit: {
    enabled: true, // enable in all environments (default: only prod)
    window: 60,
    max: 100,
    storage: 'memory',
    customRules: {
      // Stricter limits on auth-sensitive paths
      '/sign-up/email': {
        window: 10,
        max: 3,
      },
      '/forgot-password': {
        window: 60,
        max: 3,
      },
      '/reset-password': {
        window: 60,
        max: 5,
      },
    },
  },
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
          // Fire-and-forget — never block the login
          void checkAndSendSuspiciousLoginAlert(session)
        },
      },
    },
  },
  plugins: [tanstackStartCookies()],
})
