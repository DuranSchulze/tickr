export interface ChangelogFeature {
  title: string
  description: string
  image: string | null
}

type ChangelogEntryDetails = {
  publishedAt: string
  title: string
  body: string
  features: ChangelogFeature[]
}

export type ChangelogEntry = ChangelogEntryDetails &
  ({ version: string; kind?: never } | { kind: 'notice'; id: string })

export interface FeatureManifest {
  appVersion: string
  updates: ChangelogEntry[]
}
