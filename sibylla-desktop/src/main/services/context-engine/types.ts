import type { PromptPart, PromptSource } from '../../../shared/types'

export interface RawPromptFrontmatter {
  id: string
  version: string
  scope: string
  model_hint?: string
  estimated_tokens?: number
  last_evaluated?: string
  performance_score?: number
  tags?: string[]
  requires?: string[]
  conflicts?: string[]
}

export interface RawPromptFile {
  frontmatter: RawPromptFrontmatter
  body: string
}

export interface LoadResult {
  id: string
  version: string
  scope: string
  body: string
  source: PromptSource
  path: string
  tokens: number
  rawFrontmatter: Record<string, unknown>
}

export interface ComposeContext {
  mode: string
  tools: Array<{ id: string }>
  currentAgent?: string
  userPreferences: Record<string, unknown>
  workspaceInfo: {
    name: string
    rootPath: string
    fileCount: number
    recentChanges?: string[]
  }
  maxTokens?: number
  includeHooks?: string[]
}

export interface ComposedPrompt {
  text: string
  parts: PromptPart[]
  estimatedTokens: number
  version: string
  warnings: string[]
}

export class PromptFormatError extends Error {
  readonly filePath: string
  readonly line?: number
  readonly errorType: string

  constructor(filePath: string, errorType: string, message: string, line?: number) {
    super(message)
    this.name = 'PromptFormatError'
    this.filePath = filePath
    this.line = line
    this.errorType = errorType
  }
}

export class PromptDependencyError extends Error {
  readonly promptId: string
  readonly missingRequires: string[]

  constructor(promptId: string, missingRequires: string[]) {
    super(`Prompt "${promptId}" has unmet requires: ${missingRequires.join(', ')}`)
    this.name = 'PromptDependencyError'
    this.promptId = promptId
    this.missingRequires = missingRequires
  }
}
