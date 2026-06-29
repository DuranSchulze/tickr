import '@tanstack/react-start/server-only'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import { workspaceApiKeys, workspaces } from '#/db/schema'
import { hashApiKey } from './api-keys.server'

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

function readPresentedApiKey(request: Request): string | null {
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

export async function requireExternalApiKey(
  request: Request,
): Promise<ExternalApiContext> {
  const apiKey = readPresentedApiKey(request)
  if (!apiKey) {
    throw new ExternalApiError(401, 'missing_api_key', 'API key is required.')
  }

  const tokenHash = hashApiKey(apiKey)
  const [row] = await db
    .select({ key: workspaceApiKeys, workspace: workspaces })
    .from(workspaceApiKeys)
    .innerJoin(workspaces, eq(workspaceApiKeys.workspaceId, workspaces.id))
    .where(and(eq(workspaceApiKeys.tokenHash, tokenHash)))
    .limit(1)

  if (!row) {
    throw new ExternalApiError(401, 'invalid_api_key', 'Invalid API key.')
  }

  const now = new Date()
  if (row.key.revokedAt) {
    throw new ExternalApiError(401, 'revoked_api_key', 'API key was revoked.')
  }
  if (row.key.expiresAt && row.key.expiresAt.getTime() <= now.getTime()) {
    throw new ExternalApiError(401, 'expired_api_key', 'API key is expired.')
  }

  await db
    .update(workspaceApiKeys)
    .set({ lastUsedAt: now, lastUsedIp: readClientIp(request) })
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
  }
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
