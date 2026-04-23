import { describe, it, expect, vi } from 'vitest'
import { SkillExecutor } from '../../../../src/main/services/skill-system/SkillExecutor'
import type { SkillV2, SkillExecutionPlan, SkillResult } from '../../../../src/shared/types'
import type { FileManager } from '../../../../src/main/services/file-manager'
import type { Tracer } from '../../../../src/main/services/trace/tracer'
import type { Span } from '../../../../src/main/services/trace/types'

function makeV2Skill(overrides: Partial<SkillV2> = {}): SkillV2 {
  return {
    id: 'test-skill',
    name: 'Test Skill',
    description: 'A test skill',
    scenarios: 'testing',
    instructions: 'Default instructions',
    outputFormat: 'text',
    examples: 'Default examples',
    filePath: '/skills/test-skill',
    tokenCount: 100,
    updatedAt: Date.now(),
    version: '1.0.0',
    author: 'test',
    category: 'test',
    tags: [],
    scope: 'public',
    source: 'builtin',
    triggers: [],
    formatVersion: 2,
    ...overrides,
  }
}

function makeV1Skill(overrides: Partial<SkillV2> = {}): SkillV2 {
  return makeV2Skill({
    formatVersion: 1,
    instructions: 'V1 inline instructions',
    examples: 'V1 inline examples',
    ...overrides,
  })
}

function mockFileManager(setup: {
  promptContent?: string
  exampleFiles?: Array<{ name: string; path: string; content: string }>
  toolsYamlContent?: string
  readFileError?: boolean
  listFilesError?: boolean
}): FileManager {
  const readMap = new Map<string, string>()
  if (setup.promptContent !== undefined) {
    readMap.set('/skills/test-skill/prompt.md', setup.promptContent)
  }
  if (setup.toolsYamlContent !== undefined) {
    readMap.set('/skills/test-skill/tools.yaml', setup.toolsYamlContent)
  }
  if (setup.exampleFiles) {
    for (const f of setup.exampleFiles) {
      readMap.set(f.path, f.content)
    }
  }

  return {
    readFile: vi.fn().mockImplementation((path: string) => {
      if (setup.readFileError) throw new Error('read error')
      const content = readMap.get(path)
      if (content !== undefined) {
        return Promise.resolve({ path, content, encoding: 'utf-8', size: content.length })
      }
      return Promise.reject(new Error(`File not found: ${path}`))
    }),
    listFiles: vi.fn().mockImplementation((_path: string) => {
      if (setup.listFilesError) throw new Error('list error')
      if (setup.exampleFiles) {
        return Promise.resolve(
          setup.exampleFiles.map((f) => ({
            name: f.name,
            path: f.path,
            isDirectory: false,
            size: f.content.length,
            modifiedTime: Date.now(),
            createdTime: Date.now(),
            extension: '.md',
          })),
        )
      }
      return Promise.resolve([])
    }),
  } as unknown as FileManager
}

function mockTracer(): { tracer: Tracer; span: Span } {
  const span: Span = {
    context: { traceId: 't1', spanId: 's1' },
    name: 'test-span',
    kind: 'internal',
    setAttribute: vi.fn(),
    setAttributes: vi.fn(),
    addEvent: vi.fn(),
    end: vi.fn(),
    isFinalized: vi.fn().mockReturnValue(false),
  }

  const tracer = {
    startSpan: vi.fn().mockReturnValue(span),
  } as unknown as Tracer

  return { tracer, span }
}

function simpleTokenEstimator(text: string): number {
  return Math.ceil(text.length / 4)
}

