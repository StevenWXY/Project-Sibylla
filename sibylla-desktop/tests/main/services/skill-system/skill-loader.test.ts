import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillLoader } from '../../../../src/main/services/skill-system/SkillLoader'
import type { SkillSource } from '../../../../src/main/services/skill-system/types'

function createMockFileManager() {
  return {
    readFile: vi.fn(),
    listFiles: vi.fn(),
    exists: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    delete: vi.fn(),
    stat: vi.fn(),
    copy: vi.fn(),
    move: vi.fn(),
  }
}

const V1_CONTENT = `# Skill: Test V1 Skill
## 描述
This is a v1 description.
## 适用场景
Scenario one.
## AI 行为指令
Do the thing.
## 输出格式
JSON output.
## 示例
Example text here.`

const V2_INDEX = `---
id: my-v2-skill
version: 2.0.0
name: My V2 Skill
description: A v2 skill for testing
author: tester
category: test
tags: [ai, test]
scope: public
triggers:
  - slash: /test
---
# My V2 Skill`

const V2_PROMPT = `You are a helpful assistant.`

const TOOLS_YAML = `allowed_tools:
  - tool_a
  - tool_b
required_context:
  - context_x
budget:
  max_tokens: 4096
  max_tool_calls: 10`

const EXAMPLE_A = `## Example A
User asked something.
Bot responded.`

const EXAMPLE_B = `## Example B
Another example.`

