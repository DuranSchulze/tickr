import { useState } from 'react'
import { authClient } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'

export function VerifyEmailNotice({ email }: { email: string }) {
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  async function send() {
    setPending(true)
    try {
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: window.location.href,
      })
      setMessage(
        result.error
          ? 'Could not send the verification email. Please try again later.'
          : 'Verification email sent. Check your inbox and spam folder.',
      )
    } catch {
      setMessage(
        'Could not send the verification email. Please try again later.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-3 rounded-xl border border-stone bg-warm-taupe p-4 text-sm text-foreground">
      <p className="m-0">
        Verify {email} before accepting workspace invitations. Existing
        workspace access is unchanged.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={send} disabled={pending}>
          {pending ? 'Sending…' : 'Send verification email'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => window.location.reload()}
        >
          I’ve verified my email
        </Button>
      </div>
      {message && (
        <p role="status" className="m-0 text-sm text-smoke">
          {message}
        </p>
      )}
    </div>
  )
}
