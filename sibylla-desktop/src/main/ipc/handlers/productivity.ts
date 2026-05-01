import type { ProductivityAnalyzer } from '../../services/productivity/productivity-analyzer'
import type { AnalyzeOptions } from '../../services/productivity/types'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'

export function registerProductivityHandlers(
  ipcMainInstance: Electron.IpcMain,
  productivityAnalyzer: ProductivityAnalyzer,
): () => void {
  ipcMainInstance.handle(
    IPC_CHANNELS.PRODUCTIVITY_ANALYZE,
    async (_event, period: string, memberId?: string, viewerId?: string) => {
      try {
        const opts: AnalyzeOptions = {
          period: period as 'week' | 'month' | 'quarter',
          memberId,
          viewerId: viewerId ?? 'unknown',
        }
        return await productivityAnalyzer.analyze(opts)
      } catch (error) {
        logger.error('productivity.analyze.error', {
          period,
          memberId,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.PRODUCTIVITY_QUERY,
    async (_event, period: string, memberId?: string, viewerId?: string) => {
      try {
        const opts: AnalyzeOptions = {
          period: period as 'week' | 'month' | 'quarter',
          memberId,
          viewerId: viewerId ?? 'unknown',
        }
        return productivityAnalyzer.queryCached(opts)
      } catch (error) {
        logger.error('productivity.query.error', {
          period,
          memberId,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  return () => {
    ipcMainInstance.removeHandler(IPC_CHANNELS.PRODUCTIVITY_ANALYZE)
    ipcMainInstance.removeHandler(IPC_CHANNELS.PRODUCTIVITY_QUERY)
  }
}
