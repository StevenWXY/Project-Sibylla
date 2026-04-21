export type TaskState = 'queued' | 'running' | 'paused' | 'completed' | 'failed'

export type ChecklistItemStatus = 'pending' | 'in_progress' | 'done' | 'skipped'

export interface ChecklistItem {
  description: string
  status: ChecklistItemStatus
}

export interface TaskOutput {
  type: 'file' | 'message'
  ref: string
}

export interface TaskRecord {
  id: string
  title: string
  state: TaskState
  mode?: 'plan' | 'analyze' | 'review' | 'free'
  traceId?: string
  conversationId?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  checklist: ChecklistItem[]
  outputs: TaskOutput[]
  resultSummary?: string
  failureReason?: string
  userNotes?: string
}

export interface ProgressSnapshot {
  active: TaskRecord[]
  completedRecent: TaskRecord[]
  queued: TaskRecord[]
  updatedAt: string
}

export interface DeclareInput {
  title: string
  mode?: TaskRecord['mode']
  traceId?: string
  conversationId?: string
  plannedChecklist?: string[]
}

export interface UpdatePatch {
  checklistUpdates?: Array<{ index: number; status: ChecklistItemStatus }>
  newChecklistItems?: string[]
  output?: TaskOutput
}
