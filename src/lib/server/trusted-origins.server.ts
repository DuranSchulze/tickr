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
export function getTrustedOrigins(): string[] {
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

  // Comma-separated list for custom domains & DigitalOcean droplets
  if (process.env.ADDITIONAL_TRUSTED_ORIGINS) {
    for (const origin of process.env.ADDITIONAL_TRUSTED_ORIGINS.split(',')) {
      const trimmed = origin.trim()
      if (trimmed) origins.push(trimmed)
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

  return origins
}
