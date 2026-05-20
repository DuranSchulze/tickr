import { DollarSign } from 'lucide-react'

export function BillableToggleButton({
  pressed,
  onPressedChange,
  className = '',
}: {
  pressed: boolean
  onPressedChange: (pressed: boolean) => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={() => onPressedChange(!pressed)}
      aria-pressed={pressed}
      aria-label={
        pressed ? 'Mark timer as non-billable' : 'Mark timer as billable'
      }
      title={pressed ? 'Billable' : 'Non-billable'}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border text-sm font-bold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${className} ${
        pressed
          ? 'border-primary bg-primary text-primary-foreground hover:brightness-110'
          : 'border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <DollarSign className="h-4 w-4" />
    </button>
  )
}
