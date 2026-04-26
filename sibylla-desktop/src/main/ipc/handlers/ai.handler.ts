import * as path from 'path'
import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type {
  ContextFileInfo,
  SkillSearchParams,
  SkillSummary,
  SkillV2,
  SkillTemplate,
  SkillValidationResult,
  SkillResult,
  WorkspaceInfo,
  DegradationWarning,
} from '../../../shared/types'
import { estimateTokens as sharedEstimateTokens } from '../../services/context-engine/token-utils'
import { logger } from '../../utils/logger'
import { AiGatewayClient } from '../../services/ai-gateway-client'
import { MemoryManager } from '../../services/memory-manager'
import { LocalRagEngine, type LocalRagSearchHit } from '../../services/local-rag-engine'
import { TokenStorage } from '../../services/token-storage'
import { WorkspaceManager } from '../../services/workspace-manager'
import { FileManager } from '../../services/file-manager'
import { ContextEngine, type ContextAssemblyRequest } from '../../services/context-engine'
import { SkillEngine } from '../../services/skill-engine'
import { SkillRegistry } from '../../services/skill-system/SkillRegistry'
import { SkillLoader } from '../../services/skill-system/SkillLoader'
import { SkillValidator } from '../../services/skill-system/SkillValidator'
import { SkillExecutor } from '../../services/skill-system/SkillExecutor'
import type { HarnessOrchestrator } from '../../services/harness/orchestrator'
import type { ProgressLedger } from '../../services/progress/progress-ledger'
import type { AiModeRegistry } from '../../services/mode/ai-mode-registry'
import { TaskDeclarationParser, stripDeclarationBlocks } from '../../services/ai/task-declaration-parser'
import type { ChecklistItemStatus } from '../../services/progress/types'
import type { MCPClient } from '../../services/mcp/mcp-client'
import type { MCPRegistry } from '../../services/mcp/mcp-registry'
import type { MCPPermission } from '../../services/mcp/mcp-permission'
import type { MCPAuditLog } from '../../services/mcp/mcp-audit'
import type { MCPPermissionLevel, ToolCallIntent } from '../../services/mcp/types'

type StreamErrorCode = AIStreamError['code']

export class AIHandler extends IpcHandler {
  readonly namespace = 'ai'
  private readonly activeStreams = new Map<string, AbortController>()
  private readonly contextEngine: ContextEngine
  private readonly skillEngine: SkillEngine
  private skillRegistry: SkillRegistry | null = null
  private skillValidator: SkillValidator | null = null
  private skillExecutor: SkillExecutor | null = null
  private streamListener: ((...args: unknown[]) => void) | null = null
  private abortListener: ((...args: unknown[]) => void) | null = null
  private harnessOrchestrator: HarnessOrchestrator | null = null
  private progressLedger: ProgressLedger | null = null
  private aiModeRegistry: AiModeRegistry | null = null
  private mcpClient: MCPClient | null = null
  private mcpRegistry: MCPRegistry | null = null
  private mcpPermission: MCPPermission | null = null
  private mcpAuditLog: MCPAuditLog | null = null
  private mcpEnabled: boolean = false
  private readonly pendingPermissionRequests = new Map<string, {
    resolve: (level: MCPPermissionLevel) => void
    timeout: ReturnType<typeof setTimeout>
  }>()

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

  setProgressLedger(ledger: ProgressLedger): void {
    this.progressLedger = ledger
  }

  setAiModeRegistry(registry: AiModeRegistry): void {
    this.aiModeRegistry = registry
  }

  setMcpServices(deps: {
    client: MCPClient
    registry: MCPRegistry
    permission: MCPPermission
    auditLog: MCPAuditLog
    enabled: boolean
  }): void {
    this.mcpClient = deps.client
    this.mcpRegistry = deps.registry
    this.mcpPermission = deps.permission
    this.mcpAuditLog = deps.auditLog
    this.mcpEnabled = deps.enabled
  }

