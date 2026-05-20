import { useRef, useState } from 'react'
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import { generateShareTokenFn, revokeShareTokenFn } from '#/lib/server/tracker'

function useShareLogic({
  token,
  onTokenChange,
}: {
  token: string | null
  onTokenChange: (token: string | null) => void
}) {
  const [pending, setPending] = useState<'generate' | 'revoke' | null>(null)
  const [copied, setCopied] = useState(false)

  const shareUrl = token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/performance/${token}`
    : null

  async function handleGenerate() {
    setPending('generate')
    try {
      const newToken = await generateShareTokenFn()
      onTokenChange(newToken)
    } finally {
      setPending(null)
    }
  }

  async function handleRevoke() {
    setPending('revoke')
    try {
      await revokeShareTokenFn()
      onTokenChange(null)
    } finally {
      setPending(null)
    }
  }

  async function handleCopy() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return { pending, copied, shareUrl, handleGenerate, handleRevoke, handleCopy }
}

export function ShareLinkPanel({
  token,
  onTokenChange,
}: {
  token: string | null
  onTokenChange: (token: string | null) => void
}) {
  const {
    pending,
    copied,
    shareUrl,
    handleGenerate,
    handleRevoke,
    handleCopy,
  } = useShareLogic({ token, onTokenChange })

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="m-0 font-heading text-base font-black tracking-tight text-foreground">
            Public share link
          </h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            Share your performance summary with anyone — no login required. The
            link shows your heatmap, grade, and top projects only.
          </p>
        </div>
      </div>

      {shareUrl ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-mono text-foreground">
              {shareUrl}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              title="Copy link"
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {copied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </button>
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              title="Open link"
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!!pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === 'generate' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              Regenerate
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={!!pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-background px-3 py-2 text-sm font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === 'revoke' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              Revoke link
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!!pending}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending === 'generate' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Link2 className="h-4 w-4" />
          )}
          Generate share link
        </button>
      )}
    </section>
  )
}

/** Compact share button with dropdown — placed inside the profile section. */
export function ShareButtonCompact({
  token,
  onTokenChange,
}: {
  token: string | null
  onTokenChange: (token: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const {
    pending,
    copied,
    shareUrl,
    handleGenerate,
    handleRevoke,
    handleCopy,
  } = useShareLogic({ token, onTokenChange })

  return (
    <div ref={dropdownRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        title="Share performance"
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Share2 className="h-3.5 w-3.5" />
        Share
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Backdrop click */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-border bg-card p-4 shadow-lg">
            {/* Close button */}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <div className="mb-3 flex items-start gap-2">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="m-0 text-sm font-bold text-foreground">
                  Share performance
                </p>
                <p className="m-0 mt-0.5 text-xs text-muted-foreground">
                  Anyone with the link can view your heatmap, grade &amp; top
                  projects.
                </p>
              </div>
            </div>

            {shareUrl ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs font-mono text-foreground">
                    {shareUrl}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    title="Copy link"
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Open link"
                    className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={!!pending}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs font-bold text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending === 'generate' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Link2 className="h-3 w-3" />
                    )}
                    Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={handleRevoke}
                    disabled={!!pending}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-destructive/40 bg-background px-2 py-1.5 text-xs font-bold text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {pending === 'revoke' ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Revoke
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!!pending}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pending === 'generate' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                Generate share link
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
