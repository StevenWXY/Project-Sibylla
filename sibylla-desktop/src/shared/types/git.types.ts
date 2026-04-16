export interface CommitInfo {
  readonly oid: string
  readonly message: string
  readonly authorName: string
  readonly authorEmail: string
  readonly timestamp: number
  readonly parents: readonly string[]
}

export interface HistoryOptions {
  readonly depth?: number
  readonly filepath?: string
  readonly ref?: string
}

export interface DiffLine {
  readonly type: 'add' | 'delete' | 'context'
  readonly content: string
}

export interface DiffHunk {
  readonly oldStart: number
  readonly oldLines: number
  readonly newStart: number
  readonly newLines: number
  readonly lines: readonly DiffLine[]
}

export interface FileDiff {
  readonly filepath: string
  readonly oldContent: string
  readonly newContent: string
  readonly hunks: readonly DiffHunk[]
}
