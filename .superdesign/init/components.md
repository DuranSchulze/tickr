# Components (shared UI primitives)

Stack: React 19 + TanStack Start/Router, Tailwind CSS v4 (tokens in `src/styles.css`, no tailwind.config), shadcn/ui (style `radix-vega`, base color `taupe`) on Radix primitives, cva + `cn()` (`src/lib/utils.ts`), icons from lucide-react and @tabler/icons-react, toasts via `sileo` (`src/lib/toast.ts`). Alias `#/` → `src/`.

## button

- Description: Button with cva variants/sizes

### `src/components/ui/button.tsx`

```tsx
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
```

## card

- Description: Card container family

### `src/components/ui/card.tsx`

```tsx
import * as React from 'react'

import { cn } from '#/lib/utils'

function Card({
  className,
  size = 'default',
  variant = 'elevated',
  ...props
}: React.ComponentProps<'div'> & {
  size?: 'default' | 'sm'
  /** Editorial card variants (DESIGN.md §Components).
   *  - `elevated` (default): eggshell card, stone hairline, whisper elevation
   *  - `taupe`: Feature Card — #f5f3f1 fill, no border, no shadow
   *  - `plain`: hairline-separated surface with no elevation */
  variant?: 'elevated' | 'taupe' | 'plain'
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(
        'group/card flex flex-col gap-6 overflow-hidden rounded-xl border border-stone bg-card py-6 text-sm text-card-foreground shadow-[var(--shadow-whisper)] has-[>img:first-child]:pt-0 data-[size=sm]:gap-4 data-[size=sm]:py-4 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
        variant === 'taupe' &&
          'border-transparent bg-warm-taupe shadow-none dark:bg-muted',
        variant === 'plain' && 'bg-transparent shadow-none',
        className,
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-6 group-data-[size=sm]/card:px-4 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-6 group-data-[size=sm]/card:[.border-b]:pb-4',
        className,
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        'font-heading text-base leading-normal font-medium group-data-[size=sm]/card:text-sm',
        className,
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className,
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-6 group-data-[size=sm]/card:px-4', className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'flex items-center rounded-b-xl px-6 group-data-[size=sm]/card:px-4 [.border-t]:pt-6 group-data-[size=sm]/card:[.border-t]:pt-4',
        className,
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
```

## dialog

- Description: Radix dialog with editorial modal motion

### `src/components/ui/dialog.tsx`

```tsx
import * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import { IconX } from '@tabler/icons-react'
import { OverlayPortalContainerContext } from './overlay-portal-context'

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        't-overlay-surface fixed inset-0 isolate z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs',
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ref,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const contentRef = React.useRef<HTMLDivElement>(null)
  const descriptionProps = hasDialogDescription(children)
    ? {}
    : ({ 'aria-describedby': undefined } as const)

  function setContentRef(node: HTMLDivElement | null) {
    contentRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) ref.current = node
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={setContentRef}
        data-slot="dialog-content"
        className={cn(
          't-modal-surface fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-xl border border-stone bg-popover p-6 text-sm text-popover-foreground shadow-[var(--shadow-whisper)] outline-none sm:max-w-md',
          className,
        )}
        {...props}
        {...descriptionProps}
      >
        <OverlayPortalContainerContext.Provider value={contentRef}>
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close data-slot="dialog-close" asChild>
              <Button
                variant="ghost"
                className="absolute top-4 right-4"
                size="icon-sm"
              >
                <IconX />
                <span className="sr-only">Close</span>
              </Button>
            </DialogPrimitive.Close>
          )}
        </OverlayPortalContainerContext.Provider>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function hasDialogDescription(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some((child) => {
    if (!React.isValidElement(child)) return false
    if (child.type === DialogDescription) return true
    return hasDialogDescription(
      (child.props as { children?: React.ReactNode }).children,
    )
  })
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('font-heading leading-none font-medium', className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        'text-sm text-smoke *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
```

## drawer

- Description: Vaul bottom/side drawer

### `src/components/ui/drawer.tsx`

