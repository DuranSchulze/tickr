import '@tanstack/react-start/server-only'
import { getRequest } from '@tanstack/react-start/server'

// Keep in sync with the trustedOrigins list in src/lib/auth.ts.
function getTrustedOrigins(): string[] {
  const origins = [
    'http://localhost:3000',
    'http://localhost:3001',
    ...(process.env.NGROK_URL ? [process.env.NGROK_URL] : []),
    ...(process.env.CHROME_EXTENSION_ORIGIN
      ? [process.env.CHROME_EXTENSION_ORIGIN]
      : []),
    ...(process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : []),
  ]

  // Vercel auto-provides the deployment URL — add it for production deploys.
  if (process.env.VERCEL_URL) {
    origins.push(`https://${process.env.VERCEL_URL}`)
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
