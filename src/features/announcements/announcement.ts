/**
 * Lightweight announcement parser.
 *
 * Announcements are authored as markdown with a small YAML-style frontmatter
 * block, so non-developers can publish one by editing `announcement.md` only:
 *
 * ```md
 * ---
 * title: Performance fixes are live
 * badge: Update
 * link: /app/changelog
 * linkLabel: See what's new
 * ---
 * Body copy with **bold** and [inline links](/app/changelog).
 * ```
 *
 * This module is intentionally dependency-free and side-effect-free so it can
 * be unit tested without pulling in the markdown asset itself.
 */

export interface Announcement {
  title: string
  badge: string | null
  link: string | null
  linkLabel: string
  body: string
}

const DEFAULT_LINK_LABEL = 'Learn more'

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/

function parseFrontmatter(block: string): Record<string, string | undefined> {
  const meta: Record<string, string | undefined> = {}

  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(':')
    if (separator === -1) continue

    const key = line.slice(0, separator).trim()
    if (!key) continue

    let value = line.slice(separator + 1).trim()
    const quoted =
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    if (quoted) value = value.slice(1, -1)

    meta[key] = value
  }

  return meta
}

/**
 * Returns the parsed announcement, or `null` when the file has no frontmatter
 * `title` — which is how an empty or title-less file disables the card.
 */
export function parseAnnouncement(raw: string): Announcement | null {
  const match = raw.match(FRONTMATTER)
  if (!match) return null

  const meta = parseFrontmatter(match[1])
  const title = meta.title?.trim()
  if (!title) return null

  return {
    title,
    badge: meta.badge?.trim() || null,
    link: meta.link?.trim() || null,
    linkLabel: meta.linkLabel?.trim() || DEFAULT_LINK_LABEL,
    body: match[2].trim(),
  }
}
