import '@tanstack/react-start/server-only'
import crypto from 'node:crypto'
import { db } from '#/db'
import {
  workspaceInvites,
  workspaceMembers,
  workspaceRoles,
  departments,
  workspaces,
  users,
} from '#/db/schema'
import { and, eq, ilike, isNull, sql } from 'drizzle-orm'
import { sendInviteEmail } from './mailer'
import {
  getAuthSession,
  requireWorkspaceAccess,
  setActiveWorkspaceCookie,
} from './workspace-access.server'
import { createAuditLog } from './tracker/audit/audit-logger.server'
import { shareSheetWithUser } from './gsheets/auth.server'
import { extractSheetId } from './gsheets/extract-sheet-id'

const INVITE_TTL_DAYS = 7

const SHEET_SHARED_ROLES = new Set(['OWNER', 'ADMIN'])

async function maybeShareSheetWithMember(
  workspace: { googleSheetUrl: string | null },
  role: { permissionLevel: string } | null,
  email: string,
) {
  if (!workspace.googleSheetUrl) return
  if (!role || !SHEET_SHARED_ROLES.has(role.permissionLevel)) return
  try {
    const sheetId = extractSheetId(workspace.googleSheetUrl)
    await shareSheetWithUser(sheetId, email)
  } catch {
    // Non-fatal: sheet sharing failures should not block the invite flow
  }
}

export class WorkspaceInviteError extends Error {
  readonly code: InviteErrorCode
  constructor(code: InviteErrorCode, message: string) {
    super(message)
    this.name = 'WorkspaceInviteError'
    this.code = code
  }
}

export type InviteErrorCode =
  | 'not_found'
  | 'expired'
  | 'revoked'
  | 'already_accepted'
  | 'wrong_account'
  | 'forbidden'
  | 'duplicate'
  | 'invalid_role'

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function generateToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

// Unambiguous uppercase alphanumeric (no 0/O, 1/I/L)
const JOIN_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateJoinCode(): string {
  const bytes = crypto.randomBytes(6)
  return Array.from(bytes)
    .map((b) => JOIN_CODE_CHARS[b % JOIN_CODE_CHARS.length])
    .join('')
}

function getAppUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.BETTER_AUTH_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

function assertOwnerOrAdmin(access: {
  member: { workspaceRole: { permissionLevel: string } | null }
}) {
  const level = access.member.workspaceRole?.permissionLevel
  if (level !== 'OWNER' && level !== 'ADMIN') {
    throw new WorkspaceInviteError(
      'forbidden',
      'Only Owners and Admins can manage invites.',
    )
  }
}

export async function listWorkspaceInvites() {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const rows = await db
    .select({
      invite: workspaceInvites,
      workspaceRole: workspaceRoles,
      department: departments,
    })
    .from(workspaceInvites)
    .leftJoin(
      workspaceRoles,
      eq(workspaceInvites.workspaceRoleId, workspaceRoles.id),
    )
    .leftJoin(departments, eq(workspaceInvites.departmentId, departments.id))
    .where(
      and(
        eq(workspaceInvites.workspaceId, access.workspace.id),
        isNull(workspaceInvites.acceptedAt),
        isNull(workspaceInvites.revokedAt),
      ),
    )
    .orderBy(sql`${workspaceInvites.createdAt} desc`)

  return rows.map((r) => ({
    ...r.invite,
    workspaceRole: r.workspaceRole,
    department: r.department,
  }))
}

