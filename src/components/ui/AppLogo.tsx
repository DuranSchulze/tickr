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
