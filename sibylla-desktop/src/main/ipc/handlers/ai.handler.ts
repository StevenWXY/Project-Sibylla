import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type {
  AIChatRequest,
  AIChatResponse,
  AIEmbedRequest,
  AIEmbedResponse,
  AIStreamRequest,
  AIStreamChunk,
  AIStreamEnd,
  AIStreamError,
  ContextFileInfo,
  SkillSearchParams,
  SkillSummary,
  WorkspaceInfo,
  DegradationWarning,
} from '../../../shared/types'
import { logger } from '../../utils/logger'
import { AiGatewayClient } from '../../services/ai-gateway-client'
import { MemoryManager } from '../../services/memory-manager'
import { LocalRagEngine, type LocalRagSearchHit } from '../../services/local-rag-engine'
import { TokenStorage } from '../../services/token-storage'
import { WorkspaceManager } from '../../services/workspace-manager'
import { FileManager } from '../../services/file-manager'
import { ContextEngine, type ContextAssemblyRequest } from '../../services/context-engine'
import { SkillEngine } from '../../services/skill-engine'
import type { HarnessOrchestrator } from '../../services/harness/orchestrator'

type StreamErrorCode = AIStreamError['code']

export class AIHandler extends IpcHandler {
  readonly namespace = 'ai'
  private readonly activeStreams = new Map<string, AbortController>()
  private readonly contextEngine: ContextEngine
  private readonly skillEngine: SkillEngine
  private streamListener: ((...args: unknown[]) => void) | null = null
  private abortListener: ((...args: unknown[]) => void) | null = null
  private harnessOrchestrator: HarnessOrchestrator | null = null

  constructor(
    private readonly gatewayClient: AiGatewayClient,
    private readonly memoryManager: MemoryManager,
    private readonly ragEngine: LocalRagEngine,
    private readonly tokenStorage: TokenStorage,
    private readonly workspaceManager: WorkspaceManager,
    private readonly fileManager: FileManager
  ) {
    super()
    this.skillEngine = new SkillEngine(fileManager)
    this.contextEngine = new ContextEngine(fileManager, memoryManager, this.skillEngine)
  }

  setHarnessOrchestrator(orchestrator: HarnessOrchestrator): void {
    this.harnessOrchestrator = orchestrator
  }

