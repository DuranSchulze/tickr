import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '#/db'
import * as schema from '#/db/schema'
import { sendEmail } from '#/lib/server/mailer'
import { renderVerificationEmail } from '#/lib/server/email-templates/verify-email'
import { renderResetPasswordEmail } from '#/lib/server/email-templates/reset-password'
import { allPasswordRulesPass, isBlockedDomain } from '#/lib/auth-validation'
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
      // Persistent limiter shared by all application instances.
      rateLimit: schema.rateLimits,
    },
  }),
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: 60 * 60,
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        ...renderVerificationEmail(user.name, url),
      })
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
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
    ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
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
  // Shared across serverless instances. Apply the rate_limit migration before deployment.
  rateLimit: {
    enabled: true, // enable in all environments (default: only prod)
    window: 60,
    max: 100,
    storage: 'database',
    customRules: {
      // Stricter limits on auth-sensitive paths
      '/sign-up/email': {
        window: 10,
        max: 3,
      },
      '/request-password-reset': {
        window: 60,
        max: 3,
      },
      '/reset-password': {
        window: 60,
        max: 5,
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const field =
        ctx.path === '/sign-up/email' || ctx.path === '/set-password'
          ? 'password'
          : ['/reset-password', '/change-password'].includes(ctx.path)
            ? 'newPassword'
            : null
      if (!field) return
      const password = ctx.body?.[field]
      if (
        typeof password !== 'string' ||
        password.length > 128 ||
        !allPasswordRulesPass(password)
      ) {
        throw new APIError('BAD_REQUEST', {
          message:
            'Password must be 8–128 characters and include uppercase, lowercase, a number, and a special character.',
        })
      }
    }),
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
