import '@tanstack/react-start/server-only'

/**
 * Collect all trusted origins from env vars so both `auth.ts` and `csrf.server.ts`
 * use the same source of truth.
 *
 * Sources (each is checked independently):
 * - `BETTER_AUTH_URL`        – primary deployment URL
 * - `ADDITIONAL_TRUSTED_ORIGINS` – comma-separated list of extra URLs
 * - `NGROK_URL`              – ngrok tunnel
 * - `CHROME_EXTENSION_ORIGIN` – Chrome extension origin
 * - Vercel system env vars   – set automatically on Vercel
 */
export function getTrustedOrigins(request?: Request): string[] {
  const origins: string[] = ['http://localhost:3000', 'http://localhost:3001']

  // Explicit origins
  if (process.env.NGROK_URL) {
    origins.push(process.env.NGROK_URL)
  }
  if (process.env.CHROME_EXTENSION_ORIGIN) {
    origins.push(process.env.CHROME_EXTENSION_ORIGIN)
  }
  if (process.env.BETTER_AUTH_URL) {
    origins.push(process.env.BETTER_AUTH_URL)
  }

  // Comma-separated list for custom domains & DigitalOcean droplets.
  // Entries are normalized so bare hosts (e.g. "app.example.com") are accepted
  // even though the browser's Origin header always includes the scheme.
  if (process.env.ADDITIONAL_TRUSTED_ORIGINS) {
    for (const origin of process.env.ADDITIONAL_TRUSTED_ORIGINS.split(',')) {
      const normalized = normalizeOrigin(origin)
      if (normalized) origins.push(normalized)
    }
  }

  // Vercel system env vars (set automatically)
  if (process.env.VERCEL_URL) {
    origins.push(`https://${process.env.VERCEL_URL}`)
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    origins.push(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  }
  if (process.env.VERCEL_BRANCH_URL) {
    origins.push(`https://${process.env.VERCEL_BRANCH_URL}`)
  }

  // The domain currently serving the request is implicitly trusted. This lets
  // the same deployment work across multiple domains (custom domains, previews,
  // tunnels) without redeploying when a domain is added. It doesn't weaken CSRF:
  // an attacker's page sends its own Origin, which never matches the server's Host.
  if (request) {
    try {
      origins.push(new URL(request.url).origin)
    } catch {
      // Malformed request URL — nothing to trust
    }
  }

  return [...new Set(origins)]
}

/**
 * Normalize a user-supplied origin: trim whitespace, default a missing scheme
 * to https, and strip trailing slashes so it can be compared against the
 * browser's `Origin` header (which is always `scheme://host`).
 */
function normalizeOrigin(origin: string): string | null {
  const trimmed = origin.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`
  return withScheme.replace(/\/+$/, '')
}
