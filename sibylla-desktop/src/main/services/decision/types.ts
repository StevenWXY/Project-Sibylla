export type DecisionStatus = 'decided' | 'in-progress' | 'reverted'

export interface DecisionOption {
  name: string
  pros?: string
  cons?: string
  risks?: string
}

export interface DecisionLog {
  id: string
  title: string
  status: DecisionStatus
  decidedAt: string
  decidedBy: string[]
  tags: string[]
  relatedFiles: string[]
  problem: string
  options: DecisionOption[]
  chosen: string
  reason: string
  actualResult?: string
  filePath: string
  updatedAt: number
}

export interface CreateDecisionInput {
  title: string
  problem: string
  options: DecisionOption[]
  chosen: string
  reason: string
  decidedBy?: string[]
  tags?: string[]
  relatedFiles?: string[]
  location?: 'memory' | 'docs'
}

export interface DecisionListFilters {
  tags?: string[]
  status?: DecisionStatus
  searchQuery?: string
  sortBy?: 'date' | 'title'
  sortOrder?: 'asc' | 'desc'
}
