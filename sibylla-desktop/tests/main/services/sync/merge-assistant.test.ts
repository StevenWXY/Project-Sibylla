import { describe, expect, it, beforeEach, vi } from 'vitest'
import { MergeAssistant } from '../../../../src/main/services/sync/merge-assistant'
import type { ConflictInfo, MergeResult } from '../../../../src/shared/types'

function createMockSubAgentExecutor() {
  return {
    run: vi.fn(),
    gracefulAbort: vi.fn(),
    abortAll: vi.fn(),
  } as unknown as ReturnType<typeof vi.fn> extends (...args: unknown[]) => unknown ? never : never
}

function createMockRegistry(agentDef: Record<string, unknown> | null) {
  return {
    get: vi.fn().mockReturnValue(agentDef),
    getAll: vi.fn().mockReturnValue([]),
    initialize: vi.fn(),
  }
}

function createMockSearchEngine(results: Array<{ snippet: string }> = []) {
  return {
    search: vi.fn().mockResolvedValue({ results }),
  }
}

const SUCCESSFUL_AGENT_DEF = {
  id: 'merge-curator',
  allowedTools: ['read-file', 'search'],
}

const BASE_CONFLICT: ConflictInfo = {
  filePath: 'docs/meeting-notes.md',
  localContent: 'local version content\nline 2\nline 3',
  remoteContent: 'remote version content\nline 2\nline 3',
  baseContent: 'base content\nline 2\nline 3',
  conflictId: '01H5TEST1234567890ABCDEF',
}

function createMergeAssistant(overrides: {
  agentDef?: Record<string, unknown> | null
  searchResults?: Array<{ snippet: string }>
  customPatterns?: readonly string[]
} = {}): { assistant: MergeAssistant; executor: ReturnType<typeof createMockSubAgentExecutor>; registry: ReturnType<typeof createMockRegistry>; searchEngine: ReturnType<typeof createMockSearchEngine> } {
  const executor = createMockSubAgentExecutor()
  const agentDef = overrides.agentDef ?? SUCCESSFUL_AGENT_DEF
  const registry = createMockRegistry(agentDef)
  const searchEngine = createMockSearchEngine(overrides.searchResults ?? [{ snippet: 'related context' }])

  const assistant = new MergeAssistant({
    subAgentExecutor: executor as unknown as import('../../../../src/main/services/sub-agent/SubAgentExecutor').SubAgentExecutor,
    registry: registry as unknown as import('../../../../src/main/services/sub-agent/SubAgentRegistry').SubAgentRegistry,
    searchEngine: searchEngine as unknown as import('../../../../src/main/services/unified-search/unified-search-engine').UnifiedSearchEngine,
    workspaceDir: '/tmp/test-workspace',
    customSensitivePatterns: overrides.customPatterns,
  })

  return { assistant, executor, registry, searchEngine }
}

