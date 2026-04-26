import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  AutoSavedPayload,
  ConflictInfo,
  ConflictResolution,
  ContextFileInfo,
  IPCResponse,
  SystemInfo,
  EchoRequest,
  IPCChannel,
  FileContent,
  FileReadOptions,
  FileWriteOptions,
  ListFilesOptions,
  FileInfo,
  FileWatchEvent,
  CreateWorkspaceOptions,
  WorkspaceInfo,
  WorkspaceConfig,
  WorkspaceMetadata,
  SyncStatusData,
  SyncResult,
  AuthLoginInput,
  AuthRegisterInput,
  AuthSession,
  AIChatRequest,
  AIChatResponse,
  AIEmbedRequest,
  AIEmbedResponse,
  AIStreamChunk,
  AIStreamEnd,
  AIStreamError,
  ImportOptions,
  ImportResult,
  ImportProgress,
  SaveFailedPayload,
  MemberRole,
  WorkspaceMember,
  InviteRequest,
  InviteResult,
  SkillSummary,
  SkillSearchParams,
  SearchQueryParams,
  SearchResult,
  SearchIndexStatus,
  SearchIndexProgress,
  MemorySnapshotResponse,
  MemoryUpdateRequest,
  MemoryFlushRequest,
  MemoryFlushResponse,
  DailyLogQueryRequest,
  DailyLogEntry,
  RagSearchRequest,
  RagSearchHit,
  HarnessMode,
  HarnessResult,
  DegradationWarning,
  GuardrailRuleSummaryShared,
  SetGuardrailEnabledRequest,
  TaskStateSummary,
  TaskResumeResultShared,
  GuardrailNotificationData,
  // Memory v2 types
  MemoryEntry,
  MemoryV2StatsResponse,
  HybridSearchResult,
  EvolutionEvent,
  CheckpointRecord,
  CompressionResult,
  MemoryConfig,
  // Trace types (TASK029)
  SerializedSpanShared,
  TraceQueryFilterShared,
  RecentTraceInfoShared,
  TraceStatsShared,
  TraceSnapshotShared,
  ExportPreviewShared,
  RedactionRuleShared,
  // Performance types (TASK029)
  PerformanceMetricsShared,
  PerformanceAlertShared,
  // Progress types (TASK029)
  TaskRecordShared,
  ProgressSnapshotShared,
  // Conversation types
  ConversationSummary,
  ConversationMessageShared,
  PaginatedMessagesShared,
  // AI Mode types (TASK030)
  AiModeDefinitionShared,
  // Plan types (TASK031)
  PlanMetadataShared,
  PlanStepShared,
  ParsedPlanShared,
  PlanFollowUpResultShared,
  // Prompt Optimizer types (TASK032)
  OptimizeRequestShared,
  OptimizeResponseShared,
  // Command Palette types (TASK032)
  CommandShared,
  // Handbook types (TASK033)
  HandbookEntryShared,
  HandbookSearchOptionsShared,
  HandbookCloneResultShared,
  HandbookUpdateCheckResultShared,
  // DataSource types (TASK033)
  DataSourceQueryShared,
  DataSourceResultShared,
  DataSourceProviderInfoShared,
  DataSourceProviderStatusShared,
  // Export types (TASK034)
  ExportOptionsShared,
  ExportPreviewSharedV2,
  // Model types (TASK034)
  ConfiguredModelShared,
  ModelSwitchedEventShared,
  // QuickSettings types (TASK034)
  QuickSettingsStateShared,
  // Prompt Library types (TASK035)
  PromptMetadata,
  PromptContent,
  PromptValidationResult,
  // Skill v2 types (TASK037)
  SkillV2,
  SkillTemplate,
  SkillResult,
  SkillValidationResult as SkillValidationResultType,
  SlashCommandTemplate,
  ParsedCommand,
  CommandSuggestion,
  // Sub-agent types (TASK038)
  SubAgentMetadata,
  SubAgentTemplate,
  SubAgentTrace,
  // Workflow types (TASK039)
  WorkflowDefinition,
  WorkflowRun,
  WorkflowRunSummary,
  RunFilter,
  WorkflowConfirmationRequest,
  // Classification types (TASK041)
  ClassificationResultShared,
  ClassificationConfirmationPayload,
  // MCP types (TASK042)
  MCPServerConfigShared,
  MCPServerInfoShared,
  MCPToolShared,
  MCPToolResultShared,
  MCPPermissionLevelShared,
  MCPPermissionPromptShared,
  // MCP Sync types (TASK043)
  SyncTaskConfigShared,
  SyncProgressShared,
  SyncTaskWithStateShared,
  // App config types (TASK044)
  AppConfig,
} from '../shared/types'
import type { CommitInfo, HistoryOptions, FileDiff } from '../shared/types/git.types'
import { IPC_CHANNELS, ErrorType } from '../shared/types'

/**
 * Preload Script
 * 
 * This script runs in a privileged context with access to both Node.js APIs
 * and the renderer's DOM. It uses contextBridge to safely expose a limited
 * set of APIs to the renderer process.
 * 
 * Security principles:
 * - Only expose necessary APIs through contextBridge
 * - Validate all inputs from renderer process
 * - Never expose raw ipcRenderer or Node.js APIs directly
 * - Use invoke/handle pattern for request-response communication
 */

/**
 * Electron API exposed to renderer process
 * All methods are type-safe and validated
 */
interface ElectronAPI {
  // Test methods
  ping: () => Promise<IPCResponse<string>>
  echo: (message: string, delay?: number) => Promise<IPCResponse<string>>
  
  // System information
  getSystemInfo: () => Promise<IPCResponse<SystemInfo>>
  getPlatform: () => Promise<IPCResponse<NodeJS.Platform>>
  getVersion: () => Promise<IPCResponse<string>>
  
  // File operations
  file: {
    read: (path: string, options?: FileReadOptions) => Promise<IPCResponse<FileContent>>
    write: (path: string, content: string, options?: FileWriteOptions) => Promise<IPCResponse<void>>
    delete: (path: string) => Promise<IPCResponse<void>>
    copy: (sourcePath: string, destPath: string) => Promise<IPCResponse<void>>
    move: (sourcePath: string, destPath: string) => Promise<IPCResponse<void>>
    list: (path: string, options?: ListFilesOptions) => Promise<IPCResponse<FileInfo[]>>
    getInfo: (path: string) => Promise<IPCResponse<FileInfo>>
    exists: (path: string) => Promise<IPCResponse<boolean>>
    
    // Directory operations
    createDir: (path: string, recursive?: boolean) => Promise<IPCResponse<void>>
    deleteDir: (path: string, recursive?: boolean) => Promise<IPCResponse<void>>
    
    // File watching
    startWatching: () => Promise<IPCResponse<void>>
    stopWatching: () => Promise<IPCResponse<void>>
    onFileChange: (callback: (event: FileWatchEvent) => void) => () => void
    
    // File import
    import: (sourcePaths: string[], options?: ImportOptions) => Promise<IPCResponse<ImportResult>>
    onImportProgress: (callback: (data: ImportProgress) => void) => () => void

    // Auto-save
    notifyChange: (filePath: string, content: string) => void
    onAutoSaved: (callback: (data: AutoSavedPayload) => void) => () => void
    onSaveFailed: (callback: (data: SaveFailedPayload) => void) => () => void
    retrySave: (filePath: string) => Promise<IPCResponse<void>>
  }
  
  // Workspace operations
  workspace: {
    create: (options: CreateWorkspaceOptions) => Promise<IPCResponse<WorkspaceInfo>>
    open: (path: string) => Promise<IPCResponse<WorkspaceInfo>>
    close: () => Promise<IPCResponse<void>>
    getCurrent: () => Promise<IPCResponse<WorkspaceInfo | null>>
    validate: (path: string) => Promise<IPCResponse<boolean>>
    selectFolder: () => Promise<IPCResponse<string | null>>
    getConfig: () => Promise<IPCResponse<WorkspaceConfig>>
    updateConfig: (updates: Partial<WorkspaceConfig>) => Promise<IPCResponse<void>>
    getMetadata: () => Promise<IPCResponse<WorkspaceMetadata>>

    // Member management
    getMembers: (workspaceId: string) => Promise<IPCResponse<WorkspaceMember[]>>
    inviteMember: (workspaceId: string, request: InviteRequest) => Promise<IPCResponse<InviteResult>>
    updateMemberRole: (workspaceId: string, userId: string, role: MemberRole) => Promise<IPCResponse<void>>
    removeMember: (workspaceId: string, userId: string) => Promise<IPCResponse<void>>
  }
  
  // Sync operations
  sync: {
    force: () => Promise<IPCResponse<SyncResult>>
    getState: () => Promise<IPCResponse<SyncStatusData>>
    onStatusChange: (callback: (data: SyncStatusData) => void) => () => void
  }

  // Git conflict operations
  git: {
    /** Get detailed conflict info for all conflicting files */
    getConflicts: () => Promise<IPCResponse<ConflictInfo[]>>
    /** Resolve a conflict with chosen strategy */
    resolve: (resolution: ConflictResolution) => Promise<IPCResponse<string>>
    /** Listen for conflict detection events (pushed on sync conflict) */
    onConflictDetected: (callback: (conflicts: ConflictInfo[]) => void) => () => void
    /** Get file version history */
    history: (options?: HistoryOptions) => Promise<IPCResponse<readonly CommitInfo[]>>
    /** Get diff between two versions of a file */
    diff: (filepath: string, commitA?: string, commitB?: string) => Promise<IPCResponse<FileDiff>>
    /** Restore file to a specific version */
    restore: (filepath: string, commitSha: string) => Promise<IPCResponse<string>>
  }

  // AI operations
  ai: {
    chat: (request: AIChatRequest | string) => Promise<IPCResponse<AIChatResponse>>
    stream: (request: AIChatRequest | string) => string
    abortStream: (streamId: string) => void
    onStreamChunk: (callback: (chunk: AIStreamChunk) => void) => () => void
    onStreamEnd: (callback: (end: AIStreamEnd) => void) => () => void
    onStreamError: (callback: (error: AIStreamError) => void) => () => void
    embed: (request: AIEmbedRequest | string) => Promise<IPCResponse<AIEmbedResponse>>
    contextFiles: (query: string, limit?: number) => Promise<IPCResponse<ContextFileInfo[]>>
    skillList: () => Promise<IPCResponse<SkillSummary[]>>
    skillSearch: (params: SkillSearchParams) => Promise<IPCResponse<SkillSummary[]>>
    skillGet: (skillId: string) => Promise<IPCResponse<SkillV2 | null>>
    skillCreate: (template: SkillTemplate) => Promise<IPCResponse<{ skillId: string; path: string }>>
    skillValidate: (skillId: string) => Promise<IPCResponse<SkillValidationResultType>>
    skillDelete: (skillId: string) => Promise<IPCResponse<void>>
    skillExport: (skillId: string) => Promise<IPCResponse<{ bundlePath: string }>>
    skillImport: (bundlePath: string) => Promise<IPCResponse<{ skillId: string }>>
    skillTestRun: (skillId: string, userInput: string) => Promise<IPCResponse<SkillResult>>
  }

  // Slash Command operations (TASK037)
  slashCommand: {
    parse: (input: string) => Promise<IPCResponse<ParsedCommand | null>>
    create: (template: SlashCommandTemplate) => Promise<IPCResponse<{ commandId: string }>>
    getSuggestions: (partial: string) => Promise<IPCResponse<CommandSuggestion[]>>
  }

