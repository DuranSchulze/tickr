import { betterAuth } from 'better-auth'
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
} from 'better-auth/api'
import { oauthProvider } from '@better-auth/oauth-provider'
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
import {
  isMcpEnabled,
  isMcpPilotUser,
} from '#/lib/server/integrations/mcp-config.server'
import {
  MCP_ACCESS_TOKEN_PREFIX,
  MCP_READ_SCOPE,
  MCP_REFRESH_TOKEN_PREFIX,
  MCP_WRITE_SCOPE,
  hashMcpToken,
} from '#/lib/server/integrations/mcp-token.server'

const RESET_PASSWORD_EXPIRES_IN_SECONDS = 60 * 15
const REMEMBERED_SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30
const REMEMBERED_SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24
/** MCP access tokens are short-lived; disconnect also deletes them outright. */
const MCP_ACCESS_TOKEN_EXPIRES_IN_SECONDS = 60 * 15
const MCP_RESOURCE = `${process.env.BETTER_AUTH_URL ?? ''}/api/mcp`

function isOAuthProviderPath(path: string): boolean {
  return path.startsWith('/oauth2/') || path.startsWith('/.well-known/')
}

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
      // OAuth provider for the read-only MCP pilot.
      oauthClient: schema.oauthClients,
      oauthRefreshToken: schema.oauthRefreshTokens,
      oauthAccessToken: schema.oauthAccessTokens,
      oauthConsent: schema.oauthConsents,
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
      // Unauthenticated MCP client registration creates rows; keep it scarce.
      '/oauth2/register': {
        window: 600,
        max: 5,
      },
      '/oauth2/token': {
        window: 60,
        max: 20,
      },
      '/oauth2/authorize': {
        window: 60,
        max: 20,
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (isOAuthProviderPath(ctx.path)) {
        // The MCP pilot switch hides every OAuth provider endpoint.
        if (!isMcpEnabled()) throw new APIError('NOT_FOUND')
        if (
          ctx.path === '/oauth2/consent' ||
          ctx.path === '/oauth2/authorize'
        ) {
          const session = await getSessionFromCtx(ctx)
          if (session && !isMcpPilotUser(session.user.id)) {
            // Non-pilot users never get a grant. Consent is forced to "deny",
            // which makes the plugin return a validated `access_denied`
            // redirect; authorize is forced through the consent page so a
            // stale consent cannot skip that step.
            if (ctx.path === '/oauth2/consent') {
              return { context: { body: { ...ctx.body, accept: false } } }
            }
            return { context: { query: { ...ctx.query, prompt: 'consent' } } }
          }
        }
        return
      }
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
  plugins: [
    // MCP pilot: read always, write only when the user approves
    // time_entries:write on the consent page. Opaque tokens are looked up on every call so a
    // disconnect takes effect on the next request (spec REQ-2, Q1).
    oauthProvider({
      loginPage: '/api/oauth/login',
      consentPage: '/api/oauth/consent',
      scopes: [MCP_READ_SCOPE, MCP_WRITE_SCOPE, 'offline_access'],
      validAudiences: [MCP_RESOURCE],
      disableJwtPlugin: true,
      storeTokens: { hash: (token) => hashMcpToken(token) },
      prefix: {
        opaqueAccessToken: MCP_ACCESS_TOKEN_PREFIX,
        refreshToken: MCP_REFRESH_TOKEN_PREFIX,
      },
      accessTokenExpiresIn: MCP_ACCESS_TOKEN_EXPIRES_IN_SECONDS,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // Served by src/routes/[.]well-known/oauth-authorization-server/api/auth.ts
      silenceWarnings: { oauthAuthServerConfig: true },
    }),
    // Must stay last so Set-Cookie from other plugins' after-hooks is forwarded.
    tanstackStartCookies(),
  ],
})
