import '@tanstack/react-start/server-only'
import { and, asc, desc, eq, inArray, isNotNull } from 'drizzle-orm'
import { db } from '#/db'
import {
  departments,
  projects,
  projectTasks,
  timeEntries,
  users,
  workspaceMembers,
} from '#/db/schema'
import {
  requireWorkspaceAccess,
  requireWorkspaceMembership,
} from '../workspace-access.server'
import { memberScopeCondition } from './shared/member-scope.server'
import { resolveEntryOrigin } from './shared/origin.server'
import { createAuditLog } from './audit/audit-logger.server'
import type { DeviceLocation } from '#/lib/time-tracker/device-location'

export type LocationHistoryMember = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  departmentName: string | null
}

export type LocationHistoryEntry = {
  id: string
  memberId: string
  memberName: string
  description: string
  projectName: string | null
  projectColor: string | null
  taskName: string | null
  location: string | null
  latitude: number
  longitude: number
  startedAt: string
  endedAt: string | null
  durationSeconds: number
}

export type LocationHistoryPayload = {
  timezone: string
  currentMemberId: string
  selectedMemberId: string
  members: LocationHistoryMember[]
  entries: LocationHistoryEntry[]
  limit: number
}

export type EntryOriginAttachment = {
  id: string
  ipAddress: string | null
  location: string | null
  latitude: number | null
  longitude: number | null
  userAgent: string | null
  status: 'attached' | 'approximate' | 'unavailable'
}

const ENTRY_LIMIT = 200

export async function attachOwnEntryOrigin(data: {
  entryId: string
  deviceLocation?: DeviceLocation
}): Promise<EntryOriginAttachment> {
  const access = await requireWorkspaceMembership()
  if (!access.workspace.locationTrackingEnabled) {
    throw new Error('Location tracking is disabled for this workspace.')
  }

  const [ownedEntry] = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.id, data.entryId),
        eq(timeEntries.workspaceId, access.workspace.id),
        eq(timeEntries.workspaceMemberId, access.member.id),
      ),
    )
    .limit(1)

  if (!ownedEntry) {
    throw new Error('This entry was not found or does not belong to you.')
  }

  const origin = await resolveEntryOrigin({
    trackingEnabled: true,
    deviceLocation: data.deviceLocation,
  })
  const [updated] = await db
    .update(timeEntries)
    .set({ ...origin, updatedAt: new Date() })
    .where(eq(timeEntries.id, ownedEntry.id))
    .returning({
      id: timeEntries.id,
      ipAddress: timeEntries.ipAddress,
      location: timeEntries.location,
      latitude: timeEntries.latitude,
      longitude: timeEntries.longitude,
      userAgent: timeEntries.userAgent,
    })

  const hasCoordinates = updated.latitude !== null && updated.longitude !== null
  const hasNetworkOrigin = !!updated.ipAddress || !!updated.location

  return {
    ...updated,
    status: data.deviceLocation
      ? 'attached'
      : hasCoordinates || hasNetworkOrigin
        ? 'approximate'
        : 'unavailable',
  }
}

export async function getLocationHistory(data: {
  memberId?: string
}): Promise<LocationHistoryPayload> {
  const access = await requireWorkspaceAccess()

  const memberConditions = [
    memberScopeCondition(access, 'locations.view'),
    eq(workspaceMembers.status, 'ACTIVE' as const),
  ]

  const memberRows = await db
    .select({
      id: workspaceMembers.id,
      email: workspaceMembers.email,
      name: users.name,
      avatarUrl: users.image,
      departmentName: departments.name,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .leftJoin(departments, eq(workspaceMembers.departmentId, departments.id))
    .where(and(...memberConditions))
    .orderBy(asc(users.name), asc(workspaceMembers.email))

  const allowedMemberIds = memberRows.map((member) => member.id)
  const selectedMemberId =
    data.memberId && allowedMemberIds.includes(data.memberId)
      ? data.memberId
      : ''

  const entryConditions = [
    eq(timeEntries.workspaceId, access.workspace.id),
    isNotNull(timeEntries.latitude),
    isNotNull(timeEntries.longitude),
  ]

  if (selectedMemberId) {
    entryConditions.push(eq(timeEntries.workspaceMemberId, selectedMemberId))
  } else if (allowedMemberIds.length > 0) {
    entryConditions.push(
      inArray(timeEntries.workspaceMemberId, allowedMemberIds),
    )
  }

  const entryRows = allowedMemberIds.length
    ? await db
        .select({
          id: timeEntries.id,
          memberId: workspaceMembers.id,
          memberName: users.name,
          description: timeEntries.description,
          projectName: projects.name,
          projectColor: projects.color,
          taskName: projectTasks.name,
          location: timeEntries.location,
          latitude: timeEntries.latitude,
          longitude: timeEntries.longitude,
          startedAt: timeEntries.startedAt,
          endedAt: timeEntries.endedAt,
          durationSeconds: timeEntries.durationSeconds,
        })
        .from(timeEntries)
        .innerJoin(
          workspaceMembers,
          eq(timeEntries.workspaceMemberId, workspaceMembers.id),
        )
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .leftJoin(projects, eq(timeEntries.projectId, projects.id))
        .leftJoin(projectTasks, eq(timeEntries.taskId, projectTasks.id))
        .where(and(...entryConditions))
        .orderBy(desc(timeEntries.startedAt))
        .limit(ENTRY_LIMIT)
    : []

  return {
    timezone: access.workspace.timezone,
    currentMemberId: access.member.id,
    selectedMemberId,
    limit: ENTRY_LIMIT,
    members: memberRows.map((member) => ({
      ...member,
      avatarUrl: member.avatarUrl ?? null,
      departmentName: member.departmentName ?? null,
    })),
    entries: entryRows.map((entry) => ({
      ...entry,
      projectName: entry.projectName ?? null,
      projectColor: entry.projectColor ?? null,
      taskName: entry.taskName ?? null,
      location: entry.location ?? null,
      latitude: entry.latitude!,
      longitude: entry.longitude!,
      startedAt: entry.startedAt.toISOString(),
      endedAt: entry.endedAt?.toISOString() ?? null,
    })),
  }
}

export async function refreshOwnEntryLocation(data: {
  id: string
  deviceLocation: DeviceLocation
}): Promise<{ id: string }> {
  const access = await requireWorkspaceMembership()
  if (!access.workspace.locationTrackingEnabled) {
    throw new Error('Location tracking is disabled for this workspace.')
  }

  const origin = await resolveEntryOrigin({
    trackingEnabled: true,
    deviceLocation: data.deviceLocation,
  })
  const [updated] = await db
    .update(timeEntries)
    .set({ ...origin, updatedAt: new Date() })
    .where(
      and(
        eq(timeEntries.id, data.id),
        eq(timeEntries.workspaceId, access.workspace.id),
        eq(timeEntries.workspaceMemberId, access.member.id),
      ),
    )
    .returning({ id: timeEntries.id })

  if (!updated) {
    throw new Error('This entry was not found or does not belong to you.')
  }

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'ENTRY_EDIT',
    targetType: 'time_entry',
    targetId: updated.id,
    details: 'Location refreshed from device',
  })

  return updated
}
