import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SkillEngine } from '../../src/main/services/skill-engine'
import type { FileManager } from '../../src/main/services/file-manager'
import type { FileContent } from '../../src/shared/types'

function createMockFileManager(files: Map<string, string>): FileManager {
  return {
    getWorkspaceRoot: vi.fn().mockReturnValue('/test/workspace'),
    readFile: vi.fn(async (relativePath: string): Promise<FileContent> => {
      const content = files.get(relativePath)
      if (content === undefined) {
        throw new Error(`File not found: ${relativePath}`)
      }
      return { path: relativePath, content, encoding: 'utf-8', size: content.length }
    }),
    listFiles: vi.fn(async () => {
      return Array.from(files.entries()).map(([filePath, content]) => ({
        name: filePath.split('/').pop() ?? filePath,
        path: filePath,
        isDirectory: false,
        size: content.length,
        modifiedTime: new Date().toISOString(),
        createdTime: new Date().toISOString(),
        extension: filePath.split('.').pop(),
      }))
    }),
  } as unknown as FileManager
}

const SKILL_PRD_CONTENT = `# Skill: 撰写 PRD

## 描述
按照产品需求文档标准模板撰写高质量的 PRD。

## 适用场景
产品需求文档撰写、功能规格定义

## AI 行为指令
你是一位经验丰富的产品经理。在撰写 PRD 时，你应该：
1. 明确定义问题背景和目标
2. 描述用户故事和使用场景

## 输出格式
[功能名称] PRD — 包含背景与目标、用户故事、功能需求、非功能需求、验收标准等章节。

## 示例
用户输入：帮我写一个 PRD
`

const SKILL_DESIGN_CONTENT = `# Skill: 技术方案撰写

## 描述
按照技术方案标准模板撰写设计文档。

## 适用场景
技术方案设计、架构评审

## AI 行为指令
你是一位资深技术架构师。在撰写技术方案时，请分析现有系统局限性并提出至少两个备选方案。

## 输出格式
技术方案 — 包含背景与目标、方案概述、架构设计、数据模型、接口设计等章节。

## 示例
用户输入：帮我设计一个方案
`

