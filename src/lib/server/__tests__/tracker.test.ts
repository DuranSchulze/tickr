/**
 * Integration tests for tracker server functions.
 *
 * These tests mock requireWorkspaceAccess to inject role-specific sessions,
 * and mock the Prisma client to avoid hitting a real database.
 *
 * Coverage areas (from mvp-spec.md):
 *   1. Auth     — unauthenticated calls throw WorkspaceAccessError
 *   2. Permissions — role guards (OWNER/ADMIN vs EMPLOYEE)
 *   3. Timer rule  — one active timer per employee
 *   4. Data scoping — getTrackerState scopes entries to current member
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkspaceAccessError } from '../workspace-access.server'
import type * as WorkspaceAccessModule from '../workspace-access.server'

// ─── Shared mock fixtures ─────────────────────────────────────────────────────

const WORKSPACE_ID = 'ws_test_01'

function makeAccess(
  role: 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE',
  memberId = 'mbr_01',
) {
  return {
    session: { user: { id: 'usr_01', email: 'test@example.com' } },
    user: { id: 'usr_01', email: 'test@example.com' },
    workspace: { id: WORKSPACE_ID, name: 'Test Co', timezone: 'Asia/Manila' },
    member: {
      id: memberId,
      workspaceRole: { permissionLevel: role },
    },
  }
}

// Mock requireWorkspaceAccess at the module level
vi.mock('../workspace-access.server', async (importOriginal) => {
  const original = await importOriginal<typeof WorkspaceAccessModule>()
  return {
    ...original,
    requireWorkspaceAccess: vi.fn(),
  }
})

// Mock prisma
vi.mock('#/db', () => ({
  prisma: {
    timeEntry: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    client: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    tag: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    department: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    cohort: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    workspaceMember: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    workspaceRole: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    workspace: {
      update: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
    userProfile: {
      upsert: vi.fn(),
    },
    cohortMember: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        workspaceMember: { update: vi.fn() },
        cohortMember: { deleteMany: vi.fn(), createMany: vi.fn() },
        user: { update: vi.fn() },
        userProfile: { upsert: vi.fn() },
      }),
    ),
  },
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getRequireWorkspaceAccess() {
  const mod = await import('../workspace-access.server')
  return mod.requireWorkspaceAccess as ReturnType<typeof vi.fn>
}

async function getPrisma() {
  const mod = await import('#/db')
  return mod.prisma
}

// ─── 1. Auth — unauthenticated calls ─────────────────────────────────────────

describe('auth guard', () => {
  it('throws WorkspaceAccessError when not signed in', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockRejectedValueOnce(
      new WorkspaceAccessError('Please sign in to continue.'),
    )

    const { startTimer } = await import('../tracker.server')

    await expect(
      startTimer({
        description: 'Test',
        projectId: 'proj_01',
        tagIds: [],
        billable: false,
      }),
    ).rejects.toThrow(WorkspaceAccessError)
  })
})

// ─── 2. Permissions — role guards ─────────────────────────────────────────────

describe('permissions', () => {
  beforeEach(async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockReset()
  })

  it('allows OWNER to create a project', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockResolvedValueOnce(makeAccess('OWNER'))

    const prisma = await getPrisma()
    ;(
      prisma.client.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ id: 'cln_01' })
    ;(
      prisma.project.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null)
    ;(prisma.project.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {},
    )

    const { createProject } = await import('../tracker.server')
    await expect(
      createProject({
        name: 'New Project',
        color: '#2563eb',
        clientId: 'cln_01',
      }),
    ).resolves.not.toThrow()
  })

  it('allows ADMIN to create a project', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockResolvedValueOnce(makeAccess('ADMIN'))

    const prisma = await getPrisma()
    ;(
      prisma.client.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ id: 'cln_01' })
    ;(
      prisma.project.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null)
    ;(prisma.project.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {},
    )

    const { createProject } = await import('../tracker.server')
    await expect(
      createProject({
        name: 'New Project',
        color: '#2563eb',
        clientId: 'cln_01',
      }),
    ).resolves.not.toThrow()
  })

  it('rejects EMPLOYEE attempting to create a project', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockResolvedValueOnce(makeAccess('EMPLOYEE'))

    const { createProject } = await import('../tracker.server')
    await expect(
      createProject({
        name: 'New Project',
        color: '#2563eb',
        clientId: 'cln_01',
      }),
    ).rejects.toThrow('Only Owners and Admins')
  })

  it('rejects creating a project with a client from another workspace', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockResolvedValueOnce(makeAccess('OWNER'))

    const prisma = await getPrisma()
    ;(
      prisma.client.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null)

    const { createProject } = await import('../tracker.server')
    await expect(
      createProject({
        name: 'New Project',
        color: '#2563eb',
        clientId: 'cln_other_workspace',
      }),
    ).rejects.toThrow('client was not found')
  })

  it('allows OWNER to create a client', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockResolvedValueOnce(makeAccess('OWNER'))

    const prisma = await getPrisma()
    ;(
      prisma.client.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null)
    ;(prisma.client.create as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      {},
    )

    const { createClient } = await import('../tracker.server')
    await expect(createClient({ name: 'Acme' })).resolves.not.toThrow()
  })

  it('rejects EMPLOYEE attempting to create a client', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockResolvedValueOnce(makeAccess('EMPLOYEE'))

    const { createClient } = await import('../tracker.server')
    await expect(createClient({ name: 'Acme' })).rejects.toThrow(
      'Only Owners and Admins',
    )
  })

  it('archive client soft-deletes by setting INACTIVE', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockResolvedValueOnce(makeAccess('ADMIN'))

    const prisma = await getPrisma()
    ;(
      prisma.client.updateMany as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ count: 1 })

    const { archiveClient } = await import('../tracker.server')
    await archiveClient({ id: 'cln_01' })

    const updateCall = (prisma.client.updateMany as ReturnType<typeof vi.fn>)
      .mock.calls[0][0]
    expect(updateCall.data.clientStatus).toBe('INACTIVE')
    expect(updateCall.where.workspaceId).toBe(WORKSPACE_ID)
  })

  it('rejects MANAGER attempting to delete a department', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockResolvedValueOnce(makeAccess('MANAGER'))

    const { deleteDepartment } = await import('../tracker.server')
    await expect(deleteDepartment({ id: 'dept_01' })).rejects.toThrow(
      'Only Owners and Admins',
    )
  })

  it('rejects OWNER attempting to change own status', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockResolvedValueOnce(makeAccess('OWNER', 'mbr_01'))

    const { setMemberStatus } = await import('../tracker.server')
    await expect(
      setMemberStatus({ memberId: 'mbr_01', status: 'DISABLED' }),
    ).rejects.toThrow('cannot change your own')
  })

  it('rejects non-OWNER from changing workspace settings', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockResolvedValueOnce(makeAccess('ADMIN'))

    const { updateWorkspaceSettings } = await import('../tracker.server')
    await expect(
      updateWorkspaceSettings({ name: 'New Name', timezone: 'UTC' }),
    ).rejects.toThrow('Only the workspace Owner')
  })
})

// ─── 3. Timer rule — one active timer ─────────────────────────────────────────

describe('timer rule', () => {
  it('prevents starting a second timer when one is active', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockResolvedValueOnce(makeAccess('EMPLOYEE'))

    const prisma = await getPrisma()
    // assertWorkspaceCatalogs: project found, no tags
    ;(
      prisma.project.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ id: 'proj_01' })
    // Active timer already exists
    ;(
      prisma.timeEntry.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      id: 'entry_active',
      endedAt: null,
    })

    const { startTimer } = await import('../tracker.server')
    await expect(
      startTimer({
        description: 'Task',
        projectId: 'proj_01',
        tagIds: [],
        billable: false,
      }),
    ).rejects.toThrow('Stop your current timer')
  })

  it('allows starting a timer when none is active', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockResolvedValueOnce(makeAccess('EMPLOYEE'))

    const prisma = await getPrisma()
    ;(
      prisma.project.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({ id: 'proj_01' })
    ;(
      prisma.timeEntry.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null)
    ;(
      prisma.timeEntry.create as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      id: 'entry_01',
      workspaceMemberId: 'mbr_01',
      description: 'Task',
      projectId: 'proj_01',
      billable: false,
      startedAt: new Date(),
      endedAt: null,
      durationSeconds: 0,
      notes: '',
      tags: [],
    })

    const { startTimer } = await import('../tracker.server')
    await expect(
      startTimer({
        description: 'Task',
        projectId: 'proj_01',
        tagIds: [],
        billable: false,
      }),
    ).resolves.not.toThrow()
  })

  it('stops a timer and calculates duration', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockResolvedValueOnce(makeAccess('EMPLOYEE'))

    const prisma = await getPrisma()
    const startedAt = new Date(Date.now() - 3600_000) // 1 hour ago
    ;(
      prisma.timeEntry.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      id: 'entry_01',
      workspaceMemberId: 'mbr_01',
      description: 'Task',
      projectId: 'proj_01',
      billable: false,
      startedAt,
      endedAt: null,
      durationSeconds: 0,
      notes: '',
      tags: [{ tagId: 'tag_01' }],
    })
    ;(
      prisma.timeEntry.update as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce({
      id: 'entry_01',
      workspaceMemberId: 'mbr_01',
      description: 'Task',
      projectId: 'proj_01',
      billable: false,
      startedAt,
      endedAt: new Date(),
      durationSeconds: 3600,
      notes: '',
      tags: [{ tagId: 'tag_01' }],
    })

    const { stopTimer } = await import('../tracker.server')
    await expect(stopTimer({ id: 'entry_01' })).resolves.not.toThrow()

    const updateCall = (prisma.timeEntry.update as ReturnType<typeof vi.fn>)
      .mock.calls[0][0]
    expect(updateCall.data.durationSeconds).toBeGreaterThanOrEqual(3590)
  })
})

// ─── 4. Data scoping ──────────────────────────────────────────────────────────

describe('data scoping', () => {
  it('getTrackerState queries entries for current member only', async () => {
    const requireWorkspaceAccess = await getRequireWorkspaceAccess()
    requireWorkspaceAccess.mockResolvedValueOnce(
      makeAccess('EMPLOYEE', 'mbr_01'),
    )

    const prisma = await getPrisma()
    ;(
      prisma.workspaceRole.findFirst as ReturnType<typeof vi.fn>
    ).mockResolvedValue(null)

    // Mock all parallel queries in getTrackerState
    const findMany = vi.fn()
    prisma.department.findFirst = vi.fn()
    ;(
      prisma as unknown as {
        department: { findMany: ReturnType<typeof vi.fn> }
      }
    ).department.findMany = findMany.mockResolvedValueOnce([])
    ;(
      prisma as unknown as { cohort: { findMany: ReturnType<typeof vi.fn> } }
    ).cohort.findMany = findMany.mockResolvedValueOnce([])
    ;(
      prisma as unknown as { project: { findMany: ReturnType<typeof vi.fn> } }
    ).project.findMany = findMany.mockResolvedValueOnce([])
    ;(
      prisma as unknown as { client: { findMany: ReturnType<typeof vi.fn> } }
    ).client.findMany = findMany.mockResolvedValueOnce([])
    ;(
      prisma as unknown as { tag: { findMany: ReturnType<typeof vi.fn> } }
    ).tag.findMany = findMany.mockResolvedValueOnce([])
    ;(
      prisma as unknown as {
        workspaceMember: { findMany: ReturnType<typeof vi.fn> }
      }
    ).workspaceMember.findMany = findMany.mockResolvedValueOnce([])
    ;(
      prisma as unknown as { timeEntry: { findMany: ReturnType<typeof vi.fn> } }
    ).timeEntry.findMany = findMany.mockResolvedValueOnce([])
    ;(
      prisma as unknown as {
        workspaceRole: { findMany: ReturnType<typeof vi.fn> }
      }
    ).workspaceRole.findMany = findMany.mockResolvedValueOnce([])

    const { getTrackerState } = await import('../tracker.server')

    // Verify the time entry query is scoped to the current member
    await getTrackerState().catch(() => {
      // May fail due to incomplete mocks; what we care about is the query args
    })

    const timeEntryCall = findMany.mock.calls.find(
      (call) => call[0]?.where?.workspaceMemberId === 'mbr_01',
    )
    expect(timeEntryCall).toBeDefined()
  })
})