describe('MergeAssistant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('isSensitiveFile', () => {
    it('blocks secrets/ directory', () => {
      const { assistant } = createMergeAssistant()
      expect(assistant.isSensitiveFile('secrets/api-key.txt')).toBe(true)
    })

    it('blocks personal/ directory', () => {
      const { assistant } = createMergeAssistant()
      expect(assistant.isSensitiveFile('personal/diary.md')).toBe(true)
    })

    it('blocks .env files', () => {
      const { assistant } = createMergeAssistant()
      expect(assistant.isSensitiveFile('.env')).toBe(true)
      expect(assistant.isSensitiveFile('.env.production')).toBe(true)
    })

    it('blocks .key files', () => {
      const { assistant } = createMergeAssistant()
      expect(assistant.isSensitiveFile('server.key')).toBe(true)
    })

    it('allows normal files', () => {
      const { assistant } = createMergeAssistant()
      expect(assistant.isSensitiveFile('docs/meeting-notes.md')).toBe(false)
      expect(assistant.isSensitiveFile('src/index.ts')).toBe(false)
    })

    it('applies custom patterns from ConfigManager', () => {
      const { assistant } = createMergeAssistant({ customPatterns: ['^private/'] })
      expect(assistant.isSensitiveFile('private/notes.md')).toBe(true)
      expect(assistant.isSensitiveFile('docs/notes.md')).toBe(false)
    })
  })

  describe('propose', () => {
    it('returns sensitive status for sensitive files', async () => {
      const { assistant } = createMergeAssistant()
      const conflict: ConflictInfo = { ...BASE_CONFLICT, filePath: 'secrets/credentials.json' }
      const result = await assistant.propose(conflict)
      expect(result.status).toBe('sensitive')
      expect(result.conflictId).toBe(conflict.conflictId)
    })

    it('returns success for normal files via Sub-agent', async () => {
      const { assistant, executor } = createMergeAssistant()
      executor.run.mockResolvedValue({
        success: true,
        structuredOutput: {
          mergedContent: 'merged content\nline 2\nline 3',
          attribution: { fromMine: [[1, 1]], fromTheirs: [[2, 2]], byAI: [[3, 3]] },
          rationale: 'Retained local heading, used remote body text.',
        },
      })

      const result = await assistant.propose(BASE_CONFLICT)
      expect(result.status).toBe('success')
      expect(result.mergedContent).toBe('merged content\nline 2\nline 3')
      expect(result.conflictId).toBe(BASE_CONFLICT.conflictId)
      expect(executor.run).toHaveBeenCalledOnce()
    })

    it('returns failed when Sub-agent agent not found', async () => {
      const { assistant } = createMergeAssistant({ agentDef: null })
      const result = await assistant.propose(BASE_CONFLICT)
      expect(result.status).toBe('failed')
    })

    it('returns timeout on Sub-agent timeout', async () => {
      const { assistant, executor } = createMergeAssistant()
      const error = new Error('Aborted')
      error.name = 'AbortError'
      executor.run.mockRejectedValue(error)

      const result = await assistant.propose(BASE_CONFLICT)
      expect(result.status).toBe('timeout')
    })

    it('returns failed on Sub-agent general failure', async () => {
      const { assistant, executor } = createMergeAssistant()
      executor.run.mockRejectedValue(new Error('Network error'))

      const result = await assistant.propose(BASE_CONFLICT)
      expect(result.status).toBe('failed')
    })

    it('returns failed when Sub-agent success=false', async () => {
      const { assistant, executor } = createMergeAssistant()
      executor.run.mockResolvedValue({
        success: false,
        errors: ['Agent execution failed'],
      })

      const result = await assistant.propose(BASE_CONFLICT)
      expect(result.status).toBe('failed')
    })

    it('rejects merged content with conflict markers', async () => {
      const { assistant, executor } = createMergeAssistant()
      executor.run.mockResolvedValue({
        success: true,
        structuredOutput: {
          mergedContent: 'some content\n<<<<<<< HEAD\nmore content',
          attribution: { fromMine: [], fromTheirs: [], byAI: [] },
          rationale: 'Failed merge',
        },
      })

      const result = await assistant.propose(BASE_CONFLICT)
      expect(result.status).toBe('failed')
    })

    it('continues without search context when search fails', async () => {
      const { assistant, executor, searchEngine } = createMergeAssistant()
      searchEngine.search.mockRejectedValue(new Error('Search unavailable'))
      executor.run.mockResolvedValue({
        success: true,
        structuredOutput: {
          mergedContent: 'merged',
          attribution: { fromMine: [], fromTheirs: [], byAI: [[1, 1]] },
          rationale: 'Basic merge',
        },
      })

      const result = await assistant.propose(BASE_CONFLICT)
      expect(result.status).toBe('success')
    })

    it('passes correct params to Sub-agent', async () => {
      const { assistant, executor } = createMergeAssistant()
      executor.run.mockResolvedValue({
        success: true,
        structuredOutput: {
          mergedContent: 'merged',
          attribution: { fromMine: [], fromTheirs: [], byAI: [] },
          rationale: 'test',
        },
      })

      await assistant.propose(BASE_CONFLICT)

      const call = executor.run.mock.calls[0][0]
      expect(call.agent.id).toBe('merge-curator')
      expect(call.timeoutMs).toBe(5000)
      expect(call.params.filePath).toBe(BASE_CONFLICT.filePath)
      expect(call.params.localContent).toBe(BASE_CONFLICT.localContent)
      expect(call.params.remoteContent).toBe(BASE_CONFLICT.remoteContent)
      expect(call.params.baseContent).toBe(BASE_CONFLICT.baseContent)
    })
  })

  describe('adoptMerge', () => {
    it('writes audit log as JSONL', () => {
      const { assistant } = createMergeAssistant()
      assistant.adoptMerge({
        conflictId: 'test-id',
        filePath: 'docs/test.md',
        mergedContent: 'merged',
        attribution: { fromMine: [[1, 1]], fromTheirs: [[2, 2]], byAI: [] },
        rationale: 'test rationale',
        userId: 'user-1',
      })

      const fs = require('fs')
      const dir = '/tmp/test-workspace/.sibylla/sync'
      expect(fs.existsSync(dir + '/merge-history.jsonl')).toBe(true)
    })
  })
})
