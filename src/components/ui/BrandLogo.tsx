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
