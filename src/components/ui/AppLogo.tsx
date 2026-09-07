import { BRAND } from '#/lib/brand'
import { BrandLogo } from '#/components/ui/BrandLogo'

const sizes = {
  sm: 'h-7 w-auto sm:h-8',
  md: 'h-9 w-auto sm:h-10',
  lg: 'h-11 w-auto sm:h-12',
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
