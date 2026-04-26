/**
 * Import Pipeline
 *
 * Three-stage pipeline (scan → transform → write) for importing content
 * from external platforms into the Sibylla workspace. Supports pause/resume/cancel
 * and streams items via AsyncIterable for memory efficiency.
 */

import * as path from 'path'
import type {
  ImportAdapter,
  ImportPlan,
  ImportItem,
  ImportPipelineOptions,
  ImportPipelineResult,
  ImportProgress,
  ImportError,
  PipelineState,
  PipelineStage,
} from './types'
import type { ImportRegistry } from './import-registry'
import type { FileManager } from '../file-manager'
import type { ImportHistoryManager } from './import-history-manager'
import type { GitAbstraction } from '../git-abstraction'
import { copyAssets, rewriteImagePaths } from './asset-handler'
import { logger } from '../../utils/logger'

const LOG_PREFIX = '[ImportPipeline]'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class ImportPipeline {
  private state: PipelineState = 'idle'
  private paused = false
  private abortController = new AbortController()
  private currentAdapter: ImportAdapter | null = null

  constructor(
    private readonly registry: ImportRegistry,
    private readonly fileManager: FileManager,
    private readonly historyManager: ImportHistoryManager,
    _gitAbstraction: GitAbstraction,
    private readonly onProgress?: (progress: ImportProgress) => void
  ) {
    void _gitAbstraction
  }

  async run(
    input: string,
    options: ImportPipelineOptions
  ): Promise<ImportPipelineResult> {
    const startTime = Date.now()
    this.state = 'idle'
    this.paused = false
    if (this.abortController && !this.abortController.signal.aborted) {
      this.abortController.abort()
    }
    this.abortController = new AbortController()

    const errors: ImportError[] = []
    let importedFiles = 0
    let importedImages = 0
    let skippedFiles = 0

    try {
      // ── Stage 1: Scan ────────────────────────────────────────
      this.state = 'scanning'
      this.pushProgress(0, 0, input, 'scanning')

      const adapter = await this.registry.detectAdapter(input)
      if (!adapter) {
        throw new Error(`No adapter found for input: ${input}`)
      }
      this.currentAdapter = adapter

      const plan = await adapter.scan(input)
      this.pushProgress(0, plan.totalFiles, input, 'scanning')

      logger.info(`${LOG_PREFIX} Scan complete`, {
        sourceFormat: plan.sourceFormat,
        totalFiles: plan.totalFiles,
        totalImages: plan.totalImages,
      })

      // ── Stage 2+3: Transform + Write (streamed) ─────────────
      this.state = 'transforming'

      for await (const item of adapter.transform(plan, options)) {
        while (this.paused && !this.abortController.signal.aborted) {
          await sleep(100)
        }

        if (this.abortController.signal.aborted) {
          break
        }

        try {
          const writeResult = await this.writeItem(item, options)
          if (writeResult === 'skipped') {
            skippedFiles++
          } else {
            importedFiles++
            importedImages += item.attachments.length
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          errors.push({
            filePath: item.targetPath,
            type: 'write_failed',
            message: msg,
          })
          logger.warn(`${LOG_PREFIX} Failed to write item`, {
            targetPath: item.targetPath,
            error: msg,
          })
        }

        this.pushProgress(
          importedFiles + skippedFiles + errors.length,
          plan.totalFiles,
          item.targetPath,
          'writing'
        )
      }

      // ── Finalize ─────────────────────────────────────────────
      if (this.abortController.signal.aborted) {
        this.state = 'cancelled'
      } else {
        this.state = 'completed'
      }
    } catch (error) {
      this.state = 'failed'
      const msg = error instanceof Error ? error.message : String(error)
      errors.push({
        filePath: input,
        type: 'conversion_failed',
        message: msg,
      })
      logger.error(`${LOG_PREFIX} Pipeline failed`, { error: msg })
    }

    const durationMs = Date.now() - startTime
    const result: ImportPipelineResult = {
      importedFiles,
      importedImages,
      skippedFiles,
      errors,
      durationMs,
      importId: options.importId,
    }

    if (this.state === 'completed' && importedFiles > 0) {
      try {
        await this.historyManager.record(result, { sourceFormat: this.currentAdapter?.name ?? 'unknown', sourcePath: input, totalFiles: importedFiles, totalImages: importedImages, warnings: [], estimatedDurationMs: durationMs, entries: [], id: options.importId } as ImportPlan)
      } catch (recordError) {
        logger.warn(`${LOG_PREFIX} Failed to record import history`, {
          error: recordError instanceof Error ? recordError.message : String(recordError),
        })
      }
    }

    this.pushProgress(importedFiles, importedFiles + skippedFiles, '', this.state as PipelineStage)
    logger.info(`${LOG_PREFIX} Pipeline finished`, {
      state: this.state,
      importedFiles,
      skippedFiles,
      errors: errors.length,
      durationMs,
    })

    return result
  }

  private async writeItem(
    item: ImportItem,
    options: ImportPipelineOptions
  ): Promise<'written' | 'skipped'> {
    const targetPath = path.join(options.targetDir, item.targetPath)

    if (options.conflictStrategy === 'skip') {
      const exists = await this.fileManager.exists(targetPath)
      if (exists) {
        return 'skipped'
      }
    }

    let content = item.content

    if (item.attachments.length > 0) {
      const workspaceRoot = this.fileManager.getWorkspaceRoot()
      const fullTargetDir = path.join(workspaceRoot, options.targetDir)
      const assetResult = await copyAssets(item.attachments, fullTargetDir, options.importId)
      content = rewriteImagePaths(content, options.importId, assetResult.pathMapping)
    }

    await this.fileManager.writeFile(targetPath, content)
    return 'written'
  }

  pause(): void {
    this.paused = true
    logger.info(`${LOG_PREFIX} Pipeline paused`)
  }

  resume(): void {
    this.paused = false
    logger.info(`${LOG_PREFIX} Pipeline resumed`)
  }

  async cancel(): Promise<void> {
    this.abortController.abort()
    logger.info(`${LOG_PREFIX} Pipeline cancelled, initiating rollback`)
    try {
      await this.historyManager.rollbackLatest()
    } catch (error) {
      logger.warn(`${LOG_PREFIX} Rollback failed after cancel`, {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  getState(): PipelineState {
    return this.state
  }

  private pushProgress(
    current: number,
    total: number,
    currentFile: string,
    stage: PipelineStage
  ): void {
    this.onProgress?.({ current, total, currentFile, stage })
  }
}