export async function createWorkspaceInvite(input: {
  email: string
  workspaceRoleId: string
  departmentId?: string | null
}) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const email = input.email.trim().toLowerCase()
  if (!email.includes('@')) {
    throw new WorkspaceInviteError('duplicate', 'Enter a valid email address.')
  }

  const [role] = await db
    .select()
    .from(workspaceRoles)
    .where(
      and(
        eq(workspaceRoles.id, input.workspaceRoleId),
        eq(workspaceRoles.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)
  if (!role) {
    throw new WorkspaceInviteError(
      'invalid_role',
      'Selected role does not exist.',
    )
  }

  const [existingMember] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, access.workspace.id),
        ilike(workspaceMembers.email, email),
        eq(workspaceMembers.status, 'ACTIVE'),
      ),
    )
    .limit(1)
  if (existingMember) {
    throw new WorkspaceInviteError(
      'duplicate',
      `${input.email} is already a member of this workspace.`,
    )
  }

  const token = generateToken()
  const tokenHash = hashToken(token)
  const joinCode = generateJoinCode()
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  const [invite] = await db
    .insert(workspaceInvites)
    .values({
      workspaceId: access.workspace.id,
      email,
      workspaceRoleId: role.id,
      departmentId: input.departmentId ?? null,
      invitedById: access.member.id,
      tokenHash,
      joinCode,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [workspaceInvites.workspaceId, workspaceInvites.email],
      set: {
        workspaceRoleId: role.id,
        departmentId: input.departmentId ?? null,
        invitedById: access.member.id,
        tokenHash,
        joinCode,
        expiresAt,
        acceptedAt: null,
        revokedAt: null,
      },
    })
    .returning()

  await sendInviteEmail({
    to: email,
    workspaceName: access.workspace.name,
    inviterName: access.user.name || access.user.email,
    roleName: role.name,
    inviteUrl: `${getAppUrl()}/invite/${token}`,
    joinCode: invite.joinCode ?? joinCode,
  })

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'MEMBER_INVITE',
    targetType: 'invite',
    targetId: invite.id,
    details: email,
  })

  return {
    id: invite.id,
    email: invite.email,
    expiresAt: invite.expiresAt,
  }
}

export async function resendWorkspaceInvite(input: { inviteId: string }) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [inviteRow] = await db
    .select({
      invite: workspaceInvites,
      workspaceRole: workspaceRoles,
    })
    .from(workspaceInvites)
    .leftJoin(
      workspaceRoles,
      eq(workspaceInvites.workspaceRoleId, workspaceRoles.id),
    )
    .where(
      and(
        eq(workspaceInvites.id, input.inviteId),
        eq(workspaceInvites.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  if (!inviteRow)
    throw new WorkspaceInviteError('not_found', 'Invite not found.')
  if (inviteRow.invite.acceptedAt)
    throw new WorkspaceInviteError(
      'already_accepted',
      'Invite already accepted.',
    )

  const token = generateToken()
  const tokenHash = hashToken(token)
  const joinCode = generateJoinCode()
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  const [updated] = await db
    .update(workspaceInvites)
    .set({ tokenHash, joinCode, expiresAt, revokedAt: null })
    .where(eq(workspaceInvites.id, inviteRow.invite.id))
    .returning()

  await sendInviteEmail({
    to: updated.email,
    workspaceName: access.workspace.name,
    inviterName: access.user.name || access.user.email,
    roleName: inviteRow.workspaceRole?.name ?? 'Member',
    inviteUrl: `${getAppUrl()}/invite/${token}`,
    joinCode: updated.joinCode ?? joinCode,
  })

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'MEMBER_INVITE_RESEND',
    targetType: 'invite',
    targetId: updated.id,
    details: updated.email,
  })

  return { id: updated.id, expiresAt: updated.expiresAt }
}

export async function revokeWorkspaceInvite(input: { inviteId: string }) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [invite] = await db
    .select()
    .from(workspaceInvites)
    .where(
      and(
        eq(workspaceInvites.id, input.inviteId),
        eq(workspaceInvites.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)
  if (!invite) throw new WorkspaceInviteError('not_found', 'Invite not found.')

  await db
    .update(workspaceInvites)
    .set({ revokedAt: new Date() })
    .where(eq(workspaceInvites.id, invite.id))

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'MEMBER_INVITE_REVOKE',
    targetType: 'invite',
    targetId: invite.id,
    details: invite.email,
  })

  return { id: invite.id }
}

