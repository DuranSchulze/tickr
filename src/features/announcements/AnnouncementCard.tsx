import { useEffect, useState } from 'react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { ArrowRight, Megaphone, X } from 'lucide-react'
import announcementRaw from './announcement.md?raw'
import { parseAnnouncement } from './announcement'

// Parsed once at module load — the markdown file is the single source of truth
// for what the sidebar shows. Editing `announcement.md` is all it takes to
// change the message; deleting its frontmatter `title` removes the card.
const announcement = parseAnnouncement(announcementRaw)

const DISMISSED_VALUE = 'dismissed'
// Keyed by content, so editing the announcement makes the card reappear for
// users who dismissed the previous one.
const DISMISS_KEY = `tickr:announcement-dismissed:${hashString(announcementRaw)}`

const EXTERNAL_LINK = /^[a-z][a-z0-9+.-]*:/i
const LINK_CLASS = 'font-semibold text-primary no-underline hover:underline'
const INLINE_TOKEN = /\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*/g
const LINK_TOKEN = /^\[([^\]]+)\]\(([^)]+)\)$/

export function AnnouncementCard({ collapsed }: { collapsed: boolean }) {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === DISMISSED_VALUE)
    } catch {
      // Storage unavailable (e.g. private browsing) — keep the card visible.
    }
  }, [])

  function dismiss() {
    try {
      window.localStorage.setItem(DISMISS_KEY, DISMISSED_VALUE)
    } catch {
      // Dismiss for this session even if it can't be persisted.
    }
    setDismissed(true)
  }

  if (!announcement || dismissed) return null

  if (collapsed) {
    return <CollapsedAnnouncement />
  }

  const paragraphs = announcement.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)

  return (
    <div className="mt-auto pt-4">
      <div className="relative rounded-xl border border-primary/20 bg-primary/5 p-3">
        <button
          type="button"
          onClick={dismiss}
          title="Dismiss"
          aria-label="Dismiss announcement"
          className="absolute top-2 right-2 flex size-6 items-center justify-center rounded-full text-smoke transition-colors hover:bg-primary/10 hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
        <div className="flex items-start gap-2.5 pr-8">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Megaphone className="size-3.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            {announcement.badge && (
              <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                {announcement.badge}
              </span>
            )}
            <p className="m-0 mt-1.5 text-sm leading-5 font-semibold text-foreground">
              {announcement.title}
            </p>
            {paragraphs.length > 0 && (
              <div className="mt-1 space-y-1.5">
                {paragraphs.map((paragraph, index) => (
                  <p key={index} className="m-0 text-xs leading-5 text-smoke">
                    {renderInline(paragraph)}
                  </p>
                ))}
              </div>
            )}
            {announcement.link && (
              <AnnouncementLink
                href={announcement.link}
                className={`mt-2 inline-flex items-center gap-1 text-xs ${LINK_CLASS}`}
              >
                {announcement.linkLabel}
                <ArrowRight className="size-3" />
              </AnnouncementLink>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CollapsedAnnouncement() {
  const href = announcement?.link ?? '/app/changelog'

  return (
    <div className="mt-auto flex justify-center pt-3">
      <AnnouncementLink
        href={href}
        title={announcement?.title}
        aria-label={announcement?.title}
        className="relative flex size-9 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
      >
        <Megaphone className="size-4" />
        <span
          aria-hidden
          className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary"
        />
      </AnnouncementLink>
    </div>
  )
}

/** Renders `[label](href)` links and `**bold**` spans, leaving the rest as text. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let lastIndex = 0
  let key = 0

  for (const match of text.matchAll(INLINE_TOKEN)) {
    const token = match[0]
    const index = match.index
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index))

    if (token.startsWith('[')) {
      const parts = LINK_TOKEN.exec(token)
      if (parts) {
        nodes.push(
          <AnnouncementLink key={key++} href={parts[2]} className={LINK_CLASS}>
            {parts[1]}
          </AnnouncementLink>,
        )
      } else {
        nodes.push(token)
      }
    } else {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      )
    }

    lastIndex = index + token.length
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

/**
 * A plain anchor (rather than the router's `Link`) because announcement links
 * come from user-authored markdown and may point anywhere. Internal links
 * navigate normally; absolute URLs open in a new tab.
 */
function AnnouncementLink({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const external = EXTERNAL_LINK.test(href)

  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...rest}
    >
      {children}
    </a>
  )
}

/** Small, stable, non-cryptographic hash used to version the dismissal key. */
function hashString(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i++) {
    hash = (Math.imul(hash, 33) ^ value.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}
