import '@tanstack/react-start/server-only'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '#/db'
import {
  oauthAccessTokens,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
} from '#/db/schema'
import { oauthQueryClientId } from '#/lib/oauth-query'
import { isMcpEnabled, isMcpPilotUser } from './integrations/mcp-config.server'
import { getSession } from './session.server'

export type McpConsentContext =
  | { status: 'disabled' }
  | { status: 'signed_out' }
  | { status: 'unknown_client' }
  | {
      status: 'ready'
      client: { name: string; uri: string | null }
      account: { name: string; email: string }
      /** False for accounts outside MCP_PILOT_USER_IDS: only Decline works. */
      eligible: boolean
    }

/** Data for the consent page. The signed query itself is verified by the plugin. */
export async function getMcpConsentContext(
  oauth: string,
): Promise<McpConsentContext> {
  if (!isMcpEnabled()) return { status: 'disabled' }
  const session = await getSession()
  if (!session?.user) return { status: 'signed_out' }

  const [client] = await db
    .select({
      name: oauthClients.name,
      uri: oauthClients.uri,
      disabled: oauthClients.disabled,
    })
    .from(oauthClients)
    .where(eq(oauthClients.clientId, oauthQueryClientId(oauth)))
    .limit(1)
  if (!client || client.disabled) return { status: 'unknown_client' }

  return {
    status: 'ready',
    client: { name: client.name?.trim() || 'An unnamed app', uri: client.uri },
    account: { name: session.user.name, email: session.user.email },
    eligible: isMcpPilotUser(session.user.id),
  }
}

export type ConnectedApp = {
  clientId: string
  name: string
  grantedAt: string | null
}

async function requireUserId(): Promise<string> {
  const session = await getSession()
  if (!session?.user) throw new Error('UNAUTHORIZED')
  return session.user.id
}

export type ConnectedAppsResult = { enabled: boolean; apps: ConnectedApp[] }

/** Apps the signed-in user has approved. `enabled` hides the UI when off. */
export async function listConnectedApps(): Promise<ConnectedAppsResult> {
  if (!isMcpEnabled()) return { enabled: false, apps: [] }
  const userId = await requireUserId()
  const rows = await db
    .select({
      clientId: oauthConsents.clientId,
      name: oauthClients.name,
      grantedAt: oauthConsents.createdAt,
    })
    .from(oauthConsents)
    .innerJoin(oauthClients, eq(oauthClients.clientId, oauthConsents.clientId))
    .where(eq(oauthConsents.userId, userId))
    .orderBy(desc(oauthConsents.createdAt))

  const seen = new Set<string>()
  const apps = rows
    .filter((row) => !seen.has(row.clientId) && seen.add(row.clientId))
    .map((row) => ({
      clientId: row.clientId,
      name: row.name?.trim() || 'An unnamed app',
      grantedAt: row.grantedAt ? row.grantedAt.toISOString() : null,
    }))
  return { enabled: true, apps }
}

/**
 * Disconnects one app for the signed-in user: deletes its access tokens,
 * refresh tokens and consent in one atomic batch, so the next MCP call with a
 * previously issued token fails. Deleting the consent alone would not revoke
 * issued tokens (see spec evidence).
 */
export async function disconnectApp(clientId: string): Promise<void> {
  const userId = await requireUserId()
  await db.batch([
    db
      .delete(oauthAccessTokens)
      .where(
        and(
          eq(oauthAccessTokens.userId, userId),
          eq(oauthAccessTokens.clientId, clientId),
        ),
      ),
    db
      .delete(oauthRefreshTokens)
      .where(
        and(
          eq(oauthRefreshTokens.userId, userId),
          eq(oauthRefreshTokens.clientId, clientId),
        ),
      ),
    db
      .delete(oauthConsents)
      .where(
        and(
          eq(oauthConsents.userId, userId),
          eq(oauthConsents.clientId, clientId),
        ),
      ),
  ])
}
