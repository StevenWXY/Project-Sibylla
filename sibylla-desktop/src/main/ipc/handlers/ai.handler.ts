import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import { logger } from '../../utils/logger'
import { AiGatewayClient } from '../../services/ai-gateway-client'
import { MemoryManager } from '../../services/memory-manager'
import { LocalRagEngine, type LocalRagSearchHit } from '../../services/local-rag-engine'
import { TokenStorage } from '../../services/token-storage'
import { WorkspaceManager } from '../../services/workspace-manager'
import type {
  AIChatRequest,
  AIChatResponse,
  AIEmbedRequest,
  AIEmbedResponse,
  WorkspaceInfo,
} from '../../../shared/types'

export class AIHandler extends IpcHandler {
  readonly namespace = 'ai'

  constructor(
    private readonly gatewayClient: AiGatewayClient,
    private readonly memoryManager: MemoryManager,
    private readonly ragEngine: LocalRagEngine,
    private readonly tokenStorage: TokenStorage,
    private readonly workspaceManager: WorkspaceManager
  ) {
    super()
  }

  register(): void {
    ipcMain.handle(IPC_CHANNELS.AI_CHAT, this.safeHandle(this.chat.bind(this)))
    ipcMain.handle(IPC_CHANNELS.AI_STREAM, this.safeHandle(this.stream.bind(this)))
    ipcMain.handle(IPC_CHANNELS.AI_EMBED, this.safeHandle(this.embed.bind(this)))
    logger.info('[AIHandler] All handlers registered')
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.AI_CHAT)
    ipcMain.removeHandler(IPC_CHANNELS.AI_STREAM)
    ipcMain.removeHandler(IPC_CHANNELS.AI_EMBED)
    super.cleanup()
  }

  private async chat(_event: IpcMainInvokeEvent, input: AIChatRequest | string): Promise<AIChatResponse> {
    return this.handleChatLikeRequest(input, false)
  }

  private async stream(
    _event: IpcMainInvokeEvent,
    input: AIChatRequest | string
  ): Promise<AIChatResponse> {
    return this.handleChatLikeRequest(input, true)
  }

  private async embed(
    _event: IpcMainInvokeEvent,
    input: AIEmbedRequest | string
  ): Promise<AIEmbedResponse> {
    const workspace = this.ensureWorkspaceServices()
    const request: AIEmbedRequest = typeof input === 'string' ? { text: input } : input
    const dimensions = request.dimensions ?? 128
    const vector = this.ragEngine.createEmbedding(request.text, dimensions)

    await this.memoryManager.appendLog({
      type: 'system',
      operator: 'ai',
      sessionId: 'embedding',
      summary: 'Local embedding generated',
      details: [
        `workspace=${workspace.config.workspaceId}`,
        `dimensions=${dimensions}`,
        `textLength=${request.text.length}`,
      ],
      tags: ['ai', 'embedding'],
    })

    return {
      model: 'local-hash-embedding-v1',
      vector,
    }
  }

  private async handleChatLikeRequest(
    input: AIChatRequest | string,
    streamMode: boolean
  ): Promise<AIChatResponse> {
    const workspace = this.ensureWorkspaceServices()
    const request = this.normalizeRequest(input)
    const sessionId = request.sessionId ?? `ai-session-${Date.now()}`
    const model = request.model ?? workspace.config.defaultModel
    const useRag = request.useRag ?? true
    const contextWindowTokens = request.contextWindowTokens ?? 16000
    const currentSessionUsage = request.sessionTokenUsage ?? 0

    await this.memoryManager.appendLog({
      type: 'user-interaction',
      operator: 'user',
      sessionId,
      summary: request.message.slice(0, 120),
      details: [
        `streamMode=${streamMode}`,
        `model=${model}`,
        `workspace=${workspace.config.workspaceId}`,
      ],
      tags: ['ai', 'chat', 'input'],
    })

    const ragHits = useRag ? await this.queryRagSafely(request.message) : []
    const memorySnapshot = await this.memoryManager.getMemorySnapshot()
    const compactMemoryContext = memorySnapshot.content.slice(0, 5000)
    const ragContext = ragHits
      .map((hit, index) => `[${index + 1}] ${hit.path}\n${hit.snippet}`)
      .join('\n\n')

    const systemSegments = [
      '你是 Sibylla 团队协作助手。回答要直接、可执行、中文优先。',
      '请在必要时引用上下文，不要伪造不存在的文件。',
      `当前 MEMORY 摘要（截断）:\n${compactMemoryContext}`,
    ]
    if (ragContext.length > 0) {
      systemSegments.push(`本地 RAG 命中上下文:\n${ragContext}`)
    }

    const accessToken = this.tokenStorage.getAccessToken() ?? undefined
    const gatewayResponse = await this.gatewayClient.chat(
      {
        model,
        stream: streamMode,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        messages: [
          {
            role: 'system',
            content: systemSegments.join('\n\n'),
          },
          {
            role: 'user',
            content: request.message,
          },
        ],
      },
      accessToken
    )

    await this.memoryManager.appendLog({
      type: 'user-interaction',
      operator: 'ai',
      sessionId,
      summary: gatewayResponse.content.slice(0, 120),
      details: [
        `provider=${gatewayResponse.provider}`,
        `model=${gatewayResponse.model}`,
        `totalTokens=${gatewayResponse.usage.totalTokens}`,
        `ragHits=${ragHits.length}`,
      ],
      tags: ['ai', 'chat', 'output'],
      relatedFiles: ragHits.map((hit) => hit.path),
    })

    const flushResult = await this.memoryManager.flushIfNeeded(
      currentSessionUsage + gatewayResponse.usage.totalTokens,
      contextWindowTokens,
      [
        `最近用户问题: ${request.message.slice(0, 120)}`,
        `最近 AI 响应: ${gatewayResponse.content.slice(0, 120)}`,
      ]
    )

    return {
      id: gatewayResponse.id,
      model: gatewayResponse.model,
      provider: gatewayResponse.provider,
      content: gatewayResponse.content,
      usage: gatewayResponse.usage,
      intercepted: gatewayResponse.intercepted,
      warnings: gatewayResponse.warnings,
      ragHits: ragHits.map((hit) => ({
        path: hit.path,
        score: hit.score,
        snippet: hit.snippet,
      })),
      memory: {
        tokenCount: flushResult.snapshot.tokenCount,
        tokenDebt: flushResult.snapshot.tokenDebt,
        flushTriggered: flushResult.triggered,
      },
    }
  }

  private normalizeRequest(input: AIChatRequest | string): AIChatRequest {
    if (typeof input === 'string') {
      return {
        message: input,
      }
    }
    return input
  }

  private async queryRagSafely(query: string): Promise<LocalRagSearchHit[]> {
    try {
      return await this.ragEngine.search(query, { limit: 5 })
    } catch (error) {
      logger.warn('[AIHandler] RAG search failed, fallback to empty results', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  private ensureWorkspaceServices(): WorkspaceInfo {
    const workspace = this.workspaceManager.getCurrentWorkspace()
    const workspacePath = this.workspaceManager.getWorkspacePath()
    if (!workspace || !workspacePath) {
      throw new Error('Please open a workspace before using AI features')
    }

    this.memoryManager.setWorkspacePath(workspacePath)
    this.ragEngine.setWorkspacePath(workspacePath)
    return workspace
  }
}
