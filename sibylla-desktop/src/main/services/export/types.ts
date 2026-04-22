import type { RedactionRule } from '../trace/trace-exporter'

export type ExportFormat = 'markdown' | 'json' | 'html'

export interface SensitiveField {
  path: string
  rule: string
  sample: string
}

export interface ExportOptions {
  format: ExportFormat
  conversationId: string
  includeMetadata: boolean
  includeReferencedFiles: boolean
  applyRedaction: boolean
  customRedactionRules?: RedactionRule[]
  targetPath: string
  messageRange?: { startIndex: number; endIndex: number }
}

export interface ExportPreview {
  estimatedSizeBytes: number
  messageCount: number
  detectedSensitiveFields: SensitiveField[]
  referencedFiles: string[]
  hasPlans: boolean
  hasTraces: boolean
}

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  model?: string
  aiModeId?: string
  traceId?: string
  planId?: string
}

export interface ConversationData {
  id: string
  title: string
  messages: ConversationMessage[]
  createdAt: string
  updatedAt: string
}
