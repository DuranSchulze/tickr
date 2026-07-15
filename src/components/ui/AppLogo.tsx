import { BRAND } from '#/lib/brand'

const sizes = {
  sm: { container: 'size-8', img: 'size-5' },
  md: { container: 'size-11', img: 'size-7' },
  lg: { container: 'size-14', img: 'size-10' },
}

/**
 * App logo mark — the icon in a rounded container.
 * Change the source of truth in src/lib/brand.ts.
 */
export function AppLogo({
  size = 'md',
  customSrc,
  imgClassName,
}: {
  size?: keyof typeof sizes
  /** Override the default BRAND.logoSrc (e.g. "/favicon/icon1.png") */
  customSrc?: string
  /** Additional classes for the <img> (e.g. "dark:invert") */
  imgClassName?: string
}) {
  const { container } = sizes[size]
  const src = customSrc ?? BRAND.logoSrc

  return (
    <div
      className={`
        ${container}
        flex shrink-0 items-center justify-center
        rounded-2xl overflow-hidden
      `}
    >
      <img
        src={src}
        alt={BRAND.logoAlt}
        /* max-h-full and max-w-full keep it inside the box
           block removes any baseline whitespace
        */
        className={`max-h-full max-w-full block object-contain transition-[filter] duration-300 ${imgClassName ?? ''}`}
      />
    </div>
  )
}
