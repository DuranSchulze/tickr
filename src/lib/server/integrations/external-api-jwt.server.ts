import '@tanstack/react-start/server-only'
import { SignJWT, jwtVerify } from 'jose'

const JWT_ALGORITHM = 'HS256'
const DEFAULT_TTL_SECONDS = 60 * 60 // 1 hour

export type ApiKeyJwtPayload = {
  keyId: string
  workspaceId: string
  type: 'api_key_jwt'
}

export type DeveloperJwtPayload = {
  developerId: string
  workspaceId: string
  permissionLevel: 'OWNER' | 'ADMIN'
  type: 'developer_jwt'
}

export type ExternalApiJwtPayload = ApiKeyJwtPayload | DeveloperJwtPayload

function jwtSecret(): Uint8Array {
  const secret =
    process.env.EXTERNAL_API_JWT_SECRET || process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error('EXTERNAL_API_JWT_SECRET is not configured.')
  }
  return new TextEncoder().encode(secret)
}

function jwtTtlSeconds(): number {
  const raw = process.env.EXTERNAL_API_JWT_TTL_SECONDS
  const parsed = raw ? Number(raw) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_TTL_SECONDS
}

async function signToken(payload: ExternalApiJwtPayload) {
  const ttlSeconds = jwtTtlSeconds()
  const issuedAt = Math.floor(Date.now() / 1000)
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALGORITHM, typ: 'JWT' })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ttlSeconds)
    .sign(jwtSecret())

  return {
    token,
    expiresInSeconds: ttlSeconds,
    expiresAt: new Date((issuedAt + ttlSeconds) * 1000),
  }
}

export function signApiKeyJwt(payload: { keyId: string; workspaceId: string }) {
  return signToken({ ...payload, type: 'api_key_jwt' })
}

export function signDeveloperJwt(payload: {
  developerId: string
  workspaceId: string
  permissionLevel: 'OWNER' | 'ADMIN'
}) {
  return signToken({ ...payload, type: 'developer_jwt' })
}

export async function verifyExternalApiJwt(
  token: string,
): Promise<ExternalApiJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      algorithms: [JWT_ALGORITHM],
    })
    if (payload.type === 'api_key_jwt') {
      if (
        typeof payload.keyId !== 'string' ||
        typeof payload.workspaceId !== 'string'
      ) {
        return null
      }
      return {
        keyId: payload.keyId,
        workspaceId: payload.workspaceId,
        type: 'api_key_jwt',
      }
    }
    if (payload.type === 'developer_jwt') {
      if (
        typeof payload.developerId !== 'string' ||
        typeof payload.workspaceId !== 'string' ||
        (payload.permissionLevel !== 'OWNER' &&
          payload.permissionLevel !== 'ADMIN')
      ) {
        return null
      }
      return {
        developerId: payload.developerId,
        workspaceId: payload.workspaceId,
        permissionLevel: payload.permissionLevel,
        type: 'developer_jwt',
      }
    }
    return null
  } catch {
    return null
  }
}

/** A raw workspace API key never contains dots; a JWT always has exactly two. */
export function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3
}
