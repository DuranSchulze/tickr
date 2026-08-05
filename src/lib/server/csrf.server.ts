import '@tanstack/react-start/server-only'
import { getRequest } from '@tanstack/react-start/server'
import { getTrustedOrigins } from './trusted-origins.server'

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

  const trusted = getTrustedOrigins(request)
  if (!trusted.includes(origin)) {
    throw new Error('Forbidden: request origin not trusted.')
  }
}