  // Memory operations
  memory: {
    /** @deprecated v1 — Use listEntries + getStats instead */
    snapshot: () => Promise<IPCResponse<MemorySnapshotResponse>>
    /** @deprecated v1 — Use updateEntry instead */
    update: (request: MemoryUpdateRequest) => Promise<IPCResponse<MemorySnapshotResponse>>
    /** @deprecated v1 */
    flush: (request: MemoryFlushRequest) => Promise<IPCResponse<MemoryFlushResponse>>
    /** @deprecated v1 */
    queryDailyLog: (request: DailyLogQueryRequest) => Promise<IPCResponse<DailyLogEntry[]>>

    // v2 operations
    listEntries: () => Promise<IPCResponse<MemoryEntry[]>>
    listArchived: () => Promise<IPCResponse<MemoryEntry[]>>
    search: (query: string, options?: { limit?: number; sections?: string[] }) => Promise<IPCResponse<HybridSearchResult[]>>
    getEntry: (id: string) => Promise<IPCResponse<MemoryEntry | null>>
    getStats: () => Promise<IPCResponse<MemoryV2StatsResponse>>
    updateEntry: (id: string, updates: Partial<MemoryEntry>) => Promise<IPCResponse<void>>
    deleteEntry: (id: string) => Promise<IPCResponse<void>>
    lockEntry: (id: string, locked: boolean) => Promise<IPCResponse<void>>
    triggerCheckpoint: () => Promise<IPCResponse<void>>
    triggerCompression: () => Promise<IPCResponse<CompressionResult>>
    undoLastCompression: () => Promise<IPCResponse<void>>
    getEvolutionHistory: (entryId?: string) => Promise<IPCResponse<EvolutionEvent[]>>
    rebuildIndex: () => Promise<IPCResponse<void>>
    getIndexHealth: () => Promise<IPCResponse<{ healthy: boolean; entryCount: number }>>
    getConfig: () => Promise<IPCResponse<MemoryConfig>>
    updateConfig: (patch: Partial<MemoryConfig>) => Promise<IPCResponse<void>>

    // v2 event listeners (Main → Renderer push)
    onCheckpointStarted: (callback: (record: CheckpointRecord) => void) => () => void
    onCheckpointCompleted: (callback: (record: CheckpointRecord) => void) => () => void
    onCheckpointFailed: (callback: (record: CheckpointRecord) => void) => () => void
    onEntryAdded: (callback: (entry: MemoryEntry) => void) => () => void
    onEntryUpdated: (callback: (entry: MemoryEntry) => void) => () => void
    onEntryDeleted: (callback: (entryId: string) => void) => () => void
  }

  // RAG operations
  rag: {
    search: (request: RagSearchRequest) => Promise<IPCResponse<RagSearchHit[]>>
    rebuild: () => Promise<IPCResponse<void>>
  }

  // Harness operations
  harness: {
    execute: (request: AIChatRequest) => Promise<IPCResponse<HarnessResult>>
    setMode: (mode: HarnessMode) => Promise<IPCResponse<void>>
    getMode: () => Promise<IPCResponse<HarnessMode>>
    listGuardrails: () => Promise<IPCResponse<GuardrailRuleSummaryShared[]>>
    setGuardrailEnabled: (request: SetGuardrailEnabledRequest) => Promise<IPCResponse<void>>
    onDegradationOccurred: (callback: (warning: DegradationWarning) => void) => () => void
    // TASK021: Task state machine operations
    listResumeable: () => Promise<IPCResponse<TaskStateSummary[]>>
    resumeTask: (taskId: string) => Promise<IPCResponse<TaskResumeResultShared>>
    abandonTask: (taskId: string) => Promise<IPCResponse<void>>
    onResumeableTaskDetected: (callback: (tasks: TaskStateSummary[]) => void) => () => void
    onGuardrailBlocked: (callback: (data: GuardrailNotificationData) => void) => () => void
  }
  
  // Auth operations
  auth: {
    login: (input: AuthLoginInput) => Promise<IPCResponse<AuthSession>>
    register: (input: AuthRegisterInput) => Promise<IPCResponse<AuthSession>>
    logout: () => Promise<IPCResponse<void>>
    getCurrentUser: () => Promise<IPCResponse<AuthSession>>
    refreshToken: () => Promise<IPCResponse<AuthSession>>
  }
  
  // Window control
  window: {
    minimize: () => Promise<IPCResponse<void>>
    maximize: () => Promise<IPCResponse<boolean>>
    close: () => Promise<IPCResponse<void>>
    toggleFullscreen: () => Promise<IPCResponse<boolean>>
  }
  
  // Search operations
  search: {
    query: (params: SearchQueryParams) => Promise<IPCResponse<SearchResult[]>>
    indexStatus: () => Promise<IPCResponse<SearchIndexStatus>>
    reindex: () => Promise<IPCResponse<void>>
    onIndexProgress: (callback: (progress: SearchIndexProgress) => void) => () => void
  }

  // Trace operations (TASK029)
  trace: {
    getTraceTree: (traceId: string) => Promise<IPCResponse<SerializedSpanShared[]>>
    query: (filter: TraceQueryFilterShared) => Promise<IPCResponse<SerializedSpanShared[]>>
    getRecentTraces: (limit: number) => Promise<IPCResponse<RecentTraceInfoShared[]>>
    getStats: () => Promise<IPCResponse<TraceStatsShared>>
    lockTrace: (traceId: string, reason?: string) => Promise<IPCResponse<void>>
    unlockTrace: (traceId: string) => Promise<IPCResponse<void>>
    cleanup: () => Promise<IPCResponse<{ deleted: number }>>
    previewExport: (traceIds: string[], customRules?: RedactionRuleShared[]) => Promise<IPCResponse<ExportPreviewShared>>
    exportTrace: (traceIds: string[], outputPath: string, customRules?: RedactionRuleShared[]) => Promise<IPCResponse<void>>
    importTrace: (filePath: string) => Promise<IPCResponse<{ traceIds: string[] }>>
    rebuildSnapshot: (traceId: string) => Promise<IPCResponse<TraceSnapshotShared>>
    rerun: (traceId: string) => Promise<IPCResponse<{ newTraceId: string }>>
    onTraceUpdate: (callback: (traceId: string) => void) => () => void
    onSpanEnded: (callback: (span: SerializedSpanShared) => void) => () => void
  }

  // Performance operations (TASK029)
  performance: {
    getMetrics: () => Promise<IPCResponse<PerformanceMetricsShared | null>>
    getAlerts: () => Promise<IPCResponse<PerformanceAlertShared[]>>
    suppressAlert: (type: string, durationMs?: number) => Promise<IPCResponse<void>>
    onMetrics: (callback: (metrics: PerformanceMetricsShared) => void) => () => void
    onAlert: (callback: (alert: PerformanceAlertShared) => void) => () => void
    onAlertCleared: (callback: (payload: { type: string }) => void) => () => void
  }

  // Progress operations (TASK029)
  progress: {
    getSnapshot: () => Promise<IPCResponse<ProgressSnapshotShared>>
    getTask: (id: string) => Promise<IPCResponse<TaskRecordShared | null>>
    editUserNote: (taskId: string, note: string) => Promise<IPCResponse<void>>
    getArchive: (month: string) => Promise<IPCResponse<string>>
    onTaskEvent: (callback: (event: { type: string; task: TaskRecordShared }) => void) => () => void
  }

  // Inspector operations (TASK029)
  inspector: {
    open: (traceId?: string) => void
  }

  // Conversation operations
  conversation: {
    create: (id: string, title?: string) => Promise<IPCResponse<ConversationSummary>>
    appendMessage: (message: ConversationMessageShared) => Promise<IPCResponse<void>>
    getMessages: (conversationId: string, limit: number, beforeTimestamp?: number) => Promise<IPCResponse<PaginatedMessagesShared>>
    list: (limit: number, offset: number) => Promise<IPCResponse<ConversationSummary[]>>
    loadLatest: () => Promise<IPCResponse<{ conversationId: string; messages: ConversationMessageShared[]; hasMore: boolean } | null>>
  }

  // AI Mode operations (TASK030)
  aiMode: {
    getAll: () => Promise<IPCResponse<AiModeDefinitionShared[]>>
    getActive: (conversationId: string) => Promise<IPCResponse<AiModeDefinitionShared>>
    switchMode: (conversationId: string, aiModeId: string) => Promise<IPCResponse<void>>
    onModeChanged: (callback: (event: { conversationId: string; from?: string; to: string }) => void) => () => void
  },

  // Plan operations (TASK031)
  plan: {
    getActivePlans: () => Promise<IPCResponse<PlanMetadataShared[]>>
    getPlan: (id: string) => Promise<IPCResponse<ParsedPlanShared | null>>
    startExecution: (id: string) => Promise<IPCResponse<void>>
    archive: (id: string, targetPath: string) => Promise<IPCResponse<PlanMetadataShared>>
    abandon: (id: string) => Promise<IPCResponse<void>>
    followUp: (id: string) => Promise<IPCResponse<PlanFollowUpResultShared>>
    onPlanCreated: (callback: (plan: PlanMetadataShared) => void) => () => void
    onPlanExecutionStarted: (callback: (plan: PlanMetadataShared) => void) => () => void
    onStepsCompleted: (callback: (event: { planId: string; completed: PlanStepShared[] }) => void) => () => void
    onPlanArchived: (callback: (plan: PlanMetadataShared) => void) => () => void
    onPlanAbandoned: (callback: (plan: PlanMetadataShared) => void) => () => void
  }

  // Prompt Optimizer operations (TASK032)
  promptOptimizer: {
    optimize: (req: OptimizeRequestShared) => Promise<IPCResponse<OptimizeResponseShared>>
    recordAction: (requestId: string, action: string, suggestionId?: string) => Promise<IPCResponse<void>>
  }

  // Command Palette operations (TASK032)
  command: {
    search: (query: string, language?: string) => Promise<IPCResponse<CommandShared[]>>
    execute: (id: string) => Promise<IPCResponse<void>>
  }

  // Handbook operations (TASK033)
  handbook: {
    search: (query: string, options?: HandbookSearchOptionsShared) => Promise<IPCResponse<HandbookEntryShared[]>>
    getEntry: (id: string, language?: string) => Promise<IPCResponse<HandbookEntryShared | null>>
    cloneToWorkspace: () => Promise<IPCResponse<HandbookCloneResultShared>>
    checkUpdates: () => Promise<IPCResponse<HandbookUpdateCheckResultShared>>
  }

  // DataSource operations (TASK033)
  datasource: {
    listProviders: () => Promise<IPCResponse<DataSourceProviderInfoShared[]>>
    query: (providerId: string, query: DataSourceQueryShared) => Promise<IPCResponse<DataSourceResultShared>>
    getProviderStatus: (id: string) => Promise<IPCResponse<DataSourceProviderStatusShared>>
  }

  // Export operations (TASK034)
  export: {
    preview: (conversationId: string, options: ExportOptionsShared) => Promise<IPCResponse<ExportPreviewSharedV2>>
    execute: (conversationId: string, options: ExportOptionsShared) => Promise<IPCResponse<void>>
    copyToClipboard: (messageIds: string[], format: string) => Promise<IPCResponse<string>>
  }

  // Model operations (TASK034)
  model: {
    getCurrent: (conversationId: string) => Promise<IPCResponse<string>>
    getAvailable: () => Promise<IPCResponse<ConfiguredModelShared[]>>
    switchModel: (conversationId: string, modelId: string) => Promise<IPCResponse<void>>
    getStatus: (modelId: string) => Promise<IPCResponse<ConfiguredModelShared>>
    onSwitched: (callback: (event: ModelSwitchedEventShared) => void) => () => void
  }

  // QuickSettings operations (TASK034)
  quickSettings: {
    get: () => Promise<IPCResponse<QuickSettingsStateShared>>
    update: (patch: Partial<QuickSettingsStateShared>) => Promise<IPCResponse<void>>
  }