  resolvePermissionRequest(requestId: string, level: MCPPermissionLevel): void {
    const pending = this.pendingPermissionRequests.get(requestId)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingPermissionRequests.delete(requestId)
      pending.resolve(level)
    }
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
    ipcMain.handle(IPC_CHANNELS.AI_SKILL_GET, this.safeHandle(this.handleSkillGet.bind(this)))
    ipcMain.handle(IPC_CHANNELS.AI_SKILL_CREATE, this.safeHandle(this.handleSkillCreate.bind(this)))
    ipcMain.handle(IPC_CHANNELS.AI_SKILL_VALIDATE, this.safeHandle(this.handleSkillValidate.bind(this)))
    ipcMain.handle(IPC_CHANNELS.AI_SKILL_DELETE, this.safeHandle(this.handleSkillDelete.bind(this)))
    ipcMain.handle(IPC_CHANNELS.AI_SKILL_EXPORT, this.safeHandle(this.handleSkillExport.bind(this)))
    ipcMain.handle(IPC_CHANNELS.AI_SKILL_IMPORT, this.safeHandle(this.handleSkillImport.bind(this)))
    ipcMain.handle(IPC_CHANNELS.AI_SKILL_TEST_RUN, this.safeHandle(this.handleSkillTestRun.bind(this)))
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
    ipcMain.removeHandler(IPC_CHANNELS.AI_SKILL_GET)
    ipcMain.removeHandler(IPC_CHANNELS.AI_SKILL_CREATE)
    ipcMain.removeHandler(IPC_CHANNELS.AI_SKILL_VALIDATE)
    ipcMain.removeHandler(IPC_CHANNELS.AI_SKILL_DELETE)
    ipcMain.removeHandler(IPC_CHANNELS.AI_SKILL_EXPORT)
    ipcMain.removeHandler(IPC_CHANNELS.AI_SKILL_IMPORT)
    ipcMain.removeHandler(IPC_CHANNELS.AI_SKILL_TEST_RUN)
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
    let normalized = this.normalizeRequest(input)
    const streamId = this.extractStreamId(input)
    const sender = event.sender

    // === TASK030: Inject aiModeId from registry ===
    if (this.aiModeRegistry && normalized.sessionId) {
      const activeModeId = this.aiModeRegistry.getActiveModeId(normalized.sessionId)
      if (activeModeId !== 'free') {
        normalized = { ...normalized, aiModeId: activeModeId }
      }
    }

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

      let streamPaused = false
      const pendingInjections: string[] = []
      let accumulatedText = ''

      for await (const chunk of stream) {
        fullContent.push(chunk)
        accumulatedText += chunk

        if (this.mcpEnabled && !streamPaused) {
          const mayContainToolCall = accumulatedText.includes('<tool_call') || accumulatedText.includes('"tool_call"')
          if (mayContainToolCall) {
            const toolIntent = this.detectToolCall(accumulatedText)
            if (toolIntent) {
              streamPaused = true
              const toolResult = await this.handleToolCall(toolIntent, sender)
              if (toolResult) {
                pendingInjections.push(toolResult)
                fullContent.push(toolResult)
                accumulatedText += toolResult
                if (!sender.isDestroyed()) {
                  const resultChunk: AIStreamChunk = { id: streamId, delta: toolResult }
                  sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, resultChunk)
                }
              }
              streamPaused = false
              continue
            }
          }
        }

