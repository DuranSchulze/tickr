import * as React from 'react'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '#/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform,filter] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)] outline-none select-none motion-reduce:transition-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Filled Pill Button — ink fill, eggshell text (DESIGN.md §Components).
        // Ink is the only CTA fill; accent presets never fill buttons.
        default:
          'bg-primary-action text-primary-action-foreground shadow-[var(--shadow-whisper)] hover:bg-primary-action/85',
        // Outline Pill Button — eggshell fill, ink text, stone hairline.
        outline:
          'border-stone bg-eggshell text-foreground shadow-[var(--shadow-whisper)] hover:bg-warm-taupe hover:text-foreground aria-expanded:bg-warm-taupe aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        // Taupe surface — secondary, low-weight action.
        secondary:
          'bg-warm-taupe text-graphite hover:bg-stone aria-expanded:bg-stone aria-expanded:text-foreground',
        ghost:
          'text-foreground hover:bg-warm-taupe hover:text-foreground aria-expanded:bg-warm-taupe aria-expanded:text-foreground dark:hover:bg-muted/50',
        // Destructive is functional and exempt from the achromatic rule.
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-foreground underline-offset-4 hover:underline',
      },
      size: {
        default:
          'h-9 gap-1.5 px-2.5 in-data-[slot=button-group]:rounded-full has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        xs: "h-6 gap-1 rounded-full px-2 text-xs in-data-[slot=button-group]:rounded-full has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: 'h-8 gap-1 rounded-full px-2.5 in-data-[slot=button-group]:rounded-full has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5',
        lg: 'h-10 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        icon: 'size-9 rounded-full',
        'icon-xs':
          "size-6 rounded-full in-data-[slot=button-group]:rounded-full [&_svg:not([class*='size-'])]:size-3",
        'icon-sm':
          'size-8 rounded-full in-data-[slot=button-group]:rounded-full',
        'icon-lg': 'size-10 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

// oxlint-disable-next-line react/only-export-components
export { Button, buttonVariants }
