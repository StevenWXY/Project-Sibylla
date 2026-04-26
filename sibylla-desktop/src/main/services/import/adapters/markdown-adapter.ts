/**
 * Markdown Adapter
 *
 * Handles local Markdown folder imports, preserving directory hierarchy
 * and copying non-text assets (images, etc.) to the assets directory.
 */

import * as path from 'path'
import * as fs from 'fs'
import type {
  ImportAdapter,
  ImportPlan,
  ImportPlanEntry,
  ImportItem,
  ImportPipelineOptions,
  AssetAttachment,
} from '../types'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'])

export class MarkdownAdapter implements ImportAdapter {
  readonly name = 'markdown'

  async detect(input: string): Promise<boolean> {
    try {
      const stat = await fs.promises.stat(input)
      if (!stat.isDirectory()) return false

      const obsidianDir = path.join(input, '.obsidian')
      try {
        await fs.promises.access(obsidianDir)
        return false
      } catch {
        // no .obsidian/ — continue
      }

      const hasMd = await this.hasMarkdownFiles(input)
      return hasMd
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
      sourceFormat: 'markdown',
      sourcePath: input,
      totalFiles: entries.filter((e) => e.type === 'markdown').length,
      totalImages,
      warnings: [],
      estimatedDurationMs: entries.length * 20,
      entries,
    }
  }

  async *transform(
    plan: ImportPlan,
    options: ImportPipelineOptions
  ): AsyncIterable<ImportItem> {
    for (const entry of plan.entries) {
      const fullPath = path.join(plan.sourcePath, entry.sourcePath)

      if (entry.type === 'markdown') {
        const content = await fs.promises.readFile(fullPath, 'utf-8')
        const targetPath = options.preserveStructure
          ? path.join(options.targetDir, entry.relativePath)
          : path.join(options.targetDir, path.basename(entry.relativePath))

        yield {
          sourcePath: entry.sourcePath,
          targetPath,
          content,
          attachments: [],
          metadata: {
            source: 'markdown',
            title: path.basename(entry.relativePath, '.md'),
          },
        }
      } else if (entry.type === 'image') {
        const attachments: AssetAttachment[] = [
          {
            sourcePath: fullPath,
            fileName: path.basename(fullPath),
          },
        ]

        const targetPath = options.preserveStructure
          ? path.join(options.targetDir, entry.relativePath.replace(/\.png$|\.jpg$|\.jpeg$|\.gif$|\.svg$|\.webp$/i, '.md'))
          : path.join(options.targetDir, path.basename(entry.relativePath).replace(/\.[^.]+$/, '.md'))

        yield {
          sourcePath: entry.sourcePath,
          targetPath,
          content: '',
          attachments,
          metadata: { source: 'markdown' },
        }
      }
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
      const fullPath = path.join(currentDir, item.name)
      const relativePath = path.relative(baseDir, fullPath)

      if (item.isDirectory()) {
        await this.walkDirectory(baseDir, fullPath, entries, onType)
      } else if (item.isFile()) {
        const ext = path.extname(item.name).toLowerCase()
        if (ext === '.md' || ext === '.txt') {
          onType?.('markdown')
          entries.push({ sourcePath: relativePath, relativePath, type: 'markdown', size: 0 })
        } else if (IMAGE_EXTENSIONS.has(ext)) {
          onType?.('image')
          entries.push({ sourcePath: relativePath, relativePath, type: 'image', size: 0 })
        }
      }
    }
  }

  private async hasMarkdownFiles(dir: string): Promise<boolean> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        return true
      }
    }
    return false
  }
}

function generateId(): string {
  return `md-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
