import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { SubAgentRegistry } from '../../../../src/main/services/sub-agent/SubAgentRegistry'

vi.mock('fs', () => ({
  promises: {
    readdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    access: vi.fn(),
  },
}))

const VALID_AGENT_MD = `---
id: pr-reviewer
version: 1.0.0
name: PR 审查员
description: 专门审查 Pull Request 的子智能体
allowed_tools:
  - read-file
  - search
  - list-files
context:
  inherit_memory: false
  inherit_trace: true
  inherit_workspace_boundary: true
max_turns: 15
max_tokens: 50000
---

# PR 审查员

你是一位专业、严格、友善的代码审查员。
`

const MISSING_FIELD_AGENT_MD = `---
id: bad-agent
version: 1.0.0
name: Bad Agent
---

Missing required fields.
`

describe('SubAgentRegistry', () => {
  let registry: SubAgentRegistry
  const builtinDir = '/builtin/agents'
  const workspaceDir = '/workspace/.sibylla/agents'

  beforeEach(() => {
    vi.clearAllMocks()
    registry = new SubAgentRegistry(builtinDir, workspaceDir)
  })

  it('initialize loads all built-in sub-agents', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValueOnce(['pr-reviewer.md', 'doc-summarizer.md'] as unknown as string[])
    vi.mocked(fs.promises.readFile)
      .mockResolvedValueOnce(VALID_AGENT_MD)
      .mockResolvedValueOnce(VALID_AGENT_MD.replace('pr-reviewer', 'doc-summarizer').replace('PR 审查员', '文档摘要员'))
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('not found'))

    await registry.initialize()

    const all = registry.getAll()
    expect(all).toHaveLength(2)
  })

  it('workspace definition overrides builtin with same id', async () => {
    vi.mocked(fs.promises.readdir)
      .mockResolvedValueOnce(['pr-reviewer.md'] as unknown as string[])
      .mockResolvedValueOnce(['pr-reviewer.md'] as unknown as string[])

    const builtinMd = VALID_AGENT_MD
    const workspaceMd = VALID_AGENT_MD.replace('专门审查 Pull Request 的子智能体', '用户自定义审查员')

    vi.mocked(fs.promises.readFile)
      .mockResolvedValueOnce(builtinMd)
      .mockResolvedValueOnce(workspaceMd)
    vi.mocked(fs.promises.access).mockResolvedValue(undefined)

    await registry.initialize()

    const agent = registry.get('pr-reviewer')
    expect(agent).toBeDefined()
    expect(agent!.description).toBe('用户自定义审查员')
    expect(agent!.builtin).toBe(false)
  })

  it('get(id) returns correct SubAgentDefinition', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValueOnce(['pr-reviewer.md'] as unknown as string[])
    vi.mocked(fs.promises.readFile).mockResolvedValue(VALID_AGENT_MD)
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('not found'))

    await registry.initialize()

    const agent = registry.get('pr-reviewer')
    expect(agent).toBeDefined()
    expect(agent!.id).toBe('pr-reviewer')
    expect(agent!.version).toBe('1.0.0')
    expect(agent!.maxTurns).toBe(15)
    expect(agent!.maxTokens).toBe(50000)
    expect(agent!.allowedTools).toEqual(['read-file', 'search', 'list-files'])
  })

  it('get(id) returns undefined for non-existent agent', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValueOnce([])
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('not found'))

    await registry.initialize()

    expect(registry.get('non-existent')).toBeUndefined()
  })

  it('getAll() returns complete metadata with source tag', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValueOnce(['pr-reviewer.md'] as unknown as string[])
    vi.mocked(fs.promises.readFile).mockResolvedValue(VALID_AGENT_MD)
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('not found'))

    await registry.initialize()

    const all = registry.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]!.source).toBe('builtin')
    expect(all[0]!.hasOutputSchema).toBe(false)
  })

  it('loadAgentPrompt returns prompt text without frontmatter', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValueOnce(['pr-reviewer.md'] as unknown as string[])
    vi.mocked(fs.promises.readFile).mockResolvedValue(VALID_AGENT_MD)
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('not found'))

    await registry.initialize()

    const prompt = await registry.loadAgentPrompt('pr-reviewer')
    expect(prompt).not.toContain('---')
    expect(prompt).toContain('PR 审查员')
    expect(prompt).toContain('代码审查员')
  })

  it('loadAgentPrompt throws for non-existent id', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValueOnce([])
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('not found'))

    await registry.initialize()

    await expect(registry.loadAgentPrompt('non-existent')).rejects.toThrow('Sub-agent not found')
  })

  it('createFromTemplate creates file and registers agent', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValueOnce([])
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('not found'))
    vi.mocked(fs.promises.mkdir).mockResolvedValue(undefined)
    vi.mocked(fs.promises.writeFile).mockResolvedValue(undefined)

    await registry.initialize()

    const result = await registry.createFromTemplate({
      id: 'custom-agent',
      name: 'Custom Agent',
      description: 'A custom agent',
      allowedTools: ['read-file'],
      task: 'Do something useful',
    })

    expect(result.agentId).toBe('custom-agent')
    expect(fs.promises.writeFile).toHaveBeenCalled()
  })

  it('malformed agent file is skipped with warning', async () => {
    vi.mocked(fs.promises.readdir).mockResolvedValueOnce(['bad-agent.md'] as unknown as string[])
    vi.mocked(fs.promises.readFile).mockResolvedValue(MISSING_FIELD_AGENT_MD)
    vi.mocked(fs.promises.access).mockRejectedValue(new Error('not found'))

    await registry.initialize()

    expect(registry.get('bad-agent')).toBeUndefined()
    expect(registry.getAll()).toHaveLength(0)
  })
})
