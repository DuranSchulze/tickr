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
}

export interface FeatureManifest {
  appVersion: string
  updates: ChangelogEntry[]
}
