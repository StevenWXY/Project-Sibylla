import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { ipcManager } from './ipc'
import { TestHandler } from './ipc/handlers/test.handler'
import { SystemHandler } from './ipc/handlers/system.handler'
import { FileHandler } from './ipc/handlers/file.handler'
import { WorkspaceHandler } from './ipc/handlers/workspace.handler'
import { WindowHandler } from './ipc/handlers/window.handler'
import { SyncHandler } from './ipc/handlers/sync.handler'
import { GitHandler } from './ipc/handlers/git.handler'
import { AuthHandler } from './ipc/handlers/auth.handler'
import { AIHandler } from './ipc/handlers/ai.handler'
import { SearchHandler } from './ipc/handlers/search.handler'
import { MemoryHandler } from './ipc/handlers/memory.handler'
import { FileManager } from './services/file-manager'
import { ImportManager } from './services/import-manager'
import { WorkspaceManager } from './services/workspace-manager'
import { GitAbstraction } from './services/git-abstraction'
import { SyncManager } from './services/sync-manager'
import { ConflictResolver } from './services/conflict-resolver'
import { NetworkMonitor } from './services/network-monitor'
import { AutoSaveManager } from './services/auto-save-manager'
import { FileWatcher } from './services/file-watcher'
import { AuthClient } from './services/auth-client'
import { TokenStorage } from './services/token-storage'
import { MemoryManager } from './services/memory-manager'
import { LocalRagEngine } from './services/local-rag-engine'
import { AiGatewayClient } from './services/ai-gateway-client'
import { ContextEngine } from './services/context-engine'
import { DatabaseManager } from './services/database-manager'
import { LocalSearchEngine } from './services/local-search-engine'
import { GuardrailEngine } from './services/harness/guardrails/engine'
import { Generator } from './services/harness/generator'
import { Evaluator } from './services/harness/evaluator'
import { HarnessOrchestrator } from './services/harness/orchestrator'
import { HarnessHandler } from './ipc/handlers/harness'
import { GuideRegistry } from './services/harness/guides/registry'
import { SensorFeedbackLoop } from './services/harness/sensors/feedback-loop'
import { ReferenceIntegritySensor } from './services/harness/sensors/reference-integrity'
import { MarkdownFormatSensor } from './services/harness/sensors/markdown-format'
import { SpecComplianceSensor } from './services/harness/sensors/spec-compliance'
import { IntentClassifier, DEFAULT_CLASSIFIER_CONFIG } from './services/harness/intent-classifier'
import { ToolScopeManager } from './services/harness/tool-scope'
import { registerBuiltInTools } from './services/harness/built-in-tools'
import { TaskStateMachine } from './services/harness/task-state-machine'
import { Tracer } from './services/trace/tracer'
import { TraceStore } from './services/trace/trace-store'
import { AppEventBus } from './services/event-bus'
import { ProgressLedger } from './services/progress/progress-ledger'
import { ProgressHandler } from './ipc/handlers/progress'
import { PerformanceMonitor } from './services/trace/performance-monitor'
import { ReplayEngine } from './services/trace/replay-engine'
import { TraceExporter } from './services/trace/trace-exporter'
import { TraceHandler } from './ipc/handlers/trace.handler'
import { logger } from './utils/logger'
import type { WorkspaceInfo } from '../shared/types'
import { IPC_CHANNELS } from '../shared/types'

// Keep reference to main window to prevent garbage collection
let mainWindow: BrowserWindow | null = null

// Keep reference to SyncManager for cleanup on quit
let syncManager: SyncManager | null = null

// Keep reference to AutoSaveManager for cleanup on quit
let autoSaveManager: AutoSaveManager | null = null

// Keep reference to DatabaseManager for cleanup on quit
let databaseManager: DatabaseManager | null = null