```tsx
import * as React from 'react'
import { Drawer as DrawerPrimitive } from 'vaul'

import { cn } from '#/lib/utils'

function Drawer({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

function DrawerOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0',
        className,
      )}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  const descriptionProps = hasDrawerDescription(children)
    ? {}
    : ({ 'aria-describedby': undefined } as const)

  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          'group/drawer-content fixed z-50 flex h-auto flex-col border-stone bg-popover text-sm text-popover-foreground shadow-[var(--shadow-whisper)] data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-xl data-[vaul-drawer-direction=bottom]:border-t data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:rounded-r-xl data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:rounded-l-xl data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-xl data-[vaul-drawer-direction=top]:border-b data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm',
          className,
        )}
        {...props}
        {...descriptionProps}
      >
        <div className="mx-auto mt-4 hidden h-1.5 w-[100px] shrink-0 rounded-full bg-muted group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  )
}

function hasDrawerDescription(children: React.ReactNode): boolean {
  return React.Children.toArray(children).some((child) => {
    if (!React.isValidElement(child)) return false
    if (child.type === DrawerDescription) return true
    return hasDrawerDescription(
      (child.props as { children?: React.ReactNode }).children,
    )
  })
}

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        'flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left',
        className,
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  )
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('font-heading font-medium text-foreground', className)}
      {...props}
    />
  )
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-sm text-smoke', className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
```

## dropdown-menu

- Description: Radix dropdown menu

### `src/components/ui/dropdown-menu.tsx`

```tsx
import * as React from 'react'
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'

import { cn } from '#/lib/utils'
import { IconCheck, IconChevronRight } from '@tabler/icons-react'

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  )
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

function DropdownMenuContent({
  className,
  align = 'start',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          't-dropdown z-50 max-h-(--radix-dropdown-menu-content-available-height) w-(--radix-dropdown-menu-trigger-width) min-w-32 origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border border-stone bg-popover p-1 text-popover-foreground shadow-[var(--shadow-whisper)] data-[state=closed]:overflow-hidden',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: 'default' | 'destructive'
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "group/dropdown-menu-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive",
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-8 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <IconCheck />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-8 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <span
        className="pointer-events-none absolute right-2 flex items-center justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <DropdownMenuPrimitive.ItemIndicator>
          <IconCheck />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        'px-2 py-1.5 text-xs font-medium text-smoke data-inset:pl-8',
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        'ml-auto text-xs tracking-widest text-smoke group-focus/dropdown-menu-item:text-accent-foreground',
        className,
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-8 data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <IconChevronRight className="ml-auto" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        't-dropdown z-50 min-w-[96px] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-lg border border-stone bg-popover p-1 text-popover-foreground shadow-[var(--shadow-whisper)]',
        className,
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
```

## input

- Description: Text input

### `src/components/ui/input.tsx`

```tsx
import * as React from 'react'

import { cn } from '#/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-stone bg-eggshell px-2.5 py-1 text-base shadow-none transition-[color,border-color,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)] outline-none motion-reduce:transition-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-smoke focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:focus-visible:border-ring dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
```

## label

- Description: Form label

### `src/components/ui/label.tsx`

```tsx
import * as React from 'react'
import { Label as LabelPrimitive } from 'radix-ui'

import { cn } from '#/lib/utils'

function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Label }
```

## select

- Description: Radix select

### `src/components/ui/select.tsx`

```tsx
'use client'

import * as React from 'react'
import { Select as SelectPrimitive } from 'radix-ui'

import { cn } from '#/lib/utils'
import {
  IconSelector,
  IconCheck,
  IconChevronUp,
  IconChevronDown,
} from '@tabler/icons-react'

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn('scroll-my-1 p-1', className)}
      {...props}
    />
  )
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = 'default',
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: 'sm' | 'default'
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-1.5 rounded-md border border-stone bg-eggshell py-2 pr-2 pl-2.5 text-sm whitespace-nowrap shadow-none transition-[color,border-color,box-shadow,background-color] duration-[var(--duration-quick)] ease-[var(--ease-smooth-out)] outline-none motion-reduce:transition-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ink/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-smoke data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <IconSelector className="pointer-events-none size-4 text-smoke" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = 'item-aligned',
  align = 'center',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        data-align-trigger={position === 'item-aligned'}
        className={cn(
          't-dropdown dark relative z-50 max-h-(--radix-select-content-available-height) min-w-36 origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border border-stone bg-popover text-popover-foreground shadow-[var(--shadow-whisper)]',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1',
          className,
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          data-position={position}
          className={cn(
            'data-[position=popper]:h-(--radix-select-trigger-height) data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)',
            position === 'popper' && '',
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn('px-2 py-1.5 text-xs text-smoke', className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className,
      )}
      {...props}
    >
      <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <IconCheck className="pointer-events-none" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('pointer-events-none -mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <IconChevronUp />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <IconChevronDown />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
```

