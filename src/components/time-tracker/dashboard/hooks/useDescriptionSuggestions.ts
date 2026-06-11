import { useMemo } from 'react'
import type { TimeEntry } from '#/lib/time-tracker/types'

export function useDescriptionSuggestions(
  entries: TimeEntry[],
  currentMemberId: string,
  query: string,
) {
  // Aggregate once per entries change; the per-keystroke memo below only has
  // to scan the (much smaller) unique-description list.
  const aggregated = useMemo(() => {
    const acc = new Map<
      string,
      { description: string; count: number; lastUsed: number }
    >()

    for (const entry of entries) {
      if (entry.workspaceMemberId !== currentMemberId) continue
      const description = entry.description.trim()
      if (!description) continue

      const key = description.toLowerCase()
      const previous = acc.get(key)
      acc.set(key, {
        description,
        count: (previous?.count ?? 0) + 1,
        lastUsed: Math.max(
          previous?.lastUsed ?? 0,
          new Date(entry.startedAt).getTime(),
        ),
      })
    }

    return Array.from(acc.values())
  }, [entries, currentMemberId])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q
      ? aggregated.filter((s) => s.description.toLowerCase().includes(q))
      : aggregated

    return matches
      .toSorted((a, b) => {
        if (q) return b.count - a.count || b.lastUsed - a.lastUsed
        return b.lastUsed - a.lastUsed
      })
      .map((s) => s.description)
      .slice(0, 6)
  }, [aggregated, query])

  function lookupEntry(description: string): TimeEntry | undefined {
    return entries
      .filter(
        (entry) =>
          entry.workspaceMemberId === currentMemberId &&
          entry.description.trim().toLowerCase() === description.toLowerCase(),
      )
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      )
      .at(0)
  }

  return { suggestions, lookupEntry }
}