export type InvitePreview = {
  workspaceName: string
  inviteEmail: string
  roleName: string
  inviterName: string | null
  status: 'ready' | 'expired' | 'revoked' | 'already_accepted' | 'not_found'
}

async function loadInviteByToken(token: string) {
  const tokenHash = hashToken(token)

  const [row] = await db
    .select({
      invite: workspaceInvites,
      workspace: workspaces,
      workspaceRole: workspaceRoles,
      invitedByMember: workspaceMembers,
    })
    .from(workspaceInvites)
    .leftJoin(workspaces, eq(workspaceInvites.workspaceId, workspaces.id))
    .leftJoin(
      workspaceRoles,
      eq(workspaceInvites.workspaceRoleId, workspaceRoles.id),
    )
    .leftJoin(
      workspaceMembers,
      eq(workspaceInvites.invitedById, workspaceMembers.id),
    )
    .where(eq(workspaceInvites.tokenHash, tokenHash))
    .limit(1)

  if (!row || !row.workspace) return null

  // Fetch the inviter's user record separately if we have a userId
  let inviterUser: { name: string | null } | null = null
  if (row.invitedByMember?.userId) {
    const [u] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, row.invitedByMember.userId))
      .limit(1)
    inviterUser = u ?? null
  }

  return {
    ...row.invite,
    workspace: row.workspace,
    workspaceRole: row.workspaceRole,
    invitedBy: row.invitedByMember
      ? { ...row.invitedByMember, user: inviterUser }
      : null,
  }
}

export async function previewInvite(token: string): Promise<InvitePreview> {
  const invite = await loadInviteByToken(token)
  if (!invite) {
    return {
      workspaceName: '',
      inviteEmail: '',
      roleName: '',
      inviterName: null,
      status: 'not_found',
    }
  }
  const base = {
    workspaceName: invite.workspace.name,
    inviteEmail: invite.email,
    roleName: invite.workspaceRole?.name ?? 'Member',
    inviterName:
      invite.invitedBy?.user?.name ?? invite.invitedBy?.email ?? null,
  }
  if (invite.revokedAt) return { ...base, status: 'revoked' }
  if (invite.acceptedAt) return { ...base, status: 'already_accepted' }
  if (invite.expiresAt < new Date()) return { ...base, status: 'expired' }
  return { ...base, status: 'ready' }
}

export async function acceptInvite(token: string) {
  const session = await getAuthSession()
  if (!session?.user) {
    throw new WorkspaceInviteError(
      'forbidden',
      'Please sign in to accept this invitation.',
    )
  }

  const invite = await loadInviteByToken(token)
  if (!invite) throw new WorkspaceInviteError('not_found', 'Invite not found.')
  if (invite.revokedAt)
    throw new WorkspaceInviteError('revoked', 'This invitation was revoked.')
  if (invite.acceptedAt)
    throw new WorkspaceInviteError(
      'already_accepted',
      'This invitation was already accepted.',
    )
  if (invite.expiresAt < new Date())
    throw new WorkspaceInviteError('expired', 'This invitation has expired.')

  const userEmail = session.user.email.toLowerCase()
  if (userEmail !== invite.email.toLowerCase()) {
    throw new WorkspaceInviteError(
      'wrong_account',
      `This invitation is for ${invite.email}. You are signed in as ${session.user.email}.`,
    )
  }

  const [member] = await db
    .insert(workspaceMembers)
    .values({
      workspaceId: invite.workspaceId,
      email: invite.email,
      userId: session.user.id,
      workspaceRoleId: invite.workspaceRoleId,
      departmentId: invite.departmentId,
      invitedById: invite.invitedById,
      status: 'ACTIVE',
    })
    .onConflictDoUpdate({
      target: [workspaceMembers.workspaceId, workspaceMembers.email],
      set: {
        userId: session.user.id,
        workspaceRoleId: invite.workspaceRoleId,
        departmentId: invite.departmentId,
        invitedById: invite.invitedById,
        status: 'ACTIVE',
      },
    })
    .returning()

  await db
    .update(workspaceInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(workspaceInvites.id, invite.id))

  const result = member

  setActiveWorkspaceCookie(invite.workspace.slug)

  void createAuditLog({
    workspaceId: invite.workspaceId,
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: 'MEMBER_INVITE_ACCEPT',
    targetType: 'member',
    targetId: result.id,
    details: invite.email,
  })

  void maybeShareSheetWithMember(
    invite.workspace,
    invite.workspaceRole,
    invite.email,
  )

  return {
    workspaceId: invite.workspaceId,
    slug: invite.workspace.slug,
    name: invite.workspace.name,
    memberId: result.id,
  }
}

