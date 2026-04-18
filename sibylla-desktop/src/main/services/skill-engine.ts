import type { Skill, SkillSummary } from '../../shared/types'
import type { FileManager } from './file-manager'
import { logger } from '../utils/logger'

type FileChangeEvent = {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
}

export type SkillFileChangeCallback = (event: FileChangeEvent) => void

export class SkillEngine {
  private skills: Map<string, Skill> = new Map()
  private readonly fileManager: FileManager
  private fileChangeCallback: SkillFileChangeCallback | null = null

  constructor(fileManager: FileManager) {
    this.fileManager = fileManager
  }

  async initialize(): Promise<void> {
    await this.loadSkills()
    logger.info('[SkillEngine] Initialized', {
      skillCount: this.skills.size,
      skillIds: Array.from(this.skills.keys()),
    })
  }

  async loadSkills(): Promise<void> {
    this.skills.clear()
    try {
      const workspaceRoot = this.fileManager.getWorkspaceRoot()
      const files = await this.fileManager.listFiles(workspaceRoot, { recursive: true })

      const skillFiles = files.filter((file) => {
        if (file.isDirectory) return false
        if (!file.path.startsWith('skills/')) return false
        if (!file.path.endsWith('.md')) return false
        if (file.path === 'skills/_index.md') return false
        return true
      })

      for (const file of skillFiles) {
        try {
          const result = await this.fileManager.readFile(file.path)
          const skill = this.parseSkill(result.content, file.path)
          this.skills.set(skill.id, skill)
        } catch (error) {
          logger.warn('[SkillEngine] Failed to parse skill file', {
            filePath: file.path,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      logger.info('[SkillEngine] Skills loaded', {
        count: this.skills.size,
        ids: Array.from(this.skills.keys()),
      })
    } catch (error) {
      logger.error('[SkillEngine] Failed to load skills', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  getSkill(id: string): Skill | undefined {
    return this.skills.get(id)
  }

  getSkills(ids: string[]): Skill[] {
    const result: Skill[] = []
    for (const id of ids) {
      const skill = this.skills.get(id)
      if (skill) {
        result.push(skill)
      }
    }
    return result
  }

  getSkillSummaries(): SkillSummary[] {
    return Array.from(this.skills.values()).map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      scenarios: skill.scenarios,
    }))
  }

  searchSkills(query: string, limit: number = 10): SkillSummary[] {
    const lowerQuery = query.toLowerCase()
    const scored: Array<{ skill: Skill; score: number }> = []

    for (const skill of this.skills.values()) {
      let score = 0
      const lowerId = skill.id.toLowerCase()
      const lowerName = skill.name.toLowerCase()
      const lowerDesc = skill.description.toLowerCase()
      const lowerScenarios = skill.scenarios.toLowerCase()

      if (lowerId === lowerQuery) score += 100
      else if (lowerId.startsWith(lowerQuery)) score += 80
      else if (lowerId.includes(lowerQuery)) score += 60

      if (lowerName.includes(lowerQuery)) score += 40

      if (lowerDesc.includes(lowerQuery)) score += 20

      if (lowerScenarios.includes(lowerQuery)) score += 10

      if (score > 0) {
        scored.push({ skill, score })
      }
    }

    scored.sort((a, b) => b.score - a.score)

    return scored.slice(0, limit).map(({ skill }) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      scenarios: skill.scenarios,
    }))
  }

  async reloadSkill(filePath: string): Promise<void> {
    try {
      const result = await this.fileManager.readFile(filePath)
      const skill = this.parseSkill(result.content, filePath)
      this.skills.set(skill.id, skill)
      logger.info('[SkillEngine] Skill reloaded', { filePath, skillId: skill.id })
    } catch (error) {
      logger.warn('[SkillEngine] Failed to reload skill', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  removeSkill(filePath: string): void {
    const id = filePath.replace(/^skills\//, '').replace(/\.md$/, '')
    this.skills.delete(id)
    logger.info('[SkillEngine] Skill removed', { filePath, skillId: id })
  }

  subscribeToFileChanges(callback: SkillFileChangeCallback): void {
    this.fileChangeCallback = callback
  }

  handleFileChange(event: FileChangeEvent): void {
    if (!event.path.startsWith('skills/') || !event.path.endsWith('.md')) return
    if (event.path === 'skills/_index.md') return

    switch (event.type) {
      case 'add':
      case 'change':
        void this.reloadSkill(event.path)
        break
      case 'unlink':
        this.removeSkill(event.path)
        break
    }

    if (this.fileChangeCallback) {
      this.fileChangeCallback(event)
    }
  }

  dispose(): void {
    this.skills.clear()
    this.fileChangeCallback = null
    logger.info('[SkillEngine] Disposed')
  }

  private parseSkill(content: string, filePath: string): Skill {
    const lines = content.split('\n')
    const id = filePath.replace(/^skills\//, '').replace(/\.md$/, '')
    const fields: Record<string, string> = {
      description: '',
      scenarios: '',
      instructions: '',
      outputFormat: '',
      examples: '',
    }
    let name = id
    let section = ''

    for (const line of lines) {
      if (line.startsWith('# ')) {
        name = line.replace(/^#\s*(Skill:\s*)?/, '').trim()
        section = ''
      } else if (line.startsWith('## 描述')) {
        section = 'description'
      } else if (line.startsWith('## 适用场景')) {
        section = 'scenarios'
      } else if (line.startsWith('## AI 行为指令')) {
        section = 'instructions'
      } else if (line.startsWith('## 输出格式')) {
        section = 'outputFormat'
      } else if (line.startsWith('## 示例')) {
        section = 'examples'
      } else if (line.startsWith('## ')) {
        section = ''
      } else if (section && line.trim()) {
        fields[section] += line + '\n'
      }
    }

    for (const key of Object.keys(fields)) {
      fields[key] = fields[key].trim()
    }

    const instructions = fields.instructions
    const outputFormat = fields.outputFormat

    return {
      id,
      name,
      description: fields.description,
      scenarios: fields.scenarios,
      instructions,
      outputFormat,
      examples: fields.examples,
      filePath,
      tokenCount: this.estimateTokens(instructions + '\n' + outputFormat),
      updatedAt: Date.now(),
    }
  }

  private estimateTokens(text: string): number {
    const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) ?? []).length
    const nonCjkLength = text.length - cjkCount
    return Math.ceil(nonCjkLength / 4) + Math.ceil(cjkCount / 2)
  }
}