describe('SkillLoader', () => {
  let fileManager: ReturnType<typeof createMockFileManager>
  let tokenEstimator: ReturnType<typeof vi.fn>
  let loader: SkillLoader

  beforeEach(() => {
    fileManager = createMockFileManager()
    tokenEstimator = vi.fn((text: string) => text.length)
    loader = new SkillLoader(fileManager as never, tokenEstimator)
  })

  describe('loadV1', () => {
    it('should parse v1 flat .md with ## sections', async () => {
      fileManager.readFile.mockResolvedValue({ content: V1_CONTENT })

      const skill = await loader.loadV1('skills/test-v1.md')

      expect(skill.id).toBe('test-v1')
      expect(skill.name).toBe('Test V1 Skill')
      expect(skill.description).toBe('This is a v1 description.')
      expect(skill.scenarios).toBe('Scenario one.')
      expect(skill.instructions).toBe('Do the thing.')
      expect(skill.outputFormat).toBe('JSON output.')
      expect(skill.examples).toBe('Example text here.')
      expect(skill.formatVersion).toBe(1)
      expect(skill.version).toBe('1.0.0')
      expect(skill.filePath).toBe('skills/test-v1.md')
      expect(tokenEstimator).toHaveBeenCalled()
    })

    it('should infer source as builtin for resources/skills path', async () => {
      fileManager.readFile.mockResolvedValue({ content: V1_CONTENT })

      const skill = await loader.loadV1('/app/resources/skills/foo.md')

      expect(skill.source).toBe('builtin')
    })

    it('should infer source as personal for personal/ path', async () => {
      fileManager.readFile.mockResolvedValue({ content: V1_CONTENT })

      const skill = await loader.loadV1('/users/me/personal/my-skill.md')

      expect(skill.source).toBe('personal')
    })

    it('should infer source as workspace for other paths', async () => {
      fileManager.readFile.mockResolvedValue({ content: V1_CONTENT })

      const skill = await loader.loadV1('/workspace/skills/my-skill.md')

      expect(skill.source).toBe('workspace')
    })

    it('should skip unrecognized ## sections', async () => {
      const content = `# Skill: SkipTest
## 描述
desc
## Unknown Section
should be ignored
## AI 行为指令
instructions here`

      fileManager.readFile.mockResolvedValue({ content })

      const skill = await loader.loadV1('skills/skip-test.md')

      expect(skill.description).toBe('desc')
      expect(skill.instructions).toBe('instructions here')
    })

    it('should use file path as id when no # heading found', async () => {
      fileManager.readFile.mockResolvedValue({ content: 'no heading content' })

      const skill = await loader.loadV1('skills/no-heading.md')

      expect(skill.id).toBe('no-heading')
      expect(skill.name).toBe('no-heading')
    })
  })

  describe('loadV2', () => {
    it('should load v2 directory with _index.md, prompt.md, tools.yaml, and examples', async () => {
      fileManager.readFile.mockImplementation((path: string) => {
        if (path.endsWith('_index.md')) return { content: V2_INDEX }
        if (path.endsWith('prompt.md')) return { content: V2_PROMPT }
        if (path.endsWith('tools.yaml')) return { content: TOOLS_YAML }
        if (path.endsWith('examples/example-a.md')) return { content: EXAMPLE_A }
        if (path.endsWith('examples/example-b.md')) return { content: EXAMPLE_B }
        throw new Error(`Unexpected read: ${path}`)
      })
      fileManager.listFiles.mockImplementation((path: string) => {
        if (path.endsWith('examples')) {
          return [
            { path: 'skills/my-v2-skill/examples/example-a.md', isDirectory: false },
            { path: 'skills/my-v2-skill/examples/example-b.md', isDirectory: false },
          ]
        }
        return []
      })

      const skill = await loader.loadV2('skills/my-v2-skill', 'workspace' as SkillSource)

      expect(skill.id).toBe('my-v2-skill')
      expect(skill.name).toBe('My V2 Skill')
      expect(skill.description).toBe('A v2 skill for testing')
      expect(skill.instructions).toBe(V2_PROMPT)
      expect(skill.formatVersion).toBe(2)
      expect(skill.version).toBe('2.0.0')
      expect(skill.author).toBe('tester')
      expect(skill.category).toBe('test')
      expect(skill.tags).toEqual(['ai', 'test'])
      expect(skill.scope).toBe('public')
      expect(skill.source).toBe('workspace')
      expect(skill.allowedTools).toEqual(['tool_a', 'tool_b'])
      expect(skill.examplesDir).toBe('skills/my-v2-skill/examples')
      expect(skill.examples).toContain('Example A')
      expect(skill.examples).toContain('Example B')
      expect(tokenEstimator).toHaveBeenCalled()
    })

    it('should throw when _index.md has missing required fields', async () => {
      const badIndex = `---
id: missing-fields-skill
---
# Bad Skill`
      fileManager.readFile.mockImplementation((path: string) => {
        if (path.endsWith('_index.md')) return { content: badIndex }
        if (path.endsWith('prompt.md')) return { content: '' }
        throw new Error(`Unexpected read: ${path}`)
      })
      fileManager.listFiles.mockImplementation(() => [])

      await expect(
        loader.loadV2('skills/bad-skill', 'workspace' as SkillSource),
      ).rejects.toThrow(/Missing required field/)
    })

    it('should set allowedTools undefined when tools.yaml does not exist', async () => {
      fileManager.readFile.mockImplementation((path: string) => {
        if (path.endsWith('_index.md')) return { content: V2_INDEX }
        if (path.endsWith('prompt.md')) return { content: V2_PROMPT }
        if (path.endsWith('tools.yaml')) throw new Error('not found')
        throw new Error(`Unexpected read: ${path}`)
      })
      fileManager.listFiles.mockImplementation(() => [])

      const skill = await loader.loadV2('skills/no-tools', 'workspace' as SkillSource)

      expect(skill.allowedTools).toBeUndefined()
    })

    it('should not error when examples directory does not exist', async () => {
      fileManager.readFile.mockImplementation((path: string) => {
        if (path.endsWith('_index.md')) return { content: V2_INDEX }
        if (path.endsWith('prompt.md')) return { content: V2_PROMPT }
        if (path.endsWith('tools.yaml')) throw new Error('not found')
        throw new Error(`Unexpected read: ${path}`)
      })
      fileManager.listFiles.mockImplementation((path: string) => {
        if (path.endsWith('examples')) throw new Error('dir not found')
        return []
      })

      const skill = await loader.loadV2('skills/no-examples', 'workspace' as SkillSource)

      expect(skill.examples).toBe('')
      expect(skill.examplesDir).toBeUndefined()
    })

    it('should not error when examples directory is empty', async () => {
      fileManager.readFile.mockImplementation((path: string) => {
        if (path.endsWith('_index.md')) return { content: V2_INDEX }
        if (path.endsWith('prompt.md')) return { content: V2_PROMPT }
        if (path.endsWith('tools.yaml')) throw new Error('not found')
        throw new Error(`Unexpected read: ${path}`)
      })
      fileManager.listFiles.mockImplementation((path: string) => {
        if (path.endsWith('examples')) return []
        return []
      })

      const skill = await loader.loadV2('skills/empty-examples', 'workspace' as SkillSource)

      expect(skill.examples).toBe('')
      expect(skill.examplesDir).toBeUndefined()
    })

    it('should use empty instructions when prompt.md is missing', async () => {
      fileManager.readFile.mockImplementation((path: string) => {
        if (path.endsWith('_index.md')) return { content: V2_INDEX }
        if (path.endsWith('prompt.md')) throw new Error('not found')
        if (path.endsWith('tools.yaml')) throw new Error('not found')
        throw new Error(`Unexpected read: ${path}`)
      })
      fileManager.listFiles.mockImplementation(() => [])

      const skill = await loader.loadV2('skills/no-prompt', 'workspace' as SkillSource)

      expect(skill.instructions).toBe('')
    })

    it('should use defaults for optional frontmatter fields', async () => {
      const minimalIndex = `---
id: minimal
version: 1.0.0
name: Minimal
description: minimal skill
---`
      fileManager.readFile.mockImplementation((path: string) => {
        if (path.endsWith('_index.md')) return { content: minimalIndex }
        if (path.endsWith('prompt.md')) return { content: 'prompt' }
        if (path.endsWith('tools.yaml')) throw new Error('not found')
        throw new Error(`Unexpected read: ${path}`)
      })
      fileManager.listFiles.mockImplementation(() => [])

      const skill = await loader.loadV2('skills/minimal', 'workspace' as SkillSource)

      expect(skill.author).toBe('')
      expect(skill.category).toBe('general')
      expect(skill.tags).toEqual([])
      expect(skill.scope).toBe('public')
      expect(skill.triggers).toEqual([])
    })

    it('should throw when _index.md has no frontmatter', async () => {
      fileManager.readFile.mockImplementation((path: string) => {
        if (path.endsWith('_index.md')) return { content: 'No frontmatter here' }
        throw new Error(`Unexpected read: ${path}`)
      })

      await expect(
        loader.loadV2('skills/no-fm', 'workspace' as SkillSource),
      ).rejects.toThrow('Missing YAML frontmatter in _index.md')
    })
  })

  describe('loadFromDir', () => {
    it('should scan directory and load both v1 .md files and v2 directories', async () => {
      fileManager.listFiles.mockImplementation((path: string) => {
        if (path === 'skills') {
          return [
            { path: 'skills/v1-skill.md', isDirectory: false },
            { path: 'skills/my-v2-skill', isDirectory: true },
            { path: 'skills/ignored.txt', isDirectory: false },
          ]
        }
        if (path.endsWith('examples')) return []
        return []
      })
      fileManager.exists.mockImplementation((path: string) => {
        if (path.endsWith('my-v2-skill/_index.md')) return true
        return false
      })
      fileManager.readFile.mockImplementation((path: string) => {
        if (path === 'skills/v1-skill.md') return { content: V1_CONTENT }
        if (path.endsWith('_index.md')) return { content: V2_INDEX }
        if (path.endsWith('prompt.md')) return { content: V2_PROMPT }
        if (path.endsWith('tools.yaml')) throw new Error('not found')
        throw new Error(`Unexpected read: ${path}`)
      })

      const skills = await loader.loadFromDir('skills', 'workspace' as SkillSource)

      expect(skills).toHaveLength(2)
      const v1 = skills.find((s) => s.formatVersion === 1)
      const v2 = skills.find((s) => s.formatVersion === 2)
      expect(v1).toBeDefined()
      expect(v1!.id).toBe('v1-skill')
      expect(v2).toBeDefined()
      expect(v2!.id).toBe('my-v2-skill')
    })

    it('should skip directories that are not v2 format', async () => {
      fileManager.listFiles.mockResolvedValue([
        { path: 'skills/not-skill-dir', isDirectory: true },
      ])
      fileManager.exists.mockResolvedValue(false)

      const skills = await loader.loadFromDir('skills', 'workspace' as SkillSource)

      expect(skills).toHaveLength(0)
    })

    it('should skip _index.md files as v1 entries', async () => {
      fileManager.listFiles.mockResolvedValue([
        { path: 'skills/_index.md', isDirectory: false },
      ])

      const skills = await loader.loadFromDir('skills', 'workspace' as SkillSource)

      expect(skills).toHaveLength(0)
    })

    it('should return empty array when directory cannot be listed', async () => {
      fileManager.listFiles.mockRejectedValue(new Error('dir not found'))

      const skills = await loader.loadFromDir('nonexistent', 'workspace' as SkillSource)

      expect(skills).toHaveLength(0)
    })

    it('should continue loading other skills when one fails', async () => {
      fileManager.listFiles.mockResolvedValue([
        { path: 'skills/bad.md', isDirectory: false },
        { path: 'skills/good.md', isDirectory: false },
      ])
      fileManager.readFile.mockImplementation((path: string) => {
        if (path === 'skills/bad.md') throw new Error('read error')
        if (path === 'skills/good.md') return { content: V1_CONTENT }
        throw new Error(`Unexpected read: ${path}`)
      })

      const skills = await loader.loadFromDir('skills', 'workspace' as SkillSource)

      expect(skills).toHaveLength(1)
      expect(skills[0].id).toBe('good')
    })
  })

  describe('isV2Directory', () => {
    it('should return true when _index.md exists', async () => {
      fileManager.exists.mockResolvedValue(true)

      const result = await loader.isV2Directory('skills/my-skill')

      expect(result).toBe(true)
      expect(fileManager.exists).toHaveBeenCalledWith('skills/my-skill/_index.md')
    })

    it('should return false when _index.md does not exist', async () => {
      fileManager.exists.mockResolvedValue(false)

      const result = await loader.isV2Directory('skills/my-skill')

      expect(result).toBe(false)
    })

    it('should return false when exists throws', async () => {
      fileManager.exists.mockRejectedValue(new Error('error'))

      const result = await loader.isV2Directory('skills/my-skill')

      expect(result).toBe(false)
    })
  })
})