## popover

- Description: Radix popover

### `src/components/ui/popover.tsx`

```tsx
import * as React from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'

import { cn } from '#/lib/utils'
import { useOverlayPortalContainer } from './overlay-portal-context'

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const portalContainer = useOverlayPortalContainer()

  return (
    <PopoverPrimitive.Portal container={portalContainer?.current}>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          't-dropdown z-50 flex w-72 origin-(--radix-popover-content-transform-origin) flex-col gap-4 rounded-xl border border-stone bg-popover p-4 text-sm text-popover-foreground shadow-[var(--shadow-whisper)] outline-hidden',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="popover-header"
      className={cn('flex flex-col gap-1 text-sm', className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <div
      data-slot="popover-title"
      className={cn('font-medium', className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="popover-description"
      className={cn('text-smoke', className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}
```

## tooltip

- Description: Radix tooltip

### `src/components/ui/tooltip.tsx`

```tsx
import * as React from 'react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'

import { cn } from '#/lib/utils'
import { useOverlayPortalContainer } from './overlay-portal-context'

function TooltipProvider({
  delayDuration = 150,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const portalContainer = useOverlayPortalContainer()

  return (
    <TooltipPrimitive.Portal container={portalContainer?.current}>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(
          'z-50 max-w-[min(20rem,calc(100vw-1rem))] rounded-lg border border-stone bg-popover px-2.5 py-1.5 text-xs leading-snug whitespace-normal break-words text-popover-foreground shadow-[var(--shadow-whisper)] outline-hidden',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
```

## table

- Description: Table primitives

### `src/components/ui/table.tsx`

```tsx
import * as React from 'react'

import { cn } from '#/lib/utils'

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        className={cn('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return (
    <thead
      data-slot="table-header"
      className={cn('bg-warm-taupe [&_tr]:border-b', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t bg-muted/50 font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-stone transition-colors hover:bg-warm-taupe/70 has-aria-expanded:bg-warm-taupe/70 data-[state=selected]:bg-warm-taupe',
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-graphite [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-sm text-smoke', className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
```

## pagination

- Description: Pagination controls

### `src/components/ui/pagination.tsx`

```tsx
import * as React from 'react'

import { cn } from '#/lib/utils'
import { Button } from '#/components/ui/button'
import {
  IconChevronLeft,
  IconChevronRight,
  IconDots,
} from '@tabler/icons-react'

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn('flex items-center gap-1', className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, 'size'> &
  React.ComponentProps<'a'>

function PaginationLink({
  className,
  isActive,
  size = 'icon',
  ...props
}: PaginationLinkProps) {
  return (
    <Button
      asChild
      variant={isActive ? 'default' : 'ghost'}
      size={size}
      className={cn(className)}
    >
      <a
        aria-current={isActive ? 'page' : undefined}
        data-slot="pagination-link"
        data-active={isActive}
        {...props}
      />
    </Button>
  )
}

function PaginationPrevious({
  className,
  text = 'Previous',
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Go to previous page"
      size="default"
      className={cn('pl-2!', className)}
      {...props}
    >
      <IconChevronLeft data-icon="inline-start" />
      <span className="hidden sm:block">{text}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  text = 'Next',
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      aria-label="Go to next page"
      size="default"
      className={cn('pr-2!', className)}
      {...props}
    >
      <span className="hidden sm:block">{text}</span>
      <IconChevronRight data-icon="inline-end" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-9 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <IconDots />
      <span className="sr-only">More pages</span>
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
```

## combobox

- Description: Searchable select (popover + list)

### `src/components/ui/combobox.tsx`

