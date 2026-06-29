import type {
  ComponentProps,
  ComponentPropsWithRef,
  MouseEvent,
  ReactNode,
} from 'react'
import {
  createContext,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import type {
  CreateTypes as ConfettiInstance,
  GlobalOptions as ConfettiGlobalOptions,
  Options as ConfettiOptions,
} from 'canvas-confetti'
import confetti from 'canvas-confetti'
import { Button } from '#/components/ui/button'

type Api = {
  fire: (options?: ConfettiOptions) => Promise<void>
}

type Props = ComponentPropsWithRef<'canvas'> & {
  options?: ConfettiOptions
  globalOptions?: ConfettiGlobalOptions
  manualstart?: boolean
  children?: ReactNode
}

export type ConfettiRef = Api | null

export const ConfettiContext = createContext<Api>({} as Api)

const DEFAULT_CANNON_COLORS = ['#a786ff', '#fd8bbc', '#eca184', '#f8deb1']

const ConfettiComponent = forwardRef<ConfettiRef, Props>((props, ref) => {
  const {
    options,
    globalOptions = { resize: true, useWorker: true },
    manualstart = false,
    children,
    ...rest
  } = props
  const instanceRef = useRef<ConfettiInstance | null>(null)

  const canvasRef = useCallback(
    (node: HTMLCanvasElement | null) => {
      if (node !== null) {
        if (instanceRef.current) return
        instanceRef.current = confetti.create(node, {
          ...globalOptions,
          resize: true,
        })
      } else if (instanceRef.current) {
        instanceRef.current.reset()
        instanceRef.current = null
      }
    },
    [globalOptions],
  )

  const fire = useCallback(
    async (opts: ConfettiOptions = {}) => {
      try {
        await instanceRef.current?.({ ...options, ...opts })
      } catch {
        // Ignore confetti failures in restricted browser contexts.
      }
    },
    [options],
  )

  const api = useMemo(
    () => ({
      fire,
    }),
    [fire],
  )

  useImperativeHandle(ref, () => api, [api])

  useEffect(() => {
    if (!manualstart) {
      void fire()
    }
  }, [manualstart, fire])

  return (
    <ConfettiContext.Provider value={api}>
      <canvas ref={canvasRef} {...rest} />
      {children}
    </ConfettiContext.Provider>
  )
})

ConfettiComponent.displayName = 'Confetti'

export const Confetti = ConfettiComponent

interface ConfettiButtonProps extends ComponentProps<'button'> {
  options?: ConfettiOptions &
    ConfettiGlobalOptions & { canvas?: HTMLCanvasElement }
}

const ConfettiButtonComponent = ({
  options,
  children,
  ...props
}: ConfettiButtonProps) => {
  const handleClick = async (event: MouseEvent<HTMLButtonElement>) => {
    try {
      const rect = event.currentTarget.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2

      await confetti({
        ...options,
        origin: {
          x: x / window.innerWidth,
          y: y / window.innerHeight,
        },
      })
    } catch {
      // Ignore confetti failures in restricted browser contexts.
    }
  }

  return (
    <Button onClick={handleClick} {...props}>
      {children}
    </Button>
  )
}

ConfettiButtonComponent.displayName = 'ConfettiButton'

export const ConfettiButton = ConfettiButtonComponent

export function fireSideCannons({
  durationMs = 3000,
  particleCount = 2,
  colors = DEFAULT_CANNON_COLORS,
}: {
  durationMs?: number
  particleCount?: number
  colors?: string[]
} = {}) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return () => undefined
  }

  const end = Date.now() + durationMs
  let frameId = 0

  const frame = () => {
    if (Date.now() > end) return

    void confetti({
      particleCount,
      angle: 60,
      spread: 55,
      startVelocity: 60,
      origin: { x: 0, y: 0.5 },
      colors,
    })
    void confetti({
      particleCount,
      angle: 120,
      spread: 55,
      startVelocity: 60,
      origin: { x: 1, y: 0.5 },
      colors,
    })

    frameId = window.requestAnimationFrame(frame)
  }

  frame()

  return () => {
    if (frameId) window.cancelAnimationFrame(frameId)
  }
}