describe('SkillEngine', () => {
  let fileManager: FileManager
  let files: Map<string, string>

  beforeEach(() => {
    files = new Map<string, string>([
      ['skills/writing-prd.md', SKILL_PRD_CONTENT],
      ['skills/writing-design.md', SKILL_DESIGN_CONTENT],
      ['skills/_index.md', '# Skills 索引\n暂无。'],
      ['CLAUDE.md', '# Project'],
    ])
    fileManager = createMockFileManager(files)
  })

  describe('initialize + loadSkills', () => {
    it('should load skill files from skills/ directory', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      expect(engine.getSkill('writing-prd')).toBeDefined()
      expect(engine.getSkill('writing-design')).toBeDefined()
    })

    it('should exclude _index.md from skills', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      expect(engine.getSkill('_index')).toBeUndefined()
    })

    it('should parse skill name from H1 header', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const skill = engine.getSkill('writing-prd')
      expect(skill?.name).toBe('撰写 PRD')
    })

    it('should use filename as fallback name when H1 has no prefix', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const skill = engine.getSkill('writing-design')
      expect(skill?.name).toBe('技术方案撰写')
    })

    it('should parse description section', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const skill = engine.getSkill('writing-prd')
      expect(skill?.description).toContain('按照产品需求文档标准模板')
    })

    it('should parse scenarios section', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const skill = engine.getSkill('writing-prd')
      expect(skill?.scenarios).toContain('产品需求文档撰写')
    })

    it('should parse instructions section', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const skill = engine.getSkill('writing-prd')
      expect(skill?.instructions).toContain('经验丰富的产品经理')
    })

    it('should parse outputFormat section', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const skill = engine.getSkill('writing-prd')
      expect(skill?.outputFormat).toContain('[功能名称] PRD')
      expect(skill?.outputFormat).toContain('背景与目标')
    })

    it('should parse examples section', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const skill = engine.getSkill('writing-prd')
      expect(skill?.examples).toContain('帮我写一个 PRD')
    })

    it('should compute tokenCount', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const skill = engine.getSkill('writing-prd')
      expect(skill?.tokenCount).toBeGreaterThan(0)
    })

    it('should set filePath to relative path', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const skill = engine.getSkill('writing-prd')
      expect(skill?.filePath).toBe('skills/writing-prd.md')
    })
  })

  describe('getSkill / getSkills', () => {
    it('should return undefined for unknown skill', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      expect(engine.getSkill('nonexistent')).toBeUndefined()
    })

    it('should return multiple skills', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const skills = engine.getSkills(['writing-prd', 'writing-design'])
      expect(skills).toHaveLength(2)
    })

    it('should skip unknown skills in getSkills', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const skills = engine.getSkills(['writing-prd', 'unknown'])
      expect(skills).toHaveLength(1)
    })
  })

  describe('getSkillSummaries', () => {
    it('should return lightweight summaries', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const summaries = engine.getSkillSummaries()
      expect(summaries).toHaveLength(2)
      expect(summaries[0]).toHaveProperty('id')
      expect(summaries[0]).toHaveProperty('name')
      expect(summaries[0]).toHaveProperty('description')
      expect(summaries[0]).toHaveProperty('scenarios')
      expect(summaries[0]).not.toHaveProperty('instructions')
    })
  })

  describe('searchSkills', () => {
    it('should find skills by ID prefix with highest score', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const results = engine.searchSkills('writing')
      expect(results.length).toBeGreaterThanOrEqual(2)
      expect(results.map((s) => s.id)).toContain('writing-prd')
      expect(results.map((s) => s.id)).toContain('writing-design')
    })

    it('should find skills by exact ID match', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const results = engine.searchSkills('writing-prd')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].id).toBe('writing-prd')
    })

    it('should find skills by name', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const results = engine.searchSkills('PRD')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results[0].id).toBe('writing-prd')
    })

    it('should find skills by description', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const results = engine.searchSkills('模板')
      expect(results.length).toBeGreaterThanOrEqual(1)
    })

    it('should respect limit parameter', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const results = engine.searchSkills('writing', 1)
      expect(results).toHaveLength(1)
    })

    it('should return empty for no match', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const results = engine.searchSkills('zzzznonexistent')
      expect(results).toHaveLength(0)
    })

    it('should score ID exact match higher than partial match', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const results = engine.searchSkills('writing-prd')
      expect(results[0].id).toBe('writing-prd')
    })
  })

  describe('reloadSkill', () => {
    it('should reload a modified skill', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const original = engine.getSkill('writing-prd')
      expect(original?.name).toBe('撰写 PRD')

      files.set('skills/writing-prd.md', '# Skill: Updated PRD\n## 描述\nUpdated description.')
      await engine.reloadSkill('skills/writing-prd.md')

      const updated = engine.getSkill('writing-prd')
      expect(updated?.name).toBe('Updated PRD')
      expect(updated?.description).toBe('Updated description.')
    })
  })

  describe('removeSkill', () => {
    it('should remove a skill by file path', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      expect(engine.getSkill('writing-prd')).toBeDefined()

      engine.removeSkill('skills/writing-prd.md')
      expect(engine.getSkill('writing-prd')).toBeUndefined()
    })
  })

  describe('handleFileChange', () => {
    it('should reload skill on add event', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      expect(engine.getSkill('extra-skill')).toBeUndefined()

      files.set('skills/extra-skill.md', '# Skill: Extra\n## 描述\nAn extra skill.')
      engine.handleFileChange({ type: 'add', path: 'skills/extra-skill.md' })
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(engine.getSkill('extra-skill')).toBeDefined()
    })

    it('should remove skill on unlink event', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      expect(engine.getSkill('writing-prd')).toBeDefined()

      engine.handleFileChange({ type: 'unlink', path: 'skills/writing-prd.md' })
      expect(engine.getSkill('writing-prd')).toBeUndefined()
    })

    it('should ignore _index.md events', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      engine.handleFileChange({ type: 'add', path: 'skills/_index.md' })
      expect(engine.getSkill('_index')).toBeUndefined()
    })

    it('should ignore non-skills directory events', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      engine.handleFileChange({ type: 'add', path: 'docs/other.md' })
      expect(engine.getSkill('other')).toBeUndefined()
    })

    it('should notify file change callback', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const callback = vi.fn()
      engine.subscribeToFileChanges(callback)

      engine.handleFileChange({ type: 'unlink', path: 'skills/writing-prd.md' })
      expect(callback).toHaveBeenCalledWith({ type: 'unlink', path: 'skills/writing-prd.md' })
    })
  })

  describe('dispose', () => {
    it('should clear all skills', async () => {
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      expect(engine.getSkillSummaries()).toHaveLength(2)

      engine.dispose()
      expect(engine.getSkillSummaries()).toHaveLength(0)
    })
  })

  describe('parseSkill edge cases', () => {
    it('should handle empty sections gracefully', async () => {
      files.set('skills/minimal.md', '# Minimal Skill')
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const skill = engine.getSkill('minimal')
      expect(skill).toBeDefined()
      expect(skill?.name).toBe('Minimal Skill')
      expect(skill?.description).toBe('')
      expect(skill?.instructions).toBe('')
    })

    it('should handle unknown sections gracefully', async () => {
      files.set('skills/unknown-sections.md', '# Test\n## 未知 Section\nSome content\n## 描述\nThe description.')
      const engine = new SkillEngine(fileManager)
      await engine.initialize()
      const skill = engine.getSkill('unknown-sections')
      expect(skill?.description).toBe('The description.')
    })
  })
})