```tsx
import { useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '#/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export type ComboboxOption = {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

type ComboboxProps = {
  options: ComboboxOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  contentClassName?: string
  maxVisibleOptions?: number
}

export function filterComboboxOptions(
  options: ComboboxOption[],
  search: string,
  maxVisibleOptions: number,
) {
  const query = search.trim().toLowerCase()
  const matches = query
    ? options.filter((option) => {
        const haystack = `${option.label} ${option.description ?? ''}`
        return haystack.toLowerCase().includes(query)
      })
    : options

  return {
    filteredOptions: matches.slice(0, maxVisibleOptions),
    truncated: matches.length > maxVisibleOptions,
  }
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  emptyText = 'No results found.',
  disabled = false,
  className,
  contentClassName,
  maxVisibleOptions = 80,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedOption = options.find((option) => option.value === value)

  const { filteredOptions, truncated } = useMemo(() => {
    if (!open) {
      return { filteredOptions: [] as ComboboxOption[], truncated: false }
    }

    return filterComboboxOptions(options, search, maxVisibleOptions)
  }, [maxVisibleOptions, open, options, search])

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) setSearch('')
  }

  function handleSelect(nextValue: string) {
    onValueChange(nextValue)
    setOpen(false)
    setSearch('')
  }

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={open}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-md border border-stone bg-eggshell px-3 text-left text-sm text-foreground outline-none transition-colors hover:bg-warm-taupe/60 disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              !selectedOption && 'text-smoke',
            )}
          >
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-smoke" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
        className={cn(
          'max-h-[min(var(--radix-popover-content-available-height),20rem)] w-[var(--radix-popover-trigger-width)] min-w-[min(18rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-lg border border-stone bg-popover p-0 shadow-[var(--shadow-whisper)]',
          contentClassName,
        )}
      >
        <div className="flex items-center gap-2 border-b border-stone px-3 py-2">
          <Search className="size-4 shrink-0 text-smoke" />
          <input
            ref={inputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-8 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-smoke"
          />
        </div>

        <div className="max-h-[min(calc(var(--radix-popover-content-available-height)-3.5rem),16rem)] overflow-y-auto overscroll-contain py-1 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
          {filteredOptions.length === 0 ? (
            <p className="m-0 px-3 py-3 text-sm text-smoke">{emptyText}</p>
          ) : (
            filteredOptions.map((option) => {
              const selected = option.value === value
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => handleSelect(option.value)}
                  className={cn(
                    'flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
                    selected && 'font-semibold text-foreground',
                  )}
                >
                  <Check
                    className={cn(
                      'size-4 shrink-0 text-primary',
                      !selected && 'opacity-0',
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.description && (
                      <span className="block truncate text-xs font-normal text-smoke">
                        {option.description}
                      </span>
                    )}
                  </span>
                </button>
              )
            })
          )}
          {truncated && (
            <p className="m-0 border-t border-stone px-3 py-2 text-xs text-smoke">
              Showing first {maxVisibleOptions}. Type to narrow results.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
```

## calendar

- Description: react-day-picker calendar

### `src/components/ui/calendar.tsx`

