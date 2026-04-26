/**
 * Obsidian Adapter
 *
 * Handles Obsidian vault imports, preserving wikilinks, YAML frontmatter tags,
 * and directory structure. Excludes the .obsidian/ configuration directory.
 */

import * as path from 'path'
import * as fs from 'fs'
import type {
  ImportAdapter,
  ImportPlan,
  ImportPlanEntry,
  ImportItem,
  ImportPipelineOptions,
} from '../types'
import { logger } from '../../../utils/logger'

const LOG_PREFIX = '[ObsidianAdapter]'

const DATAVIEW_PATTERN = /```dataview[\s\S]*?```/gi
const TEMPLATER_PATTERN = /<%[\s\S]*?%>/g

export class ObsidianAdapter implements ImportAdapter {
  readonly name = 'obsidian'

  async detect(input: string): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(input)
      if (!stat.isDirectory()) return false

      const obsidianDir = path.join(input, '.obsidian')
      try {
        await fs.promises.access(obsidianDir)
        return true
      } catch {
        // no .obsidian/ dir, check for wikilinks
        return await this.hasWikilinks(input)
      }
    } catch {
      return false
    }
  }

  async scan(input: string): Promise<ImportPlan> {
    const id = generateId()
    const entries: ImportPlanEntry[] = []
    let totalImages = 0

    await this.walkDirectory(input, input, entries, (type) => {
      if (type === 'image') totalImages++
    })

    return {
      id,
      sourceFormat: 'obsidian',
      sourcePath: input,
      totalFiles: entries.filter((e) => e.type !== 'image').length,
      totalImages,
      warnings: [],
      estimatedDurationMs: entries.length * 30,
      entries,
    }
  }

  async *transform(
    plan: ImportPlan,
    options: ImportPipelineOptions
  ): AsyncIterable<ImportItem> {
    const mdFiles = plan.entries.filter((e) => e.type === 'markdown')
    const warnings: string[] = []

    for (const entry of mdFiles) {
      const fullPath = path.join(plan.sourcePath, entry.sourcePath)
      const content = await fs.promises.readFile(fullPath, 'utf-8')

      const { frontmatter, tags, warnings: parseWarnings } = parseFrontmatter(content)
      warnings.push(...parseWarnings)

      if (hasDataview(content)) {
        warnings.push(`Dataview query found in ${entry.relativePath}`)
      }
      if (hasTemplater(content)) {
        warnings.push(`Templater syntax found in ${entry.relativePath}`)
      }

      const targetPath = options.preserveStructure
        ? path.join(options.targetDir, entry.relativePath)
        : path.join(options.targetDir, path.basename(entry.relativePath))

      yield {
        sourcePath: entry.sourcePath,
        targetPath,
        content,
        attachments: [],
        metadata: {
          source: 'obsidian',
          tags,
          frontmatter,
          title: path.basename(entry.relativePath, '.md'),
        },
      }
    }

    for (const warning of warnings) {
      logger.debug(`${LOG_PREFIX} Warning: ${warning}`)
    }
  }

  private async walkDirectory(
    baseDir: string,
    currentDir: string,
    entries: ImportPlanEntry[],
    onType?: (type: ImportPlanEntry['type']) => void
  ): Promise<void> {
    const items = await fs.promises.readdir(currentDir, { withFileTypes: true })

    for (const item of items) {
      if (item.name === '.obsidian') continue

      const fullPath = path.join(currentDir, item.name)
      const relativePath = path.relative(baseDir, fullPath)

      if (item.isDirectory()) {
        await this.walkDirectory(baseDir, fullPath, entries, onType)
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase()
        const type = classifyFile(ext)
        onType?.(type)

        if (type !== 'other' || isImageExt(ext)) {
          entries.push({
            sourcePath: relativePath,
            relativePath,
            type,
            size: 0,
          })
        }
      }
    }
  }

  private async hasWikilinks(dir: string): Promise<boolean> {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })
      let mdCount = 0
      let wikilinkCount = 0

      for (const entry of entries) {
        if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          mdCount++
          const content = await fs.promises.readFile(path.join(dir, entry.name), 'utf-8')
          if (/\[\[.+?\]\]/.test(content)) {
            wikilinkCount++
          }
        }
        if (mdCount >= 10) break
      }

      return mdCount > 0 && wikilinkCount / mdCount > 0.3
    } catch {
      return false
    }
  }
}

function classifyFile(ext: string): ImportPlanEntry['type'] {
  if (ext === '.md') return 'markdown'
  if (isImageExt(ext)) return 'image'
  return 'other'
}

function isImageExt(ext: string): boolean {
  return ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)
}

interface FrontmatterResult {
  frontmatter: Record<string, unknown> | undefined
  tags: string[]
  warnings: string[]
}

function parseFrontmatter(content: string): FrontmatterResult {
  const tags: string[] = []
  const warnings: string[] = []
  let frontmatter: Record<string, unknown> | undefined

  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (match) {
    try {
      const yaml = match[1]
      const tagMatch = yaml?.match(/tags:\s*\[(.+?)\]/i)
      if (tagMatch?.[1]) {
        const tagStr = tagMatch[1]
        tags.push(
          ...tagStr.split(',').map((t: string) => t.trim().replace(/^#/, ''))
        )
      }

      const tagLineMatch = yaml?.match(/tags:\s*\n((?:\s*-\s+.+\n?)+)/i)
      if (tagLineMatch?.[1]) {
        const lineMatches = [...tagLineMatch[1].matchAll(/-\s+(.+)/g)]
        for (const lm of lineMatches) {
          if (lm[1]) {
            tags.push(lm[1].trim().replace(/^#/, ''))
          }
        }
      }
    } catch {
      warnings.push('Failed to parse frontmatter tags')
    }
  }

  return { frontmatter, tags, warnings }
}

function hasDataview(content: string): boolean {
  return DATAVIEW_PATTERN.test(content)
}

function hasTemplater(content: string): boolean {
  return TEMPLATER_PATTERN.test(content)
}

function generateId(): string {
  return `obsidian-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