export async function redeemInviteByCode(code: string) {
  const session = await getAuthSession()
  if (!session?.user) {
    throw new WorkspaceInviteError(
      'forbidden',
      'Please sign in to use a join code.',
    )
  }

  const normalised = code.trim().toUpperCase()

  const [row] = await db
    .select({
      invite: workspaceInvites,
      workspace: workspaces,
      workspaceRole: workspaceRoles,
    })
    .from(workspaceInvites)
    .leftJoin(workspaces, eq(workspaceInvites.workspaceId, workspaces.id))
    .leftJoin(
      workspaceRoles,
      eq(workspaceInvites.workspaceRoleId, workspaceRoles.id),
    )
    .where(eq(workspaceInvites.joinCode, normalised))
    .limit(1)

  if (!row || !row.workspace)
    throw new WorkspaceInviteError(
      'not_found',
      'No invite found for that code.',
    )
  const invite = row.invite

  if (invite.revokedAt)
    throw new WorkspaceInviteError('revoked', 'This invitation was revoked.')
  if (invite.acceptedAt)
    throw new WorkspaceInviteError(
      'already_accepted',
      'This invitation was already accepted.',
    )
  if (invite.expiresAt < new Date())
    throw new WorkspaceInviteError('expired', 'This invitation has expired.')

  const userEmail = session.user.email.toLowerCase()
  if (userEmail !== invite.email.toLowerCase()) {
    throw new WorkspaceInviteError(
      'wrong_account',
      `This code is for ${invite.email}. You are signed in as ${session.user.email}.`,
    )
  }

  const [member] = await db
    .insert(workspaceMembers)
    .values({
      workspaceId: invite.workspaceId,
      email: invite.email,
      userId: session.user.id,
      workspaceRoleId: invite.workspaceRoleId,
      departmentId: invite.departmentId,
      invitedById: invite.invitedById,
      status: 'ACTIVE',
    })
    .onConflictDoUpdate({
      target: [workspaceMembers.workspaceId, workspaceMembers.email],
      set: {
        userId: session.user.id,
        workspaceRoleId: invite.workspaceRoleId,
        departmentId: invite.departmentId,
        invitedById: invite.invitedById,
        status: 'ACTIVE',
      },
    })
    .returning()

  await db
    .update(workspaceInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(workspaceInvites.id, invite.id))

  const result = member

  setActiveWorkspaceCookie(row.workspace.slug)

  void createAuditLog({
    workspaceId: invite.workspaceId,
    actorId: session.user.id,
    actorEmail: session.user.email,
    action: 'MEMBER_INVITE_ACCEPT',
    targetType: 'member',
    targetId: result.id,
    details: `${invite.email} (via join code)`,
  })

  void maybeShareSheetWithMember(row.workspace, row.workspaceRole, invite.email)

  return {
    workspaceId: invite.workspaceId,
    slug: row.workspace.slug,
    name: row.workspace.name,
    memberId: result.id,
  }
}
