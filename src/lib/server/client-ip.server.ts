import '@tanstack/react-start/server-only'

/**
 * Extracts the originating client IP from proxy headers.
 *
 * Order of precedence: `x-forwarded-for` (first hop — set by Vercel and most
 * proxies), then `x-real-ip`, then `cf-connecting-ip` (Cloudflare). Values are
 * capped at 64 chars to bound the column size regardless of header contents.
 */
export function readClientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim().slice(0, 64) || null
  return (
    request.headers.get('x-real-ip')?.trim().slice(0, 64) ||
    request.headers.get('cf-connecting-ip')?.trim().slice(0, 64) ||
    null
  )
}

/**
 * Reads the User-Agent header, trimmed and capped at 512 chars. Raw UA
 * strings can run long on some mobile browsers; we only need display detail.
 */
export function readUserAgent(request: Request): string | null {
  return request.headers.get('user-agent')?.trim().slice(0, 512) || null
}
