import { useCallback, useRef } from 'react'

/**
 * Returns a stable function identity that always invokes the latest callback.
 * Lets memoized children (EntryRow / EntryCard) skip re-rendering even though
 * the parent recreates its handlers on every render.
 */
export function useStableCallback<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...args: TArgs) => ref.current(...args), [])
}
