/**
 * Regenerates the PWA / home-screen icons in public/favicon/ from the current
 * brand logo. Run after replacing the logo:
 *
 *   pnpm dlx tsx scripts/generate-pwa-icons.ts
 *
 * The source logo is a transparent PNG whose mark fills ~90% of its canvas, so
 * each icon composes the logo onto a solid white background at a size that
 * keeps the mark inside Android's 80% maskable safe zone (maskable variants)
 * or fills more of the tile for plain / Apple icons.
 */
import path from 'node:path'
import sharp from 'sharp'

const repoRoot = path.resolve(import.meta.dirname, '..')
const logoPath = path.join(repoRoot, 'public/logo-8-26-26.png')
const outDir = path.join(repoRoot, 'public/favicon')

const BACKGROUND = '#ffffff'

async function composeIcon(
  size: number,
  logoFraction: number,
): Promise<Buffer> {
  const logoSize = Math.round(size * logoFraction)
  const logo = await sharp(logoPath)
    .resize(logoSize, logoSize, { fit: 'contain', background: BACKGROUND })
    .png()
    .toBuffer()
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: BACKGROUND,
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer()
}

async function writeIcon(
  fileName: string,
  size: number,
  logoFraction: number,
): Promise<void> {
  await sharp(await composeIcon(size, logoFraction)).toFile(
    path.join(outDir, fileName),
  )
  console.log(`wrote public/favicon/${fileName} (${size}x${size})`)
}

// "any" purpose home-screen icons: mark fills most of the tile.
await writeIcon('android-chrome-192x192.png', 192, 0.92)
await writeIcon('android-chrome-512x512.png', 512, 0.92)

// Maskable icons: Android masks the tile to a circle/squircle, so the mark is
// scaled into the 80% safe zone (~91% logo content * 0.78 ≈ 71% of the tile).
await writeIcon('maskable-192x192.png', 192, 0.78)
await writeIcon('maskable-512x512.png', 512, 0.78)

// Apple touch icon: iOS applies its own rounded-corner crop; fuller bleed.
await writeIcon('apple-touch-icon.png', 180, 0.88)