  // Prompt Library operations (TASK035)
  promptLibrary: {
    listAll: () => Promise<IPCResponse<PromptMetadata[]>>
    read: (id: string) => Promise<IPCResponse<PromptContent>>
    deriveUserCopy: (id: string) => Promise<IPCResponse<{ userPath: string }>>
    resetUserOverride: (id: string) => Promise<IPCResponse<void>>
    validate: (id: string, content: string) => Promise<IPCResponse<PromptValidationResult>>
    estimateTokens: (content: string) => Promise<IPCResponse<number>>
  }

  // Sub-agent operations (TASK038)
  subAgent: {
    list: () => Promise<IPCResponse<SubAgentMetadata[]>>
    create: (template: SubAgentTemplate) => Promise<IPCResponse<{ agentId: string }>>
    trace: (traceId: string) => Promise<IPCResponse<SubAgentTrace>>
  }

  // Workflow operations (TASK039)
  workflow: {
    list: () => Promise<IPCResponse<WorkflowDefinition[]>>
    triggerManual: (workflowId: string, params: Record<string, unknown>) => Promise<IPCResponse<{ runId: string }>>
    getRun: (runId: string) => Promise<IPCResponse<WorkflowRun | null>>
    cancelRun: (runId: string) => Promise<IPCResponse<void>>
    listRuns: (filter?: RunFilter) => Promise<IPCResponse<WorkflowRunSummary[]>>
    confirmStep: (runId: string, decision: 'confirm' | 'skip' | 'cancel') => Promise<IPCResponse<void>>
    onConfirmationRequired: (callback: (request: WorkflowConfirmationRequest) => void) => () => void
  }

  // Import Pipeline operations (TASK040)
  importPipeline: {
    plan: (input: string) => Promise<IPCResponse<unknown>>
    execute: (input: string, options?: Record<string, unknown>) => Promise<IPCResponse<unknown>>
    cancel: () => Promise<IPCResponse<void>>
    pause: () => Promise<IPCResponse<void>>
    resume: () => Promise<IPCResponse<void>>
    onProgress: (callback: (data: Record<string, unknown>) => void) => () => void
    history: () => Promise<IPCResponse<unknown[]>>
    rollback: (importId: string) => Promise<IPCResponse<unknown>>
    onClassification: (callback: (data: ClassificationConfirmationPayload) => void) => () => void
    confirmClassification: (importId: string, result: ClassificationResultShared) => Promise<IPCResponse<void>>
  }
  
  // Event listeners (for future use)
  on: (channel: IPCChannel, callback: (...args: unknown[]) => void) => () => void
  off: (channel: IPCChannel, callback: (...args: unknown[]) => void) => () => void

  // MCP operations (TASK042)
  mcp: {
    connect: (config: MCPServerConfigShared) => Promise<IPCResponse<void>>
    disconnect: (serverName: string) => Promise<IPCResponse<void>>
    listServers: () => Promise<IPCResponse<MCPServerInfoShared[]>>
    listTools: () => Promise<IPCResponse<MCPToolShared[]>>
    callTool: (serverName: string, toolName: string, args: Record<string, unknown>) => Promise<IPCResponse<MCPToolResultShared>>
    grantPermission: (requestId: string, level: MCPPermissionLevelShared) => Promise<IPCResponse<void>>
    revokePermission: (serverName: string, toolName: string) => Promise<IPCResponse<void>>
    onPermissionPrompt: (callback: (prompt: MCPPermissionPromptShared) => void) => () => void
    onServerStatusChanged: (callback: (info: MCPServerInfoShared) => void) => () => void
    // TASK043 sync methods
    configureSync: (config: SyncTaskConfigShared) => Promise<IPCResponse<void>>
    triggerSync: (taskId: string) => Promise<IPCResponse<SyncProgressShared>>
    listSyncTasks: () => Promise<IPCResponse<SyncTaskWithStateShared[]>>
    pauseSync: (taskId: string) => Promise<IPCResponse<void>>
    resumeSync: (taskId: string) => Promise<IPCResponse<void>>
    onSyncProgress: (callback: (progress: SyncProgressShared) => void) => () => void
  }

  // App configuration (TASK044)
  app: {
    getConfig: () => Promise<IPCResponse<AppConfig>>
    updateConfig: (updates: Partial<AppConfig>) => Promise<IPCResponse<void>>
  }
}

