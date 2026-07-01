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
  startedAtLabel,
  runningDuration,
  projectName,
  taskName,
  timerUrl,
}: TimerReminderEmailInput): RenderedEmail {
  const subject = `Your ${BRAND.name} timer is still running`
  const taskLine = taskName
    ? `${taskDescription} (${taskName})`
    : taskDescription
  const projectLine = projectName ? [`Project: ${projectName}`] : []

  const text = [
    `Hi ${memberName},`,
    '',
    `Your timer in "${workspaceName}" is still running.`,
    '',
    `Task: ${taskLine}`,
    ...projectLine,
    `Started: ${startedAtLabel}`,
    `Current duration: ${runningDuration}`,
    '',
    `Open your timer: ${timerUrl}`,
    '',
    `If you are still working, you can ignore this reminder. Otherwise, stop or update the timer so your records stay accurate.`,
    '',
    `- ${BRAND.name}`,
  ].join('\n')

  const html = renderEmailLayout({
    title: 'Your timer is still running',
    children: [
      paragraph(`Hi ${escapeHtml(memberName)},`),
      paragraph(
        `Your timer in <strong>${escapeHtml(workspaceName)}</strong> is still active.`,
      ),
      renderDetailTable([
        { label: 'Task', value: taskLine },
        { label: 'Project', value: projectName ?? '' },
        { label: 'Started', value: startedAtLabel },
        { label: 'Duration', value: runningDuration, monospace: true },
      ]),
      renderButton({ href: timerUrl, label: 'Open timer' }),
      mutedParagraph(
        'If you are still working, you can ignore this reminder. Otherwise, stop or update the timer so your records stay accurate.',
      ),
      renderFallbackLink(timerUrl),
    ].join(''),
  })

  return { subject, html, text }
}
