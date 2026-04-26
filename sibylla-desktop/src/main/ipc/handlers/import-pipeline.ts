/**
 * Import Pipeline IPC Handler
 *
 * Registers 8 IPC channels for the import pipeline:
 * plan, execute, cancel, pause, resume, progress, history, rollback.
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import type { ImportRegistry } from '../../services/import/import-registry'
import type { ImportHistoryManager } from '../../services/import/import-history-manager'
import type { FileManager } from '../../services/file-manager'
import type { GitAbstraction } from '../../services/git-abstraction'
import type {
  ImportPipelineOptions,
  ImportProgress,
  ClassificationResult,
} from '../../services/import/types'
import type { ClassificationResultShared } from '../../../shared/types'
import { ImportPipeline } from '../../services/import/import-pipeline'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'

const CLASSIFICATION_TIMEOUT_MS = 30000

type ClassificationResolver = {
  resolve: (result: ClassificationResult) => void
  timer: ReturnType<typeof setTimeout>
}

export class ImportPipelineHandler extends IpcHandler {
  readonly namespace = 'import-pipeline'
  private activePipeline: ImportPipeline | null = null
  private pendingClassifications = new Map<string, ClassificationResolver>()

  constructor(
    private readonly registry: ImportRegistry,
    private readonly fileManager: FileManager,
    private readonly historyManager: ImportHistoryManager,
    private readonly gitAbstraction: GitAbstraction
  ) {
    super()
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.FILE_IMPORT_PLAN,
      this.safeHandle(this.handlePlan.bind(this))
    )
    ipcMain.handle(
      IPC_CHANNELS.FILE_IMPORT_EXECUTE,
      this.safeHandle(this.handleExecute.bind(this))
    )
    ipcMain.handle(
      IPC_CHANNELS.FILE_IMPORT_CANCEL,
      this.safeHandle(this.handleCancel.bind(this))
    )
    ipcMain.handle(
      IPC_CHANNELS.FILE_IMPORT_PAUSE,
      this.safeHandle(this.handlePause.bind(this))
    )
    ipcMain.handle(
      IPC_CHANNELS.FILE_IMPORT_RESUME,
      this.safeHandle(this.handleResume.bind(this))
    )
    ipcMain.handle(
      IPC_CHANNELS.FILE_IMPORT_HISTORY,
      this.safeHandle(this.handleHistory.bind(this))
    )
    ipcMain.handle(
      IPC_CHANNELS.FILE_IMPORT_ROLLBACK,
      this.safeHandle(this.handleRollback.bind(this))
    )

    ipcMain.handle(
      IPC_CHANNELS.FILE_IMPORT_CONFIRM_CLASSIFICATION,
      this.safeHandle(this.handleConfirmClassification.bind(this))
    )

    logger.info('[ImportPipelineHandler] All handlers registered')
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.FILE_IMPORT_PLAN)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_IMPORT_EXECUTE)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_IMPORT_CANCEL)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_IMPORT_PAUSE)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_IMPORT_RESUME)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_IMPORT_HISTORY)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_IMPORT_ROLLBACK)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_IMPORT_CONFIRM_CLASSIFICATION)

    for (const [, resolver] of this.pendingClassifications) {
      clearTimeout(resolver.timer)
      resolver.resolve({
        category: 'unknown',
        targetPath: 'imports/untriaged/',
        confidence: 0,
        tags: [],
      })
    }
    this.pendingClassifications.clear()
    super.cleanup()
  }

  private async handlePlan(
    _event: IpcMainInvokeEvent,
    input: string
  ) {
    const adapter = await this.registry.detectAdapter(input)
    if (!adapter) {
      throw new Error(`No adapter found for input: ${input}`)
    }
    return await adapter.scan(input)
  }

  private async handleExecute(
    _event: IpcMainInvokeEvent,
    input: string,
    options?: ImportPipelineOptions
  ) {
    const importId = options?.importId ?? `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const defaultOptions: ImportPipelineOptions = {
      targetDir: options?.targetDir ?? 'imports',
      conflictStrategy: options?.conflictStrategy ?? 'skip',
      preserveStructure: options?.preserveStructure ?? true,
      importId,
      enableOcr: options?.enableOcr ?? true,
      enableClassification: options?.enableClassification ?? true,
    }

    const classificationHandler = async (classification: ClassificationResult): Promise<ClassificationResult> => {
      return this.waitForClassificationConfirmation(importId, classification)
    }

    const pipeline = new ImportPipeline(
      this.registry,
      this.fileManager,
      this.historyManager,
      this.gitAbstraction,
      (progress: ImportProgress) => {
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send(
              IPC_CHANNELS.FILE_IMPORT_PIPELINE_PROGRESS,
              progress
            )
          }
        })
      }
    )

    this.activePipeline = pipeline
    try {
      return await pipeline.run(input, {
        ...defaultOptions,
        classificationHandler,
      })
    } finally {
      this.activePipeline = null
    }
  }

  private async handleCancel() {
    if (!this.activePipeline) {
      throw new Error('No active import to cancel')
    }
    await this.activePipeline.cancel()
  }

  private async handlePause() {
    if (!this.activePipeline) {
      throw new Error('No active import to pause')
    }
    this.activePipeline.pause()
  }

  private async handleResume() {
    if (!this.activePipeline) {
      throw new Error('No active import to resume')
    }
    this.activePipeline.resume()
  }

  private async handleHistory() {
    return await this.historyManager.listHistory()
  }

  private async handleRollback(
    _event: IpcMainInvokeEvent,
    importId: string,
    options?: { skipAgeWarning?: boolean }
  ) {
    return await this.historyManager.rollback(importId, options)
  }

  private async handleConfirmClassification(
    _event: IpcMainInvokeEvent,
    importId: string,
    result: ClassificationResultShared
  ) {
    const resolver = this.pendingClassifications.get(importId)
    if (!resolver) {
      logger.warn('[ImportPipelineHandler] No pending classification for importId', { importId })
      return
    }

    clearTimeout(resolver.timer)
    this.pendingClassifications.delete(importId)

    const classification: ClassificationResult = {
      category: result.category,
      targetPath: result.targetPath,
      confidence: result.confidence,
      tags: [...result.tags],
    }
    resolver.resolve(classification)
  }

  private waitForClassificationConfirmation(
    importId: string,
    classification: ClassificationResult
  ): Promise<ClassificationResult> {
    return new Promise<ClassificationResult>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingClassifications.delete(importId)
        logger.info('[ImportPipelineHandler] Classification confirmation timed out, using AI suggestion', { importId })
        resolve(classification)
      }, CLASSIFICATION_TIMEOUT_MS)

      this.pendingClassifications.set(importId, { resolve, timer })

      BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.FILE_IMPORT_CLASSIFICATION, {
            importId,
            classification,
            fileName: classification.targetPath.split('/').pop() ?? '',
          })
        }
      })
    })
  }
}
