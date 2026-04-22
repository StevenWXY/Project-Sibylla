import type { IpcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../../shared/types'
import type { ConfiguredModelShared, ModelSwitchedEventShared } from '../../../shared/types'
import type { Tracer } from '../../services/trace/tracer'
import type { AppEventBus } from '../../services/event-bus'
import { logger } from '../../utils/logger'

interface ModelConfig {
  id: string
  displayName: string
  provider: string
  costTier: 'low' | 'medium' | 'high'
}

const AVAILABLE_MODELS: ModelConfig[] = [
  { id: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', provider: 'anthropic', costTier: 'medium' },
  { id: 'gpt-4o', displayName: 'GPT-4o', provider: 'openai', costTier: 'medium' },
  { id: 'gpt-4o-mini', displayName: 'GPT-4o Mini', provider: 'openai', costTier: 'low' },
  { id: 'claude-haiku-3-20240307', displayName: 'Claude 3 Haiku', provider: 'anthropic', costTier: 'low' },
]

const MODEL_ID_SET = new Set(AVAILABLE_MODELS.map(m => m.id))
const MAX_CONVERSATION_CACHE = 500

const channels = [
  IPC_CHANNELS.MODEL_GET_CURRENT,
  IPC_CHANNELS.MODEL_GET_AVAILABLE,
  IPC_CHANNELS.MODEL_SWITCH,
  IPC_CHANNELS.MODEL_GET_STATUS,
]

export function registerModelHandlers(
  ipcMain: IpcMain,
  tracer: Tracer,
  eventBus: AppEventBus,
  getWindow: () => BrowserWindow | null,
  defaultModel: string,
): () => void {
  const conversationModels = new Map<string, string>()

  ipcMain.handle(
    IPC_CHANNELS.MODEL_GET_CURRENT,
    async (_event, conversationId: string) => {
      return conversationModels.get(conversationId) ?? defaultModel
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.MODEL_GET_AVAILABLE,
    async () => {
      return AVAILABLE_MODELS.map((m): ConfiguredModelShared => ({
        id: m.id,
        displayName: m.displayName,
        provider: m.provider,
        available: true,
        costTier: m.costTier,
        isRateLimited: false,
      }))
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.MODEL_SWITCH,
    async (_event, conversationId: string, modelId: string) => {
      if (!MODEL_ID_SET.has(modelId)) {
        logger.warn('[ModelHandler] Rejected unknown modelId', { modelId })
        throw new Error(`Unknown model: ${modelId}`)
      }
      await tracer.withSpan('model.switch', async (span) => {
        const oldModel = conversationModels.get(conversationId) ?? defaultModel
        conversationModels.set(conversationId, modelId)

        if (conversationModels.size > MAX_CONVERSATION_CACHE) {
          const firstKey = conversationModels.keys().next().value
          if (firstKey != null) conversationModels.delete(firstKey)
        }

        span.setAttribute('model.old', oldModel)
        span.setAttribute('model.new', modelId)
        span.setAttribute('model.conversation_id', conversationId)

        const payload: ModelSwitchedEventShared = {
          conversationId,
          oldModel,
          newModel: modelId,
        }

        eventBus.emit('model:switched', payload)

        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) {
            window.webContents.send(IPC_CHANNELS.MODEL_SWITCHED, payload)
          }
        }

        logger.info('[ModelHandler] model switched', { conversationId, oldModel, newModel: modelId })
      }, { kind: 'user-action' })
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.MODEL_GET_STATUS,
    async (_event, modelId: string) => {
      const model = AVAILABLE_MODELS.find((m) => m.id === modelId)
      if (!model) {
        return {
          id: modelId,
          displayName: modelId,
          provider: 'unknown',
          available: false,
          unavailableReason: 'Model not configured',
          costTier: 'medium' as const,
          isRateLimited: false,
        } satisfies ConfiguredModelShared
      }
      return {
        id: model.id,
        displayName: model.displayName,
        provider: model.provider,
        available: true,
        costTier: model.costTier,
        isRateLimited: false,
      } satisfies ConfiguredModelShared
    },
  )

  return () => {
    for (const ch of channels) {
      ipcMain.removeHandler(ch)
    }
  }
}
