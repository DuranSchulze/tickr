import { useState } from 'react'
import { gooeyToast } from 'goey-toast'
import { KeyRound, X } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { PasswordInput } from '#/components/ui/password-input'
import { PasswordStrengthChecklist } from '#/components/auth/PasswordStrengthChecklist'
import { allPasswordRulesPass } from '#/lib/auth-validation'

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [pending, setPending] = useState(false)

  const newPwValid = allPasswordRulesPass(newPw)
  const submitDisabled = pending || !newPwValid || !currentPw

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setConfirmError('')

    if (!newPwValid) return

    if (newPw !== confirmPw) {
      setConfirmError('Passwords do not match.')
      return
    }

    setPending(true)
    try {
      const result = await authClient.changePassword({
        currentPassword: currentPw,
        newPassword: newPw,
        revokeOtherSessions: false,
      })
      if (result.error) {
        gooeyToast.error('Could not change password', {
          description: result.error.message ?? 'Please try again.',
        })
        return
      }
      gooeyToast.success('Password changed successfully')
      onClose()
    } catch {
      gooeyToast.error('Something went wrong', {
        description: 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-foreground" />
            <h3 className="m-0 text-base font-bold text-foreground">
              Change password
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-3">
          <div className="grid gap-1.5">
            <label
              htmlFor="cp-current"
              className="text-xs font-semibold text-foreground"
            >
              Current password
            </label>
            <PasswordInput
              id="cp-current"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              required
              autoComplete="current-password"
              className="h-9 text-sm"
            />
          </div>

          <div className="grid gap-1.5">
            <label
              htmlFor="cp-new"
              className="text-xs font-semibold text-foreground"
            >
              New password
            </label>
            <PasswordInput
              id="cp-new"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              required
              autoComplete="new-password"
              className="h-9 text-sm"
            />
            <PasswordStrengthChecklist password={newPw} />
          </div>

          <div className="grid gap-1.5">
            <label
              htmlFor="cp-confirm"
              className="text-xs font-semibold text-foreground"
            >
              Confirm new password
            </label>
            <PasswordInput
              id="cp-confirm"
              value={confirmPw}
              onChange={(e) => {
                setConfirmPw(e.target.value)
                setConfirmError('')
              }}
              required
              autoComplete="new-password"
              className="h-9 text-sm"
            />
            {confirmError && (
              <p className="text-xs text-red-500">{confirmError}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitDisabled}
            className="mt-1 h-9 w-full rounded-lg bg-primary text-sm font-bold text-primary-foreground transition-colors hover:brightness-110 disabled:bg-muted disabled:text-muted-foreground"
          >
            {pending ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
