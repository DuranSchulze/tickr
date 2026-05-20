export const FREE_EMAIL_DOMAINS: string[] = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.co.in',
  'ymail.com',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'protonmail.com',
  'proton.me',
  'tutanota.com',
  'tutanota.de',
  'zoho.com',
  'gmx.com',
  'gmx.net',
  'mail.com',
  'inbox.com',
  'yandex.com',
  'yandex.ru',
  'qq.com',
  '163.com',
  '126.com',
  'rediffmail.com',
  'rocketmail.com',
]

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
    label: 'At least 12 characters',
    test: (pw) => pw.length >= 12,
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

export function getPasswordStrength(pw: string): 0 | 1 | 2 | 3 | 4 {
  const passed = PASSWORD_RULES.filter((r) => r.test(pw)).length
  return Math.min(4, passed) as 0 | 1 | 2 | 3 | 4
}

export const STRENGTH_LABELS = [
  '',
  'Weak',
  'Fair',
  'Strong',
  'Very Strong',
] as const

export function allPasswordRulesPass(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw))
}
