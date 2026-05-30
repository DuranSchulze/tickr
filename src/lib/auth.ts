import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '#/db'
import * as schema from '#/db/schema'
import { sendEmail } from '#/lib/server/mailer'
import { renderResetPasswordEmail } from '#/lib/server/email-templates/reset-password'
import { isBlockedDomain } from '#/lib/auth-validation'
import { checkAndSendSuspiciousLoginAlert } from '#/lib/server/auth-security.server'

const RESET_PASSWORD_EXPIRES_IN_SECONDS = 60 * 15

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: (() => {
    const origins = [
      'http://localhost:3000',
      'http://localhost:3001',
      ...(process.env.NGROK_URL ? [process.env.NGROK_URL] : []),
      ...(process.env.CHROME_EXTENSION_ORIGIN
        ? [process.env.CHROME_EXTENSION_ORIGIN]
        : []),
      ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
    ]

    if (process.env.VERCEL_URL) {
      origins.push(`https://${process.env.VERCEL_URL}`)
    }
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      origins.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
    }
    if (process.env.VERCEL_BRANCH_URL) {
      origins.push(`https://${process.env.VERCEL_BRANCH_URL}`)
    }

    return origins
  })(),
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
