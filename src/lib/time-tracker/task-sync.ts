import type { QueryClient } from '@tanstack/react-query'

const TASK_SYNC_CHANNEL = 'tickr:task-data-sync:v1'
const TASK_SYNC_VERSION = 1

const taskQueryRoots = new Set([
  'tracker-state',
  'tracker-state-lite',
  'analytics',
  'reports',
  'analytics-overview',
  'department-dashboard',
  'department-member-detail',
  'department-member-calendar',
  'my-performance',
  'workspace-activity',
])

const taskRoutePrefixes = [
  '/app/time-tracker',
  '/app/calendar',
  '/app/analytics',
  '/app/reports',
  '/app/my-performance',
  '/app/department-analytics',
  '/app/department-member-analytics',
  '/app/department-member-calendar',
  '/app/workspace/activity',
  '/app/workspace/catalogs',
] as const

export type TaskSyncMessage = {
  version: typeof TASK_SYNC_VERSION
  type: 'task-data-changed'
  sourceId: string
  workspaceId: string
  sentAt: number
}

export type TaskSyncCompletedEvent = {
  workspaceId: string
  reason: 'activation' | 'online' | 'remote-change'
}

type TaskSyncCompletedListener = (event: TaskSyncCompletedEvent) => void

const completedListeners = new Set<TaskSyncCompletedListener>()
let publisher: BroadcastChannel | null | undefined

const sourceId = (() => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`
})()

export function isTaskDataRoute(pathname: string): boolean {
  return taskRoutePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export function isTaskSyncMessage(value: unknown): value is TaskSyncMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return (
    message.version === TASK_SYNC_VERSION &&
    message.type === 'task-data-changed' &&
    typeof message.sourceId === 'string' &&
    message.sourceId.length > 0 &&
    typeof message.workspaceId === 'string' &&
    message.workspaceId.length > 0 &&
    typeof message.sentAt === 'number' &&
    Number.isFinite(message.sentAt)
  )
}

function getPublisher(): BroadcastChannel | null {
  if (publisher !== undefined) return publisher
  // Some supported browser/test environments do not expose BroadcastChannel.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof window === 'undefined' || !window.BroadcastChannel) {
    publisher = null
    return publisher
  }
  try {
    publisher = new window.BroadcastChannel(TASK_SYNC_CHANNEL)
  } catch {
    publisher = null
  }
  return publisher
}

export function publishTaskDataChange(workspaceId: string): void {
  if (!workspaceId) return
  getPublisher()?.postMessage({
    version: TASK_SYNC_VERSION,
    type: 'task-data-changed',
    sourceId,
    workspaceId,
    sentAt: Date.now(),
  } satisfies TaskSyncMessage)
}

export function subscribeToTaskDataChanges(
  workspaceId: string,
  listener: (message: TaskSyncMessage) => void,
): () => void {
  // See getPublisher: activation refresh remains the fallback in this case.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof window === 'undefined' || !window.BroadcastChannel) return () => {}

  let channel: BroadcastChannel
  try {
    channel = new window.BroadcastChannel(TASK_SYNC_CHANNEL)
  } catch {
    return () => {}
  }

  channel.onmessage = (event: MessageEvent<unknown>) => {
    if (!isTaskSyncMessage(event.data)) return
    if (event.data.sourceId === sourceId) return
    if (event.data.workspaceId !== workspaceId) return
    listener(event.data)
  }

  return () => channel.close()
}

export function subscribeToTaskSyncCompleted(
  listener: TaskSyncCompletedListener,
): () => void {
  completedListeners.add(listener)
  return () => completedListeners.delete(listener)
}

export function notifyTaskSyncCompleted(event: TaskSyncCompletedEvent): void {
  for (const listener of completedListeners) listener(event)
}

export function invalidateTaskDataQueries(
  queryClient: QueryClient,
  refetchType: 'active' | 'none' = 'active',
): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => taskQueryRoots.has(String(query.queryKey[0] ?? '')),
    refetchType,
  })
}
