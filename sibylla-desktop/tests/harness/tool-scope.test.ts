/**
 * ToolScopeManager unit tests
 *
 * Tests tool selection by intent, explicit overrides, maxTools trimming,
 * registry management, and error message formatting.
 *
 * @see plans/phase1-task020-tool-scope-intent-classifier-plan.md §九.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ToolScopeManager, INTENT_PROFILES, TOOL_NOT_AVAILABLE_MESSAGE } from '../../src/main/services/harness/tool-scope'
import type { ToolDefinition, HarnessIntent } from '../../src/main/services/harness/tool-scope'
import type { IntentClassifier, ClassifyResult } from '../../src/main/services/harness/intent-classifier'
import type { AIChatRequest } from '../../src/shared/types'
import { registerBuiltInTools } from '../../src/main/services/harness/built-in-tools'

// ─── Mocks ───

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
}

function createMockRequest(message: string, explicitTools?: string[]): AIChatRequest {
  return { message, explicitTools }
}

function createClassifyResult(intent: HarnessIntent, confidence = 0.9): ClassifyResult {
  return { intent, confidence, source: 'rule', elapsedMs: 1 }
}

function createMockClassifier(result: ClassifyResult): IntentClassifier {
  return {
    classify: vi.fn().mockResolvedValue(result),
  } as unknown as IntentClassifier
}

function createSimpleTool(id: string, name?: string): ToolDefinition {
  return {
    id,
    name: name ?? id,
    description: `Tool: ${id}`,
    schema: { type: 'object', properties: {} },
    tags: [id],
    handler: vi.fn().mockResolvedValue({}),
  }
}

// ─── Tests ───

describe('ToolScopeManager', () => {
  let manager: ToolScopeManager

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('select() — intent-based tool selection', () => {
    // Test 1: chat intent → 3 tools
    it('should return reference_file, search, skill_activate for chat intent', async () => {
      const classifier = createMockClassifier(createClassifyResult('chat'))
      manager = new ToolScopeManager(classifier, mockLogger as never)
      registerBuiltInTools(manager)

      const selection = await manager.select(createMockRequest('hello'))

      const toolIds = selection.tools.map(t => t.id)
      expect(toolIds).toContain('reference_file')
      expect(toolIds).toContain('search')
      expect(toolIds).toContain('skill_activate')
      expect(selection.intent).toBe('chat')
      expect(selection.profile.intent).toBe('chat')
    })

    // Test 2: edit_file intent → 4 tools
    it('should return reference_file, diff_write, search, spec_lookup for edit_file intent', async () => {
      const classifier = createMockClassifier(createClassifyResult('edit_file'))
      manager = new ToolScopeManager(classifier, mockLogger as never)
      registerBuiltInTools(manager)

      const selection = await manager.select(createMockRequest('edit file'))

      const toolIds = selection.tools.map(t => t.id)
      expect(toolIds).toContain('reference_file')
      expect(toolIds).toContain('diff_write')
      expect(toolIds).toContain('search')
      expect(toolIds).toContain('spec_lookup')
      expect(selection.intent).toBe('edit_file')
    })

    // Test 3: analyze intent → 4 tools
    it('should return reference_file, search, memory_query, graph_traverse for analyze intent', async () => {
      const classifier = createMockClassifier(createClassifyResult('analyze'))
      manager = new ToolScopeManager(classifier, mockLogger as never)
      registerBuiltInTools(manager)

      const selection = await manager.select(createMockRequest('analyze'))

      const toolIds = selection.tools.map(t => t.id)
      expect(toolIds).toContain('reference_file')
      expect(toolIds).toContain('search')
      expect(toolIds).toContain('memory_query')
      expect(toolIds).toContain('graph_traverse')
      expect(selection.intent).toBe('analyze')
    })

    // Test 12: search intent → 2 tools
    it('should return search, reference_file for search intent', async () => {
      const classifier = createMockClassifier(createClassifyResult('search'))
      manager = new ToolScopeManager(classifier, mockLogger as never)
      registerBuiltInTools(manager)

      const selection = await manager.select(createMockRequest('search'))

      const toolIds = selection.tools.map(t => t.id)
      expect(toolIds).toContain('search')
      expect(toolIds).toContain('reference_file')
      expect(selection.intent).toBe('search')
    })
  })

  describe('select() — explicit tool overrides', () => {
    // Test 4: user explicit diff_write in chat mode
    it('should append explicit tools that are not in the profile', async () => {
      const classifier = createMockClassifier(createClassifyResult('chat'))
      manager = new ToolScopeManager(classifier, mockLogger as never)
      registerBuiltInTools(manager)

      const selection = await manager.select(createMockRequest('hello', ['diff_write']))

      const toolIds = selection.tools.map(t => t.id)
      // Original chat tools + explicit override
      expect(toolIds).toContain('reference_file')
      expect(toolIds).toContain('search')
      expect(toolIds).toContain('skill_activate')
      expect(toolIds).toContain('diff_write')
      expect(selection.explicitOverrides).toContain('diff_write')
    })

    it('should not duplicate tools already in the profile', async () => {
      const classifier = createMockClassifier(createClassifyResult('chat'))
      manager = new ToolScopeManager(classifier, mockLogger as never)
      registerBuiltInTools(manager)

      const selection = await manager.select(createMockRequest('hello', ['search']))

      // search is already in chat profile, should not be duplicated
      const searchCount = selection.tools.filter(t => t.id === 'search').length
      expect(searchCount).toBe(1)
      expect(selection.explicitOverrides).not.toContain('search')
    })
  })

  describe('select() — fallback and edge cases', () => {
    // Test 5: unknown intent → chat profile
    it('should fallback to chat profile for unknown intent', async () => {
      const unknownResult: ClassifyResult = {
        intent: 'unknown_thing' as HarnessIntent,
        confidence: 0.5,
        source: 'fallback',
        elapsedMs: 1,
      }
      const classifier = createMockClassifier(unknownResult)
      manager = new ToolScopeManager(classifier, mockLogger as never)
      registerBuiltInTools(manager)

      const selection = await manager.select(createMockRequest('???'))

      expect(selection.profile.intent).toBe('chat')
    })

    // Test 6: tools exceeding maxTools → trimmed
    it('should trim tools to maxTools limit', async () => {
      const classifier = createMockClassifier(createClassifyResult('chat'))
      manager = new ToolScopeManager(classifier, mockLogger as never)
      registerBuiltInTools(manager)

      const selection = await manager.select(createMockRequest('hello'))

      const chatProfile = INTENT_PROFILES.find(p => p.intent === 'chat')!
      expect(selection.tools.length).toBeLessThanOrEqual(chatProfile.maxTools)
    })

    // Test 11: registry missing tool IDs referenced by profile
    it('should skip tool IDs not found in registry', async () => {
      const classifier = createMockClassifier(createClassifyResult('chat'))
      manager = new ToolScopeManager(classifier, mockLogger as never)
      // Only register one of the three chat tools
      manager.registerTool(createSimpleTool('reference_file'))

      const selection = await manager.select(createMockRequest('hello'))

      // Only reference_file was registered, others should be skipped
      expect(selection.tools.length).toBe(1)
      expect(selection.tools[0].id).toBe('reference_file')
    })
  })

  describe('getToolError()', () => {
    // Test 7: error message formatting
    it('should format error message with available tool names', () => {
      const classifier = createMockClassifier(createClassifyResult('chat'))
      manager = new ToolScopeManager(classifier, mockLogger as never)

      const tools = [
        createSimpleTool('reference_file', 'Reference File'),
        createSimpleTool('search', 'Full-text Search'),
      ]

      const errorMsg = manager.getToolError('diff_write', tools)

      expect(errorMsg).toContain('diff_write')
      expect(errorMsg).toContain('tool not available')
      expect(errorMsg).toContain('Reference File')
      expect(errorMsg).toContain('Full-text Search')
    })
  })

  describe('registerTool() / unregisterTool()', () => {
    // Test 8: register tool
    it('should register a new tool and retrieve it by ID', () => {
      const classifier = createMockClassifier(createClassifyResult('chat'))
      manager = new ToolScopeManager(classifier, mockLogger as never)

      const tool = createSimpleTool('custom_tool')
      manager.registerTool(tool)

      expect(manager.getToolById('custom_tool')).toBe(tool)
      expect(manager.getRegisteredTools()).toContain(tool)
    })

    // Test 9: unregister tool
    it('should unregister a tool and return true', () => {
      const classifier = createMockClassifier(createClassifyResult('chat'))
      manager = new ToolScopeManager(classifier, mockLogger as never)

      const tool = createSimpleTool('temp_tool')
      manager.registerTool(tool)

      const result = manager.unregisterTool('temp_tool')

      expect(result).toBe(true)
      expect(manager.getToolById('temp_tool')).toBeUndefined()
    })

    it('should return false when unregistering non-existent tool', () => {
      const classifier = createMockClassifier(createClassifyResult('chat'))
      manager = new ToolScopeManager(classifier, mockLogger as never)

      const result = manager.unregisterTool('nonexistent')

      expect(result).toBe(false)
    })

    // Test 10: duplicate registration warns and overwrites
    it('should warn on duplicate registration and overwrite', () => {
      const classifier = createMockClassifier(createClassifyResult('chat'))
      manager = new ToolScopeManager(classifier, mockLogger as never)

      const tool1 = createSimpleTool('dup_tool', 'Tool v1')
      const tool2 = createSimpleTool('dup_tool', 'Tool v2')

      manager.registerTool(tool1)
      manager.registerTool(tool2)

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'tool-scope.register.duplicate',
        expect.objectContaining({ id: 'dup_tool' })
      )
      expect(manager.getToolById('dup_tool')?.name).toBe('Tool v2')
    })
  })

  describe('getRegisteredTools()', () => {
    it('should return all registered tools', () => {
      const classifier = createMockClassifier(createClassifyResult('chat'))
      manager = new ToolScopeManager(classifier, mockLogger as never)

      registerBuiltInTools(manager)

      const tools = manager.getRegisteredTools()
      expect(tools.length).toBe(8)

      const toolIds = tools.map(t => t.id)
      expect(toolIds).toContain('reference_file')
      expect(toolIds).toContain('diff_write')
      expect(toolIds).toContain('search')
      expect(toolIds).toContain('skill_activate')
      expect(toolIds).toContain('spec_lookup')
      expect(toolIds).toContain('memory_query')
      expect(toolIds).toContain('task_create')
      expect(toolIds).toContain('graph_traverse')
    })
  })

  describe('INTENT_PROFILES constant', () => {
    it('should define 5 profiles', () => {
      expect(INTENT_PROFILES.length).toBe(5)
    })

    it('should have unique intent values', () => {
      const intents = INTENT_PROFILES.map(p => p.intent)
      expect(new Set(intents).size).toBe(5)
    })
  })

  describe('TOOL_NOT_AVAILABLE_MESSAGE constant', () => {
    it('should contain placeholder for available tools', () => {
      expect(TOOL_NOT_AVAILABLE_MESSAGE).toContain('{availableTools}')
    })
  })
})
