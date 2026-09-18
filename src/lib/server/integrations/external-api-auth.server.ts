import '@tanstack/react-start/server-only'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { developerAccounts, workspaceApiKeys, workspaces } from '#/db/schema'
import { readClientIp } from '../client-ip.server'
import { createAuditLog } from '../tracker/audit/audit-logger.server'
import { hashApiKey } from './api-keys.server'
import { looksLikeJwt, verifyExternalApiJwt } from './external-api-jwt.server'

export type ExternalApiContext = {
  keyId: string | null
  developerId: string | null
  permissionLevel: 'OWNER' | 'ADMIN' | null
  workspaceId: string
  workspace: {
    id: string
    name: string
    slug: string
    timezone: string
    billableCurrency: string
  }
  createdByUserId: string | null
}

export class ExternalApiError extends Error {
  status: number
  code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ExternalApiError'
    this.status = status
    this.code = code
  }
}

function readPresentedCredential(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice('bearer '.length).trim()
    return token || null
  }

  const headerKey = request.headers.get('x-api-key')?.trim()
  return headerKey || null
}

/**
 * Records a failed public-API authentication.
 *
 * When the workspace is knowable the failure becomes an attributable audit row
 * so brute-force and credential-stuffing attempts leave a trail. An unknown or
 * malformed credential has no workspace to attach to, so it is logged for
 * alerting instead of polluting the audit view with a null workspace.
 *
 * `identifier` must never be credential material: it is the stored token prefix
 * for raw keys (`tokenPrefix`, already how keys are identified at rest) or the
 * key/developer id carried by a verified JWT. The presented secret is never
 * recorded.
 */
async function recordAuthFailure(input: {
  reason: string
  workspaceId?: string | null
  targetType?: 'api_key' | 'developer_account'
  targetId?: string | null
  identifier?: string | null
}): Promise<void> {
  const details = `reason=${input.reason}${
    input.identifier ? ` identifier=${input.identifier}` : ''
  }`

  if (!input.workspaceId) {
    console.warn(`[external-api] Auth failure (unattributed): ${details}`)
    return
  }

  // Awaited rather than the usual fire-and-forget: on serverless a voided
  // promise can be killed once the response returns, which would silently
  // defeat the purpose of a security-detection signal.
  await createAuditLog({
    workspaceId: input.workspaceId,
    action: 'API_KEY_AUTH_FAILURE',
    targetType: input.targetType ?? 'api_key',
    targetId: input.targetId ?? null,
    details,
  })
}

async function buildContextFromKeyRow(
  row: {
    key: typeof workspaceApiKeys.$inferSelect
    workspace: typeof workspaces.$inferSelect
  },
  expectedWorkspaceId: string | null,
  request?: Request,
) {
  const now = new Date()
  if (row.key.revokedAt) {
    await recordAuthFailure({
      reason: 'revoked_api_key',
      workspaceId: row.workspace.id,
      targetId: row.key.id,
      identifier: row.key.tokenPrefix,
    })
    throw new ExternalApiError(401, 'revoked_api_key', 'API key was revoked.')
  }
  if (row.key.expiresAt && row.key.expiresAt.getTime() <= now.getTime()) {
    await recordAuthFailure({
      reason: 'expired_api_key',
      workspaceId: row.workspace.id,
      targetId: row.key.id,
      identifier: row.key.tokenPrefix,
    })
    throw new ExternalApiError(401, 'expired_api_key', 'API key is expired.')
  }
  if (expectedWorkspaceId && row.workspace.id !== expectedWorkspaceId) {
    await recordAuthFailure({
      reason: 'workspace_mismatch',
      workspaceId: row.workspace.id,
      targetId: row.key.id,
      identifier: row.key.tokenPrefix,
    })
    throw new ExternalApiError(401, 'invalid_api_key', 'Invalid API key.')
  }

  await db
    .update(workspaceApiKeys)
    .set({
      lastUsedAt: now,
      lastUsedIp: request ? readClientIp(request) : null,
    })
    .where(eq(workspaceApiKeys.id, row.key.id))

  return {
    keyId: row.key.id,
    developerId: null,
    permissionLevel: null,
    workspaceId: row.workspace.id,
    workspace: {
      id: row.workspace.id,
      name: row.workspace.name,
      slug: row.workspace.slug,
      timezone: row.workspace.timezone,
      billableCurrency: row.workspace.billableCurrency,
    },
    createdByUserId: row.key.createdByUserId,
  } satisfies ExternalApiContext
}

