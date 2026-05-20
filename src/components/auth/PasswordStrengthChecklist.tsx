import { Check, X } from 'lucide-react'
import { cn } from '#/lib/utils'
import {
  PASSWORD_RULES,
  STRENGTH_LABELS,
  getPasswordStrength,
} from '#/lib/auth-validation'

const STRENGTH_COLORS = [
  '',
  'bg-red-500',
  'bg-orange-400',
  'bg-yellow-400',
  'bg-green-500',
] as const

interface Props {
  password: string
}

export function PasswordStrengthChecklist({ password }: Props) {
  if (password.length === 0) return null

  const strength = getPasswordStrength(password)

  return (
    <div className="mt-2 grid max-h-24 gap-2 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[1, 2, 3, 4].map((level) => (
            <div
              key={level}
              role="none"
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors duration-300',
                strength >= level ? STRENGTH_COLORS[strength] : 'bg-muted',
              )}
            />
          ))}
        </div>
        {strength > 0 && (
          <span className="w-20 shrink-0 text-right text-xs font-medium text-muted-foreground">
            {STRENGTH_LABELS[strength]}
          </span>
        )}
      </div>

      {/* Rule checklist */}
      <ul className="grid gap-1 pr-1">
        {PASSWORD_RULES.map((rule) => {
          const passed = rule.test(password)
          return (
            <li key={rule.id} className="flex items-start gap-1.5 text-xs">
              {passed ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
              ) : (
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
              )}
              <span
                className={cn(
                  'transition-colors',
                  passed
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-muted-foreground',
                )}
              >
                {rule.label}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
