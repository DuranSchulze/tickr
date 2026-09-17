import { useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Copy, KeyRound, LogIn, X } from 'lucide-react'
import { gooeyToast } from '#/lib/toast'
import { authClient } from '#/lib/auth-client'
import { DEV_CREDENTIALS, DEV_PASSWORD } from '#/lib/dev-credentials'
import type { DevCredential } from '#/lib/dev-credentials'
import { cn } from '#/lib/utils'

const ROLE_STYLES: Record<DevCredential['permissionLevel'], string> = {
  OWNER: 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900',
  ADMIN:
    'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  MANAGER: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  EMPLOYEE: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
}

/**
 * A floating button (dev-only) that lists seeded test accounts and lets you
 * sign in as any of them with one click. Hidden in production builds.
 */
export function DevLoginButton() {
  if (!import.meta.env.DEV) return null
  return <DevLoginButtonInner />
}

function DevLoginButtonInner() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return
    function onClick(event: MouseEvent) {
      if (!panelRef.current) return
      if (!panelRef.current.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function signInAs(cred: DevCredential): Promise<void> {
    setPending(cred.email)
    try {
      const result = await authClient.signIn.email({
        email: cred.email,
        password: cred.password,
      })
      if (result.error) {
        gooeyToast.error('Dev sign-in failed', {
          description:
            result.error.message ??
            'Did you run `pnpm db:seed`? The account may not exist yet.',
        })
        return
      }
      gooeyToast.success(`Signed in as ${cred.roleLabel}`, {
        description: cred.email,
      })
      setOpen(false)
      await navigate({ to: '/lounge' })
    } catch {
      gooeyToast.error('Dev sign-in failed', {
        description: 'Unexpected error. Check the console.',
      })
    } finally {
      setPending(null)
    }
  }

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      gooeyToast.success('Copied to clipboard')
    } catch {
      gooeyToast.error('Could not copy')
    }
  }

  return (
    <div
      ref={panelRef}
      className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3"
    >
      {open && (
        <div className="w-[340px] overflow-hidden rounded-xl border border-stone bg-eggshell shadow-[var(--shadow-whisper)]">
          <div className="flex items-center justify-between border-b border-stone bg-warm-taupe px-4 py-3">
            <div>
              <p className="m-0 text-xs font-bold uppercase tracking-wider text-foreground">
                Dev logins
              </p>
              <p className="m-0 text-xs text-smoke">
                Shown only in <code>dev</code>. Seeded via{' '}
                <code>pnpm db:seed</code>.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close dev logins"
              className="flex size-7 items-center justify-center rounded-full text-smoke hover:bg-warm-taupe hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          <ul className="m-0 grid gap-1 p-2">
            {DEV_CREDENTIALS.map((cred) => {
              const isPending = pending === cred.email
              return (
                <li key={cred.email} className="group">
                  <div className="flex items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-warm-taupe">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold text-foreground">
                          {cred.name}
                        </span>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                            ROLE_STYLES[cred.permissionLevel],
                          )}
                        >
                          {cred.roleLabel}
                        </span>
                      </div>
                      <p className="m-0 truncate text-xs text-smoke">
                        {cred.email}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void copy(cred.email)}
                      aria-label={`Copy ${cred.email}`}
                      className="flex size-8 items-center justify-center rounded-full text-smoke opacity-0 transition hover:bg-warm-taupe hover:text-foreground group-hover:opacity-100"
                    >
                      <Copy className="size-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => void signInAs(cred)}
                      disabled={pending !== null}
                      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-primary-action px-2.5 text-xs font-bold text-primary-action-foreground shadow-[var(--shadow-whisper)] transition-colors hover:bg-primary-action/85 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isPending ? (
                        'Signing…'
                      ) : (
                        <>
                          <LogIn className="size-3" />
                          Use
                        </>
                      )}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>

          <div className="flex items-center justify-between gap-2 border-t border-stone bg-warm-taupe px-4 py-2 text-xs text-smoke">
            <span>
              Password for all:{' '}
              <code className="font-mono text-foreground">{DEV_PASSWORD}</code>
            </span>
            <button
              type="button"
              onClick={() => void copy(DEV_PASSWORD)}
              className="inline-flex items-center gap-1 rounded-full text-smoke hover:text-foreground"
            >
              <Copy className="size-3" />
              Copy
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Dev logins"
        className="flex h-12 items-center gap-2 rounded-full bg-primary-action px-4 text-sm font-bold text-primary-action-foreground shadow-[var(--shadow-whisper)] transition-colors hover:bg-primary-action/85"
      >
        <KeyRound className="size-4" />
        Dev logins
      </button>
    </div>
  )
}