describe('SkillExecutor', () => {
  describe('execute - returns SkillExecutionPlan with correct additionalPromptParts', () => {
    it('includes prompt and examples in additionalPromptParts', async () => {
      const fm = mockFileManager({
        promptContent: 'You are a helpful coding assistant.',
        exampleFiles: [
          { name: 'ex1.md', path: '/skills/test-skill/examples/ex1.md', content: 'Example 1 content' },
          { name: 'ex2.md', path: '/skills/test-skill/examples/ex2.md', content: 'Example 2 content' },
        ],
      })

      const executor = new SkillExecutor(fm, simpleTokenEstimator)
      const skill = makeV2Skill({ estimatedTokens: 500 })
      const plan = await executor.execute({
        skill,
        userInput: 'test input',
        parentTraceId: 'trace-123',
      })

      expect(plan.additionalPromptParts).toHaveLength(3)
      expect(plan.additionalPromptParts[0]).toBe('You are a helpful coding assistant.')
      expect(plan.additionalPromptParts[1]).toBe('Example 1 content')
      expect(plan.additionalPromptParts[2]).toBe('Example 2 content')
      expect(plan.skill).toBe(skill)
    })
  })

  describe('execute - tool filter correctly set from skill.allowedTools', () => {
    it('sets toolFilter from allowedTools', async () => {
      const fm = mockFileManager({ promptContent: 'prompt' })
      const executor = new SkillExecutor(fm, simpleTokenEstimator)
      const skill = makeV2Skill({
        allowedTools: ['read_file', 'write_file', 'search'],
      })

      const plan = await executor.execute({
        skill,
        userInput: 'test',
        parentTraceId: 'trace-1',
      })

      expect(plan.toolFilter).toEqual(['read_file', 'write_file', 'search'])
    })

    it('sets toolFilter to undefined when allowedTools is not set', async () => {
      const fm = mockFileManager({ promptContent: 'prompt' })
      const executor = new SkillExecutor(fm, simpleTokenEstimator)
      const skill = makeV2Skill()

      const plan = await executor.execute({
        skill,
        userInput: 'test',
        parentTraceId: 'trace-1',
      })

      expect(plan.toolFilter).toBeUndefined()
    })
  })

  describe('execute - example trimming when examples exceed budget', () => {
    it('trims examples to at most 3 when they exceed estimated_tokens * 0.5', async () => {
      const longExamples = Array.from({ length: 6 }, (_, i) => ({
        name: `ex${i}.md`,
        path: `/skills/test-skill/examples/ex${i}.md`,
        content: `Example ${i} content that is moderately long to consume token budget. `.repeat(10),
      }))

      const fm = mockFileManager({
        promptContent: 'Short prompt.',
        exampleFiles: longExamples,
      })

      const tokenEstimator = (text: string) => Math.ceil(text.length / 2)
      const executor = new SkillExecutor(fm, tokenEstimator)
      const skill = makeV2Skill({ estimatedTokens: 50 })

      const plan = await executor.execute({
        skill,
        userInput: 'test',
        parentTraceId: 'trace-1',
      })

      expect(plan.additionalPromptParts.length).toBeGreaterThanOrEqual(2)
      expect(plan.additionalPromptParts.length).toBeLessThanOrEqual(4)
    })

    it('keeps all examples when within budget', async () => {
      const fm = mockFileManager({
        promptContent: 'Prompt.',
        exampleFiles: [
          { name: 'ex1.md', path: '/skills/test-skill/examples/ex1.md', content: 'Short ex1' },
          { name: 'ex2.md', path: '/skills/test-skill/examples/ex2.md', content: 'Short ex2' },
        ],
      })

      const executor = new SkillExecutor(fm, simpleTokenEstimator)
      const skill = makeV2Skill({ estimatedTokens: 1000 })

      const plan = await executor.execute({
        skill,
        userInput: 'test',
        parentTraceId: 'trace-1',
      })

      expect(plan.additionalPromptParts).toHaveLength(3)
    })
  })

  describe('v1 skills use skill.instructions + skill.examples as fallback', () => {
    it('uses instructions and examples fields for v1 format skills', async () => {
      const fm = mockFileManager({})
      const executor = new SkillExecutor(fm, simpleTokenEstimator)
      const skill = makeV1Skill({
        instructions: 'V1 specific instructions text.',
        examples: 'V1 specific example content.',
      })

      const plan = await executor.execute({
        skill,
        userInput: 'test',
        parentTraceId: 'trace-1',
      })

      expect(plan.additionalPromptParts[0]).toBe('V1 specific instructions text.')
      expect(plan.additionalPromptParts[1]).toBe('V1 specific example content.')
    })

    it('v1 skill does not call fileManager for prompt.md', async () => {
      const fm = mockFileManager({})
      const executor = new SkillExecutor(fm, simpleTokenEstimator)
      const skill = makeV1Skill()

      await executor.execute({
        skill,
        userInput: 'test',
        parentTraceId: 'trace-1',
      })

      expect(fm.readFile).not.toHaveBeenCalled()
    })
  })

  describe('trace span is created during execute', () => {
    it('creates a span via tracer.startSpan during execute', async () => {
      const fm = mockFileManager({ promptContent: 'prompt' })
      const { tracer, span } = mockTracer()
      const executor = new SkillExecutor(fm, simpleTokenEstimator, tracer)
      const skill = makeV2Skill()

      await executor.execute({
        skill,
        userInput: 'test',
        parentTraceId: 'trace-1',
      })

      expect(tracer.startSpan).toHaveBeenCalledWith('skill.invocation', {
        attributes: {
          'skill.id': skill.id,
          'skill.version': skill.version,
          'skill.formatVersion': skill.formatVersion,
          'skill.source': skill.source,
        },
        kind: 'internal',
      })
      expect(span.setAttributes).toHaveBeenCalledWith({ 'skill.success': true })
      expect(span.end).toHaveBeenCalled()
    })

    it('creates a span via tracer.startSpan during recordResult', () => {
      const fm = mockFileManager({})
      const { tracer, span } = mockTracer()
      const executor = new SkillExecutor(fm, simpleTokenEstimator, tracer)

      const result: SkillResult = {
        success: true,
        tokensUsed: 150,
        toolCallsCount: 3,
        errors: [],
      }

      executor.recordResult('skill-abc', result)

      expect(tracer.startSpan).toHaveBeenCalledWith('skill.result', {
        attributes: {
          'skill.id': 'skill-abc',
          'skill.result.success': true,
          'skill.result.tokensUsed': 150,
          'skill.result.toolCallsCount': 3,
        },
        kind: 'internal',
      })
      expect(span.end).toHaveBeenCalled()
    })
  })

  describe('loadSkillResources', () => {
    it('loads prompt, examples, and tools.yaml for v2 skills', async () => {
      const fm = mockFileManager({
        promptContent: '# Skill Prompt\nDo the thing.',
        exampleFiles: [
          { name: 'basic.md', path: '/skills/test-skill/examples/basic.md', content: 'Example A' },
        ],
        toolsYamlContent: 'budget:\n  max_tokens: 1000\n  max_tool_calls: 5\n',
      })

      const executor = new SkillExecutor(fm, simpleTokenEstimator)
      const skill = makeV2Skill()
      const resources = await executor.loadSkillResources(skill)

      expect(resources.prompt).toBe('# Skill Prompt\nDo the thing.')
      expect(resources.examples).toEqual(['Example A'])
      expect(resources.toolsConfig).not.toBeNull()
      expect(resources.totalTokens).toBeGreaterThan(0)
    })

    it('falls back to skill.examples when no example files found', async () => {
      const fm = mockFileManager({ promptContent: 'prompt' })
      const executor = new SkillExecutor(fm, simpleTokenEstimator)
      const skill = makeV2Skill({ examples: 'Fallback example text' })

      const resources = await executor.loadSkillResources(skill)

      expect(resources.examples).toEqual(['Fallback example text'])
    })
  })

  describe('budget is set from toolsConfig', () => {
    it('sets budget to undefined when tools.yaml has no parseable budget', async () => {
      const fm = mockFileManager({
        promptContent: 'prompt',
        toolsYamlContent: 'allowed_tools:\n  - tool_a\n',
      })

      const executor = new SkillExecutor(fm, simpleTokenEstimator)
      const skill = makeV2Skill()

      const plan = await executor.execute({
        skill,
        userInput: 'test',
        parentTraceId: 'trace-1',
      })

      expect(plan.budget).toBeUndefined()
    })
  })
})