```tsx
/* eslint-disable no-shadow -- shadcn-vendored render callbacks intentionally re-bind className/props */
import * as React from 'react'
import { DayPicker, getDefaultClassNames } from 'react-day-picker'
import type { DayButton, Locale } from 'react-day-picker'

import { cn } from '#/lib/utils'
import { Button, buttonVariants } from '#/components/ui/button'
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronDown,
} from '@tabler/icons-react'

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  buttonVariant = 'ghost',
  locale,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>['variant']
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        'group/calendar bg-eggshell p-3 [--cell-radius:var(--radius-button)] [--cell-size:--spacing(8)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent',
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className,
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale?.code, { month: 'short' }),
        ...formatters,
      }}
      classNames={{
        root: cn('w-fit', defaultClassNames.root),
        months: cn(
          'relative flex flex-col gap-4 md:flex-row',
          defaultClassNames.months,
        ),
        month: cn('flex w-full flex-col gap-4', defaultClassNames.month),
        nav: cn(
          'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          'flex h-(--cell-size) w-full items-center justify-center gap-1.5 text-sm font-medium',
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          'relative rounded-(--cell-radius)',
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn(
          'absolute inset-0 bg-popover opacity-0',
          defaultClassNames.dropdown,
        ),
        caption_label: cn(
          'font-medium select-none',
          captionLayout === 'label'
            ? 'text-sm'
            : 'flex items-center gap-1 rounded-(--cell-radius) text-sm [&>svg]:size-3.5 [&>svg]:text-smoke',
          defaultClassNames.caption_label,
        ),
        table: 'w-full border-collapse',
        weekdays: cn('flex', defaultClassNames.weekdays),
        weekday: cn(
          'flex-1 rounded-(--cell-radius) text-[0.8rem] font-normal text-smoke select-none',
          defaultClassNames.weekday,
        ),
        week: cn('mt-2 flex w-full', defaultClassNames.week),
        week_number_header: cn(
          'w-(--cell-size) select-none',
          defaultClassNames.week_number_header,
        ),
        week_number: cn(
          'text-[0.8rem] text-smoke select-none',
          defaultClassNames.week_number,
        ),
        day: cn(
          'group/day relative aspect-square size-full rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)',
          props.showWeekNumber
            ? '[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)'
            : '[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)',
          defaultClassNames.day,
        ),
        range_start: cn(
          'relative isolate z-0 rounded-l-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-muted',
          defaultClassNames.range_start,
        ),
        range_middle: cn('rounded-none', defaultClassNames.range_middle),
        range_end: cn(
          'relative isolate z-0 rounded-r-(--cell-radius) bg-muted after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-muted',
          defaultClassNames.range_end,
        ),
        today: cn(
          'rounded-(--cell-radius) bg-warm-taupe text-graphite data-[selected=true]:rounded-(--cell-radius)',
          defaultClassNames.today,
        ),
        outside: cn(
          'text-smoke aria-selected:text-smoke',
          defaultClassNames.outside,
        ),
        disabled: cn('text-smoke opacity-50', defaultClassNames.disabled),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === 'left') {
            return (
              <IconChevronLeft className={cn('size-4', className)} {...props} />
            )
          }

          if (orientation === 'right') {
            return (
              <IconChevronRight
                className={cn('size-4', className)}
                {...props}
              />
            )
          }

          return (
            <IconChevronDown className={cn('size-4', className)} {...props} />
          )
        },
        DayButton: ({ ...props }) => (
          <CalendarDayButton locale={locale} {...props} />
        ),
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...props
}: React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }) {
  const defaultClassNames = getDefaultClassNames()

  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        'relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 border-0 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50 data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:bg-primary-action data-[range-end=true]:text-primary-action-foreground data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-warm-taupe data-[range-middle=true]:text-graphite data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:bg-primary-action data-[range-start=true]:text-primary-action-foreground data-[selected-single=true]:bg-primary-action data-[selected-single=true]:text-primary-action-foreground dark:hover:text-foreground [&>span]:text-xs [&>span]:opacity-70',
        defaultClassNames.day,
        className,
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
```

## kbd

- Description: Keyboard hint

### `src/components/ui/kbd.tsx`

```tsx
import { cn } from '#/lib/utils'

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-stone px-1 font-sans text-xs font-medium text-graphite shadow-[var(--shadow-inset-plate)] select-none in-data-[slot=tooltip-content]:bg-eggshell/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-eggshell/10 [&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-1', className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
```

## password-input

- Description: Password input with reveal

### `src/components/ui/password-input.tsx`

```tsx
import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '#/lib/utils'

export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
>(function PasswordInputInner({ className, ...props }, ref) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        {...props}
        ref={ref}
        type={show ? 'text' : 'password'}
        className={cn(
          'h-11 w-full rounded-md border border-stone bg-eggshell pl-3 pr-11 text-sm text-foreground outline-none transition-colors placeholder:text-smoke focus:border-ink focus:ring-2 focus:ring-ink/20',
          className,
        )}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex size-11 items-center justify-center rounded-r-md text-smoke transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
})
```

## theme-toggle

- Description: Light/dark toggle

### `src/components/ui/theme-toggle.tsx`

