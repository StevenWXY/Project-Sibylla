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
import { DatabaseManager } from './services/database-manager'
import { LocalSearchEngine } from './services/local-search-engine'
import type { WorkspaceInfo } from '../shared/types'

// Keep reference to main window to prevent garbage collection
let mainWindow: BrowserWindow | null = null

// Keep reference to SyncManager for cleanup on quit
let syncManager: SyncManager | null = null

// Keep reference to AutoSaveManager for cleanup on quit
let autoSaveManager: AutoSaveManager | null = null

// Keep reference to DatabaseManager for cleanup on quit
let databaseManager: DatabaseManager | null = null

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
        } catch (error) {
          console.error('[Main] Failed to initialize workspace services', error)
          // Non-fatal: workspace can still be used without sync
        }
      })
      
      workspaceHandler.onWorkspaceClosed(async () => {
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
    // Cleanup IPC handlers
    ipcManager.cleanup()
  })
}
