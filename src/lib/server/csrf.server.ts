import '@tanstack/react-start/server-only'
import { getRequest } from '@tanstack/react-start/server'
import { getTrustedOrigins } from './trusted-origins.server'

/** Cookie-authenticated writes require positive browser origin evidence. */
export function assertRequestOrigin(request: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return
  const origin = request.headers.get('origin')
  if (origin) {
    if (getTrustedOrigins(request).includes(origin)) return
    throw new Error('Forbidden: request origin not trusted.')
  }
  if (request.headers.get('sec-fetch-site') === 'same-origin') return
  throw new Error('Forbidden: request origin could not be verified.')
}

export function assertTrustedOrigin(): void {
  assertRequestOrigin(getRequest())
}
