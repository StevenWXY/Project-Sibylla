import type { Skill, SkillV2 } from '../../../shared/types'
import type { FileManager } from '../file-manager'
import type { SkillSource, IndexFrontmatter } from './types'
import { logger } from '../../utils/logger'

const REQUIRED_FRONTMATTER_FIELDS: ReadonlyArray<keyof IndexFrontmatter> = [
  'id',
  'version',
  'name',
  'description',
]

export class SkillLoader {
  constructor(
    private readonly fileManager: FileManager,
    private readonly tokenEstimator: (text: string) => number,
  ) {}

  async loadV1(filePath: string): Promise<SkillV2> {
    const result = await this.fileManager.readFile(filePath)
    const parsed = this.parseV1Content(result.content, filePath)

    const source = this.inferSource(filePath)
    return {
      ...parsed,
      version: '1.0.0',
      author: '',
      category: 'general',
      tags: [],
      scope: 'public',
      source,
      triggers: [],
      allowedTools: undefined,
      formatVersion: 1,
      updatedAt: Date.now(),
    }
  }

  async loadV2(
    dirPath: string,
    source: SkillSource,
  ): Promise<SkillV2> {
    const indexPath = this.joinPath(dirPath, '_index.md')
    const promptPath = this.joinPath(dirPath, 'prompt.md')
    const toolsPath = this.joinPath(dirPath, 'tools.yaml')

    const indexResult = await this.fileManager.readFile(indexPath)
    const frontmatter = this.parseFrontmatter(indexResult.content)

    this.validateFrontmatter(frontmatter, dirPath)

    let promptContent = ''
    try {
      const promptResult = await this.fileManager.readFile(promptPath)
      promptContent = promptResult.content
    } catch {
      logger.warn('[SkillLoader] prompt.md not found, using empty prompt', { dirPath })
    }

    let toolsConfig: { allowed_tools?: string[]; required_context?: string[]; budget?: { max_tokens: number; max_tool_calls: number } } | null = null
    try {
      const toolsResult = await this.fileManager.readFile(toolsPath)
      toolsConfig = this.parseSimpleYaml(toolsResult.content)
    } catch {
      // tools.yaml is optional
    }

    const examples = await this.loadExamples(dirPath)

    const examplesText = examples.join('\n')
    const instructions = promptContent
    const outputFormat = ''
    const fullText = instructions + '\n' + outputFormat + '\n' + examplesText

    const skillId = frontmatter.id
    const skillName = frontmatter.name

    const skillV2: SkillV2 = {
      id: skillId,
      name: skillName,
      description: frontmatter.description,
      scenarios: '',
      instructions,
      outputFormat,
      examples: examplesText,
      filePath: dirPath,
      tokenCount: this.tokenEstimator(fullText),
      updatedAt: Date.now(),
      version: frontmatter.version,
      author: frontmatter.author ?? '',
      category: frontmatter.category ?? 'general',
      tags: frontmatter.tags ?? [],
      scope: frontmatter.scope ?? 'public',
      source,
      triggers: frontmatter.triggers ?? [],
      allowedTools: toolsConfig?.allowed_tools,
      examplesDir: examples.length > 0 ? this.joinPath(dirPath, 'examples') : undefined,
      formatVersion: 2,
      estimatedTokens: frontmatter.estimated_tokens,
      loadableIn: frontmatter.loadable_in,
    }

    return skillV2
  }

