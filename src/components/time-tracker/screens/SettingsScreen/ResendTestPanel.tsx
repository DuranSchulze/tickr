import { useState } from 'react'
import { gooeyToast } from 'goey-toast'
import { Send } from 'lucide-react'
import { sendResendTestFn } from '#/lib/server/resend-test'

export function ResendTestPanel({ defaultEmail }: { defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<
    { ok: true } | { ok: false; error: string } | null
  >(null)

  async function handleSend(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setResult(null)
    try {
      const res = await sendResendTestFn({ data: { to: email } })
      setResult(res)
      if (res.ok) {
        gooeyToast.success(`Test email sent to ${email}`)
      } else {
        gooeyToast.error('Resend test failed', { description: res.error })
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Please try again.'
      setResult({ ok: false, error })
      gooeyToast.error('Could not send test email', { description: error })
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <h2 className="m-0 text-base font-bold text-foreground">
        Test email (Resend)
      </h2>
      <p className="m-0 mt-1 text-sm text-muted-foreground">
        Send a one-off test email through the Resend API to confirm your
        <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs font-mono">
          RESEND_API_KEY
        </code>
        is configured and working.
      </p>

      <form
        onSubmit={handleSend}
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        <label className="grid flex-1 gap-1.5 text-xs font-semibold text-foreground min-w-[14rem]">
          Send test email to
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !email.trim()}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
        >
          <Send className="size-4" />
          {pending ? 'Sending…' : 'Send Resend test'}
        </button>
      </form>

      {result && (
        <div
          role="status"
          className={`mt-3 rounded-lg border px-3 py-2.5 text-sm ${
            result.ok
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300'
          }`}
        >
          {result.ok ? (
            <>
              ✅ Test email was accepted by Resend. Check the inbox (and spam)
              for <strong>{email}</strong>, and the{' '}
              <a
                href="https://resend.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline"
              >
                Resend dashboard
              </a>{' '}
              for delivery status.
            </>
          ) : (
            <>
              ❌ Sending failed:{' '}
              <span className="font-mono">{result.error}</span>
            </>
          )}
        </div>
      )}
    </section>
  )
}
