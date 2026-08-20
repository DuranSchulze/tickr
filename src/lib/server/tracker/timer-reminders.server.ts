import '@tanstack/react-start/server-only'
import { db } from '#/db'
import {
  clients,
  projects,
  projectTasks,
  timeEntries,
  timerReminderEmails,
  users,
  workspaceMembers,
  workspaces,
} from '#/db/schema'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { sendTimerReminderEmail } from '../mailer'

/** Remind users whose running timer has crossed these hour thresholds. */
export const REMINDER_MILESTONE_HOURS = [4, 6, 8] as const
export type ReminderKind = '4h' | '6h' | '8h'

const FALLBACK_TIMEZONE = 'Asia/Manila'

type ReminderCandidate = {
  entryId: string
  workspaceId: string
  workspaceName: string
  timezone: string
  workspaceMemberId: string
  memberEmail: string
  memberName: string | null
  description: string
  startedAt: Date
  projectName: string | null
  taskName: string | null
  clientName: string | null
}

type LocalParts = {
  dateKey: string
  label: string
}

export type TimerReminderResult = {
  ok: true
  checked: number
  due: number
  sent: number
  skippedAlreadySent: number
  failureCount: number
  durationMs: number
  errors: Array<{ entryId: string; email: string; error: string }>
}

function kindForHours(hours: number): ReminderKind {
  return `${hours}h` as ReminderKind
}

function getAppUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.BETTER_AUTH_URL ??
    'http://localhost:3000'
  ).replace(/\/$/, '')
}

function getLocalParts(date: Date, timezone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  )
  const dateKey = `${parts.year}-${parts.month}-${parts.day}`
  return {
    dateKey,
    label: `${dateKey} ${parts.hour}:${parts.minute}:${parts.second} ${timezone}`,
  }
}

function safeLocalParts(date: Date, timezone: string): LocalParts {
  try {
    return getLocalParts(date, timezone)
  } catch {
    return getLocalParts(date, FALLBACK_TIMEZONE)
  }
}

function formatHms(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

async function getRunningTimers(): Promise<ReminderCandidate[]> {
  const rows = await db
    .select({
      entryId: timeEntries.id,
      workspaceId: timeEntries.workspaceId,
      workspaceName: workspaces.name,
      timezone: workspaces.timezone,
      workspaceMemberId: workspaceMembers.id,
      memberEmail: workspaceMembers.email,
      memberName: users.name,
      description: timeEntries.description,
      startedAt: timeEntries.startedAt,
      projectName: projects.name,
      taskName: projectTasks.name,
      clientName: clients.name,
    })
    .from(timeEntries)
    .innerJoin(workspaces, eq(timeEntries.workspaceId, workspaces.id))
    .innerJoin(
      workspaceMembers,
      eq(timeEntries.workspaceMemberId, workspaceMembers.id),
    )
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(projectTasks, eq(timeEntries.taskId, projectTasks.id))
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .where(
      and(isNull(timeEntries.endedAt), eq(workspaceMembers.status, 'ACTIVE')),
    )

  return rows
}

/**
 * Sends a reminder email for every running timer that has crossed one of the
 * milestone thresholds (4h, 6h, 8h) and hasn't been reminded for it yet.
 * One email per milestone per timer — if several milestones were crossed since
 * the last run, only the lowest outstanding one is sent so users never get a
 * burst of duplicate emails.
 */
export async function sendTimerReminders(
  now = new Date(),
): Promise<TimerReminderResult> {
  const startedAt = Date.now()
  const runningTimers = await getRunningTimers()

  const candidates = runningTimers
    .map((timer) => {
      const elapsedSeconds = Math.floor(
        (now.getTime() - timer.startedAt.getTime()) / 1000,
      )
      const elapsedHours = elapsedSeconds / 3600
      const reached = REMINDER_MILESTONE_HOURS.filter(
        (hours) => elapsedHours >= hours,
      )
      return { timer, elapsedSeconds, reached }
    })
    .filter((candidate) => candidate.reached.length > 0)

  const existingReminders =
    candidates.length > 0
      ? await db
          .select({
            timeEntryId: timerReminderEmails.timeEntryId,
            kind: timerReminderEmails.kind,
          })
          .from(timerReminderEmails)
          .where(
            inArray(
              timerReminderEmails.timeEntryId,
              candidates.map(({ timer }) => timer.entryId),
            ),
          )
      : []

  const sentKinds = new Map<string, Set<string>>()
  for (const row of existingReminders) {
    const set = sentKinds.get(row.timeEntryId) ?? new Set<string>()
    set.add(row.kind)
    sentKinds.set(row.timeEntryId, set)
  }

  let due = 0
  let sent = 0
  let skippedAlreadySent = 0
  let failureCount = 0
  const errors: TimerReminderResult['errors'] = []

  for (const { timer, elapsedSeconds, reached } of candidates) {
    const alreadySent = sentKinds.get(timer.entryId) ?? new Set<string>()
    const dueKinds = reached.filter(
      (hours) => !alreadySent.has(kindForHours(hours)),
    )
    if (dueKinds.length === 0) {
      skippedAlreadySent++
      continue
    }

    due++
    const milestoneHours = dueKinds[0]

    try {
      await sendTimerReminderEmail({
        to: timer.memberEmail,
        memberName: timer.memberName ?? timer.memberEmail,
        workspaceName: timer.workspaceName,
        taskDescription: timer.description,
        milestoneHours,
        startedAtLabel: safeLocalParts(timer.startedAt, timer.timezone).label,
        runningDuration: formatHms(elapsedSeconds),
        projectName:
          [timer.clientName, timer.projectName].filter(Boolean).join(' / ') ||
          null,
        taskName: timer.taskName,
        timerUrl: `${getAppUrl()}/app/time-tracker?focus=timer`,
      })
      await db
        .insert(timerReminderEmails)
        .values({
          timeEntryId: timer.entryId,
          workspaceId: timer.workspaceId,
          workspaceMemberId: timer.workspaceMemberId,
          reminderDate: safeLocalParts(now, timer.timezone).dateKey,
          kind: kindForHours(milestoneHours),
          sentAt: now,
        })
        .onConflictDoNothing({
          target: [timerReminderEmails.timeEntryId, timerReminderEmails.kind],
        })
      alreadySent.add(kindForHours(milestoneHours))
      sent++
    } catch (err) {
      failureCount++
      const error = err instanceof Error ? err.message : String(err)
      errors.push({ entryId: timer.entryId, email: timer.memberEmail, error })
      console.error(
        `[timer-reminders] Failed to remind ${timer.memberEmail} for entry ${timer.entryId}: ${error}`,
      )
    }
  }

  return {
    ok: true,
    checked: runningTimers.length,
    due,
    sent,
    skippedAlreadySent,
    failureCount,
    durationMs: Date.now() - startedAt,
    errors,
  }
}
