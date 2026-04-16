/**
 * Import Manager Service
 *
 * Manages file import and format conversion into the workspace.
 * All imported content is stored as Markdown plaintext (CLAUDE.md "file as truth" principle).
 *
 * Supported formats:
 * - .md / .txt / .csv → direct copy (copied as-is)
 * - .docx → Markdown conversion (mammoth)
 * - .pdf → text extraction (pdf-parse, lossy)
 */

import * as path from 'path'
import { promises as fs } from 'fs'
import mammoth from 'mammoth'
import * as pdfParse from 'pdf-parse'
import { FileManager } from './file-manager'
import { logger } from '../utils/logger'
import type {
  ImportResult,
  ImportFileResult,
  ImportableFileType,
} from '../../shared/types'
import type {
  InternalImportOptions,
  ImportResultAccumulator,
} from './types/import-manager.types'

/** Maximum single file size: 10 MB */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024

/** [C3-FIX] Maximum recursion depth to prevent stack overflow from circular symlinks */
const MAX_DIRECTORY_DEPTH = 20

/** Supported file extensions for import */
const SUPPORTED_EXTENSIONS: readonly string[] = ['.md', '.docx', '.pdf', '.csv', '.txt']

export class ImportManager {
  constructor(
    private readonly fileManager: FileManager
  ) {}

  /**
   * Import multiple files and/or directories into the workspace.
   *
   * @param sourcePaths - Absolute paths to files or directories on the host filesystem
   * @param options - Import options including target directory and progress callback
   * @returns Structured import result with categorized file results
   */
  async importFiles(
    sourcePaths: string[],
    options: InternalImportOptions = {},
    depth = 0
  ): Promise<ImportResult> {
    const startTime = Date.now()
    const targetDir = options.targetDir ?? '/'

    if (depth > MAX_DIRECTORY_DEPTH) {
      logger.warn('[ImportManager] Max directory depth exceeded, skipping', { targetDir })
      return { imported: [], converted: [], skipped: [], failed: [], durationMs: 0 }
    }

    const result: ImportResultAccumulator = {
      imported: [],
      converted: [],
      skipped: [],
      failed: [],
    }

    let processed = 0
    const total = sourcePaths.length

    for (const sourcePath of sourcePaths) {
      try {
        const stat = await fs.stat(sourcePath)
        if (stat.isDirectory()) {
          const subResult = await this.importDirectory(sourcePath, targetDir, options, depth)
          result.imported.push(...subResult.imported)
          result.converted.push(...subResult.converted)
          result.skipped.push(...subResult.skipped)
          result.failed.push(...subResult.failed)
        } else if (stat.isSymbolicLink()) {
          /* [W2-FIX] Skip symbolic links to prevent directory traversal outside workspace */
          result.skipped.push({
            sourcePath,
            destPath: '',
            action: 'skipped',
            sourceType: this.extractExtension(sourcePath),
            error: 'Symbolic links are not supported',
          })
        } else {
          const fileResult = await this.importSingleFile(sourcePath, targetDir, options, stat.size)
          this.categorizeResult(result, fileResult)
        }
      } catch (error) {
        result.failed.push({
          sourcePath,
          destPath: '',
          action: 'failed',
          sourceType: this.extractExtension(sourcePath),
          error: error instanceof Error ? error.message : String(error),
        })
      }

      processed++
      options.onProgress?.(processed, total, path.basename(sourcePath))
    }

    const durationMs = Date.now() - startTime
    const finalResult: ImportResult = {
      imported: result.imported,
      converted: result.converted,
      skipped: result.skipped,
      failed: result.failed,
      durationMs,
    }

    logger.info('[ImportManager] Import completed', {
      imported: result.imported.length,
      converted: result.converted.length,
      skipped: result.skipped.length,
      failed: result.failed.length,
      durationMs,
    })

    return finalResult
  }

  /**
   * Check if a file name has a supported import extension.
   */
  isSupportedFile(fileName: string): boolean {
    const ext = path.extname(fileName).toLowerCase()
    return SUPPORTED_EXTENSIONS.includes(ext)
  }

  /**
   * Import a single file based on its extension.
   */
  private async importSingleFile(
    sourcePath: string,
    targetDir: string,
    options: InternalImportOptions,
    knownSize?: number
  ): Promise<ImportFileResult> {
    const ext = path.extname(sourcePath).toLowerCase() as ImportableFileType

    if (!this.isSupportedFile(sourcePath)) {
      return {
        sourcePath,
        destPath: '',
        action: 'skipped',
        sourceType: ext,
        error: `Unsupported file type: ${ext}`,
      }
    }

    /* [W1-FIX] Reuse stat from caller when available to avoid redundant I/O */
    const stat = knownSize !== undefined
      ? { size: knownSize } as { size: number }
      : await fs.stat(sourcePath)
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      return {
        sourcePath,
        destPath: '',
        action: 'failed',
        sourceType: ext,
        error: `File exceeds 10MB limit (${(stat.size / 1024 / 1024).toFixed(1)}MB)`,
      }
    }

