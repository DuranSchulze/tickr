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
