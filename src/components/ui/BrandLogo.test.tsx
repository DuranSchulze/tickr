import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BrandLogo } from '#/components/ui/BrandLogo'
import { AppLogo } from '#/components/ui/AppLogo'

describe('BrandLogo', () => {
  it('shows the black logo in light mode and the white logo in dark mode', () => {
    const markup = renderToStaticMarkup(<BrandLogo className="size-9" />)

    expect(markup).toContain('src="/Logo-Black.png"')
    expect(markup).toContain('class="size-9 dark:hidden"')
    expect(markup).toContain('src="/Logo-White.png"')
    expect(markup).toContain('class="size-9 hidden dark:block"')
  })

  it('preserves the wordmark aspect ratio with responsive navigation sizing', () => {
    const markup = renderToStaticMarkup(<AppLogo size="md" />)

    expect(markup).toContain('h-9 w-auto sm:h-10')
    expect(markup).not.toContain('<div')
  })
})
