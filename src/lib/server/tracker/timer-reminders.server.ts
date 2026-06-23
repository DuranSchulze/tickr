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

const DEFAULT_REMINDER_HOUR = 22
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
  hour: number
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

function getReminderHour(): number {
  const value = Number(
    process.env.LATE_TIMER_REMINDER_HOUR ?? DEFAULT_REMINDER_HOUR,
  )
  return Number.isInteger(value) && value >= 0 && value <= 23
    ? value
    : DEFAULT_REMINDER_HOUR
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
    hour: Number(parts.hour ?? 0),
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
      and(
        isNull(timeEntries.endedAt),
        eq(workspaceMembers.status, 'ACTIVE'),
      ),
    )

  return rows
}

export async function sendLateTimerReminders(
  now = new Date(),
): Promise<TimerReminderResult> {
  const startedAt = Date.now()
  const reminderHour = getReminderHour()
  const runningTimers = await getRunningTimers()
  const dueTimers = runningTimers
    .map((timer) => ({
      timer,
      localNow: safeLocalParts(now, timer.timezone),
      localStart: safeLocalParts(timer.startedAt, timer.timezone),
    }))
    .filter(({ localNow }) => localNow.hour >= reminderHour)

  const reminderKeys = new Map<string, string>()
  for (const due of dueTimers) {
    reminderKeys.set(due.timer.entryId, due.localNow.dateKey)
  }

  const existingReminders =
    dueTimers.length > 0
      ? await db
          .select({
            timeEntryId: timerReminderEmails.timeEntryId,
            reminderDate: timerReminderEmails.reminderDate,
          })
          .from(timerReminderEmails)
          .where(
            inArray(
              timerReminderEmails.timeEntryId,
              dueTimers.map(({ timer }) => timer.entryId),
            ),
          )
      : []

  const sentKeys = new Set(
    existingReminders.map(
      (row) => `${row.timeEntryId}:${row.reminderDate}`,
    ),
  )
  let sent = 0
  let skippedAlreadySent = 0
  let failureCount = 0
  const errors: TimerReminderResult['errors'] = []

  for (const { timer, localNow, localStart } of dueTimers) {
    const reminderDate = reminderKeys.get(timer.entryId) ?? localNow.dateKey
    const reminderKey = `${timer.entryId}:${reminderDate}`
    if (sentKeys.has(reminderKey)) {
      skippedAlreadySent++
      continue
    }

    try {
      const durationSeconds = Math.floor(
        (now.getTime() - timer.startedAt.getTime()) / 1000,
      )
      await sendTimerReminderEmail({
        to: timer.memberEmail,
        memberName: timer.memberName ?? timer.memberEmail,
        workspaceName: timer.workspaceName,
        taskDescription: timer.description,
        startedAtLabel: localStart.label,
        runningDuration: formatHms(durationSeconds),
        projectName:
          [timer.clientName, timer.projectName].filter(Boolean).join(' / ') ||
          null,
        taskName: timer.taskName,
        timerUrl: `${getAppUrl()}/app/time-tracker`,
      })
      await db
        .insert(timerReminderEmails)
        .values({
          timeEntryId: timer.entryId,
          workspaceId: timer.workspaceId,
          workspaceMemberId: timer.workspaceMemberId,
          reminderDate,
          sentAt: now,
        })
        .onConflictDoNothing({
          target: [
            timerReminderEmails.timeEntryId,
            timerReminderEmails.reminderDate,
          ],
        })
      sentKeys.add(reminderKey)
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
    due: dueTimers.length,
    sent,
    skippedAlreadySent,
    failureCount,
    durationMs: Date.now() - startedAt,
    errors,
  }
}
