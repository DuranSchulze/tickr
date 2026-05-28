import '@tanstack/react-start/server-only'
import { getRequest } from '@tanstack/react-start/server'

function getTrustedOrigins(): string[] {
  const origins = [
    'http://localhost:3000',
    'http://localhost:3001',
    ...(process.env.NGROK_URL ? [process.env.NGROK_URL] : []),
    ...(process.env.CHROME_EXTENSION_ORIGIN
      ? [process.env.CHROME_EXTENSION_ORIGIN]
      : []),
    // Set BETTER_AUTH_URL to your production/custom domain (e.g. https://tickr.com).
    // This is the primary way to add a custom domain to the trusted list.
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
  ]

  // Vercel system env vars (set automatically — no manual config needed).
  // VERCEL_URL         = per-deployment URL  (e.g. project-abc123.vercel.app)
  // VERCEL_BRANCH_URL  = per-branch URL      (e.g. project-git-main-team.vercel.app)
  // VERCEL_PROJECT_PRODUCTION_URL = stable production URL (e.g. project.vercel.app)
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

/**
 * Rejects requests whose Origin header is present but doesn't match a trusted
 * origin. Absence of Origin (same-origin browser requests, curl, etc.) is
 * allowed. Call this at the top of any state-mutating server function.
 *
 * With SameSite=None session cookies the browser sends the cookie on all
 * cross-origin requests, so this explicit origin check is the CSRF gate.
 */
export function assertTrustedOrigin(): void {
  const request = getRequest()
  const origin = request.headers.get('origin')
  if (!origin) return

  const trusted = getTrustedOrigins()
  if (!trusted.includes(origin)) {
    throw new Error('Forbidden: request origin not trusted.')
  }
}
