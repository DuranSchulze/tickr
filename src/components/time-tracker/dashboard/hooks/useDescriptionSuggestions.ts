import { useMemo } from 'react'
import type { TimeEntry } from '#/lib/time-tracker/types'

export function useDescriptionSuggestions(
  entries: TimeEntry[],
  currentMemberId: string,
  query: string,
) {
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    const acc = new Map<
      string,
      { description: string; count: number; lastUsed: number }
    >()

    entries
      .filter((entry) => entry.workspaceMemberId === currentMemberId)
      .forEach((entry) => {
        const description = entry.description.trim()
        if (!description) return

        const key = description.toLowerCase()
        if (q && !key.includes(q)) return

        const previous = acc.get(key)
        acc.set(key, {
          description,
          count: (previous?.count ?? 0) + 1,
          lastUsed: Math.max(
            previous?.lastUsed ?? 0,
            new Date(entry.startedAt).getTime(),
          ),
        })
      })

    return [...acc.values()]
      .sort((a, b) => {
        if (q) return b.count - a.count || b.lastUsed - a.lastUsed
        return b.lastUsed - a.lastUsed
      })
      .map((s) => s.description)
      .slice(0, 6)
  }, [entries, currentMemberId, query])

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
