import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { ipcManager } from './ipc'
import { TestHandler } from './ipc/handlers/test.handler'
import { SystemHandler } from './ipc/handlers/system.handler'
import { FileHandler } from './ipc/handlers/file.handler'
import { WorkspaceHandler } from './ipc/handlers/workspace.handler'
import { WindowHandler } from './ipc/handlers/window.handler'
import { SyncHandler } from './ipc/handlers/sync.handler'
import { AuthHandler } from './ipc/handlers/auth.handler'
import { AIHandler } from './ipc/handlers/ai.handler'
import { FileManager } from './services/file-manager'
import { WorkspaceManager } from './services/workspace-manager'
import { GitAbstraction } from './services/git-abstraction'
import { SyncManager } from './services/sync-manager'
import { FileWatcher } from './services/file-watcher'
import { AuthClient } from './services/auth-client'
import { TokenStorage } from './services/token-storage'
import { MemoryManager } from './services/memory-manager'
import { LocalRagEngine } from './services/local-rag-engine'
import { AiGatewayClient } from './services/ai-gateway-client'
import type { WorkspaceInfo } from '../shared/types'

// Keep reference to main window to prevent garbage collection
let mainWindow: BrowserWindow | null = null

// Keep reference to SyncManager for cleanup on quit
let syncManager: SyncManager | null = null

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
      )
      
      // Create WindowHandler (window reference set after createMainWindow)
      const windowHandler = new WindowHandler()
      
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
          
          // Create and start SyncManager
          const syncInterval = workspaceInfo.config.syncInterval ?? 30
          syncManager = new SyncManager(
            {
              workspaceDir: workspacePath,
              saveDebounceMs: 1000,
              syncIntervalMs: syncInterval * 1000,
            },
            fileManager,
            gitAbstraction,
          )
          
          // Connect SyncHandler to SyncManager for IPC event bridging
          syncHandler.setSyncManager(syncManager)
          
          // Start automatic sync
          syncManager.start()
          
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
          })
          
          console.log('[Main] All services started for workspace', { path: workspacePath })

          // Initialize memory + local RAG services for current workspace
          memoryManager.setWorkspacePath(workspacePath)
          localRagEngine.setWorkspacePath(workspacePath)
          await localRagEngine.rebuildIndex()
        } catch (error) {
          console.error('[Main] Failed to initialize workspace services', error)
          // Non-fatal: workspace can still be used without sync
        }
      })
      
      workspaceHandler.onWorkspaceClosed(async () => {
        memoryManager.setWorkspacePath(null)
        localRagEngine.setWorkspacePath(null)

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
      })
      
      // Register all handlers
      const handlers = [
        new SystemHandler(),
        new TestHandler(),
        fileHandler,
        workspaceHandler,
        syncHandler,
        authHandler,
        aiHandler,
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
    // Cleanup IPC handlers
    ipcManager.cleanup()
  })
}
