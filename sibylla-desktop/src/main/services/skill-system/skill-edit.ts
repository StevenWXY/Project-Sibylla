import type { SkillTemplate, SkillV2 } from '../../../shared/types'
import type { FileManager } from '../file-manager'
import type { IndexFrontmatter } from './types'

function joinSkillPath(dirPath: string, fileName: string): string {
  return `${dirPath.replace(/\/+$/, '')}/${fileName}`
}

function formatTagsYaml(tags: string[]): string {
  if (tags.length === 0) return 'tags: []'
  const quoted = tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(', ')
  return `tags: [${quoted}]`
}

export function serializeIndexFrontmatter(fm: IndexFrontmatter): string {
  const lines = [
    '---',
    `id: ${fm.id}`,
    `version: ${fm.version}`,
    `name: ${fm.name}`,
    `description: ${fm.description}`,
    `category: ${fm.category ?? 'general'}`,
    formatTagsYaml(fm.tags ?? []),
    `scope: ${fm.scope ?? 'public'}`,
  ]
  if (fm.author) lines.push(`author: ${fm.author}`)
  lines.push('---', '')
  return lines.join('\n')
}

function parseFrontmatterLines(content: string): IndexFrontmatter {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
  if (!match) {
    throw new Error('Missing YAML frontmatter in _index.md')
  }

  const result: Record<string, unknown> = {}
  const frontmatter = match[1]
  if (frontmatter === undefined) {
    throw new Error('Missing YAML frontmatter in _index.md')
  }

  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx < 0) continue
    const key = line.slice(0, colonIdx).trim()
    const rawValue = line.slice(colonIdx + 1).trim()
    if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
      const inner = rawValue.slice(1, -1).trim()
      result[key] = inner
        ? inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
        : []
    } else {
      result[key] = rawValue
    }
  }

  return result as unknown as IndexFrontmatter
}

export async function updateSkillV2(
  fileManager: FileManager,
  skill: SkillV2,
  updates: Partial<SkillTemplate> & { category?: string; version?: string },
): Promise<void> {
  if (skill.formatVersion !== 2) {
    throw new Error('Only v2 skill directories support online edit')
  }
  if (skill.source === 'builtin') {
    throw new Error('Cannot edit builtin skills in place')
  }

  const indexPath = joinSkillPath(skill.filePath, '_index.md')
  const indexResult = await fileManager.readFile(indexPath)
  const frontmatter = parseFrontmatterLines(indexResult.content)

  if (updates.name !== undefined) frontmatter.name = updates.name
  if (updates.description !== undefined) frontmatter.description = updates.description
  if (updates.tags !== undefined) frontmatter.tags = updates.tags
  if (updates.category !== undefined) frontmatter.category = updates.category
  if (updates.version !== undefined) frontmatter.version = updates.version

  await fileManager.writeFile(indexPath, serializeIndexFrontmatter(frontmatter))

  if (updates.prompt !== undefined) {
    const promptPath = joinSkillPath(skill.filePath, 'prompt.md')
    await fileManager.writeFile(promptPath, updates.prompt)
  }

  if (updates.tools !== undefined) {
    const toolsPath = joinSkillPath(skill.filePath, 'tools.yaml')
    if (updates.tools.length === 0) {
      try {
        await fileManager.deleteFile(toolsPath)
      } catch {
        // optional file
      }
    } else {
      const toolsContent = ['allowed_tools:', ...updates.tools.map((t) => `  - ${t}`)].join('\n')
      await fileManager.writeFile(toolsPath, toolsContent)
    }
  }
}
