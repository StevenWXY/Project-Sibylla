/**
 * Notion Adapter
 *
 * Handles Notion export packages (.zip) in two modes:
 * - Markdown+CSV: Notion's newer export format with .md and .csv files
 * - HTML: Notion's legacy export format with .html files
 */

import * as path from 'path'
import AdmZip from 'adm-zip'
import TurndownService from 'turndown'
import Papa from 'papaparse'
import type {
  ImportAdapter,
  ImportPlan,
  ImportPlanEntry,
  ImportItem,
  ImportPipelineOptions,
  AssetAttachment,
} from '../types'
import { logger } from '../../../utils/logger'

const LOG_PREFIX = '[NotionAdapter]'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'])

type NotionMode = 'md_csv' | 'html'

export class NotionAdapter implements ImportAdapter {
  readonly name = 'notion'

  async detect(input: string): Promise<boolean> {
    if (path.extname(input).toLowerCase() !== '.zip') {
      return false
    }

    try {
      const zip = new AdmZip(input)
      const entries = zip.getEntries()
      const names = entries.map((e: AdmZip.IZipEntry) => e.entryName)

      const hasCsv = names.some((n: string) => n.toLowerCase().endsWith('.csv'))
      const hasMd = names.some((n: string) => n.toLowerCase().endsWith('.md'))
      const hasHtml = names.some((n: string) => n.toLowerCase().endsWith('.html'))

      return (hasCsv && hasMd) || hasHtml
    } catch (error) {
      logger.debug(`${LOG_PREFIX} detect() failed`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  async scan(input: string): Promise<ImportPlan> {
    const id = generateId()
    const zip = new AdmZip(input)
    const entries = zip.getEntries()

    const mode = this.detectMode(entries)
    const planEntries: ImportPlanEntry[] = []
    let totalImages = 0

    for (const entry of entries) {
      if (entry.isDirectory) continue
      const name = entry.entryName
      const ext = path.extname(name).toLowerCase()

      const type = this.classifyFileType(ext, mode)
      if (type === 'other' && !IMAGE_EXTENSIONS.has(ext)) continue

      if (IMAGE_EXTENSIONS.has(ext)) {
        totalImages++
        planEntries.push({
          sourcePath: name,
          relativePath: name,
          type: 'image',
          size: entry.header.size,
        })
      } else {
        planEntries.push({
          sourcePath: name,
          relativePath: name,
          type,
          size: entry.header.size,
        })
      }
    }

    return {
      id,
      sourceFormat: `notion-${mode}`,
      sourcePath: input,
      totalFiles: planEntries.filter((e) => e.type !== 'image').length,
      totalImages,
      warnings: [],
      estimatedDurationMs: planEntries.length * 50,
      entries: planEntries,
    }
  }

  async *transform(
    plan: ImportPlan,
    options: ImportPipelineOptions
  ): AsyncIterable<ImportItem> {
    const zip = new AdmZip(plan.sourcePath)
    const entries = zip.getEntries()
    const mode = this.detectMode(entries)

    for (const entry of entries) {
      if (entry.isDirectory) continue
      const name = entry.entryName
      const ext = path.extname(name).toLowerCase()

      if (mode === 'md_csv') {
        if (ext === '.md') {
          const content = entry.getData().toString('utf-8')
          const fixed = fixNotionMarkdown(content)
          const targetPath = this.computeTargetPath(name, options)

          const attachments = this.collectImageAttachments(zip, name)

          yield {
            sourcePath: name,
            targetPath,
            content: fixed,
            attachments,
            metadata: { source: 'notion', title: path.basename(name, '.md') },
          }
        } else if (ext === '.csv') {
          const csvContent = entry.getData().toString('utf-8')
          const markdownTable = csvToMarkdownTable(csvContent)
          const targetPath = this.computeTargetPath(
            name.replace(/\.csv$/i, '.md'),
            options
          )

          yield {
            sourcePath: name,
            targetPath,
            content: markdownTable,
            attachments: [],
            metadata: { source: 'notion', title: path.basename(name, '.csv') },
          }
        }
      } else if (mode === 'html' && ext === '.html') {
        const htmlContent = entry.getData().toString('utf-8')
        const td = new TurndownService({ headingStyle: 'atx' })
        const markdown = td.turndown(htmlContent)
        const targetPath = this.computeTargetPath(
          name.replace(/\.html$/i, '.md'),
          options
        )

        const attachments = this.collectImageAttachments(zip, name)

        yield {
          sourcePath: name,
          targetPath,
          content: markdown,
          attachments,
          metadata: { source: 'notion', title: path.basename(name, '.html') },
        }
      }
    }
  }

  private detectMode(entries: AdmZip.IZipEntry[]): NotionMode {
    const names = entries.map((e) => e.entryName)
    const hasCsv = names.some((n) => n.toLowerCase().endsWith('.csv'))
    const hasHtml = names.some((n) => n.toLowerCase().endsWith('.html'))

    if (hasHtml && !hasCsv) return 'html'
    return 'md_csv'
  }

  private classifyFileType(ext: string, mode: NotionMode): ImportPlanEntry['type'] {
    if (IMAGE_EXTENSIONS.has(ext)) return 'image'
    if (mode === 'md_csv') {
      if (ext === '.md') return 'markdown'
      if (ext === '.csv') return 'csv'
    }
    if (mode === 'html' && ext === '.html') return 'html'
    return 'other'
  }

  private computeTargetPath(entryName: string, options: ImportPipelineOptions): string {
    if (!options.preserveStructure) {
      return path.join(options.targetDir, path.basename(entryName))
    }
    return path.join(options.targetDir, entryName)
  }

  private collectImageAttachments(zip: AdmZip, _entryName: string): AssetAttachment[] {
    const attachments: AssetAttachment[] = []
    for (const entry of zip.getEntries()) {
      const ext = path.extname(entry.entryName).toLowerCase()
      if (IMAGE_EXTENSIONS.has(ext) && !entry.isDirectory) {
        attachments.push({
          sourcePath: entry.entryName,
          fileName: path.basename(entry.entryName),
          buffer: entry.getData(),
        })
      }
    }
    return attachments
  }
}

function fixNotionMarkdown(content: string): string {
  let result = content

  result = result.replace(/\{\{embed\}\}(.+?)\{\{\/embed\}\}/g, (_match, url: string) => {
    return `[Embedded: ${url.trim()}](${url.trim()})`
  })

  return result
}

function csvToMarkdownTable(csvContent: string): string {
  const parsed = Papa.parse<string[]>(csvContent.trim(), {
    skipEmptyLines: true,
  })

  if (parsed.data.length === 0) return ''

  const headers = parsed.data[0] ?? []
  const rows = parsed.data.slice(1)

  const headerLine = `| ${headers.join(' | ')} |`
  const separatorLine = `| ${headers.map(() => '---').join(' | ')} |`
  const dataLines = rows.map((row) => `| ${row.join(' | ')} |`)

  return [headerLine, separatorLine, ...dataLines].join('\n')
}

function generateId(): string {
  return `notion-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
