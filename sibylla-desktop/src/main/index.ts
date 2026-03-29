import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './window'
import { ipcManager } from './ipc'
import { TestHandler } from './ipc/handlers/test.handler'
import { SystemHandler } from './ipc/handlers/system.handler'
import { FileHandler } from './ipc/handlers/file.handler'
import { WorkspaceHandler } from './ipc/handlers/workspace.handler'
import { SyncHandler } from './ipc/handlers/sync.handler'
import { FileManager } from './services/file-manager'
import { WorkspaceManager } from './services/workspace-manager'
import { GitAbstraction } from './services/git-abstraction'
import { SyncManager } from './services/sync-manager'
import type { WorkspaceInfo } from '../shared/types'

// Keep reference to main window to prevent garbage collection
let mainWindow: BrowserWindow | null = null

// Keep reference to SyncManager for cleanup on quit
let syncManager: SyncManager | null = null

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
      
      // ─── Workspace lifecycle hooks ────────────────────────────────
      // Wire up SyncManager initialization/teardown to workspace open/close
      
      workspaceHandler.onWorkspaceOpened(async (workspaceInfo: WorkspaceInfo) => {
        const workspacePath = workspaceInfo.metadata.path
        
        console.log('[Main] Initializing SyncManager for workspace', { path: workspacePath })
        
        try {
          // Create GitAbstraction for this workspace
          const gitAbstraction = new GitAbstraction({
            workspaceDir: workspacePath,
            authorName: 'Sibylla User',   // TODO: use actual user info from auth
            authorEmail: 'user@sibylla.local',
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
          
          console.log('[Main] SyncManager started for workspace', { path: workspacePath })
        } catch (error) {
          console.error('[Main] Failed to initialize SyncManager', error)
          // Non-fatal: workspace can still be used without sync
        }
      })
      
      workspaceHandler.onWorkspaceClosed(() => {
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
      ]
      
      for (const handler of handlers) {
        ipcManager.registerHandler(handler)
      }
      
      // Create main window
      mainWindow = createMainWindow()
      
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
    // Stop SyncManager if running
    if (syncManager) {
      syncManager.stop()
      syncManager = null
    }
    // Cleanup IPC handlers
    ipcManager.cleanup()
  })
}
