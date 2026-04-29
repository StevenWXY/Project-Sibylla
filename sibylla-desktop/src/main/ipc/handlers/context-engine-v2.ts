import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/types'
import type { ContextEngine } from '../../services/context-engine'
import type { ContextAssemblyRequestV2, AssembledContextV2 } from '../../services/context-engine/types-v2'
import { logger } from '../../utils/logger'

export function registerContextEngineV2Handlers(contextEngine: ContextEngine): void {
  ipcMain.handle(
    IPC_CHANNELS.CONTEXT_ENGINE_V2_PREVIEW,
    async (_event, request: ContextAssemblyRequestV2): Promise<AssembledContextV2> => {
      try {
        const result = await contextEngine.assembleContextV2(request)
        logger.info('[ContextEngineV2] Preview assembled', {
          layers: result.layers.length,
          totalTokens: result.totalTokens,
          warnings: result.warnings.length,
        })
        return result
      } catch (err) {
        logger.error('[ContextEngineV2] Preview failed', {
          error: err instanceof Error ? err.message : String(err),
        })
        throw err
      }
    },
  )
}
