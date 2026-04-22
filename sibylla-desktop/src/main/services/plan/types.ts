export type PlanStatus =
  | 'draft'
  | 'draft-unparsed'
  | 'in_progress'
  | 'completed'
  | 'archived'
  | 'abandoned'

export interface PlanMetadata {
  id: string
  title: string
  mode: 'plan'
  status: PlanStatus
  createdAt: string
  updatedAt: string
  conversationId?: string
  traceId?: string
  estimatedDuration?: string
  tags: string[]
  filePath: string
  archivedTo?: string
}

export interface PlanStep {
  sectionTitle?: string
  text: string
  done: boolean
  estimatedMinutes?: number
  owner?: string
  subSteps?: PlanStep[]
}

export interface ParsedPlan {
  metadata: PlanMetadata
  goal?: string
  steps: PlanStep[]
  risks?: string[]
  successCriteria?: string[]
  rawMarkdown: string
}

export interface PlanCreateInput {
  aiContent: string
  conversationId: string
  traceId: string
}

export interface PlanFollowUpResult {
  planId: string
  progress: number
  completedSteps: number
  totalSteps: number
  notes: string[]
}

export interface PlanParseResult {
  parseSuccess: boolean
  title?: string
  goal?: string
  steps: PlanStep[]
  risks?: string[]
  successCriteria?: string[]
  tags: string[]
  rawMarkdown: string
  id: string
}
