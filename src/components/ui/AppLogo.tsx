import { BRAND } from '#/lib/brand'

const sizes = {
  sm: { container: 'h-8 w-8', img: 'h-5 w-5' },
  md: { container: 'h-11 w-11', img: 'h-7 w-7' },
  lg: { container: 'h-14 w-14', img: 'h-10 w-10' },
}

/**
 * App logo mark — the icon in a rounded container.
 * Change the source of truth in src/lib/brand.ts.
 */
export function AppLogo({ size = 'md' }: { size?: keyof typeof sizes }) {
  const { container } = sizes[size]

  return (
    <div
      className={`
        ${container}
        flex shrink-0 items-center justify-center
        rounded-2xl overflow-hidden
      `}
    >
      <img
        src={BRAND.logoSrc}
        alt={BRAND.logoAlt}
        /* max-h-full and max-w-full keep it inside the box
           block removes any baseline whitespace
        */
        className="max-h-full max-w-full block object-contain"
      />
    </div>
  )
}
