/**
 * Google Docs Adapter
 *
 * Handles Google Docs export packages (.zip containing .docx files).
 * Uses mammoth.js for .docx → Markdown conversion.
 */

import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import AdmZip from 'adm-zip'
import mammoth from 'mammoth'
import type {
  ImportAdapter,
  ImportPlan,
  ImportPlanEntry,
  ImportItem,
  ImportPipelineOptions,
  AssetAttachment,
} from '../types'
import { logger } from '../../../utils/logger'

const LOG_PREFIX = '[GoogleDocsAdapter]'

export class GoogleDocsAdapter implements ImportAdapter {
  readonly name = 'google-docs'

  async detect(input: string): Promise<boolean> {
    if (path.extname(input).toLowerCase() !== '.zip') {
      return false
    }

    try {
      const zip = new AdmZip(input)
      const entries = zip.getEntries()
      const hasDocx = entries.some(
        (e: AdmZip.IZipEntry) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.docx')
      )

      if (!hasDocx) return false

      const hasMd = entries.some(
        (e: AdmZip.IZipEntry) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.md')
      )
      const hasCsv = entries.some(
        (e: AdmZip.IZipEntry) => !e.isDirectory && e.entryName.toLowerCase().endsWith('.csv')
      )

      return !hasMd && !hasCsv
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

    const planEntries: ImportPlanEntry[] = []

    for (const entry of entries) {
      if (entry.isDirectory) continue
      const name = entry.entryName
      const ext = path.extname(name).toLowerCase()

      if (ext === '.docx') {
        planEntries.push({
          sourcePath: name,
          relativePath: name.replace(/\.docx$/i, '.md'),
          type: 'docx',
          size: entry.header.size,
        })
      }
    }

    return {
      id,
      sourceFormat: 'google-docs',
      sourcePath: input,
      totalFiles: planEntries.length,
      totalImages: 0,
      warnings: [],
      estimatedDurationMs: planEntries.length * 200,
      entries: planEntries,
    }
  }

  async *transform(
    plan: ImportPlan,
    options: ImportPipelineOptions
  ): AsyncIterable<ImportItem> {
    const tmpDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'sibylla-gdocs-')
    )

    try {
      const zip = new AdmZip(plan.sourcePath)
      zip.extractAllTo(tmpDir, true)

      const docxFiles = await findFilesRecursive(tmpDir, '.docx')

      for (const docxPath of docxFiles) {
        const relativeToTmp = path.relative(tmpDir, docxPath)
        const targetName = relativeToTmp.replace(/\.docx$/i, '.md')

        // @ts-expect-error mammoth types don't include convertToMarkdown
        const result = await mammoth.convertToMarkdown({ path: docxPath }) as { value: string; messages: Array<{ message: string }> }

        if (result.messages.length > 0) {
          logger.warn(`${LOG_PREFIX} mammoth warnings`, {
            file: relativeToTmp,
            warnings: result.messages.map((m: { message: string }) => m.message),
          })
        }

        const attachments: AssetAttachment[] = []
        try {
          // @ts-expect-error mammoth types don't include extractRawImages
          const imageResult = await mammoth.extractRawImages({ path: docxPath }) as { images: Array<{ contentType: string; content: Buffer }> }
          for (const img of imageResult.images) {
            const imgName = `image-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${path.extname(img.contentType?.replace('image/', '.') ?? '.png')}`
            attachments.push({
              sourcePath: imgName,
              fileName: imgName,
              buffer: Buffer.from(img.content),
            })
          }
        } catch {
          // image extraction optional
        }

        const targetPath = options.preserveStructure
          ? path.join(options.targetDir, targetName)
          : path.join(options.targetDir, path.basename(targetName))

        yield {
          sourcePath: relativeToTmp,
          targetPath,
          content: result.value,
          attachments,
          metadata: {
            source: 'google-docs',
            title: path.basename(relativeToTmp, '.docx'),
          },
        }
      }
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true })
    }
  }
}

async function findFilesRecursive(dir: string, ext: string): Promise<string[]> {
  const results: string[] = []
  const entries = await fs.promises.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...await findFilesRecursive(fullPath, ext))
    } else if (entry.name.toLowerCase().endsWith(ext)) {
      results.push(fullPath)
    }
  }

  return results
}

function generateId(): string {
  return `gdocs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
