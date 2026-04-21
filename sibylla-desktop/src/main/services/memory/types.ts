import type { MemoryLogType } from '../memory-manager'

export type MemorySection =
  | 'user_preference'
  | 'technical_decision'
  | 'common_issue'
  | 'project_convention'
  | 'risk_note'
  | 'glossary'

export interface MemoryEntry {
  id: string
  section: MemorySection
  content: string
  confidence: number
  hits: number
  createdAt: string
  updatedAt: string
  sourceLogIds: string[]
  locked: boolean
  tags: string[]
}

export interface MemoryFileMetadata {
  version: 2
  lastCheckpoint: string
  totalTokens: number
  entryCount: number
}

export interface MemoryFileSnapshot {
  metadata: MemoryFileMetadata
  entries: MemoryEntry[]
}

export type HarnessTraceType =
  | 'guardrail_triggered'
  | 'sensor_signal'
  | 'evaluator_verdict'
  | 'mode_degraded'
  | 'task_state_change'

export interface LogEntry {
  id: string
  type: MemoryLogType | 'harness_trace'
  timestamp: string
  sessionId: string
  summary: string
  details?: Record<string, unknown>
  tags?: string[]
  relatedFiles?: string[]
  operator?: string
  traceType?: HarnessTraceType
  severity?: 'info' | 'warn' | 'error'
}

export interface HarnessTraceEvent {
  id: string
  traceType: HarnessTraceType
  timestamp: string
  sessionId: string
  taskId?: string
  details: Record<string, unknown>
  severity: 'info' | 'warn' | 'error'
}

export const V1_SECTION_MAP: Record<string, MemorySection> = {
  '项目概览': 'project_convention',
  '核心决策': 'technical_decision',
  '当前焦点': 'project_convention',
  '用户偏好': 'user_preference',
  '技术决策': 'technical_decision',
  '常见问题': 'common_issue',
  '项目约定': 'project_convention',
  '风险提示': 'risk_note',
  '关键术语': 'glossary',
}

export const MEMORY_SECTION_LABELS: Record<MemorySection, string> = {
  user_preference: '用户偏好',
  technical_decision: '技术决策',
  common_issue: '常见问题',
  project_convention: '项目约定',
  risk_note: '风险提示',
  glossary: '关键术语',
}

// ─── TASK023: Extraction types ───

export interface ExtractionInput {
  logs: LogEntry[]
  existingMemory: MemoryEntry[]
  workspaceContext: { name: string; description?: string }
}

export interface ExtractionCandidate {
  section: MemorySection
  content: string
  confidence: number
  reasoning: string
  sourceLogIds: string[]
  similarExistingId?: string
}

export interface ExtractionReport {
  added: MemoryEntry[]
  merged: Array<{ existing: string; merged: string }>
  discarded: Array<{ candidate: string; reason: string }>
  durationMs: number
  tokenCost: { input: number; output: number }
}

export interface ExtractorConfig {
  extractorModel: string
  confidenceThreshold: number
  similarityThreshold: number
  maxNewEntriesPerBatch: number
  maxRetries: number
}

export const DEFAULT_EXTRACTOR_CONFIG: ExtractorConfig = {
  extractorModel: 'claude-haiku',
  confidenceThreshold: 0.5,
  similarityThreshold: 0.85,
  maxNewEntriesPerBatch: 20,
  maxRetries: 3,
}

export const SECTION_ID_PREFIX: Record<MemorySection, string> = {
  user_preference: 'pref',
  technical_decision: 'dec',
  common_issue: 'iss',
  project_convention: 'conv',
  risk_note: 'risk',
  glossary: 'glos',
}

export interface SimilarityIndexProvider {
  isAvailable(): boolean
  embed(text: string): Promise<number[]>
  getOrComputeEmbedding(entry: MemoryEntry): Promise<number[]>
}

// ─── TASK024: Checkpoint & Compression types ───

export type CheckpointTrigger = 'timer' | 'interaction_count' | 'manual' | 'key_event'

export interface CheckpointRecord {
  id: string
  trigger: CheckpointTrigger
  startedAt: string
  completedAt?: string
  status: 'running' | 'success' | 'failed' | 'aborted'
  report?: ExtractionReport
  errorMessage?: string
}

export interface CompressionResult {
  discarded: MemoryEntry[]
  merged: Array<{ original: MemoryEntry[]; merged: MemoryEntry }>
  archived: MemoryEntry[]
  beforeTokens: number
  afterTokens: number
  snapshotPath: string
}

export interface MemoryConfig {
  checkpointIntervalMs: number
  interactionThreshold: number
  extractorModel: string
  compressionThreshold: number
  compressionTargetMin: number
  compressionTargetMax: number
  searchWeights: { vector: number; bm25: number; timeDecay: number }
  embeddingProvider: 'local' | 'cloud'
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  checkpointIntervalMs: 7200000,
  interactionThreshold: 50,
  extractorModel: 'claude-haiku',
  compressionThreshold: 12000,
  compressionTargetMin: 8000,
  compressionTargetMax: 12000,
  searchWeights: { vector: 0.6, bm25: 0.3, timeDecay: 0.1 },
  embeddingProvider: 'local',
}

// ─── TASK023: Evolution types ───

export type EvolutionEventType =
  | 'add'
  | 'update'
  | 'merge'
  | 'archive'
  | 'delete'
  | 'manual-edit'
  | 'lock'
  | 'unlock'

export interface EvolutionEvent {
  id: string
  timestamp: string
  type: EvolutionEventType
  entryId: string
  section: MemorySection
  before?: Partial<MemoryEntry>
  after?: Partial<MemoryEntry>
  trigger: {
    source: 'checkpoint' | 'manual' | 'compression' | 'migration'
    checkpointId?: string
    userId?: string
  }
  rationale?: string
  traceSpanId?: string
}

export const CHANGELOG_HEADER = `# 记忆演化日志

> 本文件由 Sibylla 记忆系统自动维护。记录每次 MEMORY.md 变更的完整追溯链。

---
`

// ─── TASK025: Embedding & Search types ───

export interface EmbeddingProvider {
  readonly dimension: number
  readonly provider: 'local' | 'cloud'
  embed(texts: string[]): Promise<number[][]>
  isAvailable(): boolean
  initialize(): Promise<void>
}

export interface HybridSearchResult {
  id: string
  section: MemorySection
  content: string
  confidence: number
  hits: number
  isArchived: boolean
  vecScore: number
  bm25Score: number
  finalScore: number
}

export interface SearchOptions {
  limit?: number
  sectionFilter?: MemorySection[]
  includeArchived?: boolean
  minConfidence?: number
  weights?: { vector: number; bm25: number; timeDecay: number }
}