```tsx
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { applyTheme, getStoredTheme } from '#/lib/theme'
import type { ThemeMode } from '#/lib/theme'
import { cn } from '#/lib/utils'

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<ThemeMode>('light')

  useEffect(() => {
    setTheme(getStoredTheme())
    function onThemeChange(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail
      if (detail === 'light' || detail === 'dark') setTheme(detail)
    }
    window.addEventListener('theme-change', onThemeChange)
    return () => window.removeEventListener('theme-change', onThemeChange)
  }, [])

  function toggle(): void {
    const next: ThemeMode = theme === 'light' ? 'dark' : 'light'
    applyTheme(next)
    setTheme(next)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
      }
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-full text-smoke transition-colors hover:bg-warm-taupe hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30',
        className,
      )}
    >
      <span
        className="t-icon-swap"
        data-state={theme === 'dark' ? 'b' : 'a'}
        aria-hidden="true"
      >
        <Moon className="t-icon size-4" data-icon="a" />
        <Sun className="t-icon size-4" data-icon="b" />
      </span>
    </button>
  )
}
```

## overflow-reveal

- Description: Truncation with reveal

### `src/components/ui/overflow-reveal.tsx`

```tsx
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

import { cn } from '#/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip'

// Only devices with a real hover cursor get the reveal banner. Touch users
// open the picker instead, where the full label is always listed.
const HOVER_MEDIA_QUERY = '(hover: hover) and (pointer: fine)'

function getHoverMediaQuery() {
  if (typeof window === 'undefined') return null
  // jsdom and some embedded webviews don't implement matchMedia.
  if (typeof window.matchMedia !== 'function') return null
  return window.matchMedia(HOVER_MEDIA_QUERY)
}

function subscribeToHover(onChange: () => void) {
  const query = getHoverMediaQuery()
  if (!query) return () => {}
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getHoverSnapshot() {
  return getHoverMediaQuery()?.matches ?? true
}

// Assume hover during SSR so the server and first client render agree.
function getHoverServerSnapshot() {
  return true
}

export function useCanHover() {
  return useSyncExternalStore(
    subscribeToHover,
    getHoverSnapshot,
    getHoverServerSnapshot,
  )
}

// A flex line can clip several segments, so treat the element itself or any
// marked descendant as the overflow signal.
function hasClippedContent(el: HTMLElement) {
  if (el.scrollWidth > el.clientWidth + 1) return true
  for (const node of el.querySelectorAll<HTMLElement>(
    '[data-overflow-check]',
  )) {
    if (node.scrollWidth > node.clientWidth + 1) return true
  }
  return false
}

type OverflowRevealProps = {
  /** Full, untruncated text shown in the banner. */
  label: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** Skip the banner when the caller already handles the full text. */
  disabled?: boolean
}

/**
 * Truncating label that reveals its full text in a small banner on hover.
 *
 * Truncation is pure CSS, so the surrounding layout never grows or overlaps a
 * sibling. The banner only renders while the label is actually clipped and
 * only on hover-capable devices, which keeps touch layouts free of dead
 * interactions.
 */
export function OverflowReveal({
  label,
  children,
  className,
  contentClassName,
  side = 'top',
  align = 'start',
  disabled = false,
}: OverflowRevealProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const canHover = useCanHover()

  useEffect(() => {
    const el = ref.current
    if (!el || disabled || !canHover) return

    const update = () => setOverflowing(hasClippedContent(el))
    update()

    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    for (const node of el.querySelectorAll<HTMLElement>(
      '[data-overflow-check]',
    )) {
      observer?.observe(node)
    }

    // Web fonts can change the measured width after mount.
    let cancelled = false
    if (typeof document !== 'undefined' && 'fonts' in document) {
      void document.fonts.ready.then(() => {
        if (!cancelled) update()
      })
    }

    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [label, disabled, canHover])

  const trigger = (
    <span ref={ref} className={cn('block min-w-0', className)}>
      {children}
    </span>
  )

  if (disabled || !canHover) return trigger

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        {overflowing && (
          <TooltipContent
            side={side}
            align={align}
            className={contentClassName}
          >
            {label}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}
```

## searchable-create-popover

- Description: Search-or-create picker popover

### `src/components/ui/searchable-create-popover.tsx`

