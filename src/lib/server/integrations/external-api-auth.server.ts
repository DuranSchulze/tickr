import '@tanstack/react-start/server-only'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { workspaceApiKeys, workspaces } from '#/db/schema'
import { hashApiKey } from './api-keys.server'
import { looksLikeJwt, verifyExternalApiJwt } from './external-api-jwt.server'

export type ExternalApiContext = {
  keyId: string
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

function readClientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim().slice(0, 64) || null
  return (
    request.headers.get('x-real-ip')?.trim().slice(0, 64) ||
    request.headers.get('cf-connecting-ip')?.trim().slice(0, 64) ||
    null
  )
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
    throw new ExternalApiError(401, 'revoked_api_key', 'API key was revoked.')
  }
  if (row.key.expiresAt && row.key.expiresAt.getTime() <= now.getTime()) {
    throw new ExternalApiError(401, 'expired_api_key', 'API key is expired.')
  }
  if (expectedWorkspaceId && row.workspace.id !== expectedWorkspaceId) {
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
      throw new ExternalApiError(401, 'invalid_api_key', 'Invalid API key.')
    }

    const [row] = await db
      .select({ key: workspaceApiKeys, workspace: workspaces })
      .from(workspaceApiKeys)
      .innerJoin(workspaces, eq(workspaceApiKeys.workspaceId, workspaces.id))
      .where(eq(workspaceApiKeys.id, payload.keyId))
      .limit(1)

    if (!row) {
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
    throw new ExternalApiError(401, 'invalid_api_key', 'Invalid API key.')
  }
  return buildContextFromKeyRow(row, null, request)
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
