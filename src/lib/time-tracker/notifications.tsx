import {
  CheckCheck,
  Copy,
  Pause,
  PencilLine,
  Play,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from '#/lib/toast'

export type TrackerNotice = {
  action:
    | 'started'
    | 'resumed'
    | 'stopped'
    | 'created'
    | 'updated'
    | 'duplicated'
    | 'deleted'
    | 'discarded'
  task?: string
  durationSeconds?: number
  offline?: boolean
}

const notices = {
  started: {
    title: 'Off we go!',
    detail: 'Timer started. One task at a time.',
    icon: Play,
  },
  resumed: {
    title: 'Welcome back to the flow!',
    detail: 'Timer resumed. Pick up where you left off.',
    icon: Play,
  },
  stopped: {
    title: 'Nice work. Take a breather.',
    detail: 'Timer stopped. Resume this task whenever you’re ready.',
    icon: Pause,
  },
  created: {
    title: 'Time well logged!',
    detail: 'Your new time entry is saved.',
    icon: Sparkles,
  },
  updated: {
    title: 'Looking sharp!',
    detail: 'Your entry changes are saved.',
    icon: PencilLine,
  },
  duplicated: {
    title: 'Another one, ready to go!',
    detail: 'Entry duplicated. Adjust the details whenever you like.',
    icon: Copy,
  },
  deleted: {
    title: 'Entry deleted',
    detail: 'Your time entries are up to date.',
    icon: CheckCheck,
  },
  discarded: {
    title: 'A fresh start awaits.',
    detail: 'Timer discarded.',
    icon: Trash2,
  },
} as const

export function trackerNoticeContent(notice: TrackerNotice) {
  const copy = notices[notice.action]
  const task = notice.task?.trim()
  const shortTask = task && (task.length > 80 ? `${task.slice(0, 77)}…` : task)
  const seconds = notice.durationSeconds
  const duration =
    seconds !== undefined && Number.isFinite(seconds) && seconds >= 0
      ? seconds < 60
        ? `${Math.floor(seconds)}s`
        : seconds < 3600
          ? `${Math.floor(seconds / 60)}m`
          : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
      : null
  return {
    title: copy.title,
    description: [
      notice.offline && ['created', 'updated'].includes(notice.action)
        ? notice.action === 'created'
          ? 'Your new entry is saved on this device.'
          : 'Your changes are saved on this device.'
        : copy.detail,
      shortTask ? `“${shortTask}”` : null,
      duration ? `${duration} tracked.` : null,
      notice.offline
        ? 'Kept on this device; waiting to sync when you reconnect.'
        : null,
    ]
      .filter(Boolean)
      .join(' '),
  }
}

export function notifyTracker(notice: TrackerNotice) {
  const { title, description } = trackerNoticeContent(notice)
  const Icon = notices[notice.action].icon
  toast.success(title, {
    description,
    icon: <Icon aria-hidden="true" className="size-4" />,
    duration: 4500,
  })
}
