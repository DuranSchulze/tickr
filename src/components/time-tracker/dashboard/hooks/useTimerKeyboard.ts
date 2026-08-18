import { useEffect } from 'react'
import type { TimeEntry } from '#/lib/time-tracker/types'

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="tab"]',
].join(',')

function isInteractiveElement(target: EventTarget | null): boolean {
  return target instanceof Element && target.matches(INTERACTIVE_SELECTOR)
}

function shouldIgnoreTimerShortcut(event: KeyboardEvent): boolean {
  // Respect component-level keyboard handling first. Checking the event target
  // and composed path is important because a discrete React update can unmount
  // an editor before this window listener runs, making document.activeElement
  // fall back to the body while the same key event is still bubbling.
  if (event.defaultPrevented) return true
  if (event.composedPath().some(isInteractiveElement)) return true
  return isInteractiveElement(document.activeElement)
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
      if (shouldIgnoreTimerShortcut(e)) return

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