  async loadFromDir(
    dirPath: string,
    source: SkillSource,
  ): Promise<SkillV2[]> {
    const skills: SkillV2[] = []

    let entries: Array<{ name: string; isDirectory: boolean; path: string }>
    try {
      const files = await this.fileManager.listFiles(dirPath, { recursive: false })
      entries = files.map((f) => ({
        name: f.path.split('/').pop() ?? f.path,
        isDirectory: f.isDirectory,
        path: f.path,
      }))
    } catch {
      return skills
    }

    for (const entry of entries) {
      try {
        if (entry.isDirectory) {
          if (await this.isV2Directory(this.joinPath(dirPath, entry.name))) {
            const skill = await this.loadV2(
              this.joinPath(dirPath, entry.name),
              source,
            )
            skills.push(skill)
          }
        } else if (entry.name.endsWith('.md') && entry.name !== '_index.md') {
          const skill = await this.loadV1(entry.path)
          skills.push(skill)
        }
      } catch (error) {
        logger.warn('[SkillLoader] Failed to load skill', {
          path: entry.path,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return skills
  }

  async isV2Directory(dirPath: string): Promise<boolean> {
    try {
      const indexPath = this.joinPath(dirPath, '_index.md')
      return await this.fileManager.exists(indexPath)
    } catch {
      return false
    }
  }

  private parseV1Content(content: string, filePath: string): Skill {
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
      tokenCount: this.tokenEstimator(instructions + '\n' + outputFormat),
      updatedAt: Date.now(),
    }
  }

  private parseFrontmatter(content: string): IndexFrontmatter {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (!match) {
      throw new Error('Missing YAML frontmatter in _index.md')
    }

    const yaml = match[1]
    const result: Record<string, unknown> = {}

    for (const line of yaml.split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx < 0) continue

      const key = line.slice(0, colonIdx).trim()
      const rawValue = line.slice(colonIdx + 1).trim()

      if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        result[key] = this.parseSimpleArray(rawValue)
      } else if (rawValue === 'true' || rawValue === 'false') {
        result[key] = rawValue === 'true'
      } else if (/^\d+$/.test(rawValue)) {
        result[key] = parseInt(rawValue, 10)
      } else {
        result[key] = rawValue
      }
    }

    return result as unknown as IndexFrontmatter
  }

  private parseSimpleArray(raw: string): string[] {
    const inner = raw.slice(1, -1).trim()
    if (!inner) return []
    return inner
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
  }

  private parseSimpleYaml(
    content: string,
  ): Record<string, unknown> | null {
    const result: Record<string, unknown> = {}
    let currentKey = ''
    let currentArray: string[] = []
    let inArray = false

    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      if (inArray && trimmed.startsWith('- ')) {
        currentArray.push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ''))
        continue
      }

      if (inArray && currentKey) {
        result[currentKey] = currentArray
        inArray = false
      }

      const colonIdx = trimmed.indexOf(':')
      if (colonIdx < 0) continue

      const key = trimmed.slice(0, colonIdx).trim()
      const value = trimmed.slice(colonIdx + 1).trim()

      if (!value) {
        currentKey = key
        currentArray = []
        inArray = true
      } else if (value.startsWith('[') && value.endsWith(']')) {
        result[key] = this.parseSimpleArray(value)
      } else if (/^\d+$/.test(value)) {
        result[key] = parseInt(value, 10)
      } else {
        result[key] = value.replace(/^["']|["']$/g, '')
      }
    }

    if (inArray && currentKey) {
      result[currentKey] = currentArray
    }

    return Object.keys(result).length > 0 ? result : null
  }

  private validateFrontmatter(fm: IndexFrontmatter, dirPath: string): void {
    for (const field of REQUIRED_FRONTMATTER_FIELDS) {
      if (!fm[field]) {
        throw new Error(`Missing required field "${field}" in _index.md at ${dirPath}`)
      }
    }
  }

  private async loadExamples(dirPath: string): Promise<string[]> {
    const examplesDir = this.joinPath(dirPath, 'examples')
    const examples: string[] = []

    try {
      const files = await this.fileManager.listFiles(examplesDir, { recursive: false })
      for (const file of files) {
        if (!file.isDirectory && file.path.endsWith('.md')) {
          try {
            const result = await this.fileManager.readFile(file.path)
            examples.push(result.content)
          } catch (error) {
            logger.warn('[SkillLoader] Failed to load example', {
              path: file.path,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }
      }
    } catch {
      // examples/ directory is optional
    }

    return examples
  }

  private inferSource(filePath: string): SkillSource {
    if (filePath.includes('resources/skills')) return 'builtin'
    if (filePath.includes('personal/')) return 'personal'
    return 'workspace'
  }

  private joinPath(...segments: string[]): string {
    return segments.join('/')
  }
}
