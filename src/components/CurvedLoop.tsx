import { useRef, useEffect, useState, useMemo, useId } from 'react'
import type { FC, PointerEvent } from 'react'
import './CurvedLoop.css'

interface CurvedLoopProps {
  marqueeText?: string
  speed?: number
  /** Applied to the outer wrapper div. Use for sizing, margins, theme colors. */
  className?: string
  /** Applied to the SVG <text> element. Use for font-size, fill/stroke, letter-spacing. */
  textClassName?: string
  /** Display height for the curved ribbon. Accepts pixels or any CSS length. */
  height?: number | string
  curveAmount?: number
  direction?: 'left' | 'right'
  interactive?: boolean
}

const CurvedLoop: FC<CurvedLoopProps> = ({
  marqueeText = '',
  speed = 2,
  className,
  textClassName,
  height = 'clamp(12rem, 24vw, 22rem)',
  curveAmount = 400,
  direction = 'left',
  interactive = true,
}) => {
  const text = useMemo(() => {
    const hasTrailing = /\s|\u00A0$/.test(marqueeText)
    return (
      (hasTrailing ? marqueeText.replace(/\s+$/, '') : marqueeText) + '\u00A0'
    )
  }, [marqueeText])

  const measureRef = useRef<SVGTextElement | null>(null)
  const textPathRef = useRef<SVGTextPathElement | null>(null)
  const [spacing, setSpacing] = useState(0)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const uid = useId()
  const pathId = `curve-${uid}`
  const pathD = `M-100,40 Q500,${40 + curveAmount} 1540,40`

  const dragRef = useRef(false)
  const lastXRef = useRef(0)
  const dirRef = useRef<'left' | 'right'>(direction)
  const velRef = useRef(0)

  const textLength = spacing
  const totalText = textLength
    ? Array(Math.ceil(1800 / textLength) + 2)
        .fill(text)
        .join('')
    : text
  const ready = spacing > 0

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setPrefersReducedMotion(media.matches)
    updatePreference()
    media.addEventListener('change', updatePreference)
    return () => media.removeEventListener('change', updatePreference)
  }, [])

  // Measure text width to calculate spacing
  useEffect(() => {
    if (measureRef.current)
      setSpacing(measureRef.current.getComputedTextLength())
  }, [text, textClassName])

  // Animation loop
  useEffect(() => {
    if (!spacing || !ready || prefersReducedMotion) return
    let frame = 0
    const step = () => {
      if (!dragRef.current && textPathRef.current) {
        const delta = dirRef.current === 'right' ? speed : -speed
        const currentOffset = parseFloat(
          textPathRef.current.getAttribute('startOffset') || '0',
        )
        let newOffset = currentOffset + delta
        const wrapPoint = spacing
        if (newOffset <= -wrapPoint) newOffset += wrapPoint
        if (newOffset > 0) newOffset -= wrapPoint
        textPathRef.current.setAttribute('startOffset', newOffset + 'px')
      }
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [spacing, speed, ready, prefersReducedMotion])

  const onPointerDown = (e: PointerEvent) => {
    if (!interactive) return
    dragRef.current = true
    lastXRef.current = e.clientX
    velRef.current = 0
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!interactive || !dragRef.current || !textPathRef.current) return
    const dx = e.clientX - lastXRef.current
    lastXRef.current = e.clientX
    velRef.current = dx
    const currentOffset = parseFloat(
      textPathRef.current.getAttribute('startOffset') || '0',
    )
    let newOffset = currentOffset + dx
    const wrapPoint = spacing
    if (newOffset <= -wrapPoint) newOffset += wrapPoint
    if (newOffset > 0) newOffset -= wrapPoint
    textPathRef.current.setAttribute('startOffset', newOffset + 'px')
  }

  const endDrag = () => {
    if (!interactive) return
    dragRef.current = false
    dirRef.current = velRef.current > 0 ? 'right' : 'left'
  }

  const cursorStyle = interactive
    ? dragRef.current
      ? 'grabbing'
      : 'grab'
    : 'auto'
  const displayHeight = typeof height === 'number' ? `${height}px` : height

  return (
    <div
      className={`curved-loop-jacket${className ? ` ${className}` : ''}`}
      style={{
        visibility: ready ? 'visible' : 'hidden',
        cursor: cursorStyle,
        height: displayHeight,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
    >
      <svg
        className="curved-loop-svg"
        viewBox="0 0 1440 320"
        preserveAspectRatio="xMidYMid slice"
      >
        {/* Hidden measurement text — never visible, used only for getComputedTextLength() */}
        <text
          ref={measureRef}
          className={textClassName}
          xmlSpace="preserve"
          style={{ visibility: 'hidden', opacity: 0, pointerEvents: 'none' }}
        >
          {text}
        </text>
        <defs>
          <path id={pathId} d={pathD} fill="none" stroke="transparent" />
        </defs>
        {ready && (
          <text
            fontWeight="bold"
            xmlSpace="preserve"
            className={textClassName}
            // Inherit fill from the SVG's `color`, which inherits from the
            // wrapper. When textClassName provides a Tailwind text color
            // (e.g. text-primary/20), Tailwind sets `color` on the <text>
            // element and SVG uses that for `fill` via `currentColor` default.
            style={{ fill: 'currentColor' }}
          >
            <textPath
              ref={textPathRef}
              href={`#${pathId}`}
              startOffset={`${-spacing}px`}
              xmlSpace="preserve"
            >
              {totalText}
            </textPath>
          </text>
        )}
      </svg>
    </div>
  )
}

export default CurvedLoop
