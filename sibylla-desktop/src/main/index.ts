import { app, BrowserWindow } from 'electron'
import * as path from 'path'
import { promises as fs } from 'fs'
import { createMainWindow } from './window'
import { ipcManager } from './ipc'
import { TestHandler } from './ipc/handlers/test.handler'
import { SystemHandler } from './ipc/handlers/system.handler'
import { FileHandler } from './ipc/handlers/file.handler'
import { WorkspaceHandler } from './ipc/handlers/workspace.handler'
import { FileManager } from './services/file-manager'
import { WorkspaceManager } from './services/workspace-manager'

// Keep reference to main window to prevent garbage collection
let mainWindow: BrowserWindow | null = null

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
      
      // Register all handlers
      const handlers = [
        new SystemHandler(),
        new TestHandler(),
        fileHandler,
        workspaceHandler,
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
    // Cleanup IPC handlers
    ipcManager.cleanup()
  })
}
