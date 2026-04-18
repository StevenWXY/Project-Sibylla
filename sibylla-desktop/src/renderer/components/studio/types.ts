import type { DiffHunk } from '../../../shared/types/git.types'

export type EditorMode = 'edit' | 'preview' | 'split'
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
export type ChatRole = 'user' | 'assistant'
export type LeftToolMode = 'search' | 'tasks' | 'notifications' | null
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error'

export interface SearchResultItem {
  id: string
  path: string
  lineNumber: number
  preview: string
  snippet: string
  rank: number
  matchCount: number
}

export interface TaskItem {
  id: string
  path: string
  lineNumber: number
  text: string
  completed: boolean
}

export interface NotificationItem {
  id: string
  title: string
  description: string
  level: NotificationLevel
  timestamp: number
  read: boolean
}

export interface ParsedFileDiff {
  filePath: string
  hunks: DiffHunk[]
  fullNewContent: string
  fullOldContent: string
  stats: {
    additions: number
    deletions: number
  }
}

/** @deprecated Use ParsedFileDiff[] via ChatMessage.diffProposals instead */
export interface DiffProposal {
  targetPath: string
  before: string
  after: string
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: number
  contextSources?: string[]
  streaming?: boolean
  /** @deprecated Use diffProposals instead */
  diffProposal?: DiffProposal | null
  diffProposals?: ParsedFileDiff[]
  memoryState?: {
    tokenCount: number
    tokenDebt: number
    flushTriggered: boolean
  } | null
  ragHits?: Array<{
    path: string
    score: number
    snippet: string
  }>
}

/** @deprecated 使用 tabStore.TabInfo 替代 */
export interface OpenFileTab {
  path: string
  name: string
}
