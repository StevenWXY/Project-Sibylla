export type KanbanColumn = '待开始' | '进行中' | '已完成'

export interface KanbanTask {
  id: string
  title: string
  status: KanbanColumn
  assignee?: string
  priority?: 'P0' | 'P1' | 'P2'
  deadline?: string
  relatedFiles?: string[]
  isAiLinked: boolean
  isAiSuggested: boolean
  completedAt?: string
  rawLine: string
  metadataLines: string[]
}

export interface KanbanModel {
  tasks: KanbanTask[]
  columns: Record<KanbanColumn, KanbanTask[]>
  rawContent: string
  parsedAt: number
  parseError?: boolean
}

export interface CreateTaskInput {
  title: string
  assignee?: string
  priority?: 'P0' | 'P1' | 'P2'
  deadline?: string
  relatedFiles?: string[]
  status?: KanbanColumn
  isAiSuggested?: boolean
}

export interface StatusSuggestion {
  taskId: string
  currentStatus: KanbanColumn
  suggestedStatus: KanbanColumn
  confidence: number
  signals: Array<{ type: string; weight: number; description: string }>
  reasoning: string
}