// Whitelist of allowed channels for security
const ALLOWED_CHANNELS: IPCChannel[] = [
  IPC_CHANNELS.TEST_PING,
  IPC_CHANNELS.TEST_ECHO,
  IPC_CHANNELS.SYSTEM_INFO,
  IPC_CHANNELS.SYSTEM_PLATFORM,
  IPC_CHANNELS.SYSTEM_VERSION,
  IPC_CHANNELS.NOTIFICATION,
  IPC_CHANNELS.LOG_MESSAGE,
  IPC_CHANNELS.FILE_CHANGED,
  IPC_CHANNELS.GIT_STATUS_CHANGED,
  // File operations
  IPC_CHANNELS.FILE_READ,
  IPC_CHANNELS.FILE_WRITE,
  IPC_CHANNELS.FILE_DELETE,
  IPC_CHANNELS.FILE_COPY,
  IPC_CHANNELS.FILE_MOVE,
  IPC_CHANNELS.FILE_LIST,
  IPC_CHANNELS.FILE_INFO,
  IPC_CHANNELS.FILE_EXISTS,
  // Directory operations
  IPC_CHANNELS.DIR_CREATE,
  IPC_CHANNELS.DIR_DELETE,
  // File watching
  IPC_CHANNELS.FILE_WATCH_START,
  IPC_CHANNELS.FILE_WATCH_STOP,
  IPC_CHANNELS.FILE_WATCH_EVENT,
  // File import
  IPC_CHANNELS.FILE_IMPORT,
  IPC_CHANNELS.FILE_IMPORT_PROGRESS,
  // Auto-save
  IPC_CHANNELS.FILE_NOTIFY_CHANGE,
  IPC_CHANNELS.FILE_AUTO_SAVED,
  IPC_CHANNELS.FILE_SAVE_FAILED,
  IPC_CHANNELS.FILE_RETRY_SAVE,
  // Workspace operations
  IPC_CHANNELS.WORKSPACE_CREATE,
  IPC_CHANNELS.WORKSPACE_OPEN,
  IPC_CHANNELS.WORKSPACE_CLOSE,
  IPC_CHANNELS.WORKSPACE_GET_CURRENT,
  IPC_CHANNELS.WORKSPACE_VALIDATE,
  IPC_CHANNELS.WORKSPACE_SELECT_FOLDER,
  IPC_CHANNELS.WORKSPACE_GET_CONFIG,
  IPC_CHANNELS.WORKSPACE_UPDATE_CONFIG,
  IPC_CHANNELS.WORKSPACE_GET_METADATA,
  // Workspace member management
  IPC_CHANNELS.WORKSPACE_GET_MEMBERS,
  IPC_CHANNELS.WORKSPACE_INVITE_MEMBER,
  IPC_CHANNELS.WORKSPACE_UPDATE_MEMBER_ROLE,
  IPC_CHANNELS.WORKSPACE_REMOVE_MEMBER,
  // Sync operations
  IPC_CHANNELS.SYNC_FORCE,
  IPC_CHANNELS.SYNC_STATUS_CHANGED,
  IPC_CHANNELS.SYNC_GET_STATE,
  // Git conflict operations
  IPC_CHANNELS.GIT_GET_CONFLICTS,
  IPC_CHANNELS.GIT_RESOLVE,
  IPC_CHANNELS.GIT_CONFLICT_DETECTED,
  // Git version history operations
  IPC_CHANNELS.GIT_HISTORY,
  IPC_CHANNELS.GIT_DIFF,
  IPC_CHANNELS.GIT_RESTORE,
  // Auth operations
  IPC_CHANNELS.AUTH_LOGIN,
  IPC_CHANNELS.AUTH_REGISTER,
  IPC_CHANNELS.AUTH_LOGOUT,
  IPC_CHANNELS.AUTH_GET_CURRENT_USER,
  IPC_CHANNELS.AUTH_REFRESH_TOKEN,
  // AI operations
  IPC_CHANNELS.AI_CHAT,
  IPC_CHANNELS.AI_STREAM,
  IPC_CHANNELS.AI_STREAM_CHUNK,
  IPC_CHANNELS.AI_STREAM_END,
  IPC_CHANNELS.AI_STREAM_ERROR,
  IPC_CHANNELS.AI_STREAM_ABORT,
  IPC_CHANNELS.AI_EMBED,
  IPC_CHANNELS.AI_CONTEXT_FILES,
  IPC_CHANNELS.AI_SKILL_LIST,
  IPC_CHANNELS.AI_SKILL_SEARCH,
  // Memory operations
  IPC_CHANNELS.MEMORY_SNAPSHOT,
  IPC_CHANNELS.MEMORY_UPDATE,
  IPC_CHANNELS.MEMORY_FLUSH,
  IPC_CHANNELS.MEMORY_DAILY_LOG_QUERY,
  // Memory v2 operations
  IPC_CHANNELS.MEMORY_V2_LIST_ENTRIES,
  IPC_CHANNELS.MEMORY_V2_LIST_ARCHIVED,
  IPC_CHANNELS.MEMORY_V2_SEARCH,
  IPC_CHANNELS.MEMORY_V2_GET_ENTRY,
  IPC_CHANNELS.MEMORY_V2_GET_STATS,
  IPC_CHANNELS.MEMORY_V2_UPDATE_ENTRY,
  IPC_CHANNELS.MEMORY_V2_DELETE_ENTRY,
  IPC_CHANNELS.MEMORY_V2_LOCK_ENTRY,
  IPC_CHANNELS.MEMORY_V2_TRIGGER_CHECKPOINT,
  IPC_CHANNELS.MEMORY_V2_TRIGGER_COMPRESSION,
  IPC_CHANNELS.MEMORY_V2_UNDO_LAST_COMPRESSION,
  IPC_CHANNELS.MEMORY_V2_GET_EVOLUTION_HISTORY,
  IPC_CHANNELS.MEMORY_V2_REBUILD_INDEX,
  IPC_CHANNELS.MEMORY_V2_GET_INDEX_HEALTH,
  IPC_CHANNELS.MEMORY_V2_GET_CONFIG,
  IPC_CHANNELS.MEMORY_V2_UPDATE_CONFIG,
  // Memory v2 push events
  IPC_CHANNELS.MEMORY_V2_CHECKPOINT_STARTED,
  IPC_CHANNELS.MEMORY_V2_CHECKPOINT_COMPLETED,
  IPC_CHANNELS.MEMORY_V2_CHECKPOINT_FAILED,
  IPC_CHANNELS.MEMORY_V2_ENTRY_ADDED,
  IPC_CHANNELS.MEMORY_V2_ENTRY_UPDATED,
  IPC_CHANNELS.MEMORY_V2_ENTRY_DELETED,
  // RAG operations
  IPC_CHANNELS.RAG_SEARCH,
  IPC_CHANNELS.RAG_REBUILD,
  // Window control
  IPC_CHANNELS.WINDOW_MINIMIZE,
  IPC_CHANNELS.WINDOW_MAXIMIZE,
  IPC_CHANNELS.WINDOW_CLOSE,
  IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN,
  // Search operations
  IPC_CHANNELS.SEARCH_QUERY,
  IPC_CHANNELS.SEARCH_INDEX_STATUS,
  IPC_CHANNELS.SEARCH_REINDEX,
  IPC_CHANNELS.SEARCH_INDEX_PROGRESS,
  // Harness operations
  IPC_CHANNELS.HARNESS_EXECUTE,
  IPC_CHANNELS.HARNESS_SET_MODE,
  IPC_CHANNELS.HARNESS_GET_MODE,
  IPC_CHANNELS.HARNESS_DEGRADATION_OCCURRED,
  IPC_CHANNELS.HARNESS_GUARDRAIL_BLOCKED,
  IPC_CHANNELS.HARNESS_LIST_GUARDRAILS,
  IPC_CHANNELS.HARNESS_SET_GUARDRAIL_ENABLED,
  // TASK021: Task state machine channels
  IPC_CHANNELS.HARNESS_LIST_RESUMEABLE,
  IPC_CHANNELS.HARNESS_RESUME_TASK,
  IPC_CHANNELS.HARNESS_ABANDON_TASK,
  IPC_CHANNELS.HARNESS_RESUMEABLE_DETECTED,
  // Trace operations (TASK029)
  IPC_CHANNELS.TRACE_GET_TREE,
  IPC_CHANNELS.TRACE_QUERY,
  IPC_CHANNELS.TRACE_GET_RECENT,
  IPC_CHANNELS.TRACE_GET_STATS,
  IPC_CHANNELS.TRACE_LOCK,
  IPC_CHANNELS.TRACE_UNLOCK,
  IPC_CHANNELS.TRACE_CLEANUP,
  IPC_CHANNELS.TRACE_PREVIEW_EXPORT,
  IPC_CHANNELS.TRACE_EXPORT,
  IPC_CHANNELS.TRACE_IMPORT,
  IPC_CHANNELS.TRACE_REBUILD_SNAPSHOT,
  IPC_CHANNELS.TRACE_RERUN,
  IPC_CHANNELS.TRACE_SPAN_ENDED,
  IPC_CHANNELS.TRACE_UPDATE,
  // Performance operations (TASK029)
  IPC_CHANNELS.PERFORMANCE_GET_METRICS,
  IPC_CHANNELS.PERFORMANCE_GET_ALERTS,
  IPC_CHANNELS.PERFORMANCE_SUPPRESS,
  IPC_CHANNELS.PERFORMANCE_METRICS,
  IPC_CHANNELS.PERFORMANCE_ALERT,
  IPC_CHANNELS.PERFORMANCE_ALERT_CLEARED,
  // Progress operations (TASK029)
  IPC_CHANNELS.PROGRESS_GET_SNAPSHOT,
  IPC_CHANNELS.PROGRESS_GET_TASK,
  IPC_CHANNELS.PROGRESS_EDIT_NOTE,
  IPC_CHANNELS.PROGRESS_GET_ARCHIVE,
  IPC_CHANNELS.PROGRESS_TASK_DECLARED,
  IPC_CHANNELS.PROGRESS_TASK_UPDATED,
  IPC_CHANNELS.PROGRESS_TASK_COMPLETED,
  IPC_CHANNELS.PROGRESS_TASK_FAILED,
  // Inspector operations (TASK029)
  IPC_CHANNELS.INSPECTOR_OPEN,
  // Conversation operations
  IPC_CHANNELS.CONVERSATION_CREATE,
  IPC_CHANNELS.CONVERSATION_APPEND_MESSAGE,
  IPC_CHANNELS.CONVERSATION_GET_MESSAGES,
  IPC_CHANNELS.CONVERSATION_LIST,
  IPC_CHANNELS.CONVERSATION_LOAD_LATEST,
  // AI Mode operations (TASK030)
  IPC_CHANNELS.AI_MODE_GET_ALL,
  IPC_CHANNELS.AI_MODE_GET_ACTIVE,
  IPC_CHANNELS.AI_MODE_SWITCH,
  IPC_CHANNELS.AI_MODE_CHANGED,
  // Plan operations (TASK031)
  IPC_CHANNELS.PLAN_GET_ACTIVE,
  IPC_CHANNELS.PLAN_GET,
  IPC_CHANNELS.PLAN_START_EXECUTION,
  IPC_CHANNELS.PLAN_ARCHIVE,
  IPC_CHANNELS.PLAN_ABANDON,
  IPC_CHANNELS.PLAN_FOLLOW_UP,
  IPC_CHANNELS.PLAN_CREATED,
  IPC_CHANNELS.PLAN_EXECUTION_STARTED,
  IPC_CHANNELS.PLAN_STEPS_COMPLETED,
  IPC_CHANNELS.PLAN_ARCHIVED,
  IPC_CHANNELS.PLAN_ABANDONED,
  // Prompt Optimizer operations (TASK032)
  IPC_CHANNELS.PROMPT_OPTIMIZER_OPTIMIZE,
  IPC_CHANNELS.PROMPT_OPTIMIZER_RECORD_ACTION,
  // Command Palette operations (TASK032)
  IPC_CHANNELS.COMMAND_SEARCH,
  IPC_CHANNELS.COMMAND_EXECUTE,
  // Handbook operations (TASK033)
  IPC_CHANNELS.HANDBOOK_SEARCH,
  IPC_CHANNELS.HANDBOOK_GET_ENTRY,
  IPC_CHANNELS.HANDBOOK_CLONE,
  IPC_CHANNELS.HANDBOOK_CHECK_UPDATES,
  // DataSource operations (TASK033)
  IPC_CHANNELS.DATASOURCE_LIST_PROVIDERS,
  IPC_CHANNELS.DATASOURCE_QUERY,
  IPC_CHANNELS.DATASOURCE_GET_PROVIDER_STATUS,
  IPC_CHANNELS.DATASOURCE_RATE_LIMIT_EXHAUSTED,
  IPC_CHANNELS.DATASOURCE_PROVIDER_REGISTERED,
  // Export operations (TASK034)
  IPC_CHANNELS.EXPORT_PREVIEW,
  IPC_CHANNELS.EXPORT_EXECUTE,
  IPC_CHANNELS.EXPORT_COPY_CLIPBOARD,
  // Model operations (TASK034)
  IPC_CHANNELS.MODEL_GET_CURRENT,
  IPC_CHANNELS.MODEL_GET_AVAILABLE,
  IPC_CHANNELS.MODEL_SWITCH,
  IPC_CHANNELS.MODEL_GET_STATUS,
  IPC_CHANNELS.MODEL_SWITCHED,
  // QuickSettings operations (TASK034)
  IPC_CHANNELS.QUICK_SETTINGS_GET,
  IPC_CHANNELS.QUICK_SETTINGS_UPDATE,
  // Prompt Library operations (TASK035)
  IPC_CHANNELS.PROMPT_LIBRARY_LIST_ALL,
  IPC_CHANNELS.PROMPT_LIBRARY_READ,
  IPC_CHANNELS.PROMPT_LIBRARY_DERIVE_USER_COPY,
  IPC_CHANNELS.PROMPT_LIBRARY_RESET_USER_OVERRIDE,
  IPC_CHANNELS.PROMPT_LIBRARY_VALIDATE,
  IPC_CHANNELS.PROMPT_LIBRARY_ESTIMATE_TOKENS,
  // Sub-agent operations (TASK038)
  IPC_CHANNELS.SUB_AGENT_LIST,
  IPC_CHANNELS.SUB_AGENT_CREATE,
  IPC_CHANNELS.SUB_AGENT_TRACE,
  // Workflow operations (TASK039)
  IPC_CHANNELS.WORKFLOW_LIST,
  IPC_CHANNELS.WORKFLOW_TRIGGER_MANUAL,
  IPC_CHANNELS.WORKFLOW_GET_RUN,
  IPC_CHANNELS.WORKFLOW_CANCEL_RUN,
  IPC_CHANNELS.WORKFLOW_LIST_RUNS,
  IPC_CHANNELS.WORKFLOW_CONFIRMATION_REQUIRED,
  IPC_CHANNELS.WORKFLOW_CONFIRM_STEP,
  // Import Pipeline operations (TASK040)
  IPC_CHANNELS.FILE_IMPORT_PLAN,
  IPC_CHANNELS.FILE_IMPORT_EXECUTE,
  IPC_CHANNELS.FILE_IMPORT_CANCEL,
  IPC_CHANNELS.FILE_IMPORT_PAUSE,
  IPC_CHANNELS.FILE_IMPORT_RESUME,
  IPC_CHANNELS.FILE_IMPORT_PIPELINE_PROGRESS,
  IPC_CHANNELS.FILE_IMPORT_HISTORY,
  IPC_CHANNELS.FILE_IMPORT_ROLLBACK,
  // Import Classification operations (TASK041)
  IPC_CHANNELS.FILE_IMPORT_CLASSIFICATION,
  IPC_CHANNELS.FILE_IMPORT_CONFIRM_CLASSIFICATION,
  // MCP operations (TASK042)
  IPC_CHANNELS.MCP_CONNECT,
  IPC_CHANNELS.MCP_DISCONNECT,
  IPC_CHANNELS.MCP_LIST_SERVERS,
  IPC_CHANNELS.MCP_LIST_TOOLS,
  IPC_CHANNELS.MCP_CALL_TOOL,
  IPC_CHANNELS.MCP_PERMISSION_PROMPT,
  IPC_CHANNELS.MCP_GRANT_PERMISSION,
  IPC_CHANNELS.MCP_REVOKE_PERMISSION,
  IPC_CHANNELS.MCP_SERVER_STATUS_CHANGED,
  // MCP Sync operations (TASK043)
  IPC_CHANNELS.MCP_CONFIGURE_SYNC,
  IPC_CHANNELS.MCP_TRIGGER_SYNC,
  IPC_CHANNELS.MCP_SYNC_PROGRESS,
  IPC_CHANNELS.MCP_LIST_SYNC_TASKS,
  IPC_CHANNELS.MCP_PAUSE_SYNC,
  IPC_CHANNELS.MCP_RESUME_SYNC,
  // App configuration (TASK044)
  IPC_CHANNELS.APP_GET_CONFIG,
  IPC_CHANNELS.APP_UPDATE_CONFIG,
]

/**
 * Check if running in development mode
 */
const isDev = process.env.NODE_ENV === 'development'

/**
 * Validate if a channel is allowed
 *
 * This function checks if a given channel is in the whitelist
 * to prevent unauthorized IPC communication.
 *
 * @param channel - The channel name to validate
 * @returns true if the channel is allowed, false otherwise
 */
function isChannelAllowed(channel: string): boolean {
  const isAllowed = ALLOWED_CHANNELS.includes(channel as IPCChannel)
  
  if (!isAllowed) {
    console.warn(`[Preload] Attempted to use unauthorized channel: ${channel}`)
  }
  
  return isAllowed
}

/**
 * Create a safe IPC invoke wrapper with logging, error handling, and timeout protection
 *
 * This function handles both business logic errors (from main process handlers)
 * and IPC communication errors (network failures, process crashes, etc.)
 *
 * @param channel - The IPC channel to invoke
 * @param args - Arguments to pass to the handler (last arg can be timeout config)
 * @returns Promise resolving to the IPC response
 */
async function safeInvoke<T>(
  channel: IPCChannel,
  ...args: unknown[]
): Promise<IPCResponse<T>> {
  // Default timeout: 30 seconds
  const DEFAULT_TIMEOUT = 30000
  const timeout = DEFAULT_TIMEOUT
  
  if (isDev) {
    console.debug(`[Preload] Invoking channel: ${channel}`, args.length > 0 ? args : '')
  }
  
  try {
    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`IPC timeout after ${timeout}ms`))
      }, timeout)
    })
    
    // Race between actual IPC call and timeout
    const response = await Promise.race([
      ipcRenderer.invoke(channel, ...args),
      timeoutPromise
    ])
    
    if (isDev) {
      console.debug(`[Preload] Response from ${channel}:`, response.success ? 'success' : 'error')
    }
    
    return response
  } catch (error) {
    // Catch IPC communication layer errors (not business logic errors)
    const isTimeout = error instanceof Error && error.message.includes('timeout')
    console.error(
      `[Preload] IPC ${isTimeout ? 'timeout' : 'communication error'} on channel ${channel}:`,
      error
    )
    return {
      success: false,
      error: {
        type: ErrorType.IPC_ERROR,
        message: error instanceof Error ? error.message : 'IPC communication failed',
      },
      timestamp: Date.now(),
    }
  }
}

