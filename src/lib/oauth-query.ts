/**
 * The OAuth provider's signed authorization query, carried through Tickr's
 * sign-in and consent pages as one opaque `oauth` search parameter so the
 * router never re-serializes (and breaks) the signature. It is only ever sent
 * back to the plugin as `oauth_query`, which verifies the signature; it is
 * never used as a URL.
 */
export const OAUTH_QUERY_MAX_LENGTH = 4096

export function parseOAuthQuery(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (value.length === 0 || value.length > OAUTH_QUERY_MAX_LENGTH) {
    return undefined
  }
  const params = new URLSearchParams(value)
  if (!params.get('sig') || !params.get('client_id')) return undefined
  return value
}

/** Scope that lets an MCP app start/stop the timer and log time. */
export const OAUTH_WRITE_SCOPE = 'time_entries:write'

/**
 * Scopes the app asked for, for display and for building a narrower grant.
 * Null when the query names none: the provider then requests every scope the
 * client may use, so callers must treat null as "includes write".
 */
export function oauthQueryScopes(query: string): string[] | null {
  const scope = new URLSearchParams(query).get('scope')
  if (!scope) return null
  return scope.split(' ').filter(Boolean)
}

/** Client ID named by a validated query, for display lookups only. */
export function oauthQueryClientId(query: string): string {
  return new URLSearchParams(query).get('client_id') ?? ''
}

/**
 * Where the plugin may send the browser next: a same-origin path or an
 * absolute redirect the plugin already matched against the client's
 * registered redirect URIs. Script-capable schemes are refused.
 */
export function safeOAuthRedirect(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0) return null
  if (url.startsWith('/') && !url.startsWith('//')) return url
  try {
    const parsed = new URL(url)
    const scheme = parsed.protocol.toLowerCase()
    if (['javascript:', 'data:', 'vbscript:', 'file:'].includes(scheme)) {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}
