import { clipboard } from 'electron'
import type { IpcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/types'
import type { ConversationExporter } from '../../services/export/conversation-exporter'
import type { ExportOptions } from '../../services/export/types'
import { logger } from '../../utils/logger'
import path from 'path'

const ALLOWED_FORMATS = ['markdown', 'html', 'plain-text', 'json'] as const
type AllowedFormat = typeof ALLOWED_FORMATS[number]

function sanitizeFormat(raw: string): AllowedFormat {
  if ((ALLOWED_FORMATS as readonly string[]).includes(raw)) return raw as AllowedFormat
  return 'markdown'
}

function isPathWithinWorkspace(targetPath: string, workspacePath: string): boolean {
  const resolved = path.resolve(targetPath)
  const resolvedWorkspace = path.resolve(workspacePath)
  return resolved.startsWith(resolvedWorkspace + path.sep) || resolved === resolvedWorkspace
}

export function registerExportHandlers(
  ipcMain: IpcMain,
  conversationExporter: ConversationExporter,
  getWorkspacePath: () => string,
): () => void {
  const channels = [
    IPC_CHANNELS.EXPORT_PREVIEW,
    IPC_CHANNELS.EXPORT_EXECUTE,
    IPC_CHANNELS.EXPORT_COPY_CLIPBOARD,
  ]

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_PREVIEW,
    async (_event, conversationId: string, options: ExportOptions) => {
      try {
        logger.info('[ExportHandler] preview', { conversationId, format: options.format })
        return await conversationExporter.preview(conversationId, options)
      } catch (error) {
        logger.error('[ExportHandler] preview failed', {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_EXECUTE,
    async (_event, conversationId: string, options: ExportOptions) => {
      try {
        if (options.targetPath) {
          const workspacePath = getWorkspacePath()
          if (!isPathWithinWorkspace(options.targetPath, workspacePath)) {
            throw new Error('Target path must be within the workspace directory')
          }
        }
        logger.info('[ExportHandler] execute', { conversationId, format: options.format, targetPath: options.targetPath })
        await conversationExporter.execute(conversationId, options)
      } catch (error) {
        logger.error('[ExportHandler] execute failed', {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.EXPORT_COPY_CLIPBOARD,
    async (_event, messageIds: string[], format: string) => {
      try {
        const safeFormat = sanitizeFormat(format)
        logger.info('[ExportHandler] copyToClipboard', { messageCount: messageIds.length, format: safeFormat })
        const text = await conversationExporter.copyToClipboard(messageIds, safeFormat)
        clipboard.writeText(text)
        return text
      } catch (error) {
        logger.error('[ExportHandler] copyToClipboard failed', {
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  return () => {
    for (const ch of channels) {
      ipcMain.removeHandler(ch)
    }
  }
}
