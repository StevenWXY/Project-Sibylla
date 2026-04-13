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
  diffProposal?: DiffProposal | null
}

export interface OpenFileTab {
  path: string
  name: string
}