```tsx
import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { useCanHover } from './overflow-reveal'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

export type SearchableItem = { id: string; name: string; color: string }

// Cap how many items mount at once. Opening the popover commits every row
// synchronously, so an uncapped list is what makes a large catalog slow.
const MAX_VISIBLE_ITEMS = 50

type CommonProps = {
  items: SearchableItem[]
  onCreate: (name: string, color: string) => Promise<void>
  disabled?: boolean
  /** When false, the "+ New …" footer is hidden. Defaults to true. */
  canCreate?: boolean
  /** Borderless trigger variant for use inside the unified timer bar / rows. */
  bare?: boolean
  wrapTrigger?: boolean
  searchPlaceholder?: string
  emptyText?: string
  createLabel: string
  newNamePlaceholder: string
  defaultColor: string
  renderTrigger: (selected: SearchableItem[]) => ReactNode
}

type SingleProps = CommonProps & {
  multi?: false
  value: string
  onChange: (id: string) => void
}

type MultiProps = CommonProps & {
  multi: true
  value: string[]
  onChange: (ids: string[]) => void
}

export function SearchableCreatePopover(props: SingleProps | MultiProps) {
  const {
    items,
    onCreate,
    disabled = false,
    canCreate = true,
    bare = false,
    wrapTrigger = false,
    searchPlaceholder = 'Search…',
    emptyText = 'Nothing found',
    createLabel,
    newNamePlaceholder,
    defaultColor,
    renderTrigger,
  } = props

  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState(defaultColor)
  const [createPending, setCreatePending] = useState(false)
  const canHover = useCanHover()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setSearch('')
      setCreating(false)
    }
  }

  const isSelected = (id: string) =>
    props.multi ? props.value.includes(id) : props.value === id

  const value = props.value
  const multi = props.multi
  const selectedItems = useMemo(
    () => items.filter((i) => (multi ? value.includes(i.id) : value === i.id)),
    [items, multi, value],
  )

  // Only filter while the dropdown is open — closed pickers shouldn't pay for
  // every parent re-render. Capped so a large catalog doesn't commit every row
  // at once on open; the search box narrows the rest.
  const { filtered, truncated } = useMemo(() => {
    if (!open) return { filtered: [] as SearchableItem[], truncated: false }
    const q = search.toLowerCase()
    const matches = items.filter((i) => i.name.toLowerCase().includes(q))
    return {
      filtered: matches.slice(0, MAX_VISIBLE_ITEMS),
      truncated: matches.length > MAX_VISIBLE_ITEMS,
    }
  }, [open, items, search])

  function handleSelect(id: string) {
    if (props.multi) {
      props.onChange(
        props.value.includes(id)
          ? props.value.filter((v) => v !== id)
          : [...props.value, id],
      )
    } else {
      props.onChange(id)
      setOpen(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setCreatePending(true)
    try {
      await onCreate(newName.trim(), newColor)
      setNewName('')
      setNewColor(defaultColor)
      setCreating(false)
      if (!props.multi) setOpen(false)
    } finally {
      setCreatePending(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={
            bare
              ? 'flex h-full w-full min-w-0 items-center gap-2 px-3 text-sm font-semibold text-foreground transition-colors hover:bg-accent/50 disabled:cursor-not-allowed disabled:text-smoke'
              : `flex w-full min-w-0 items-center gap-2 rounded-md border border-stone bg-eggshell px-3 text-sm font-semibold text-foreground transition-colors hover:border-graphite disabled:cursor-not-allowed disabled:bg-muted disabled:text-smoke ${wrapTrigger ? 'min-h-10 py-1.5' : 'h-10'}`
          }
        >
          <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
            {renderTrigger(selectedItems)}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-smoke" />
        </button>
      </PopoverTrigger>

      {/* Dropdown — rendered in a portal so it's never clipped by an
          overflow-hidden ancestor (timer bar) or overflow-x-auto table. */}
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          if (canHover) inputRef.current?.focus()
        }}
        className="max-h-[min(var(--radix-popover-content-available-height),calc(100dvh-1rem))] w-[min(22rem,calc(100vw-1rem))] gap-0 overflow-hidden rounded-lg border border-stone bg-eggshell p-0 shadow-[var(--shadow-whisper)]"
      >
        <div className="border-b border-stone p-2">
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-10 w-full scroll-mt-24 rounded-md border border-stone bg-eggshell px-3 text-sm text-foreground outline-none focus:border-ink sm:h-8"
          />
        </div>
        <div className="max-h-72 min-h-0 overflow-y-auto overscroll-contain py-1 [touch-action:pan-y] [-webkit-overflow-scrolling:touch]">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-smoke">{emptyText}</p>
          ) : (
            filtered.map((item) => {
              const checked = isSelected(item.id)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  className={`flex min-h-10 w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent sm:min-h-0 ${
                    checked
                      ? 'font-semibold text-foreground'
                      : 'text-foreground'
                  }`}
                >
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="min-w-0 flex-1 text-left [overflow-wrap:anywhere]">
                    {item.name}
                  </span>
                  {checked && (
                    <Check className="size-3.5 shrink-0 text-primary" />
                  )}
                </button>
              )
            })
          )}
          {truncated && (
            <p className="px-3 py-2 text-xs text-smoke">
              Showing first {MAX_VISIBLE_ITEMS} — type to narrow results.
            </p>
          )}
        </div>
        {canCreate && (
          <div className="border-t border-stone p-2">
            {creating ? (
              <form onSubmit={handleCreate} className="grid gap-2">
                <div className="flex gap-2">
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={newNamePlaceholder}
                    aria-label={newNamePlaceholder}
                    className="h-10 flex-1 scroll-mt-24 rounded-md border border-stone bg-eggshell px-2 text-sm text-foreground outline-none focus:border-ink sm:h-8"
                  />
                  <input
                    type="color"
                    value={newColor}
                    onChange={(e) => setNewColor(e.target.value)}
                    title="Pick a color"
                    aria-label="Color"
                    className="h-8 w-10 cursor-pointer rounded-md border border-stone bg-eggshell p-0.5"
                  />
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="submit"
                    disabled={createPending || !newName.trim()}
                    className="flex-1 rounded-full bg-primary-action py-1.5 text-xs font-semibold text-primary-action-foreground hover:bg-primary-action/85 disabled:bg-muted disabled:text-smoke"
                  >
                    {createPending ? 'Creating…' : 'Create'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false)
                      setNewName('')
                    }}
                    className="rounded-full border border-stone px-2.5 py-1.5 text-xs font-semibold text-graphite hover:bg-warm-taupe"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15"
              >
                <Plus className="size-3.5" />
                {createLabel}
              </button>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
```

