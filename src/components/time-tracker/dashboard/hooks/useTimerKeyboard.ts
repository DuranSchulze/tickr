import { useEffect } from 'react'
import type { TimeEntry } from '#/lib/time-tracker/types'

function isInputFocused() {
  const el = document.activeElement
  if (!el) return false
  if (el instanceof HTMLInputElement) return true
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLElement && el.isContentEditable) return true
  if (el instanceof HTMLElement && el.getAttribute('role') === 'combobox')
    return true
  if (el instanceof HTMLElement && el.getAttribute('role') === 'listbox')
    return true
  return false
}

export function useTimerKeyboard({
  activeEntry,
  stopBlocked,
  startTimer,
  stopTimer,
  discardTimer,
}: {
  activeEntry: TimeEntry | undefined
  stopBlocked: boolean
  startTimer: () => void
  stopTimer: () => void
  discardTimer: () => void
}) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isInputFocused()) return

      if (e.key === 'Enter') {
        e.preventDefault()
        if (activeEntry) {
          if (!stopBlocked) stopTimer()
        } else {
          startTimer()
        }
        return
      }

      if (e.key === 'Escape' && activeEntry) {
        e.preventDefault()
        discardTimer()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeEntry, stopBlocked, startTimer, stopTimer, discardTimer])
}
