export interface ActionLink {
  label: string
  /** @tanstack/react-router route path, e.g. "/app/time-tracker" */
  to: string
}

export interface OnboardingStep {
  id: string
  title: string
  description: string
  /** Path to an image in /public/features/, or null for no image */
  image: string | null
  action?: ActionLink | null
}

export interface OnboardingConfig {
  enabled: boolean
  title: string
  subtitle?: string
  steps: OnboardingStep[]
}

export interface ChangelogFeature {
  title: string
  description: string
  image: string | null
}

export interface ChangelogEntry {
  version: string
  publishedAt: string
  title: string
  /** A high-level summary of the release */
  body: string
  features: ChangelogFeature[]
  actions?: ActionLink[]
}

export interface FeatureManifest {
  appVersion: string
  onboarding: OnboardingConfig
  updates: ChangelogEntry[]
}

/**
 * Keys used in localStorage to persist user dismissal state.
 */
export const STORAGE_KEYS = {
  ONBOARDING_DISMISSED: 'tickr_onboarding_dismissed',
  CHANGELOG_VERSION: 'tickr_changelog_version',
} as const