## AppLogo

- Description: App logo mark

### `src/components/ui/AppLogo.tsx`

```tsx
import { BRAND } from '#/lib/brand'
import { BrandLogo } from '#/components/ui/BrandLogo'

const sizes = {
  sm: 'h-7 w-auto sm:h-8',
  md: 'h-9 w-auto sm:h-10',
  lg: 'h-11 w-auto sm:h-12',
  xl: 'h-14 w-auto sm:h-16',
}

/**
 * Responsive app wordmark that preserves the source image's aspect ratio.
 * Change the source of truth in src/lib/brand.ts.
 */
export function AppLogo({
  size = 'md',
  customSrc,
  imgClassName,
}: {
  size?: keyof typeof sizes
  /** Override the default BRAND.logoSrc */
  customSrc?: string
  /** Additional classes for the <img> (e.g. "dark:invert") */
  imgClassName?: string
}) {
  const className = `block shrink-0 object-contain ${sizes[size]} ${imgClassName ?? ''}`

  return customSrc ? (
    <img src={customSrc} alt={BRAND.logoAlt} className={className} />
  ) : (
    <BrandLogo className={className} />
  )
}
```

## BrandLogo

- Description: Brand logo

### `src/components/ui/BrandLogo.tsx`

```tsx
import { BRAND } from '#/lib/brand'

export function BrandLogo({ className = '' }: { className?: string }) {
  return (
    <>
      <img
        src={BRAND.logoSrc}
        alt={BRAND.logoAlt}
        className={`${className} dark:hidden`}
      />
      <img
        src={BRAND.logoDarkSrc}
        alt=""
        aria-hidden="true"
        className={`${className} hidden dark:block`}
      />
    </>
  )
}
```

### `src/lib/utils.ts`

```ts
import { clsx } from 'clsx'
import type { ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```
