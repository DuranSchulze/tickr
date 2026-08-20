import { BRAND } from '#/lib/brand'
import {
  escapeHtml,
  mutedParagraph,
  paragraph,
  renderButton,
  renderDetailTable,
  renderEmailLayout,
  renderFallbackLink,
} from './layout'
import type { RenderedEmail } from './layout'

export type TimerReminderEmailInput = {
  memberName: string
  workspaceName: string
  taskDescription: string
  /** How many hours the timer has been running past (4, 6 or 8). */
  milestoneHours: number
  startedAtLabel: string
  runningDuration: string
  projectName?: string | null
  taskName?: string | null
  timerUrl: string
}

export function renderTimerReminderEmail({
  memberName,
  workspaceName,
  taskDescription,
  milestoneHours,
  startedAtLabel,
  runningDuration,
  projectName,
  taskName,
  timerUrl,
}: TimerReminderEmailInput): RenderedEmail {
  const subject = `Your ${BRAND.name} timer has run for ${milestoneHours}+ hours`
  const taskLine = taskName
    ? `${taskDescription} (${taskName})`
    : taskDescription

  const text = [
    `Hi ${memberName},`,
    '',
    `Your timer in "${workspaceName}" has been running for ${milestoneHours}+ hours.`,
    '',
    `Task: ${taskLine}`,
    projectName ? `Project: ${projectName}` : '',
    `Started: ${startedAtLabel}`,
    `Current duration: ${runningDuration}`,
    '',
    `Open your timer and stop or update it: ${timerUrl}`,
    '',
    `If you are still on the task, no action is needed. Otherwise, stop the timer so your records stay accurate.`,
    '',
    `- ${BRAND.name}`,
  ]
    .filter((line) => line !== '')
    .join('\n')

  const html = renderEmailLayout({
    title: `Timer running for ${milestoneHours}+ hours`,
    children: [
      paragraph(`Hi ${escapeHtml(memberName)},`),
      paragraph(
        `Just a heads-up — your timer in <strong>${escapeHtml(workspaceName)}</strong> has been running for <strong>${milestoneHours}+ hours</strong>.`,
      ),
      renderDetailTable([
        { label: 'Task', value: taskLine },
        { label: 'Project', value: projectName ?? '' },
        { label: 'Started', value: startedAtLabel },
        { label: 'Duration', value: runningDuration, monospace: true },
      ]),
      renderButton({ href: timerUrl, label: 'Open timer' }),
      mutedParagraph(
        'If you are still on the task, no action is needed. Otherwise, open the timer and stop or update it so your time records stay accurate.',
      ),
      renderFallbackLink(timerUrl),
    ].join(''),
  })

  return { subject, html, text }
}
