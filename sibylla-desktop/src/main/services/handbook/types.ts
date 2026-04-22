export interface HandbookEntry {
  readonly id: string
  readonly path: string
  readonly title: string
  readonly tags: readonly string[]
  readonly language: string
  readonly version: string
  readonly source: 'builtin' | 'local'
  readonly content: string
  readonly keywords: readonly string[]
  readonly updatedAt: string
}

export interface HandbookIndexMeta {
  readonly id: string
  readonly path: string
  readonly title: Readonly<Record<string, string>>
  readonly tags: readonly string[]
  readonly keywords: readonly string[]
}

export interface HandbookIndex {
  readonly version: string
  readonly languages: readonly string[]
  readonly entries: readonly HandbookIndexMeta[]
}

export interface HandbookDiff {
  readonly added: readonly string[]
  readonly modified: readonly string[]
  readonly removed: readonly string[]
}

export interface HandbookSearchOptions {
  readonly limit?: number
  readonly language?: string
}

export interface CloneResult {
  readonly clonedCount: number
  readonly localPath: string
}

export interface UpdateCheckResult {
  readonly hasUpdates: boolean
  readonly diff?: HandbookDiff
}