// Keep references to TraceStore / Tracer for cleanup on quit
let traceStore: TraceStore | null = null
let tracer: Tracer | null = null
let progressLedger: ProgressLedger | null = null
let performanceMonitor: PerformanceMonitor | null = null
let replayEngine: ReplayEngine | null = null
let traceExporter: TraceExporter | null = null
let traceHandler: TraceHandler | null = null
const appEventBus = new AppEventBus()

// Keep reference to LocalSearchEngine for FileWatcher forwarding
let localSearchEngineRef: import('./services/local-search-engine').LocalSearchEngine | null = null

// Keep reference to FileWatcher for cleanup on quit
let fileWatcher: FileWatcher | null = null

// Enable single instance lock to prevent multiple app instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit()
} else {
  // Handle second instance attempt
  app.on('second-instance', () => {
    // Focus the existing window when user tries to open another instance
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.focus()
    }
  })

  // Initialize app when ready
  app.whenReady().then(async () => {
    try {
      // Initialize IPC manager
      ipcManager.initialize()
      
      // Create FileManager with a temporary root (will be updated when workspace is opened)
      // Using app.getPath('temp') as a safe default
      const tempRoot = app.getPath('temp')
      const fileManager = new FileManager(tempRoot)
      
      // Create WorkspaceManager instance
      const workspaceManager = new WorkspaceManager(fileManager)
      
      // Create FileHandler
      const fileHandler = new FileHandler()

      // Create and inject GuardrailEngine into FileHandler (TASK017)
      const guardrailEngine = new GuardrailEngine()
      fileHandler.setGuardrailEngine(guardrailEngine)
      
      // Create WorkspaceHandler and set WorkspaceManager
      const workspaceHandler = new WorkspaceHandler()
      workspaceHandler.setWorkspaceManager(workspaceManager)
      
      // Create SyncHandler
      const syncHandler = new SyncHandler()
      
      // Create GitHandler (for conflict operations)
      const gitHandler = new GitHandler()
      
      // Create AuthHandler with AuthClient and TokenStorage
      const authClient = new AuthClient()
      const tokenStorage = new TokenStorage()
      const authHandler = new AuthHandler(authClient, tokenStorage)

      // Inject AuthHandler as user provider for GuardrailEngine context (TASK017)
      fileHandler.setAuthUserProvider(authHandler)

      // Create AI infrastructure
      const memoryManager = new MemoryManager()
      const localRagEngine = new LocalRagEngine()
      const aiGatewayClient = new AiGatewayClient()
      const aiHandler = new AIHandler(
        aiGatewayClient,
        memoryManager,
        localRagEngine,
        tokenStorage,
        workspaceManager,
        fileManager,
      )

      // ====== Harness initialization (TASK018 + TASK019) ======
      // Create Generator
      const generator = new Generator(
        aiGatewayClient,
        'claude-sonnet-4-20250514',
        logger
      )

      // Create Evaluator (uses same model by default)
      const evaluator = new Evaluator(
        aiGatewayClient,
        'claude-sonnet-4-20250514',
        logger
      )

      // Create ContextEngine for Harness (reuse FileManager + MemoryManager)
      // Note: AIHandler creates its own ContextEngine internally.
      // HarnessOrchestrator needs its own reference for assembleForHarness().
      // ContextEngine is already statically imported via context-engine module (S4 fix).
      const harnessContextEngine = new ContextEngine(fileManager, memoryManager)

      // ====== TASK019: GuideRegistry + SensorFeedbackLoop ======
      const guideRegistry = new GuideRegistry(logger)
      await guideRegistry.loadBuiltIn()

      const sensorFeedbackLoop = new SensorFeedbackLoop(
        [
          new ReferenceIntegritySensor(fileManager, localRagEngine),
          new MarkdownFormatSensor(),
          new SpecComplianceSensor(),
        ],
        logger,
      )

      // Create HarnessOrchestrator
      const harnessOrchestrator = new HarnessOrchestrator(
        generator,
        evaluator,
        guardrailEngine,
        harnessContextEngine,
        memoryManager,
        logger,
        {
          defaultMode: 'dual',
          maxRetries: 2,
        },
        guideRegistry,
        sensorFeedbackLoop,
      )

      // Inject into AIHandler
      aiHandler.setHarnessOrchestrator(harnessOrchestrator)

      // Create HarnessHandler and register
      const harnessConfig = { defaultMode: 'dual' as const }
      const harnessHandler = new HarnessHandler(
        harnessOrchestrator,
        guardrailEngine,
        harnessConfig,
        guideRegistry,
      )

      // ====== TASK020: ToolScopeManager + IntentClassifier initialization ======
      const intentClassifier = new IntentClassifier(
        aiGatewayClient,
        DEFAULT_CLASSIFIER_CONFIG,
        logger,
      )

      const toolScopeManager = new ToolScopeManager(intentClassifier, logger)
      registerBuiltInTools(toolScopeManager)

      harnessOrchestrator.setToolScopeManager(toolScopeManager)
      harnessHandler.setToolScopeManager(toolScopeManager)

      // ====== TASK021: TaskStateMachine (deferred until workspace opens) ======
      // TaskStateMachine requires workspacePath, so it is created in onWorkspaceOpened.
      // References are kept at module scope for lifecycle management.
      let taskStateMachine: TaskStateMachine | null = null
      
      // Create WindowHandler (window reference set after createMainWindow)
      const windowHandler = new WindowHandler()

      // Create MemoryHandler
      const memoryHandler = new MemoryHandler(
        memoryManager,
        localRagEngine,
        workspaceManager,
      )
      
      // ─── Workspace lifecycle hooks ────────────────────────────────
      // Wire up SyncManager initialization/teardown to workspace open/close
      
      workspaceHandler.onWorkspaceOpened(async (workspaceInfo: WorkspaceInfo) => {
        const workspacePath = workspaceInfo.metadata.path

        console.log('[Main] Initializing services for workspace', { path: workspacePath })
        
        try {
          // Resolve author info from auth (if available)
          // No hardcoded fallback — if user is not authenticated, git config
          // from workspace creation (which used real owner info) will be used.
          const cachedUser = authHandler.getCachedUser()
          const authorName = cachedUser?.name ?? workspaceInfo.config.name
          const authorEmail = cachedUser?.email ?? `${workspaceInfo.config.workspaceId}@workspace.sibylla.local`
          
          // Create GitAbstraction for this workspace
          const gitAbstraction = new GitAbstraction({
            workspaceDir: workspacePath,
            authorName,
            authorEmail,
          })
          
          // Initialize Git repo if not already initialized
          try {
            await gitAbstraction.init()
          } catch (error: unknown) {
            // ALREADY_INITIALIZED is expected for existing workspaces
            const isAlreadyInit = error instanceof Error && error.message.includes('already initialized')
            if (!isAlreadyInit) {
              throw error
            }
          }
          
          // ── S3 FIX: Inject FileManager into FileHandler ──
          // Update FileManager root to workspace path and inject into FileHandler
          await fileManager.updateWorkspaceRoot(workspacePath)
          fileHandler.setFileManager(fileManager)
          
          // Create and inject ImportManager
          const importManager = new ImportManager(fileManager)
          fileHandler.setImportManager(importManager)
          
          // Create and start SyncManager
          const syncInterval = workspaceInfo.config.syncInterval ?? 30

          // Create NetworkMonitor for proactive network detection
          const networkMonitor = new NetworkMonitor({
            checkUrl: 'https://api.sibylla.io/health',
          })

          syncManager = new SyncManager(
            {
              workspaceDir: workspacePath,
              saveDebounceMs: 1000,
              syncIntervalMs: syncInterval * 1000,
            },
            fileManager,
            gitAbstraction,
            undefined,
            networkMonitor,
          )
          
          // Connect SyncHandler to SyncManager for IPC event bridging
          syncHandler.setSyncManager(syncManager)
          
          // Create ConflictResolver and inject into GitHandler
          const conflictResolver = new ConflictResolver(gitAbstraction, workspacePath)
          gitHandler.setConflictResolver(conflictResolver)
          gitHandler.setGitAbstraction(gitAbstraction)

          // Listen for sync:conflict events and broadcast conflict details
          syncManager.on('sync:conflict', async () => {
            try {
              const conflictInfos = await conflictResolver.getConflicts()
              if (conflictInfos.length > 0) {
                gitHandler.broadcastConflict(conflictInfos)
              }
            } catch (error: unknown) {
              console.error('[Main] Failed to broadcast conflict details', error)
            }
          })
          
          // Start automatic sync
          syncManager.start()

          // Create and inject AutoSaveManager
          autoSaveManager = new AutoSaveManager(
            {},
            fileManager,
            gitAbstraction,
            authorName,
          )
          fileHandler.setAutoSaveManager(autoSaveManager)

          // Connect AutoSaveManager → SyncManager (TASK006)
          syncManager.connectAutoSaveManager(autoSaveManager)
          
          // ── S4 FIX: Wire FileWatcher → SyncManager.notifyFileChanged() ──
          // Stop previous FileWatcher if any
          if (fileWatcher) {
            await fileWatcher.stop()
            fileWatcher = null
          }
          
          fileWatcher = new FileWatcher(workspacePath)
          const currentSyncManager = syncManager  // capture for closure
          await fileWatcher.start((event) => {
            // Only notify on file content changes (add/change/unlink), not directory events
            if (event.type === 'add' || event.type === 'change' || event.type === 'unlink') {
              currentSyncManager.notifyFileChanged(event.path)
            }
            // Notify SkillEngine about skill file changes
            aiHandler.handleFileChangeForSkills(event)
            // Forward to LocalSearchEngine for incremental index updates
            if (localSearchEngineRef) {
              void localSearchEngineRef.onFileChange(event)
            }
          })
          
          console.log('[Main] All services started for workspace', { path: workspacePath })

          // Initialize memory + local RAG services for current workspace
          memoryManager.setWorkspacePath(workspacePath)
          localRagEngine.setWorkspacePath(workspacePath)
          await localRagEngine.rebuildIndex()
          await aiHandler.initSkills()

          // TASK019: Load workspace-specific custom guides
          await guideRegistry.loadWorkspaceCustom(workspacePath)

          // TASK021: Initialize TaskStateMachine for this workspace + scan for resumeable tasks
          taskStateMachine = new TaskStateMachine(workspacePath, logger)
          harnessOrchestrator.setTaskStateMachine(taskStateMachine)
          harnessHandler.setTaskStateMachine(taskStateMachine)

          // Scan for resumeable tasks and broadcast to renderer
          taskStateMachine.findResumeable().then((tasks) => {
            if (tasks.length > 0) {
              const summaries = tasks.map((t) => ({
                taskId: t.taskId,
                goal: t.goal,
                status: t.status,
                completedSteps: t.steps.filter((s) => s.status === 'done').length,
                totalSteps: t.steps.length,
                updatedAt: t.updatedAt,
              }))
              BrowserWindow.getAllWindows().forEach((win) =>
                win.webContents.send(IPC_CHANNELS.HARNESS_RESUMEABLE_DETECTED, summaries),
              )
            }
          }).catch((err: unknown) => logger.error('startup.resumeable-scan.failed', { error: String(err) }))

          // Initialize fulltext search (DatabaseManager + LocalSearchEngine)
          databaseManager = new DatabaseManager(workspacePath)
          localSearchEngineRef = new LocalSearchEngine(
            databaseManager,
            fileManager,
            workspacePath,
          )
          const searchHandler = new SearchHandler(localSearchEngineRef)
          ipcManager.registerHandler(searchHandler)

          // Start initial index build in background
          if (mainWindow && !mainWindow.isDestroyed()) {
            await localSearchEngineRef.initialize(mainWindow)
          }

          // ── TASK027: Initialize TraceStore + Tracer for this workspace ──
          traceStore = new TraceStore(workspacePath)
          await traceStore.initialize()

          tracer = new Tracer({}, traceStore, appEventBus)
          tracer.start()

          fileManager.setTracer(tracer)
          memoryManager.setTracer(tracer)
          harnessContextEngine.setTracer(tracer)
          guardrailEngine.setTracer(tracer)
          evaluator.setTracer(tracer)
          sensorFeedbackLoop.setTracer(tracer)
          harnessOrchestrator.setTracer(tracer)

          // ── TASK028: Initialize ProgressLedger for this workspace ──
          progressLedger = new ProgressLedger(
            taskStateMachine,
            workspacePath,
            fileManager,
            tracer,
            appEventBus,
            logger,
          )
          await progressLedger.initialize()
          aiHandler.setProgressLedger(progressLedger)

          const progressHandler = new ProgressHandler(progressLedger)
          ipcManager.registerHandler(progressHandler)

          // ── TASK029: Initialize PerformanceMonitor, ReplayEngine, TraceExporter, TraceHandler ──
          performanceMonitor = new PerformanceMonitor(
            traceStore,
            {},
            appEventBus,
            logger,
          )
          performanceMonitor.start()

          replayEngine = new ReplayEngine(
            traceStore,
            memoryManager,
            fileManager,
            aiGatewayClient,
            tracer,
            logger,
          )

          traceExporter = new TraceExporter(traceStore, logger)

          traceHandler = new TraceHandler(
            traceStore,
            traceExporter,
            replayEngine,
            performanceMonitor,
          )
          ipcManager.registerHandler(traceHandler)

          // Register trace/performance event push to renderer
          const forwardToRenderer = (eventName: string, channel: string) => {
            appEventBus.on(eventName, (payload: unknown) => {
              for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) {
                  window.webContents.send(channel, payload)
                }
              }
            })
          }
          forwardToRenderer('trace:span-ended', IPC_CHANNELS.TRACE_SPAN_ENDED)
          forwardToRenderer('trace:update', IPC_CHANNELS.TRACE_UPDATE)
          forwardToRenderer('performance:metrics', IPC_CHANNELS.PERFORMANCE_METRICS)
          forwardToRenderer('performance:alert', IPC_CHANNELS.PERFORMANCE_ALERT)
          forwardToRenderer('performance:alert-cleared', IPC_CHANNELS.PERFORMANCE_ALERT_CLEARED)
          forwardToRenderer('progress:task-declared', IPC_CHANNELS.PROGRESS_TASK_DECLARED)
          forwardToRenderer('progress:task-updated', IPC_CHANNELS.PROGRESS_TASK_UPDATED)
          forwardToRenderer('progress:task-completed', IPC_CHANNELS.PROGRESS_TASK_COMPLETED)
          forwardToRenderer('progress:task-failed', IPC_CHANNELS.PROGRESS_TASK_FAILED)
          forwardToRenderer('progress:user-edit-conflict', IPC_CHANNELS.PROGRESS_USER_EDIT_CONFLICT)
        } catch (error) {
          console.error('[Main] Failed to initialize workspace services', error)
          // Non-fatal: workspace can still be used without sync
        }
      })
      
      workspaceHandler.onWorkspaceClosed(async () => {
        // Remove event bus listeners for the previous workspace
        appEventBus.removeAllListeners('trace:span-ended')
        appEventBus.removeAllListeners('trace:update')
        appEventBus.removeAllListeners('performance:metrics')
        appEventBus.removeAllListeners('performance:alert')
        appEventBus.removeAllListeners('performance:alert-cleared')
        appEventBus.removeAllListeners('progress:task-declared')
        appEventBus.removeAllListeners('progress:task-updated')
        appEventBus.removeAllListeners('progress:task-completed')
        appEventBus.removeAllListeners('progress:task-failed')
        appEventBus.removeAllListeners('progress:user-edit-conflict')

        // Cleanup IPC handlers for workspace-scoped services
        if (traceHandler) {
          traceHandler.cleanup()
          traceHandler = null
        }

        memoryManager.setWorkspacePath(null)
        localRagEngine.setWorkspacePath(null)

        // Cleanup search engine
        if (localSearchEngineRef) {
          localSearchEngineRef.dispose()
          localSearchEngineRef = null
        }
        if (databaseManager) {
          databaseManager.close()
          databaseManager = null
        }

        // Cleanup Tracer + TraceStore
        if (tracer) {
          await tracer.stop()
          tracer = null
        }
        if (traceStore) {
          traceStore.close()
          traceStore = null
        }

        // Cleanup PerformanceMonitor
        if (performanceMonitor) {
          performanceMonitor.stop()
          performanceMonitor = null
        }

        replayEngine = null
        traceExporter = null
        traceHandler = null

        progressLedger = null

        // Stop FileWatcher
        if (fileWatcher) {
          console.log('[Main] Stopping FileWatcher for workspace close')
          await fileWatcher.stop()
          fileWatcher = null
        }
        
        if (syncManager) {
          console.log('[Main] Stopping SyncManager for workspace close')
          syncManager.stop()
          syncManager = null
        }

        if (autoSaveManager) {
          console.log('[Main] Destroying AutoSaveManager for workspace close')
          autoSaveManager.destroy()
          autoSaveManager = null
        }
      })
      
      // Register all handlers
      const handlers = [
        new SystemHandler(),
        new TestHandler(),
        fileHandler,
        workspaceHandler,
        syncHandler,
        gitHandler,
        authHandler,
        aiHandler,
        memoryHandler,
        windowHandler,
        harnessHandler,
      ]
      
      for (const handler of handlers) {
        ipcManager.registerHandler(handler)
      }
      
      // Create main window
      mainWindow = createMainWindow()
      
      // Wire WindowHandler to the main window
      windowHandler.setWindow(mainWindow)
      
      // Handle window closed event
      mainWindow.on('closed', () => {
        mainWindow = null
      })

      // macOS: Re-create window when dock icon is clicked
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          mainWindow = createMainWindow()
        }
      })
      
      console.log('[Main] Application started successfully')
    } catch (error) {
      console.error('[Main] Failed to start application:', error)
      app.quit()
    }
  })

  // Quit when all windows are closed (except on macOS)
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })

  // Handle app quit
  app.on('will-quit', () => {
    console.log('[Main] Application is quitting')
    // Stop FileWatcher if running
    if (fileWatcher) {
      fileWatcher.stop().catch((err: unknown) => {
        console.error('[Main] Error stopping FileWatcher on quit', err)
      })
      fileWatcher = null
    }
    // Stop SyncManager if running
    if (syncManager) {
      syncManager.stop()
      syncManager = null
    }
    // Destroy AutoSaveManager if running
    if (autoSaveManager) {
      autoSaveManager.destroy()
      autoSaveManager = null
    }
    // Cleanup DatabaseManager if running
    if (databaseManager) {
      databaseManager.close()
      databaseManager = null
    }
    if (localSearchEngineRef) {
      localSearchEngineRef.dispose()
      localSearchEngineRef = null
    }
    // Cleanup Tracer + TraceStore
    if (tracer) {
      tracer.stop().catch((err: unknown) => {
        console.error('[Main] Error stopping Tracer on quit', err)
      })
      tracer = null
    }
    if (traceStore) {
      traceStore.close()
      traceStore = null
    }
    // Cleanup IPC handlers
    ipcManager.cleanup()
  })
}
