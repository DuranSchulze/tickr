/**
 * Blocking "not saved" errors for offline capture (offline-mode REQ-1). A
 * failed local write must never look like a success: the capture flow rolls
 * back its optimistic UI, keeps the user's input, and raises this alert,
 * which `OfflineSaveErrorDialog` renders with a Retry action.
 */

export type OfflineSaveFailure = {
  title: string
  description: string
  retry?: () => Promise<void>
}

let current: OfflineSaveFailure | null = null
const listeners = new Set<() => void>()

export function getOfflineSaveFailure() {
  return current
}

export function subscribeOfflineSaveFailure(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function emit() {
  for (const listener of listeners) listener()
}

export function reportOfflineSaveFailure(
  failure: Omit<OfflineSaveFailure, 'description'> & {
    description?: string
    error?: unknown
  },
) {
  const unavailable =
    failure.error instanceof Error &&
    /not available/i.test(failure.error.message)
  current = {
    title: failure.title,
    description:
      failure.description ??
      (unavailable
        ? 'Offline storage is not available in this browser, so this cannot be saved until you are back online. Your input has been kept.'
        : 'This device could not save it for offline sync. Your input has been kept. Free up storage or try again.'),
    retry: failure.retry,
  }
  emit()
}

export function clearOfflineSaveFailure() {
  current = null
  emit()
}