async function buildContextFromDeveloperRow(
  row: {
    account: typeof developerAccounts.$inferSelect
    workspace: typeof workspaces.$inferSelect
  },
  expectedWorkspaceId: string | null,
): Promise<ExternalApiContext> {
  if (!row.account.isActive) {
    await recordAuthFailure({
      reason: 'developer_account_disabled',
      workspaceId: row.workspace.id,
      targetType: 'developer_account',
      targetId: row.account.id,
    })
    throw new ExternalApiError(
      401,
      'developer_account_disabled',
      'Developer account is disabled.',
    )
  }
  if (expectedWorkspaceId && row.workspace.id !== expectedWorkspaceId) {
    await recordAuthFailure({
      reason: 'workspace_mismatch',
      workspaceId: row.workspace.id,
      targetType: 'developer_account',
      targetId: row.account.id,
    })
    throw new ExternalApiError(401, 'invalid_token', 'Invalid access token.')
  }

  return {
    keyId: null,
    developerId: row.account.id,
    permissionLevel:
      row.account.permissionLevel === 'ADMIN' ? 'ADMIN' : 'OWNER',
    workspaceId: row.workspace.id,
    workspace: {
      id: row.workspace.id,
      name: row.workspace.name,
      slug: row.workspace.slug,
      timezone: row.workspace.timezone,
      billableCurrency: row.workspace.billableCurrency,
    },
    createdByUserId: row.account.createdByUserId,
  }
}

/**
 * Validates a presented credential (raw workspace API key or a JWT issued by
 * POST /api/v1/auth/sign-in) and resolves the workspace-scoped context.
 * Every request re-checks the key row, so revoking or expiring a key takes
 * effect immediately even if a previously issued JWT is still unexpired.
 */
export async function authenticateApiKeyCredential(
  credential: string,
  request?: Request,
): Promise<ExternalApiContext> {
  if (looksLikeJwt(credential)) {
    const payload = await verifyExternalApiJwt(credential)
    if (!payload) {
      await recordAuthFailure({ reason: 'invalid_jwt' })
      throw new ExternalApiError(401, 'invalid_api_key', 'Invalid API key.')
    }

    if (payload.type === 'developer_jwt') {
      const [row] = await db
        .select({ account: developerAccounts, workspace: workspaces })
        .from(developerAccounts)
        .innerJoin(workspaces, eq(developerAccounts.workspaceId, workspaces.id))
        .where(eq(developerAccounts.id, payload.developerId))
        .limit(1)

      if (!row) {
        await recordAuthFailure({
          reason: 'unknown_developer',
          identifier: payload.developerId,
        })
        throw new ExternalApiError(
          401,
          'invalid_token',
          'Invalid access token.',
        )
      }
      return buildContextFromDeveloperRow(row, payload.workspaceId)
    }

    const [row] = await db
      .select({ key: workspaceApiKeys, workspace: workspaces })
      .from(workspaceApiKeys)
      .innerJoin(workspaces, eq(workspaceApiKeys.workspaceId, workspaces.id))
      .where(eq(workspaceApiKeys.id, payload.keyId))
      .limit(1)

    if (!row) {
      await recordAuthFailure({
        reason: 'unknown_api_key',
        identifier: payload.keyId,
      })
      throw new ExternalApiError(401, 'invalid_api_key', 'Invalid API key.')
    }
    return buildContextFromKeyRow(row, payload.workspaceId, request)
  }

  const tokenHash = hashApiKey(credential)
  const [row] = await db
    .select({ key: workspaceApiKeys, workspace: workspaces })
    .from(workspaceApiKeys)
    .innerJoin(workspaces, eq(workspaceApiKeys.workspaceId, workspaces.id))
    .where(eq(workspaceApiKeys.tokenHash, tokenHash))
    .limit(1)

  if (!row) {
    // Safe identifier: the prefix is already stored at rest, never the secret.
    await recordAuthFailure({
      reason: 'unknown_api_key',
      identifier: credential.slice(0, 12),
    })
    throw new ExternalApiError(401, 'invalid_api_key', 'Invalid API key.')
  }
  return buildContextFromKeyRow(row, null, request)
}

export async function authenticateDeveloperCredentials(
  email: string,
  password: string,
): Promise<ExternalApiContext> {
  const { verifyDeveloperCredentials } =
    await import('./developer-accounts.server')
  const result = await verifyDeveloperCredentials(email, password)
  if (!result) {
    // Unattributed on purpose: the email is PII and looking it up purely to
    // attach a workspace would widen the surface for no detection benefit — the
    // log line below still surfaces the attempt for alerting.
    await recordAuthFailure({ reason: 'invalid_developer_credentials' })
    throw new ExternalApiError(
      401,
      'invalid_credentials',
      'Invalid developer credentials.',
    )
  }
  return buildContextFromDeveloperRow(result, null)
}

export async function requireExternalApiKey(
  request: Request,
): Promise<ExternalApiContext> {
  const credential = readPresentedCredential(request)
  if (!credential) {
    throw new ExternalApiError(401, 'missing_api_key', 'API key is required.')
  }
  return authenticateApiKeyCredential(credential, request)
}

export function jsonResponse(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  headers.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(body), { ...init, headers })
}

export function externalApiErrorResponse(error: unknown): Response {
  if (error instanceof ExternalApiError) {
    return jsonResponse(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    )
  }

  console.error('[external-api] Unexpected failure', error)
  return jsonResponse(
    {
      error: {
        code: 'internal_error',
        message: 'The request could not be completed.',
      },
    },
    { status: 500 },
  )
}
