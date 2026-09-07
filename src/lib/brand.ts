/**
 * Central brand configuration.
 * Change these values to update the name, tagline, and logo everywhere in the app.
 */
export const BRAND = {
  /** Product / brand name */
  name: 'Trackly',
  /** Short descriptor shown next to the logo in nav bars */
  tagline: 'Workspace time tracking',
  /** For email footers and meta descriptions */
  description: 'Workspace time tracking for teams',
  /** Paths relative to /public, or absolute https:// URLs */
  logoSrc: '/Logo-Black.png',
  logoDarkSrc: '/Logo-White.png',
  logoAlt: 'Trackly logo',
} as const