  register(): void {
    ipcMain.handle(IPC_CHANNELS.AI_CHAT, this.safeHandle(this.chat.bind(this)))
    this.streamListener = (event: Electron.IpcMainEvent, input: unknown) => {
      this.handleStream(event, input).catch((err) => {
        logger.error('[AIHandler] Unhandled stream error', {
          error: err instanceof Error ? err.message : String(err),
        })
      })
    }
    this.abortListener = (_event: Electron.IpcMainEvent, streamId: string) => {
      this.handleStreamAbort(_event, streamId)
    }
    ipcMain.on(IPC_CHANNELS.AI_STREAM, this.streamListener)
    ipcMain.on(IPC_CHANNELS.AI_STREAM_ABORT, this.abortListener)
    ipcMain.handle(IPC_CHANNELS.AI_EMBED, this.safeHandle(this.embed.bind(this)))
    ipcMain.handle(IPC_CHANNELS.AI_CONTEXT_FILES, this.safeHandle(this.handleContextFiles.bind(this)))
    ipcMain.handle(IPC_CHANNELS.AI_SKILL_LIST, this.safeHandle(this.handleSkillList.bind(this)))
    ipcMain.handle(IPC_CHANNELS.AI_SKILL_SEARCH, this.safeHandle(this.handleSkillSearch.bind(this)))
    logger.info('[AIHandler] All handlers registered')
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.AI_CHAT)
    if (this.streamListener) {
      ipcMain.removeListener(IPC_CHANNELS.AI_STREAM, this.streamListener)
      this.streamListener = null
    }
    if (this.abortListener) {
      ipcMain.removeListener(IPC_CHANNELS.AI_STREAM_ABORT, this.abortListener)
      this.abortListener = null
    }
    ipcMain.removeHandler(IPC_CHANNELS.AI_EMBED)
    ipcMain.removeHandler(IPC_CHANNELS.AI_CONTEXT_FILES)
    ipcMain.removeHandler(IPC_CHANNELS.AI_SKILL_LIST)
    ipcMain.removeHandler(IPC_CHANNELS.AI_SKILL_SEARCH)
    for (const [, controller] of this.activeStreams) {
      controller.abort()
    }
    this.activeStreams.clear()
    this.skillEngine.dispose()
    super.cleanup()
  }

  private async chat(_event: IpcMainInvokeEvent, input: AIChatRequest | string): Promise<AIChatResponse> {
    return this.handleChatLikeRequest(input, false)
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

  private async handleStream(
    event: Electron.IpcMainEvent,
    input: AIStreamRequest | AIChatRequest | string
  ): Promise<void> {
    const normalized = this.normalizeRequest(input)
    const streamId = this.extractStreamId(input)
    const sender = event.sender

    // ── Harness branch: if orchestrator is present, check mode ──
    if (this.harnessOrchestrator) {
      const mode = this.harnessOrchestrator.resolveMode(normalized)
      if (mode !== 'single') {
        return this.handleHarnessStream(event, normalized, streamId, mode)
      }
    }

    const abortController = new AbortController()
    this.activeStreams.set(streamId, abortController)

    const workspace = this.ensureWorkspaceServices()
    const sessionId = normalized.sessionId ?? `ai-session-${Date.now()}`
    const model = normalized.model ?? workspace.config.defaultModel
    const useRag = normalized.useRag ?? true
    const contextWindowTokens = normalized.contextWindowTokens ?? 16000
    const currentSessionUsage = normalized.sessionTokenUsage ?? 0

    const fullContent: string[] = []

    try {
      await this.memoryManager.appendLog({
        type: 'user-interaction',
        operator: 'user',
        sessionId,
        summary: normalized.message.slice(0, 120),
        details: [
          `streamMode=true`,
          `streamId=${streamId}`,
          `model=${model}`,
          `workspace=${workspace.config.workspaceId}`,
        ],
        tags: ['ai', 'chat', 'input', 'stream'],
      })

      const contextRequest: ContextAssemblyRequest = {
        userMessage: normalized.message,
        currentFile: normalized.currentFile,
        manualRefs: normalized.manualRefs ?? [],
        skillRefs: normalized.skillRefs ?? [],
      }
      const assembled = await this.contextEngine.assembleContext(contextRequest)

      const ragHits = useRag ? await this.queryRagSafely(normalized.message) : []
      const ragContext = ragHits
        .map((hit, index) => `[${index + 1}] ${hit.path}\n${hit.snippet}`)
        .join('\n\n')

      // Memory context is now provided by ContextEngine memory layer
      const systemSegments = [assembled.systemPrompt]
      if (ragContext.length > 0) {
        systemSegments.push(`本地 RAG 命中上下文:\n${ragContext}`)
      }

      const accessToken = this.tokenStorage.getAccessToken() ?? undefined
      const stream = this.gatewayClient.chatStream(
        {
          model,
          stream: true,
          temperature: normalized.temperature,
          maxTokens: normalized.maxTokens,
          messages: [
            {
              role: 'system',
              content: systemSegments.join('\n\n'),
            },
            {
              role: 'user',
              content: normalized.message,
            },
          ],
        },
        accessToken,
        abortController.signal
      )

      for await (const chunk of stream) {
        fullContent.push(chunk)
        if (!sender.isDestroyed()) {
          const streamChunk: AIStreamChunk = { id: streamId, delta: chunk }
          sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, streamChunk)
        }
      }

      const finalContent = fullContent.join('')
      const estimatedInputTokens = this.estimateTokens(systemSegments.join('\n\n') + normalized.message)
      const estimatedOutputTokens = this.estimateTokens(finalContent)
      const totalTokens = estimatedInputTokens + estimatedOutputTokens
      const usage = {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        totalTokens,
        estimatedCostUsd: totalTokens * 0.000003,
      }

      const ragHitResults = ragHits.map((hit) => ({
        path: hit.path,
        score: hit.score,
        snippet: hit.snippet,
      }))

      await this.memoryManager.appendLog({
        type: 'user-interaction',
        operator: 'ai',
        sessionId,
        summary: finalContent.slice(0, 120),
        details: [
          `streamId=${streamId}`,
          `totalTokens=${totalTokens}`,
          `ragHits=${ragHits.length}`,
          `contextSources=${assembled.sources.length}`,
        ],
        tags: ['ai', 'chat', 'output', 'stream'],
        relatedFiles: ragHits.map((hit) => hit.path),
      })

      const flushResult = await this.memoryManager.flushIfNeeded(
        currentSessionUsage + totalTokens,
        contextWindowTokens,
        [
          `最近用户问题: ${normalized.message.slice(0, 120)}`,
          `最近 AI 响应: ${finalContent.slice(0, 120)}`,
        ]
      )

      const streamEnd: AIStreamEnd = {
        id: streamId,
        content: finalContent,
        usage,
        ragHits: ragHitResults,
        memory: {
          tokenCount: flushResult.snapshot.tokenCount,
          tokenDebt: flushResult.snapshot.tokenDebt,
          flushTriggered: flushResult.triggered,
        },
        provider: 'mock',
        model,
        intercepted: false,
        warnings: [...assembled.warnings],
      }

      if (!sender.isDestroyed()) {
        sender.send(IPC_CHANNELS.AI_STREAM_END, streamEnd)
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        logger.info('[AIHandler] Stream aborted by user', { streamId })
        return
      }

      const errorCode = this.classifyStreamError(error)
      const partialContent = fullContent.join('')
      const streamError: AIStreamError = {
        id: streamId,
        code: errorCode,
        message: error instanceof Error ? error.message : String(error),
        retryable: this.isRetryable(errorCode),
        partialContent,
      }

      logger.error('[AIHandler] Stream error', {
        streamId,
        code: errorCode,
        error: error instanceof Error ? error.message : String(error),
      })

      if (!sender.isDestroyed()) {
        sender.send(IPC_CHANNELS.AI_STREAM_ERROR, streamError)
      }
    } finally {
      this.activeStreams.delete(streamId)
    }
  }

  private handleStreamAbort(_event: Electron.IpcMainEvent, streamId: string): void {
    const controller = this.activeStreams.get(streamId)
    if (controller) {
      controller.abort()
      this.activeStreams.delete(streamId)
    }
  }

  /**
   * Harness-mode stream handler.
   * Dual/Panel modes run synchronously through the orchestrator,
   * then deliver the result as a single stream chunk + end event.
   */
  private async handleHarnessStream(
    event: Electron.IpcMainEvent,
    request: AIChatRequest,
    streamId: string,
    mode: 'dual' | 'panel'
  ): Promise<void> {
    const sender = event.sender

    // Send loading indicator
    if (!sender.isDestroyed()) {
      const loadingChunk: AIStreamChunk = {
        id: streamId,
        delta: '⏳ AI 正在自检中...\n',
      }
      sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, loadingChunk)
    }

    try {
      const result = await this.harnessOrchestrator!.execute(request)

      // Broadcast degradation warning if needed
      if (result.degraded) {
        const warning: DegradationWarning = {
          id: `degrade-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          reason: result.degradeReason ?? 'Unknown degradation',
          originalMode: mode,
          degradedTo: 'single',
        }
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) {
            window.webContents.send(IPC_CHANNELS.HARNESS_DEGRADATION_OCCURRED, warning)
          }
        }
      }

      // Send final content
      if (!sender.isDestroyed()) {
        const contentChunk: AIStreamChunk = {
          id: streamId,
          delta: result.finalResponse.content,
        }
        sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, contentChunk)
      }

      // Send stream end
      if (!sender.isDestroyed()) {
        const streamEnd: AIStreamEnd = {
          id: streamId,
          content: result.finalResponse.content,
          usage: result.finalResponse.usage,
          ragHits: result.finalResponse.ragHits,
          memory: result.finalResponse.memory,
          provider: result.finalResponse.provider,
          model: result.finalResponse.model,
          intercepted: result.finalResponse.intercepted,
          warnings: result.finalResponse.warnings,
        }
        sender.send(IPC_CHANNELS.AI_STREAM_END, streamEnd)
      }
    } catch (error) {
      logger.error('[AIHandler] Harness stream error', {
        streamId,
        error: error instanceof Error ? error.message : String(error),
      })

      if (!sender.isDestroyed()) {
        const streamError: AIStreamError = {
          id: streamId,
          code: 'unknown',
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
          partialContent: '',
        }
        sender.send(IPC_CHANNELS.AI_STREAM_ERROR, streamError)
      }
    }
  }

  private async handleContextFiles(
    _event: IpcMainInvokeEvent,
    query: string,
    limit?: number
  ): Promise<ContextFileInfo[]> {
    this.ensureWorkspaceServices()
    return this.contextEngine.findMatchingFiles(query, limit)
  }

  private async handleSkillList(): Promise<SkillSummary[]> {
    return this.skillEngine.getSkillSummaries()
  }

  private async handleSkillSearch(
    _event: IpcMainInvokeEvent,
    params: SkillSearchParams
  ): Promise<SkillSummary[]> {
    return this.skillEngine.searchSkills(params.query, params.limit)
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

    const contextRequest: ContextAssemblyRequest = {
      userMessage: request.message,
      currentFile: request.currentFile,
      manualRefs: request.manualRefs ?? [],
      skillRefs: request.skillRefs ?? [],
    }
    const assembled = await this.contextEngine.assembleContext(contextRequest)

    const ragHits = useRag ? await this.queryRagSafely(request.message) : []
    const ragContext = ragHits
      .map((hit, index) => `[${index + 1}] ${hit.path}\n${hit.snippet}`)
      .join('\n\n')

    // Memory context is now provided by ContextEngine memory layer
    const systemSegments = [assembled.systemPrompt]
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
        `contextSources=${assembled.sources.length}`,
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
      warnings: [...gatewayResponse.warnings, ...assembled.warnings],
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

  private normalizeRequest(input: AIChatRequest | AIStreamRequest | string): AIChatRequest {
    if (typeof input === 'string') {
      return { message: input }
    }
    return input
  }

  private extractStreamId(input: AIStreamRequest | AIChatRequest | string): string {
    if (typeof input === 'string') {
      return `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    }
    if ('streamId' in input && input.streamId) {
      return input.streamId
    }
    return `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  private classifyStreamError(error: unknown): StreamErrorCode {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('rate limit') || msg.includes('429')) return 'rate_limit'
      if (msg.includes('context length') || msg.includes('token') || msg.includes('too long')) return 'context_length'
      if (msg.includes('timeout') || msg.includes('etimedout')) return 'timeout'
      if (msg.includes('auth') || msg.includes('401') || msg.includes('api key')) return 'auth'
      if (msg.includes('network') || msg.includes('econnrefused') || msg.includes('enetunreach') || msg.includes('fetch')) return 'network'
    }
    return 'unknown'
  }

  private isRetryable(code: StreamErrorCode): boolean {
    return code === 'rate_limit' || code === 'timeout' || code === 'network'
  }

  private estimateTokens(text: string): number {
    const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) ?? []).length
    const nonCjkLength = text.length - cjkCount
    return Math.ceil(nonCjkLength / 4) + Math.ceil(cjkCount / 2)
  }

  private async queryRagSafely(query: string): Promise<LocalRagSearchHit[]> {
    // Try MemoryIndexer first (via MemoryManager)
    try {
      const indexer = this.memoryManager.v2Components?.indexer
      if (indexer) {
        const results = await indexer.search(query, { limit: 5 })
        if (results.length > 0) {
          return results.map((r) => ({
            path: `memory:${r.section}/${r.id}`,
            score: r.finalScore,
            snippet: r.content.slice(0, 200),
          }))
        }
      }
    } catch (err) {
      logger.warn('[AIHandler] MemoryIndexer search failed, falling back to LocalRagEngine', {
        error: err instanceof Error ? err.message : String(err),
      })
    }

    // Fallback: LocalRagEngine
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

  async initSkills(): Promise<void> {
    try {
      await this.skillEngine.initialize()
      logger.info('[AIHandler] SkillEngine initialized')
    } catch (error) {
      logger.warn('[AIHandler] SkillEngine initialization failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  handleFileChangeForSkills(event: { type: string; path: string }): void {
    if (event.type === 'add' || event.type === 'change' || event.type === 'unlink') {
      this.skillEngine.handleFileChange({
        type: event.type as 'add' | 'change' | 'unlink',
        path: event.path,
      })
    }
  }
}
