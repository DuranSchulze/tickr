export const FREE_EMAIL_DOMAINS: string[] = []

export function isBlockedDomain(email: string): boolean {
  const at = email.lastIndexOf('@')
  if (at === -1) return false
  const domain = email
    .slice(at + 1)
    .toLowerCase()
    .trim()
  return FREE_EMAIL_DOMAINS.includes(domain)
}

export interface PasswordRule {
  id: string
  label: string
  test: (pw: string) => boolean
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: 'length',
    label: 'At least 8 characters',
    test: (pw) => pw.length >= 8,
  },
  {
    id: 'uppercase',
    label: 'At least 1 uppercase letter (A–Z)',
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    id: 'lowercase',
    label: 'At least 1 lowercase letter (a–z)',
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    id: 'number',
    label: 'At least 1 number (0–9)',
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    id: 'special',
    label: 'At least 1 special character (!@#$%^&* …)',
    test: (pw) => /[!@#$%^&*()\-_=+[\]{}|;:'",.<>?/~`\\]/.test(pw),
  },
]

/** Total number of rules a password must satisfy to be valid. */
export const PASSWORD_RULE_COUNT = PASSWORD_RULES.length

/**
 * Number of rules the password currently passes (0…PASSWORD_RULE_COUNT).
 * The top score is only reached when every rule passes, so the strength
 * meter stays consistent with the checklist and the submit validation.
 */
export function getPasswordStrength(pw: string): number {
  return PASSWORD_RULES.filter((r) => r.test(pw)).length
}

/** Indexed by the number of passed rules (0…PASSWORD_RULE_COUNT). */
export const STRENGTH_LABELS = [
  '',
  'Very Weak',
  'Weak',
  'Fair',
  'Strong',
  'Very Strong',
] as const

export function allPasswordRulesPass(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw))
}
