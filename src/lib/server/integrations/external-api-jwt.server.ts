import '@tanstack/react-start/server-only'
import { SignJWT, jwtVerify } from 'jose'

const JWT_ALGORITHM = 'HS256'
const DEFAULT_TTL_SECONDS = 60 * 60 // 1 hour

export type ExternalApiJwtPayload = {
  keyId: string
  workspaceId: string
  type: 'api_key_jwt'
}

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

export async function signExternalApiJwt(payload: ExternalApiJwtPayload) {
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

export async function verifyExternalApiJwt(
  token: string,
): Promise<ExternalApiJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, jwtSecret(), {
      algorithms: [JWT_ALGORITHM],
    })
    if (
      payload.type !== 'api_key_jwt' ||
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
  } catch {
    return null
  }
}

/** A raw workspace API key never contains dots; a JWT always has exactly two. */
export function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3
}