// Implement the API
const api: ElectronAPI = {
  // Test ping
  ping: async () => {
    return await safeInvoke<string>(IPC_CHANNELS.TEST_PING)
  },
  
  // Test echo
  echo: async (message: string, delay?: number) => {
    const request: EchoRequest = { message, delay }
    return await safeInvoke<string>(IPC_CHANNELS.TEST_ECHO, request)
  },
  
  // Get system information
  getSystemInfo: async () => {
    return await safeInvoke<SystemInfo>(IPC_CHANNELS.SYSTEM_INFO)
  },
  
  // Get platform
  getPlatform: async () => {
    return await safeInvoke<NodeJS.Platform>(IPC_CHANNELS.SYSTEM_PLATFORM)
  },
  
  // Get app version
  getVersion: async () => {
    return await safeInvoke<string>(IPC_CHANNELS.SYSTEM_VERSION)
  },
  
  // File operations
  file: {
    read: async (path: string, options?: FileReadOptions) => {
      return await safeInvoke<FileContent>(IPC_CHANNELS.FILE_READ, path, options)
    },
    
    write: async (path: string, content: string, options?: FileWriteOptions) => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_WRITE, path, content, options)
    },
    
    delete: async (path: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_DELETE, path)
    },
    
    copy: async (sourcePath: string, destPath: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_COPY, sourcePath, destPath)
    },
    
    move: async (sourcePath: string, destPath: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_MOVE, sourcePath, destPath)
    },
    
    list: async (path: string, options?: ListFilesOptions) => {
      return await safeInvoke<FileInfo[]>(IPC_CHANNELS.FILE_LIST, path, options)
    },
    
    getInfo: async (path: string) => {
      return await safeInvoke<FileInfo>(IPC_CHANNELS.FILE_INFO, path)
    },
    
    exists: async (path: string) => {
      return await safeInvoke<boolean>(IPC_CHANNELS.FILE_EXISTS, path)
    },
    
    createDir: async (path: string, recursive?: boolean) => {
      return await safeInvoke<void>(IPC_CHANNELS.DIR_CREATE, path, recursive)
    },
    
    deleteDir: async (path: string, recursive?: boolean) => {
      return await safeInvoke<void>(IPC_CHANNELS.DIR_DELETE, path, recursive)
    },
    
    startWatching: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_WATCH_START)
    },
    
    stopWatching: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_WATCH_STOP)
    },
    
    onFileChange: (callback: (event: FileWatchEvent) => void) => {
      return api.on(IPC_CHANNELS.FILE_WATCH_EVENT, callback as (...args: unknown[]) => void)
    },
    
    import: async (sourcePaths: string[], options?: ImportOptions) => {
      return await safeInvoke<ImportResult>(IPC_CHANNELS.FILE_IMPORT, sourcePaths, options)
    },
    
    onImportProgress: (callback: (data: ImportProgress) => void) => {
      const handler = (_event: IpcRendererEvent, data: ImportProgress) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.FILE_IMPORT_PROGRESS, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.FILE_IMPORT_PROGRESS, handler)
      }
    },

    notifyChange: (filePath: string, content: string) => {
      ipcRenderer.send(IPC_CHANNELS.FILE_NOTIFY_CHANGE, filePath, content)
    },

    onAutoSaved: (callback: (data: AutoSavedPayload) => void) => {
      const handler = (_event: IpcRendererEvent, data: AutoSavedPayload) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.FILE_AUTO_SAVED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.FILE_AUTO_SAVED, handler)
      }
    },

    onSaveFailed: (callback: (data: SaveFailedPayload) => void) => {
      const handler = (_event: IpcRendererEvent, data: SaveFailedPayload) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.FILE_SAVE_FAILED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.FILE_SAVE_FAILED, handler)
      }
    },

    retrySave: (filePath: string) => {
      return safeInvoke<void>(IPC_CHANNELS.FILE_RETRY_SAVE, filePath)
    },
  },
  
  // Workspace operations
  workspace: {
    create: async (options: CreateWorkspaceOptions) => {
      return await safeInvoke<WorkspaceInfo>(IPC_CHANNELS.WORKSPACE_CREATE, options)
    },
    
    open: async (path: string) => {
      return await safeInvoke<WorkspaceInfo>(IPC_CHANNELS.WORKSPACE_OPEN, path)
    },
    
    close: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.WORKSPACE_CLOSE)
    },
    
    getCurrent: async () => {
      return await safeInvoke<WorkspaceInfo | null>(IPC_CHANNELS.WORKSPACE_GET_CURRENT)
    },
    
    validate: async (path: string) => {
      return await safeInvoke<boolean>(IPC_CHANNELS.WORKSPACE_VALIDATE, path)
    },
    
    selectFolder: async () => {
      return await safeInvoke<string | null>(IPC_CHANNELS.WORKSPACE_SELECT_FOLDER)
    },
    
    getConfig: async () => {
      return await safeInvoke<WorkspaceConfig>(IPC_CHANNELS.WORKSPACE_GET_CONFIG)
    },
    
    updateConfig: async (updates: Partial<WorkspaceConfig>) => {
      return await safeInvoke<void>(IPC_CHANNELS.WORKSPACE_UPDATE_CONFIG, updates)
    },
    
    getMetadata: async () => {
      return await safeInvoke<WorkspaceMetadata>(IPC_CHANNELS.WORKSPACE_GET_METADATA)
    },

    getMembers: async (workspaceId: string) => {
      return await safeInvoke<WorkspaceMember[]>(IPC_CHANNELS.WORKSPACE_GET_MEMBERS, workspaceId)
    },

    inviteMember: async (workspaceId: string, request: InviteRequest) => {
      return await safeInvoke<InviteResult>(IPC_CHANNELS.WORKSPACE_INVITE_MEMBER, workspaceId, request)
    },

    updateMemberRole: async (workspaceId: string, userId: string, role: MemberRole) => {
      return await safeInvoke<void>(IPC_CHANNELS.WORKSPACE_UPDATE_MEMBER_ROLE, workspaceId, userId, role)
    },

    removeMember: async (workspaceId: string, userId: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.WORKSPACE_REMOVE_MEMBER, workspaceId, userId)
    },
  },
  
  // Sync operations
  sync: {
    force: async () => {
      return await safeInvoke<SyncResult>(IPC_CHANNELS.SYNC_FORCE)
    },

    getState: async () => {
      return await safeInvoke<SyncStatusData>(IPC_CHANNELS.SYNC_GET_STATE)
    },
    
    onStatusChange: (callback: (data: SyncStatusData) => void) => {
      return api.on(IPC_CHANNELS.SYNC_STATUS_CHANGED, callback as (...args: unknown[]) => void)
    },
  },

  // Git conflict operations
  git: {
    getConflicts: async () => {
      return await safeInvoke<ConflictInfo[]>(IPC_CHANNELS.GIT_GET_CONFLICTS)
    },

    resolve: async (resolution: ConflictResolution) => {
      return await safeInvoke<string>(IPC_CHANNELS.GIT_RESOLVE, resolution)
    },

    onConflictDetected: (callback: (conflicts: ConflictInfo[]) => void) => {
      const handler = (_event: IpcRendererEvent, conflicts: ConflictInfo[]) => callback(conflicts)
      ipcRenderer.on(IPC_CHANNELS.GIT_CONFLICT_DETECTED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.GIT_CONFLICT_DETECTED, handler)
      }
    },

    history: async (options?: HistoryOptions) => {
      return await safeInvoke<readonly CommitInfo[]>(IPC_CHANNELS.GIT_HISTORY, options)
    },

    diff: async (filepath: string, commitA?: string, commitB?: string) => {
      return await safeInvoke<FileDiff>(IPC_CHANNELS.GIT_DIFF, filepath, commitA, commitB)
    },

    restore: async (filepath: string, commitSha: string) => {
      return await safeInvoke<string>(IPC_CHANNELS.GIT_RESTORE, filepath, commitSha)
    },
  },
  
  // Auth operations
  auth: {
    login: async (input: AuthLoginInput) => {
      return await safeInvoke<AuthSession>(IPC_CHANNELS.AUTH_LOGIN, input)
    },
    
    register: async (input: AuthRegisterInput) => {
      return await safeInvoke<AuthSession>(IPC_CHANNELS.AUTH_REGISTER, input)
    },
    
    logout: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.AUTH_LOGOUT)
    },
    
    getCurrentUser: async () => {
      return await safeInvoke<AuthSession>(IPC_CHANNELS.AUTH_GET_CURRENT_USER)
    },
    
    refreshToken: async () => {
      return await safeInvoke<AuthSession>(IPC_CHANNELS.AUTH_REFRESH_TOKEN)
    },
  },

  // AI operations
  ai: {
    chat: async (request: AIChatRequest | string) => {
      return await safeInvoke<AIChatResponse>(IPC_CHANNELS.AI_CHAT, request)
    },

    stream: (request: AIChatRequest | string) => {
      const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const payload = typeof request === 'string'
        ? { message: request, streamId }
        : { ...request, streamId }
      ipcRenderer.send(IPC_CHANNELS.AI_STREAM, payload)
      return streamId
    },

    abortStream: (streamId: string) => {
      ipcRenderer.send(IPC_CHANNELS.AI_STREAM_ABORT, streamId)
    },

    onStreamChunk: (callback: (chunk: AIStreamChunk) => void) => {
      return api.on(
        IPC_CHANNELS.AI_STREAM_CHUNK,
        callback as (...args: unknown[]) => void
      )
    },

    onStreamEnd: (callback: (end: AIStreamEnd) => void) => {
      return api.on(
        IPC_CHANNELS.AI_STREAM_END,
        callback as (...args: unknown[]) => void
      )
    },

    onStreamError: (callback: (error: AIStreamError) => void) => {
      return api.on(
        IPC_CHANNELS.AI_STREAM_ERROR,
        callback as (...args: unknown[]) => void
      )
    },

    embed: async (request: AIEmbedRequest | string) => {
      return await safeInvoke<AIEmbedResponse>(IPC_CHANNELS.AI_EMBED, request)
    },

    contextFiles: async (query: string, limit?: number) => {
      return await safeInvoke<ContextFileInfo[]>(IPC_CHANNELS.AI_CONTEXT_FILES, query, limit)
    },

    skillList: async () => {
      return await safeInvoke<SkillSummary[]>(IPC_CHANNELS.AI_SKILL_LIST)
    },

    skillSearch: async (params: SkillSearchParams) => {
      return await safeInvoke<SkillSummary[]>(IPC_CHANNELS.AI_SKILL_SEARCH, params)
    },

    skillGet: async (skillId: string) => {
      return await safeInvoke<SkillV2 | null>(IPC_CHANNELS.AI_SKILL_GET, skillId)
    },

    skillCreate: async (template: SkillTemplate) => {
      return await safeInvoke<{ skillId: string; path: string }>(IPC_CHANNELS.AI_SKILL_CREATE, template)
    },

    skillValidate: async (skillId: string) => {
      return await safeInvoke<SkillValidationResultType>(IPC_CHANNELS.AI_SKILL_VALIDATE, skillId)
    },

    skillDelete: async (skillId: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.AI_SKILL_DELETE, skillId)
    },

    skillExport: async (skillId: string) => {
      return await safeInvoke<{ bundlePath: string }>(IPC_CHANNELS.AI_SKILL_EXPORT, skillId)
    },

    skillImport: async (bundlePath: string) => {
      return await safeInvoke<{ skillId: string }>(IPC_CHANNELS.AI_SKILL_IMPORT, bundlePath)
    },

    skillTestRun: async (skillId: string, userInput: string) => {
      return await safeInvoke<SkillResult>(IPC_CHANNELS.AI_SKILL_TEST_RUN, skillId, userInput)
    },
  },

  slashCommand: {
    parse: async (input: string) => {
      return await safeInvoke<ParsedCommand | null>(IPC_CHANNELS.COMMAND_PARSE_SLASH, input)
    },

    create: async (template: SlashCommandTemplate) => {
      return await safeInvoke<{ commandId: string }>(IPC_CHANNELS.COMMAND_CREATE_SLASH, template)
    },

    getSuggestions: async (partial: string) => {
      return await safeInvoke<CommandSuggestion[]>(IPC_CHANNELS.COMMAND_GET_SUGGESTIONS, partial)
    },
  },

  // Memory operations
  memory: {
    // v1 (deprecated, kept for backward compatibility)
    snapshot: async () => {
      return await safeInvoke<MemorySnapshotResponse>(IPC_CHANNELS.MEMORY_SNAPSHOT)
    },

    update: async (request: MemoryUpdateRequest) => {
      return await safeInvoke<MemorySnapshotResponse>(IPC_CHANNELS.MEMORY_UPDATE, request)
    },

    flush: async (request: MemoryFlushRequest) => {
      return await safeInvoke<MemoryFlushResponse>(IPC_CHANNELS.MEMORY_FLUSH, request)
    },

    queryDailyLog: async (request: DailyLogQueryRequest) => {
      return await safeInvoke<DailyLogEntry[]>(IPC_CHANNELS.MEMORY_DAILY_LOG_QUERY, request)
    },

    // v2 operations
    listEntries: async () => {
      return await safeInvoke<MemoryEntry[]>(IPC_CHANNELS.MEMORY_V2_LIST_ENTRIES)
    },

    listArchived: async () => {
      return await safeInvoke<MemoryEntry[]>(IPC_CHANNELS.MEMORY_V2_LIST_ARCHIVED)
    },

    search: async (query: string, options?: { limit?: number; sections?: string[] }) => {
      return await safeInvoke<HybridSearchResult[]>(IPC_CHANNELS.MEMORY_V2_SEARCH, query, options)
    },

    getEntry: async (id: string) => {
      return await safeInvoke<MemoryEntry | null>(IPC_CHANNELS.MEMORY_V2_GET_ENTRY, id)
    },

    getStats: async () => {
      return await safeInvoke<MemoryV2StatsResponse>(IPC_CHANNELS.MEMORY_V2_GET_STATS)
    },

    updateEntry: async (id: string, updates: Partial<MemoryEntry>) => {
      return await safeInvoke<void>(IPC_CHANNELS.MEMORY_V2_UPDATE_ENTRY, id, updates)
    },

    deleteEntry: async (id: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.MEMORY_V2_DELETE_ENTRY, id)
    },

    lockEntry: async (id: string, locked: boolean) => {
      return await safeInvoke<void>(IPC_CHANNELS.MEMORY_V2_LOCK_ENTRY, id, locked)
    },

    triggerCheckpoint: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.MEMORY_V2_TRIGGER_CHECKPOINT)
    },

    triggerCompression: async () => {
      return await safeInvoke<CompressionResult>(IPC_CHANNELS.MEMORY_V2_TRIGGER_COMPRESSION)
    },

    undoLastCompression: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.MEMORY_V2_UNDO_LAST_COMPRESSION)
    },

    getEvolutionHistory: async (entryId?: string) => {
      return await safeInvoke<EvolutionEvent[]>(IPC_CHANNELS.MEMORY_V2_GET_EVOLUTION_HISTORY, entryId)
    },

    rebuildIndex: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.MEMORY_V2_REBUILD_INDEX)
    },

    getIndexHealth: async () => {
      return await safeInvoke<{ healthy: boolean; entryCount: number }>(IPC_CHANNELS.MEMORY_V2_GET_INDEX_HEALTH)
    },

    getConfig: async () => {
      return await safeInvoke<MemoryConfig>(IPC_CHANNELS.MEMORY_V2_GET_CONFIG)
    },

    updateConfig: async (patch: Partial<MemoryConfig>) => {
      return await safeInvoke<void>(IPC_CHANNELS.MEMORY_V2_UPDATE_CONFIG, patch)
    },

    // v2 event listeners
    onCheckpointStarted: (callback: (record: CheckpointRecord) => void) => {
      const handler = (_event: IpcRendererEvent, record: CheckpointRecord) => callback(record)
      ipcRenderer.on(IPC_CHANNELS.MEMORY_V2_CHECKPOINT_STARTED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MEMORY_V2_CHECKPOINT_STARTED, handler)
      }
    },

    onCheckpointCompleted: (callback: (record: CheckpointRecord) => void) => {
      const handler = (_event: IpcRendererEvent, record: CheckpointRecord) => callback(record)
      ipcRenderer.on(IPC_CHANNELS.MEMORY_V2_CHECKPOINT_COMPLETED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MEMORY_V2_CHECKPOINT_COMPLETED, handler)
      }
    },

    onCheckpointFailed: (callback: (record: CheckpointRecord) => void) => {
      const handler = (_event: IpcRendererEvent, record: CheckpointRecord) => callback(record)
      ipcRenderer.on(IPC_CHANNELS.MEMORY_V2_CHECKPOINT_FAILED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MEMORY_V2_CHECKPOINT_FAILED, handler)
      }
    },

    onEntryAdded: (callback: (entry: MemoryEntry) => void) => {
      const handler = (_event: IpcRendererEvent, entry: MemoryEntry) => callback(entry)
      ipcRenderer.on(IPC_CHANNELS.MEMORY_V2_ENTRY_ADDED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MEMORY_V2_ENTRY_ADDED, handler)
      }
    },

    onEntryUpdated: (callback: (entry: MemoryEntry) => void) => {
      const handler = (_event: IpcRendererEvent, entry: MemoryEntry) => callback(entry)
      ipcRenderer.on(IPC_CHANNELS.MEMORY_V2_ENTRY_UPDATED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MEMORY_V2_ENTRY_UPDATED, handler)
      }
    },

    onEntryDeleted: (callback: (entryId: string) => void) => {
      const handler = (_event: IpcRendererEvent, entryId: string) => callback(entryId)
      ipcRenderer.on(IPC_CHANNELS.MEMORY_V2_ENTRY_DELETED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.MEMORY_V2_ENTRY_DELETED, handler)
      }
    },
  },

  // RAG operations
  rag: {
    search: async (request: RagSearchRequest) => {
      return await safeInvoke<RagSearchHit[]>(IPC_CHANNELS.RAG_SEARCH, request)
    },

    rebuild: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.RAG_REBUILD)
    },
  },

  // Harness operations
  harness: {
    execute: async (request: AIChatRequest) => {
      return await safeInvoke<HarnessResult>(IPC_CHANNELS.HARNESS_EXECUTE, request)
    },

    setMode: async (mode: HarnessMode) => {
      return await safeInvoke<void>(IPC_CHANNELS.HARNESS_SET_MODE, mode)
    },

    getMode: async () => {
      return await safeInvoke<HarnessMode>(IPC_CHANNELS.HARNESS_GET_MODE)
    },

    listGuardrails: async () => {
      return await safeInvoke<GuardrailRuleSummaryShared[]>(IPC_CHANNELS.HARNESS_LIST_GUARDRAILS)
    },

    setGuardrailEnabled: async (request: SetGuardrailEnabledRequest) => {
      return await safeInvoke<void>(IPC_CHANNELS.HARNESS_SET_GUARDRAIL_ENABLED, request)
    },

    onDegradationOccurred: (callback: (warning: DegradationWarning) => void) => {
      const handler = (_event: IpcRendererEvent, warning: DegradationWarning) => callback(warning)
      ipcRenderer.on(IPC_CHANNELS.HARNESS_DEGRADATION_OCCURRED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.HARNESS_DEGRADATION_OCCURRED, handler)
      }
    },

    // TASK021: Task state machine operations
    listResumeable: async () => {
      return await safeInvoke<TaskStateSummary[]>(IPC_CHANNELS.HARNESS_LIST_RESUMEABLE)
    },

    resumeTask: async (taskId: string) => {
      return await safeInvoke<TaskResumeResultShared>(IPC_CHANNELS.HARNESS_RESUME_TASK, taskId)
    },

    abandonTask: async (taskId: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.HARNESS_ABANDON_TASK, taskId)
    },

    onResumeableTaskDetected: (callback: (tasks: TaskStateSummary[]) => void) => {
      const handler = (_event: IpcRendererEvent, tasks: TaskStateSummary[]) => callback(tasks)
      ipcRenderer.on(IPC_CHANNELS.HARNESS_RESUMEABLE_DETECTED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.HARNESS_RESUMEABLE_DETECTED, handler)
      }
    },

    onGuardrailBlocked: (callback: (data: GuardrailNotificationData) => void) => {
      const handler = (_event: IpcRendererEvent, data: GuardrailNotificationData) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.HARNESS_GUARDRAIL_BLOCKED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.HARNESS_GUARDRAIL_BLOCKED, handler)
      }
    },
  },
  
  // Window control
  window: {
    minimize: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.WINDOW_MINIMIZE)
    },
    
    maximize: async () => {
      return await safeInvoke<boolean>(IPC_CHANNELS.WINDOW_MAXIMIZE)
    },
    
    close: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.WINDOW_CLOSE)
    },
    
    toggleFullscreen: async () => {
      return await safeInvoke<boolean>(IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN)
    },
  },

  // Search operations
  search: {
    query: async (params: SearchQueryParams) => {
      return await safeInvoke<SearchResult[]>(IPC_CHANNELS.SEARCH_QUERY, params)
    },

    indexStatus: async () => {
      return await safeInvoke<SearchIndexStatus>(IPC_CHANNELS.SEARCH_INDEX_STATUS)
    },

    reindex: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.SEARCH_REINDEX)
    },

    onIndexProgress: (callback: (progress: SearchIndexProgress) => void) => {
      const handler = (_event: IpcRendererEvent, progress: SearchIndexProgress) => callback(progress)
      ipcRenderer.on(IPC_CHANNELS.SEARCH_INDEX_PROGRESS, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.SEARCH_INDEX_PROGRESS, handler)
      }
    },
  },

  // Trace operations (TASK029)
  trace: {
    getTraceTree: async (traceId: string) => {
      return await safeInvoke<SerializedSpanShared[]>(IPC_CHANNELS.TRACE_GET_TREE, traceId)
    },
    query: async (filter: TraceQueryFilterShared) => {
      return await safeInvoke<SerializedSpanShared[]>(IPC_CHANNELS.TRACE_QUERY, filter)
    },
    getRecentTraces: async (limit: number) => {
      return await safeInvoke<RecentTraceInfoShared[]>(IPC_CHANNELS.TRACE_GET_RECENT, limit)
    },
    getStats: async () => {
      return await safeInvoke<TraceStatsShared>(IPC_CHANNELS.TRACE_GET_STATS)
    },
    lockTrace: async (traceId: string, reason?: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.TRACE_LOCK, traceId, reason)
    },
    unlockTrace: async (traceId: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.TRACE_UNLOCK, traceId)
    },
    cleanup: async () => {
      return await safeInvoke<{ deleted: number }>(IPC_CHANNELS.TRACE_CLEANUP)
    },
    previewExport: async (traceIds: string[], customRules?: RedactionRuleShared[]) => {
      return await safeInvoke<ExportPreviewShared>(IPC_CHANNELS.TRACE_PREVIEW_EXPORT, traceIds, customRules)
    },
    exportTrace: async (traceIds: string[], outputPath: string, customRules?: RedactionRuleShared[]) => {
      return await safeInvoke<void>(IPC_CHANNELS.TRACE_EXPORT, traceIds, outputPath, customRules)
    },
    importTrace: async (filePath: string) => {
      return await safeInvoke<{ traceIds: string[] }>(IPC_CHANNELS.TRACE_IMPORT, filePath)
    },
    rebuildSnapshot: async (traceId: string) => {
      return await safeInvoke<TraceSnapshotShared>(IPC_CHANNELS.TRACE_REBUILD_SNAPSHOT, traceId)
    },
    rerun: async (traceId: string) => {
      return await safeInvoke<{ newTraceId: string }>(IPC_CHANNELS.TRACE_RERUN, traceId)
    },
    onTraceUpdate: (callback: (traceId: string) => void) => {
      const handler = (_event: IpcRendererEvent, traceId: string) => callback(traceId)
      ipcRenderer.on(IPC_CHANNELS.TRACE_UPDATE, handler)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.TRACE_UPDATE, handler) }
    },
    onSpanEnded: (callback: (span: SerializedSpanShared) => void) => {
      const handler = (_event: IpcRendererEvent, span: SerializedSpanShared) => callback(span)
      ipcRenderer.on(IPC_CHANNELS.TRACE_SPAN_ENDED, handler)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.TRACE_SPAN_ENDED, handler) }
    },
  },

  // Performance operations (TASK029)
  performance: {
    getMetrics: async () => {
      return await safeInvoke<PerformanceMetricsShared | null>(IPC_CHANNELS.PERFORMANCE_GET_METRICS)
    },
    getAlerts: async () => {
      return await safeInvoke<PerformanceAlertShared[]>(IPC_CHANNELS.PERFORMANCE_GET_ALERTS)
    },
    suppressAlert: async (type: string, durationMs?: number) => {
      return await safeInvoke<void>(IPC_CHANNELS.PERFORMANCE_SUPPRESS, type, durationMs)
    },
    onMetrics: (callback: (metrics: PerformanceMetricsShared) => void) => {
      const handler = (_event: IpcRendererEvent, metrics: PerformanceMetricsShared) => callback(metrics)
      ipcRenderer.on(IPC_CHANNELS.PERFORMANCE_METRICS, handler)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.PERFORMANCE_METRICS, handler) }
    },
    onAlert: (callback: (alert: PerformanceAlertShared) => void) => {
      const handler = (_event: IpcRendererEvent, alert: PerformanceAlertShared) => callback(alert)
      ipcRenderer.on(IPC_CHANNELS.PERFORMANCE_ALERT, handler)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.PERFORMANCE_ALERT, handler) }
    },
    onAlertCleared: (callback: (payload: { type: string }) => void) => {
      const handler = (_event: IpcRendererEvent, payload: { type: string }) => callback(payload)
      ipcRenderer.on(IPC_CHANNELS.PERFORMANCE_ALERT_CLEARED, handler)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.PERFORMANCE_ALERT_CLEARED, handler) }
    },
  },

  // Progress operations (TASK029)
  progress: {
    getSnapshot: async () => {
      return await safeInvoke<ProgressSnapshotShared>(IPC_CHANNELS.PROGRESS_GET_SNAPSHOT)
    },
    getTask: async (id: string) => {
      return await safeInvoke<TaskRecordShared | null>(IPC_CHANNELS.PROGRESS_GET_TASK, id)
    },
    editUserNote: async (taskId: string, note: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.PROGRESS_EDIT_NOTE, taskId, note)
    },
    getArchive: async (month: string) => {
      return await safeInvoke<string>(IPC_CHANNELS.PROGRESS_GET_ARCHIVE, month)
    },
    onTaskEvent: (callback: (event: { type: string; task: TaskRecordShared }) => void) => {
      const handlers = [
        { channel: IPC_CHANNELS.PROGRESS_TASK_DECLARED, type: 'declared' },
        { channel: IPC_CHANNELS.PROGRESS_TASK_UPDATED, type: 'updated' },
        { channel: IPC_CHANNELS.PROGRESS_TASK_COMPLETED, type: 'completed' },
        { channel: IPC_CHANNELS.PROGRESS_TASK_FAILED, type: 'failed' },
      ].map(({ channel, type }) => {
        const handler = (_event: IpcRendererEvent, task: TaskRecordShared) => callback({ type, task })
        ipcRenderer.on(channel, handler)
        return { channel, handler }
      })
      return () => {
        for (const { channel, handler } of handlers) {
          ipcRenderer.removeListener(channel, handler)
        }
      }
    },
  },

  // Inspector operations (TASK029)
  inspector: {
    open: (traceId?: string) => {
      ipcRenderer.send(IPC_CHANNELS.INSPECTOR_OPEN, traceId)
    },
  },

  // Conversation operations
  conversation: {
    create: async (id: string, title?: string) => {
      return await safeInvoke<ConversationSummary>(IPC_CHANNELS.CONVERSATION_CREATE, id, title)
    },

    appendMessage: async (message: ConversationMessageShared) => {
      return await safeInvoke<void>(IPC_CHANNELS.CONVERSATION_APPEND_MESSAGE, message)
    },

    getMessages: async (conversationId: string, limit: number, beforeTimestamp?: number) => {
      return await safeInvoke<PaginatedMessagesShared>(IPC_CHANNELS.CONVERSATION_GET_MESSAGES, conversationId, limit, beforeTimestamp)
    },

    list: async (limit: number, offset: number) => {
      return await safeInvoke<ConversationSummary[]>(IPC_CHANNELS.CONVERSATION_LIST, limit, offset)
    },

    loadLatest: async () => {
      return await safeInvoke<{ conversationId: string; messages: ConversationMessageShared[]; hasMore: boolean } | null>(IPC_CHANNELS.CONVERSATION_LOAD_LATEST)
    },
  },

  // AI Mode operations (TASK030)
  aiMode: {
    getAll: async () => {
      return await safeInvoke<AiModeDefinitionShared[]>(IPC_CHANNELS.AI_MODE_GET_ALL)
    },
    getActive: async (conversationId: string) => {
      return await safeInvoke<AiModeDefinitionShared>(IPC_CHANNELS.AI_MODE_GET_ACTIVE, conversationId)
    },
    switchMode: async (conversationId: string, aiModeId: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.AI_MODE_SWITCH, conversationId, aiModeId)
    },
    onModeChanged: (callback: (event: { conversationId: string; from?: string; to: string }) => void) => {
      const handler = (_event: IpcRendererEvent, data: unknown) => {
        callback(data as { conversationId: string; from?: string; to: string })
      }
      ipcRenderer.on(IPC_CHANNELS.AI_MODE_CHANGED, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.AI_MODE_CHANGED, handler)
      }
    },
  },

  plan: {
    getActivePlans: async () => {
      return await safeInvoke<PlanMetadataShared[]>(IPC_CHANNELS.PLAN_GET_ACTIVE)
    },
    getPlan: async (id: string) => {
      return await safeInvoke<ParsedPlanShared | null>(IPC_CHANNELS.PLAN_GET, id)
    },
    startExecution: async (id: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.PLAN_START_EXECUTION, id)
    },
    archive: async (id: string, targetPath: string) => {
      return await safeInvoke<PlanMetadataShared>(IPC_CHANNELS.PLAN_ARCHIVE, id, targetPath)
    },
    abandon: async (id: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.PLAN_ABANDON, id)
    },
    followUp: async (id: string) => {
      return await safeInvoke<PlanFollowUpResultShared>(IPC_CHANNELS.PLAN_FOLLOW_UP, id)
    },
    onPlanCreated: (callback: (plan: PlanMetadataShared) => void) => {
      const handler = (_event: IpcRendererEvent, data: unknown) => callback(data as PlanMetadataShared)
      ipcRenderer.on(IPC_CHANNELS.PLAN_CREATED, handler)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.PLAN_CREATED, handler) }
    },
    onPlanExecutionStarted: (callback: (plan: PlanMetadataShared) => void) => {
      const handler = (_event: IpcRendererEvent, data: unknown) => callback(data as PlanMetadataShared)
      ipcRenderer.on(IPC_CHANNELS.PLAN_EXECUTION_STARTED, handler)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.PLAN_EXECUTION_STARTED, handler) }
    },
    onStepsCompleted: (callback: (event: { planId: string; completed: PlanStepShared[] }) => void) => {
      const handler = (_event: IpcRendererEvent, data: unknown) => callback(data as { planId: string; completed: PlanStepShared[] })
      ipcRenderer.on(IPC_CHANNELS.PLAN_STEPS_COMPLETED, handler)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.PLAN_STEPS_COMPLETED, handler) }
    },
    onPlanArchived: (callback: (plan: PlanMetadataShared) => void) => {
      const handler = (_event: IpcRendererEvent, data: unknown) => callback(data as PlanMetadataShared)
      ipcRenderer.on(IPC_CHANNELS.PLAN_ARCHIVED, handler)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.PLAN_ARCHIVED, handler) }
    },
    onPlanAbandoned: (callback: (plan: PlanMetadataShared) => void) => {
      const handler = (_event: IpcRendererEvent, data: unknown) => callback(data as PlanMetadataShared)
      ipcRenderer.on(IPC_CHANNELS.PLAN_ABANDONED, handler)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.PLAN_ABANDONED, handler) }
    },
  },

  // Prompt Optimizer operations (TASK032)
  promptOptimizer: {
    optimize: async (req: OptimizeRequestShared) => {
      return await safeInvoke<OptimizeResponseShared>(IPC_CHANNELS.PROMPT_OPTIMIZER_OPTIMIZE, req)
    },
    recordAction: async (requestId: string, action: string, suggestionId?: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.PROMPT_OPTIMIZER_RECORD_ACTION, requestId, action, suggestionId)
    },
  },

  // Command Palette operations (TASK032)
  command: {
    search: async (query: string, language?: string) => {
      return await safeInvoke<CommandShared[]>(IPC_CHANNELS.COMMAND_SEARCH, query, language)
    },
    execute: async (id: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.COMMAND_EXECUTE, id)
    },
  },

  // Handbook operations (TASK033)
  handbook: {
    search: async (query: string, options?: HandbookSearchOptionsShared) => {
      return await safeInvoke<HandbookEntryShared[]>(IPC_CHANNELS.HANDBOOK_SEARCH, query, options)
    },
    getEntry: async (id: string, language?: string) => {
      return await safeInvoke<HandbookEntryShared | null>(IPC_CHANNELS.HANDBOOK_GET_ENTRY, id, language)
    },
    cloneToWorkspace: async () => {
      return await safeInvoke<HandbookCloneResultShared>(IPC_CHANNELS.HANDBOOK_CLONE)
    },
    checkUpdates: async () => {
      return await safeInvoke<HandbookUpdateCheckResultShared>(IPC_CHANNELS.HANDBOOK_CHECK_UPDATES)
    },
  },

  // DataSource operations (TASK033)
  datasource: {
    listProviders: async () => {
      return await safeInvoke<DataSourceProviderInfoShared[]>(IPC_CHANNELS.DATASOURCE_LIST_PROVIDERS)
    },
    query: async (providerId: string, query: DataSourceQueryShared) => {
      return await safeInvoke<DataSourceResultShared>(IPC_CHANNELS.DATASOURCE_QUERY, providerId, query)
    },
    getProviderStatus: async (id: string) => {
      return await safeInvoke<DataSourceProviderStatusShared>(IPC_CHANNELS.DATASOURCE_GET_PROVIDER_STATUS, id)
    },
  },

  // Export operations (TASK034)
  export: {
    preview: async (conversationId: string, options: ExportOptionsShared) => {
      return await safeInvoke<ExportPreviewSharedV2>(IPC_CHANNELS.EXPORT_PREVIEW, conversationId, options)
    },
    execute: async (conversationId: string, options: ExportOptionsShared) => {
      return await safeInvoke<void>(IPC_CHANNELS.EXPORT_EXECUTE, conversationId, options)
    },
    copyToClipboard: async (messageIds: string[], format: string) => {
      return await safeInvoke<string>(IPC_CHANNELS.EXPORT_COPY_CLIPBOARD, messageIds, format)
    },
  },

  // Model operations (TASK034)
  model: {
    getCurrent: async (conversationId: string) => {
      return await safeInvoke<string>(IPC_CHANNELS.MODEL_GET_CURRENT, conversationId)
    },
    getAvailable: async () => {
      return await safeInvoke<ConfiguredModelShared[]>(IPC_CHANNELS.MODEL_GET_AVAILABLE)
    },
    switchModel: async (conversationId: string, modelId: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.MODEL_SWITCH, conversationId, modelId)
    },
    getStatus: async (modelId: string) => {
      return await safeInvoke<ConfiguredModelShared>(IPC_CHANNELS.MODEL_GET_STATUS, modelId)
    },
    onSwitched: (callback: (event: ModelSwitchedEventShared) => void) => {
      const handler = (_event: IpcRendererEvent, data: unknown) => callback(data as ModelSwitchedEventShared)
      ipcRenderer.on(IPC_CHANNELS.MODEL_SWITCHED, handler)
      return () => { ipcRenderer.removeListener(IPC_CHANNELS.MODEL_SWITCHED, handler) }
    },
  },

  // QuickSettings operations (TASK034)
  quickSettings: {
    get: async () => {
      return await safeInvoke<QuickSettingsStateShared>(IPC_CHANNELS.QUICK_SETTINGS_GET)
    },
    update: async (patch: Partial<QuickSettingsStateShared>) => {
      return await safeInvoke<void>(IPC_CHANNELS.QUICK_SETTINGS_UPDATE, patch)
    },
  },

  // Prompt Library operations (TASK035)
  promptLibrary: {
    listAll: async () => {
      return await safeInvoke<PromptMetadata[]>(IPC_CHANNELS.PROMPT_LIBRARY_LIST_ALL)
    },
    read: async (id: string) => {
      return await safeInvoke<PromptContent>(IPC_CHANNELS.PROMPT_LIBRARY_READ, id)
    },
    deriveUserCopy: async (id: string) => {
      return await safeInvoke<{ userPath: string }>(IPC_CHANNELS.PROMPT_LIBRARY_DERIVE_USER_COPY, id)
    },
    resetUserOverride: async (id: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.PROMPT_LIBRARY_RESET_USER_OVERRIDE, id)
    },
    validate: async (id: string, content: string) => {
      return await safeInvoke<PromptValidationResult>(IPC_CHANNELS.PROMPT_LIBRARY_VALIDATE, id, content)
    },
    estimateTokens: async (content: string) => {
      return await safeInvoke<number>(IPC_CHANNELS.PROMPT_LIBRARY_ESTIMATE_TOKENS, content)
    },
  },

  // Sub-agent operations (TASK038)
  subAgent: {
    list: async () => {
      return await safeInvoke<SubAgentMetadata[]>(IPC_CHANNELS.SUB_AGENT_LIST)
    },
    create: async (template: SubAgentTemplate) => {
      return await safeInvoke<{ agentId: string }>(IPC_CHANNELS.SUB_AGENT_CREATE, template)
    },
    trace: async (traceId: string) => {
      return await safeInvoke<SubAgentTrace>(IPC_CHANNELS.SUB_AGENT_TRACE, traceId)
    },
  },

  // Workflow operations (TASK039)
  workflow: {
    list: async () => {
      return await safeInvoke<WorkflowDefinition[]>(IPC_CHANNELS.WORKFLOW_LIST)
    },
    triggerManual: async (workflowId: string, params: Record<string, unknown>) => {
      return await safeInvoke<{ runId: string }>(IPC_CHANNELS.WORKFLOW_TRIGGER_MANUAL, workflowId, params)
    },
    getRun: async (runId: string) => {
      return await safeInvoke<WorkflowRun | null>(IPC_CHANNELS.WORKFLOW_GET_RUN, runId)
    },
    cancelRun: async (runId: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.WORKFLOW_CANCEL_RUN, runId)
    },
    listRuns: async (filter?: RunFilter) => {
      return await safeInvoke<WorkflowRunSummary[]>(IPC_CHANNELS.WORKFLOW_LIST_RUNS, filter)
    },
    confirmStep: async (runId: string, decision: 'confirm' | 'skip' | 'cancel') => {
      return await safeInvoke<void>(IPC_CHANNELS.WORKFLOW_CONFIRM_STEP, runId, decision)
    },
    onConfirmationRequired: (callback: (request: WorkflowConfirmationRequest) => void) => {
      const subscription = (_event: IpcRendererEvent, request: WorkflowConfirmationRequest) => {
        callback(request)
      }
      ipcRenderer.on(IPC_CHANNELS.WORKFLOW_CONFIRMATION_REQUIRED, subscription)
      return () => {
        ipcRenderer.off(IPC_CHANNELS.WORKFLOW_CONFIRMATION_REQUIRED, subscription)
      }
    },
  },

  // Import Pipeline operations (TASK040)
  importPipeline: {
    plan: async (input: string) => {
      return await safeInvoke(IPC_CHANNELS.FILE_IMPORT_PLAN, input)
    },
    execute: async (input: string, options?: Record<string, unknown>) => {
      return await safeInvoke(IPC_CHANNELS.FILE_IMPORT_EXECUTE, input, options)
    },
    cancel: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_IMPORT_CANCEL)
    },
    pause: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_IMPORT_PAUSE)
    },
    resume: async () => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_IMPORT_RESUME)
    },
    onProgress: (callback: (data: Record<string, unknown>) => void) => {
      const handler = (_event: IpcRendererEvent, data: Record<string, unknown>) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.FILE_IMPORT_PIPELINE_PROGRESS, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.FILE_IMPORT_PIPELINE_PROGRESS, handler)
      }
    },
    history: async () => {
      return await safeInvoke(IPC_CHANNELS.FILE_IMPORT_HISTORY)
    },
    rollback: async (importId: string) => {
      return await safeInvoke(IPC_CHANNELS.FILE_IMPORT_ROLLBACK, importId)
    },
    onClassification: (callback: (data: ClassificationConfirmationPayload) => void) => {
      const handler = (_event: IpcRendererEvent, data: ClassificationConfirmationPayload) => callback(data)
      ipcRenderer.on(IPC_CHANNELS.FILE_IMPORT_CLASSIFICATION, handler)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.FILE_IMPORT_CLASSIFICATION, handler)
      }
    },
    confirmClassification: async (importId: string, result: ClassificationResultShared) => {
      return await safeInvoke<void>(IPC_CHANNELS.FILE_IMPORT_CONFIRM_CLASSIFICATION, importId, result)
    },
  },
  
  // Event listener registration
  on: (channel: IPCChannel, callback: (...args: unknown[]) => void) => {
    if (!isChannelAllowed(channel)) {
      const error = new Error(`Channel ${channel} is not allowed`)
      console.error('[Preload] Event listener registration failed:', error)
      throw error
    }
    
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) => {
      try {
        if (isDev) {
          console.debug(`[Preload] Event received on channel: ${channel}`)
        }
        callback(...args)
      } catch (error) {
        console.error(`[Preload] Error in event callback for ${channel}:`, error)
      }
    }
    
    ipcRenderer.on(channel, subscription)
    if (isDev) {
      console.debug(`[Preload] Event listener registered for channel: ${channel}`)
    }
    
    // Return unsubscribe function
    return () => {
      ipcRenderer.off(channel, subscription)
      if (isDev) {
        console.debug(`[Preload] Event listener unregistered for channel: ${channel}`)
      }
    }
  },
  
  // Event listener removal
  off: (channel: IPCChannel, callback: (...args: unknown[]) => void) => {
    if (!isChannelAllowed(channel)) {
      const error = new Error(`Channel ${channel} is not allowed`)
      console.error('[Preload] Event listener removal failed:', error)
      throw error
    }
    
    ipcRenderer.off(channel, callback as never)
    if (isDev) {
      console.debug(`[Preload] Event listener removed for channel: ${channel}`)
    }
  },

  // MCP operations (TASK042)
  mcp: {
    connect: async (config: MCPServerConfigShared) => {
      return await safeInvoke<void>(IPC_CHANNELS.MCP_CONNECT, config)
    },
    disconnect: async (serverName: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.MCP_DISCONNECT, serverName)
    },
    listServers: async () => {
      return await safeInvoke<MCPServerInfoShared[]>(IPC_CHANNELS.MCP_LIST_SERVERS)
    },
    listTools: async () => {
      return await safeInvoke<MCPToolShared[]>(IPC_CHANNELS.MCP_LIST_TOOLS)
    },
    callTool: async (serverName: string, toolName: string, args: Record<string, unknown>) => {
      return await safeInvoke<MCPToolResultShared>(IPC_CHANNELS.MCP_CALL_TOOL, serverName, toolName, args)
    },
    grantPermission: async (requestId: string, level: MCPPermissionLevelShared) => {
      return await safeInvoke<void>(IPC_CHANNELS.MCP_GRANT_PERMISSION, requestId, level)
    },
    revokePermission: async (serverName: string, toolName: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.MCP_REVOKE_PERMISSION, serverName, toolName)
    },
    onPermissionPrompt: (callback: (prompt: MCPPermissionPromptShared) => void) => {
      const handler = (_event: IpcRendererEvent, prompt: MCPPermissionPromptShared) => callback(prompt)
      ipcRenderer.on(IPC_CHANNELS.MCP_PERMISSION_PROMPT, handler)
      return () => {
        ipcRenderer.off(IPC_CHANNELS.MCP_PERMISSION_PROMPT, handler)
      }
    },
    onServerStatusChanged: (callback: (info: MCPServerInfoShared) => void) => {
      const handler = (_event: IpcRendererEvent, info: MCPServerInfoShared) => callback(info)
      ipcRenderer.on(IPC_CHANNELS.MCP_SERVER_STATUS_CHANGED, handler)
      return () => {
        ipcRenderer.off(IPC_CHANNELS.MCP_SERVER_STATUS_CHANGED, handler)
      }
    },
    // TASK043 sync methods
    configureSync: async (config: SyncTaskConfigShared) => {
      return await safeInvoke<void>(IPC_CHANNELS.MCP_CONFIGURE_SYNC, config)
    },
    triggerSync: async (taskId: string) => {
      return await safeInvoke<SyncProgressShared>(IPC_CHANNELS.MCP_TRIGGER_SYNC, taskId)
    },
    listSyncTasks: async () => {
      return await safeInvoke<SyncTaskWithStateShared[]>(IPC_CHANNELS.MCP_LIST_SYNC_TASKS)
    },
    pauseSync: async (taskId: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.MCP_PAUSE_SYNC, taskId)
    },
    resumeSync: async (taskId: string) => {
      return await safeInvoke<void>(IPC_CHANNELS.MCP_RESUME_SYNC, taskId)
    },
    onSyncProgress: (callback: (progress: SyncProgressShared) => void) => {
      const handler = (_event: IpcRendererEvent, progress: SyncProgressShared) => callback(progress)
      ipcRenderer.on(IPC_CHANNELS.MCP_SYNC_PROGRESS, handler)
      return () => {
        ipcRenderer.off(IPC_CHANNELS.MCP_SYNC_PROGRESS, handler)
      }
    },
  },

  // App configuration (TASK044)
  app: {
    getConfig: async () => {
      return await safeInvoke<AppConfig>(IPC_CHANNELS.APP_GET_CONFIG)
    },
    updateConfig: async (updates: Partial<AppConfig>) => {
      return await safeInvoke<void>(IPC_CHANNELS.APP_UPDATE_CONFIG, updates)
    },
  },
}

// Expose API to renderer
contextBridge.exposeInMainWorld('electronAPI', api)

console.log('[Preload] Enhanced API exposed to renderer process')

// Export type for use in other modules
export type { ElectronAPI }
