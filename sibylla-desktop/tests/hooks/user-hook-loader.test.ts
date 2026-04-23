import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UserHookLoader } from '../../src/main/services/hooks/user-hook-loader'
import type { AiGatewayClient } from '../../src/main/services/ai-gateway-client'

function createMockGateway(): AiGatewayClient {
  return {
    chat: vi.fn(async () => ({
      id: 'mock-response',
      model: 'claude-3-haiku-20240307',
      provider: 'mock',
      content: '{"decision":"allow"}',
      finishReason: 'stop',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.0001 },
      intercepted: false,
      warnings: [],
    })),
  } as unknown as AiGatewayClient
}

describe('UserHookLoader', () => {
  let loader: UserHookLoader
  let gateway: ReturnType<typeof createMockGateway>

  beforeEach(() => {
    gateway = createMockGateway()
    loader = new UserHookLoader(gateway)
  })

  it('should return empty array when directory does not exist', async () => {
    const hooks = await loader.loadFromDir('/nonexistent/path')
    expect(hooks).toHaveLength(0)
  })

  it('should parse markdown hook files with frontmatter', async () => {
    const { promises: fs } = await import('fs')
    const tmpDir = `/tmp/test-hooks-${Date.now()}`
    await fs.mkdir(tmpDir, { recursive: true })

    await fs.writeFile(`${tmpDir}/test-hook.md`, [
      '---',
      'id: my-hook',
      'version: 1.0.0',
      'name: Test Hook',
      'nodes: ["PostToolUse"]',
      'priority: 500',
      '---',
      '',
      '# Test Rule',
      'Check something after tool use.',
    ].join('\n'))

    const hooks = await loader.loadFromDir(tmpDir)
    expect(hooks).toHaveLength(1)
    expect(hooks[0].metadata.id).toBe('my-hook')
    expect(hooks[0].metadata.name).toBe('Test Hook')
    expect(hooks[0].metadata.nodes).toEqual(['PostToolUse'])
    expect(hooks[0].metadata.priority).toBe(500)
    expect(hooks[0].metadata.source).toBe('user')

    await fs.rm(tmpDir, { recursive: true })
  })

  it('should skip files with missing required fields', async () => {
    const { promises: fs } = await import('fs')
    const tmpDir = `/tmp/test-hooks-invalid-${Date.now()}`
    await fs.mkdir(tmpDir, { recursive: true })

    await fs.writeFile(`${tmpDir}/invalid.md`, [
      '---',
      'id: incomplete-hook',
      '---',
      '',
      'Missing required fields.',
    ].join('\n'))

    const hooks = await loader.loadFromDir(tmpDir)
    expect(hooks).toHaveLength(0)

    await fs.rm(tmpDir, { recursive: true })
  })

  it('should downgrade block to warn for user hooks', async () => {
    const { promises: fs } = await import('fs')
    const tmpDir = `/tmp/test-hooks-block-${Date.now()}`
    await fs.mkdir(tmpDir, { recursive: true })

    await fs.writeFile(`${tmpDir}/block-hook.md`, [
      '---',
      'id: block-hook',
      'version: 1.0.0',
      'name: Block Hook',
      'nodes: ["PreToolUse"]',
      'priority: 500',
      '---',
      '',
      'Block everything.',
    ].join('\n'))

    const blockGateway = {
      chat: vi.fn(async () => ({
        id: 'mock',
        model: 'claude-3-haiku-20240307',
        provider: 'mock',
        content: '{"decision":"block","message":"blocked!"}',
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0 },
        intercepted: false,
        warnings: [],
      })),
    } as unknown as AiGatewayClient

    const blockLoader = new UserHookLoader(blockGateway)
    const hooks = await blockLoader.loadFromDir(tmpDir)
    expect(hooks).toHaveLength(1)

    const result = await hooks[0].execute({
      node: 'PreToolUse',
      trigger: { tool: { name: 'test', input: {} } },
      conversationId: 'conv-1',
      workspacePath: '/workspace',
    })

    expect(result.decision).toBe('warn')
    expect(result.message).toContain('用户 Hook 无权 block')

    await fs.rm(tmpDir, { recursive: true })
  })

  it('should skip non-markdown files', async () => {
    const { promises: fs } = await import('fs')
    const tmpDir = `/tmp/test-hooks-nonmd-${Date.now()}`
    await fs.mkdir(tmpDir, { recursive: true })

    await fs.writeFile(`${tmpDir}/not-a-hook.json`, '{"id": "json-hook"}')
    await fs.writeFile(`${tmpDir}/valid.md`, [
      '---',
      'id: valid-hook',
      'version: 1.0.0',
      'name: Valid Hook',
      'nodes: ["PostToolUse"]',
      'priority: 500',
      '---',
      'Valid content.',
    ].join('\n'))

    const hooks = await loader.loadFromDir(tmpDir)
    expect(hooks).toHaveLength(1)
    expect(hooks[0].metadata.id).toBe('valid-hook')

    await fs.rm(tmpDir, { recursive: true })
  })
})
