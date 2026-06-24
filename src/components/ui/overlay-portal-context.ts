import { createContext, useContext } from 'react'
import type { RefObject } from 'react'

const OverlayPortalContainerContext =
  createContext<RefObject<HTMLElement | null> | null>(null)

function useOverlayPortalContainer() {
  return useContext(OverlayPortalContainerContext)
}

export { OverlayPortalContainerContext, useOverlayPortalContainer }
