import '@tanstack/react-start/server-only'
import { and, eq } from 'drizzle-orm'
import { verifyPassword } from 'better-auth/crypto'
import { db } from '#/db'
import { accounts, users, workspaceMembers } from '#/db/schema'
import { auth } from '#/lib/auth'
import { listUserWorkspaces } from '../workspace-access.server'

export type TracklyUserIdentity = {
  id: string
  name: string
  email: string
}

/**
 * Verifies a Trackly account's email + password against the credential stored
 * by Better Auth. Reads the hash directly instead of calling
 * `auth.api.signInEmail` so a public-API login never creates a browser session
 * row or sets a session cookie.
 *
 * Returns null for unknown emails, accounts without a password (OAuth-only), or
 * a wrong password — one error surface so sign-in cannot enumerate accounts.
 */
export async function verifyTracklyUserCredentials(
  email: string,
  password: string,
): Promise<TracklyUserIdentity | null> {
  const [user] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1)

  if (!user) return null

  const [credential] = await db
    .select({ password: accounts.password })
    .from(accounts)
    .where(
      and(eq(accounts.userId, user.id), eq(accounts.providerId, 'credential')),
    )
    .limit(1)

  if (!credential?.password) return null

  const valid = await verifyPassword({
    hash: credential.password,
    password,
  })
  return valid ? user : null
}

/**
 * Creates a Trackly account through Better Auth so it shares the same storage,
 * validation, and hooks as the web sign-up form (including the blocked-domain
 * guard via the user `create.before` hook). Throws the Better Auth `APIError`
 * (status + body.code) on failure for the caller to translate.
 */
export async function registerTracklyUserAccount(input: {
  name: string
  email: string
  password: string
  headers?: Headers
}): Promise<TracklyUserIdentity> {
  const result = await auth.api.signUpEmail({
    body: {
      name: input.name,
      email: input.email.toLowerCase(),
      password: input.password,
    },
    headers: input.headers,
  })

  return {
    id: result.user.id,
    name: result.user.name,
    email: result.user.email,
  }
}

/**
 * Resolves the workspace a Trackly user can access for the public API.
 *
 * Mirrors the web sign-in flow: an unclaimed invitation for the same email is
 * linked to the account and activated. Returns null when the user has no
 * ACTIVE/INVITED membership, which the caller maps to a 403.
 */
export async function resolveTracklyWorkspaceMembership(
  userId: string,
  email: string,
  workspaceSlug?: string,
): Promise<{
  memberId: string
  workspace: {
    id: string
    name: string
    slug: string
    timezone: string
    billableCurrency: string
  }
} | null> {
  const memberships = await listUserWorkspaces(userId, email)
  if (memberships.length === 0) return null

  const chosen =
    (workspaceSlug
      ? memberships.find((m) => m.workspace.slug === workspaceSlug)
      : undefined) ?? memberships[0]

  if (!chosen) return null

  // Claim an unlinked/INVITED membership, matching the web flow so an invited
  // user who signs in via the API lands in the workspace they were invited to.
  if (chosen.userId == null || chosen.status !== 'ACTIVE') {
    await db
      .update(workspaceMembers)
      .set({ userId: chosen.userId ?? userId, status: 'ACTIVE' })
      .where(eq(workspaceMembers.id, chosen.id))
  }

  return {
    memberId: chosen.id,
    workspace: {
      id: chosen.workspace.id,
      name: chosen.workspace.name,
      slug: chosen.workspace.slug,
      timezone: chosen.workspace.timezone,
      billableCurrency: chosen.workspace.billableCurrency,
    },
  }
}