    const fileName = path.basename(sourcePath)
    const destPath = path.join(targetDir, fileName)

    if (!options.overwrite) {
      const exists = await this.fileManager.exists(destPath)
      if (exists) {
        return {
          sourcePath,
          destPath,
          action: 'skipped',
          sourceType: ext,
          error: 'File already exists in workspace',
        }
      }
    }

    switch (ext) {
      case '.md':
      case '.txt':
      case '.csv':
        return this.importMarkdown(sourcePath, targetDir)
      case '.docx':
        return this.convertWordToMarkdown(sourcePath, targetDir)
      case '.pdf':
        return this.convertPdfToMarkdown(sourcePath, targetDir)
      default:
        return {
          sourcePath,
          destPath: '',
          action: 'skipped',
          sourceType: ext,
          error: `Unsupported file type: ${ext}`,
        }
    }
  }

  /**
   * Directly copy a Markdown/text/CSV file into the workspace.
   */
  private async importMarkdown(
    sourcePath: string,
    targetDir: string
  ): Promise<ImportFileResult> {
    const fileName = path.basename(sourcePath)
    const destPath = path.join(targetDir, fileName)
    const content = await fs.readFile(sourcePath, 'utf-8')

    await this.fileManager.writeFile(destPath, content)

    return {
      sourcePath,
      destPath,
      action: 'copied',
      sourceType: path.extname(sourcePath).toLowerCase() as ImportableFileType,
    }
  }

  /**
   * Convert a Word (.docx) file to Markdown using mammoth.
   */
  private async convertWordToMarkdown(
    sourcePath: string,
    targetDir: string
  ): Promise<ImportFileResult> {
    const fileName = path.basename(sourcePath, '.docx') + '.md'
    const destPath = path.join(targetDir, fileName)

    const result = await mammoth.convertToMarkdown({ path: sourcePath })

    if (result.messages.length > 0) {
      logger.warn('[ImportManager] Word conversion warnings', {
        sourcePath,
        warnings: result.messages.map((m) => m.message),
      })
    }

    await this.fileManager.writeFile(destPath, result.value)

    return {
      sourcePath,
      destPath,
      action: 'converted',
      sourceType: '.docx',
    }
  }

  /**
   * Extract text from a PDF file using pdf-parse (lossy conversion).
   */
  private async convertPdfToMarkdown(
    sourcePath: string,
    targetDir: string
  ): Promise<ImportFileResult> {
    const fileName = path.basename(sourcePath, '.pdf') + '.md'
    const destPath = path.join(targetDir, fileName)

    const dataBuffer = await fs.readFile(sourcePath)
    const data = await pdfParse(dataBuffer)

    const markdown = [
      `# ${path.basename(sourcePath, '.pdf')}`,
      '',
      `> 从 PDF 文件导入。原始文件：${path.basename(sourcePath)}`,
      '',
      data.text,
    ].join('\n')

    await this.fileManager.writeFile(destPath, markdown)

    return {
      sourcePath,
      destPath,
      action: 'converted',
      sourceType: '.pdf',
    }
  }

  /**
   * Recursively import all supported files from a directory.
   * Preserves original folder structure unless flatten is enabled.
   */
  private async importDirectory(
    dirPath: string,
    targetDir: string,
    options: InternalImportOptions,
    parentDepth: number
  ): Promise<ImportResult> {
    const dirName = path.basename(dirPath)
    const newTargetDir = options.flatten ? targetDir : path.join(targetDir, dirName)

    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const filePaths: string[] = []

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        filePaths.push(fullPath)
      } else if (entry.isSymbolicLink()) {
        /* [W2-FIX] Skip symbolic links */
        continue
      } else if (this.isSupportedFile(entry.name)) {
        filePaths.push(fullPath)
      }
    }

    return this.importFiles(filePaths, { ...options, targetDir: newTargetDir }, parentDepth + 1)
  }

  /**
   * Categorize a single file result into the appropriate accumulator bucket.
   */
  private categorizeResult(acc: ImportResultAccumulator, fileResult: ImportFileResult): void {
    switch (fileResult.action) {
      case 'copied':
        acc.imported.push(fileResult)
        break
      case 'converted':
        acc.converted.push(fileResult)
        break
      case 'skipped':
        acc.skipped.push(fileResult)
        break
      case 'failed':
        acc.failed.push(fileResult)
        break
    }
  }

  /**
   * Safely extract file extension, defaulting to '.md' if none found.
   */
  private extractExtension(filePath: string): ImportableFileType {
    const ext = path.extname(filePath).toLowerCase()
    if (SUPPORTED_EXTENSIONS.includes(ext)) {
      return ext as ImportableFileType
    }
    return '.md'
  }
}