        if (!sender.isDestroyed()) {
          const streamChunk: AIStreamChunk = { id: streamId, delta: chunk }
          sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, streamChunk)
        }
      }

      const finalContent = fullContent.join('')
      const estimatedInputTokens = this.estimateTokens(systemSegments.join('\n\n') + normalized.message)
      const estimatedOutputTokens = this.estimateTokens(finalContent)

      await this.processDeclarationBlocks(finalContent, normalized, streamId)

      const cleanedContent = stripDeclarationBlocks(finalContent)
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
        summary: cleanedContent.slice(0, 120),
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
        content: cleanedContent,
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

      if (this.progressLedger && result.finalResponse.content) {
        await this.processDeclarationBlocks(
          result.finalResponse.content,
          request,
          streamId,
        )
      }

      const cleanedHarnessContent = stripDeclarationBlocks(result.finalResponse.content)

      // Send stream end
      if (!sender.isDestroyed()) {
        const streamEnd: AIStreamEnd = {
          id: streamId,
          content: cleanedHarnessContent,
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
    if (this.skillRegistry) {
      return this.skillRegistry.getSkillSummaries()
    }
    return this.skillEngine.getSkillSummaries()
  }

  private async handleSkillSearch(
    _event: IpcMainInvokeEvent,
    params: SkillSearchParams
  ): Promise<SkillSummary[]> {
    if (this.skillRegistry) {
      const results = this.skillRegistry.search(params.query, params.limit)
      return results.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        scenarios: s.scenarios,
      }))
    }
    return this.skillEngine.searchSkills(params.query, params.limit)
  }

  private async handleSkillGet(
    _event: IpcMainInvokeEvent,
    skillId: string,
  ): Promise<SkillV2 | null> {
    if (!this.skillRegistry) return null
    return this.skillRegistry.get(skillId) ?? null
  }

  private static isValidSkillId(id: string): boolean {
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]*(?:\/[a-zA-Z0-9][a-zA-Z0-9_-]*)*$/.test(id)
  }

  private async handleSkillCreate(
    _event: IpcMainInvokeEvent,
    template: SkillTemplate,
  ): Promise<{ skillId: string; path: string }> {
    const workspacePath = this.workspaceManager.getWorkspacePath()
    if (!workspacePath) throw new Error('No workspace open')

    if (!AIHandler.isValidSkillId(template.id)) {
      throw new Error(`Invalid skill id: "${template.id}". Only alphanumeric, hyphens, underscores, and single slashes are allowed.`)
    }

    const skillDir = `.sibylla/skills/${template.id}`
    const indexPath = `${skillDir}/_index.md`
    const promptPath = `${skillDir}/prompt.md`

    const indexContent = [
      '---',
      `id: ${template.id}`,
      `version: 1.0.0`,
      `name: ${template.name}`,
      `description: ${template.description}`,
      `category: general`,
      `tags: []`,
      `scope: public`,
      '---',
      '',
    ].join('\n')

    await this.fileManager.writeFile(indexPath, indexContent)
    await this.fileManager.writeFile(promptPath, template.prompt)

    if (template.tools && template.tools.length > 0) {
      const toolsContent = [
        'allowed_tools:',
        ...template.tools.map((t) => `  - ${t}`),
      ].join('\n')
      const toolsPath = `${skillDir}/tools.yaml`
      await this.fileManager.writeFile(toolsPath, toolsContent)
    }

    if (this.skillRegistry) {
      await this.skillRegistry.discoverAll()
    }

    return { skillId: template.id, path: skillDir }
  }

  private async handleSkillValidate(
    _event: IpcMainInvokeEvent,
    skillId: string,
  ): Promise<SkillValidationResult> {
    if (!this.skillValidator) {
      return { valid: false, errors: ['SkillValidator not initialized'], warnings: [] }
    }

    const workspacePath = this.workspaceManager.getWorkspacePath()
    if (!workspacePath) {
      return { valid: false, errors: ['No workspace open'], warnings: [] }
    }

    const skill = this.skillRegistry?.get(skillId)
    if (!skill) {
      return { valid: false, errors: [`Skill not found: ${skillId}`], warnings: [] }
    }

    return await this.skillValidator.validateSkillDir(skill.filePath)
  }

  private async handleSkillDelete(
    _event: IpcMainInvokeEvent,
    skillId: string,
  ): Promise<void> {
    const skill = this.skillRegistry?.get(skillId)
    if (!skill) throw new Error(`Skill not found: ${skillId}`)
    if (skill.source === 'builtin') throw new Error('Cannot delete builtin skills')

    throw new Error('Skill deletion requires confirmation (not yet implemented in IPC)')
  }

  private async handleSkillExport(
    _event: IpcMainInvokeEvent,
    skillId: string,
  ): Promise<{ bundlePath: string }> {
    const skill = this.skillRegistry?.get(skillId)
    if (!skill) throw new Error(`Skill not found: ${skillId}`)

    logger.info('[AIHandler] Skill export requested', { skillId })
    throw new Error('Skill export not yet implemented')
  }

  private async handleSkillImport(
    _event: IpcMainInvokeEvent,
    bundlePath: string,
  ): Promise<{ skillId: string }> {
    if (!bundlePath.endsWith('.sibylla-skill')) {
      throw new Error('Invalid bundle file: must be a .sibylla-skill file')
    }
    if (bundlePath.includes('..') || path.isAbsolute(bundlePath)) {
      throw new Error('Invalid bundle path')
    }
    logger.info('[AIHandler] Skill import requested', { bundlePath })
    throw new Error('Skill import not yet implemented')
  }

  private async handleSkillTestRun(
    _event: IpcMainInvokeEvent,
    skillId: string,
    userInput: string,
  ): Promise<SkillResult> {
    if (!this.skillRegistry || !this.skillExecutor) {
      return { success: false, tokensUsed: 0, toolCallsCount: 0, errors: ['Skill system not initialized'] }
    }

    const skill = this.skillRegistry.get(skillId)
    if (!skill) {
      return { success: false, tokensUsed: 0, toolCallsCount: 0, errors: [`Skill not found: ${skillId}`] }
    }

    try {
      const plan = await this.skillExecutor.execute({
        skill,
        userInput,
        parentTraceId: `test-${Date.now()}`,
      })

      return {
        success: true,
        tokensUsed: sharedEstimateTokens(plan.additionalPromptParts.join('\n')),
        toolCallsCount: 0,
        errors: [],
      }
    } catch (error) {
      return {
        success: false,
        tokensUsed: 0,
        toolCallsCount: 0,
        errors: [error instanceof Error ? error.message : String(error)],
      }
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

    try {
      const tokenEstimator = sharedEstimateTokens

      const loader = new SkillLoader(this.fileManager, tokenEstimator)
      this.skillRegistry = new SkillRegistry(loader, this.fileManager)
      await this.skillRegistry.discoverAll()

      this.skillValidator = new SkillValidator(this.fileManager, [], tokenEstimator)
      this.skillExecutor = new SkillExecutor(this.fileManager, tokenEstimator)

      logger.info('[AIHandler] Skill v2 system initialized', {
        skillCount: this.skillRegistry.getAll().length,
      })
    } catch (error) {
      logger.warn('[AIHandler] Skill v2 system initialization failed', {
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

  private shouldRequireTaskDeclaration(request: AIChatRequest): boolean {
    const msgLen = (request.message ?? '').length
    return msgLen > 200
  }

  private async processDeclarationBlocks(
    finalContent: string,
    request: AIChatRequest,
    _streamId: string,
  ): Promise<void> {
    if (!this.progressLedger || !finalContent) return

    try {
      const parser = new TaskDeclarationParser()
      const blocks = parser.parseNewBlocks(finalContent)
      let taskId: string | null = null

      for (const block of blocks) {
        try {
          if (block.type === 'declare') {
            const task = await this.progressLedger.declare({
              title: block.data.title,
              traceId: request.traceId,
              conversationId: request.sessionId,
              plannedChecklist: block.data.planned_steps,
            })
            taskId = task.id
          } else if (block.type === 'update' && taskId) {
            await this.progressLedger.update(taskId, {
              checklistUpdates: block.data.checklistUpdates?.map((u) => ({
                index: u.index,
                status: u.status as ChecklistItemStatus,
              })),
              newChecklistItems: block.data.newChecklistItems,
              output: block.data.output,
            })
          } else if (block.type === 'complete' && taskId) {
            await this.progressLedger.complete(taskId, block.data.summary)
            taskId = null
          }
        } catch (err) {
          logger.warn('[AIHandler] Declaration block processing failed', {
            blockType: block.type,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      if (taskId) {
        await this.progressLedger.complete(taskId, '（AI 未显式归档）')
      }

      if (!taskId && blocks.length === 0 && this.shouldRequireTaskDeclaration(request)) {
        const wrapped = await this.progressLedger.declare({
          title: '(未命名任务)',
          traceId: request.traceId,
          conversationId: request.sessionId,
        })
        await this.progressLedger.complete(wrapped.id, finalContent.slice(0, 200))
      }
    } catch (err) {
      logger.warn('[AIHandler] Declaration block parsing failed', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  private detectToolCall(accumulated: string): ToolCallIntent | null {
    const xmlMatch = accumulated.match(
      /<tool_call\s+server="([^"]+)"\s+tool="([^"]+)">(.+?)<\/tool_call\s*>/s
    )
    if (xmlMatch) {
      try {
        const args = JSON.parse(xmlMatch[3]!) as Record<string, unknown>
        return {
          serverName: xmlMatch[1]!,
          toolName: xmlMatch[2]!,
          args,
        }
      } catch {
        return null
      }
    }

    const jsonPattern = /\{"type"\s*:\s*"tool_call"\s*,\s*"server"\s*:\s*"([^"]+)"\s*,\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[^}]+\})\s*\}/
    const jsonMatch = accumulated.match(jsonPattern)
    if (jsonMatch) {
      try {
        const args = JSON.parse(jsonMatch[3]!) as Record<string, unknown>
        return {
          serverName: jsonMatch[1]!,
          toolName: jsonMatch[2]!,
          args,
        }
      } catch {
        return null
      }
    }

    return null
  }

  private async handleToolCall(
    intent: ToolCallIntent,
    sender: Electron.IpcMainEvent['sender'],
  ): Promise<string | null> {
    if (!this.mcpEnabled || !this.mcpClient || !this.mcpPermission || !this.mcpAuditLog || !this.mcpRegistry) {
      return null
    }

    try {
      const existingPermission = this.mcpPermission.checkPermission(intent.serverName, intent.toolName)

      if (existingPermission === 'deny') {
        return '\n[Tool call denied by user policy]\n'
      }

      if (!existingPermission) {
        const tool = this.mcpRegistry.getTool(intent.serverName, intent.toolName)
        const decision = await this.promptUserPermission(sender, {
          requestId: `perm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          serverName: intent.serverName,
          toolName: intent.toolName,
          toolDescription: tool?.description ?? '',
          args: intent.args,
          isSensitive: this.mcpPermission.isSensitiveTool(intent.serverName, intent.toolName),
        })

        if (decision === 'deny') {
          this.mcpPermission.grantPermission(intent.serverName, intent.toolName, 'deny')
          return '\n[Tool call denied by user]\n'
        }

        this.mcpPermission.grantPermission(intent.serverName, intent.toolName, decision)
      }

      const startTime = Date.now()
      const result = await this.mcpClient.callTool(intent.serverName, intent.toolName, intent.args)
      const durationMs = Date.now() - startTime

      await this.mcpAuditLog.record({
        timestamp: Date.now(),
        serverName: intent.serverName,
        toolName: intent.toolName,
        args: JSON.stringify(intent.args),
        result: result.isError ? 'error' : 'success',
        durationMs,
        userDecision: existingPermission ? 'auto' : 'confirmed',
      })

      const resultContent = typeof result.content === 'string'
        ? result.content
        : result.content.map(c => c.text).join('\n')

      return `\n[Tool Result (${intent.serverName}/${intent.toolName})]:\n${resultContent}\n`
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return `\n[Tool call failed: ${errorMsg}. AI should try alternative approach.]\n`
    }
  }

  private promptUserPermission(
    sender: Electron.IpcMainEvent['sender'],
    prompt: { requestId: string; serverName: string; toolName: string; toolDescription: string; args: Record<string, unknown>; isSensitive: boolean },
  ): Promise<MCPPermissionLevel> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingPermissionRequests.delete(prompt.requestId)
        resolve('deny')
      }, 60000)

      this.pendingPermissionRequests.set(prompt.requestId, { resolve, timeout })

      if (!sender.isDestroyed()) {
        sender.send(IPC_CHANNELS.MCP_PERMISSION_PROMPT, prompt)
      } else {
        clearTimeout(timeout)
        this.pendingPermissionRequests.delete(prompt.requestId)
        resolve('deny')
      }
    })
  }
}
