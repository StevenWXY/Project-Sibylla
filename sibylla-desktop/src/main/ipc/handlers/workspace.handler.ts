/**
 * Workspace Handler - IPC handler for workspace operations
 *
 * This handler exposes WorkspaceManager functionality to the renderer process
 * through IPC channels. It handles workspace creation, opening, validation,
 * and configuration management.
 */

import { ipcMain, IpcMainInvokeEvent, dialog } from 'electron'
import { IpcHandler } from '../handler'
import { WorkspaceManager } from '../../services/workspace-manager'
import { IPC_CHANNELS } from '../../../shared/types'
import { logger } from '../../utils/logger'
import type {
  CreateWorkspaceOptions,
  WorkspaceInfo,
  WorkspaceConfig,
  WorkspaceMetadata,
} from '../../../shared/types'

/**
 * Callback type for workspace lifecycle events
 *
 * Used by the main process to wire up services (e.g., SyncManager)
 * when a workspace is opened or closed.
 */
export type WorkspaceLifecycleCallback = (workspaceInfo: WorkspaceInfo) => void | Promise<void>

/**
 * WorkspaceHandler class
 * 
 * Handles all workspace-related IPC communications between main and renderer processes.
 * Provides a bridge between the renderer's workspace API and the WorkspaceManager service.
 */
export class WorkspaceHandler extends IpcHandler {
  readonly namespace = 'workspace'
  private workspaceManager: WorkspaceManager | null = null
  
  /**
   * Lifecycle callbacks for workspace open/close events
   *
   * These are invoked by the handler after successful workspace open/close
   * operations, allowing the main process to wire up dependent services
   * (e.g., SyncManager, FileWatcher).
   */
  private onWorkspaceOpenedCallback: WorkspaceLifecycleCallback | null = null
  private onWorkspaceClosedCallback: (() => void | Promise<void>) | null = null
  
  /**
   * Set WorkspaceManager instance
   * 
   * @param workspaceManager - WorkspaceManager instance to use for workspace operations
   */
  setWorkspaceManager(workspaceManager: WorkspaceManager): void {
    this.workspaceManager = workspaceManager
    logger.info('[WorkspaceHandler] WorkspaceManager instance set')
  }
  
  /**
   * Set callback for workspace opened events
   *
   * Called after a workspace is successfully opened (or created and set as current).
   * The main process uses this to initialize SyncManager, GitAbstraction, etc.
   *
   * @param callback - Function receiving the WorkspaceInfo of the opened workspace
   */
  onWorkspaceOpened(callback: WorkspaceLifecycleCallback): void {
    this.onWorkspaceOpenedCallback = callback
  }
  
  /**
   * Set callback for workspace closed events
   *
   * Called after a workspace is successfully closed.
   * The main process uses this to tear down SyncManager, etc.
   *
   * @param callback - Function to call on workspace close
   */
  onWorkspaceClosed(callback: () => void | Promise<void>): void {
    this.onWorkspaceClosedCallback = callback
  }
  
  /**
   * Register all workspace operation IPC handlers
   */
  register(): void {
    // Workspace lifecycle
    ipcMain.handle(IPC_CHANNELS.WORKSPACE_CREATE, this.safeHandle(this.createWorkspace.bind(this)))
    ipcMain.handle(IPC_CHANNELS.WORKSPACE_OPEN, this.safeHandle(this.openWorkspace.bind(this)))
    ipcMain.handle(IPC_CHANNELS.WORKSPACE_CLOSE, this.safeHandle(this.closeWorkspace.bind(this)))
    
    // Workspace information
    ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET_CURRENT, this.safeHandle(this.getCurrentWorkspace.bind(this)))
    ipcMain.handle(IPC_CHANNELS.WORKSPACE_VALIDATE, this.safeHandle(this.validateWorkspace.bind(this)))
    
    // Workspace configuration
    ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET_CONFIG, this.safeHandle(this.getConfig.bind(this)))
    ipcMain.handle(IPC_CHANNELS.WORKSPACE_UPDATE_CONFIG, this.safeHandle(this.updateConfig.bind(this)))
    ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET_METADATA, this.safeHandle(this.getMetadata.bind(this)))
    
    // Utility
    ipcMain.handle(IPC_CHANNELS.WORKSPACE_SELECT_FOLDER, this.safeHandle(this.selectFolder.bind(this)))
    
    logger.info('[WorkspaceHandler] All handlers registered')
  }
  
  /**
   * Cleanup — remove all registered IPC handlers and release resources
   */
  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_CREATE)
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_OPEN)
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_CLOSE)
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_GET_CURRENT)
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_VALIDATE)
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_GET_CONFIG)
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_UPDATE_CONFIG)
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_GET_METADATA)
    ipcMain.removeHandler(IPC_CHANNELS.WORKSPACE_SELECT_FOLDER)
    
    this.workspaceManager = null
    this.onWorkspaceOpenedCallback = null
    this.onWorkspaceClosedCallback = null
    
    super.cleanup()
  }
  
  /**
   * Ensure WorkspaceManager is available
   * 
   * @throws Error if WorkspaceManager is not set
   */
  private ensureWorkspaceManager(): WorkspaceManager {
    if (!this.workspaceManager) {
      throw new Error('WorkspaceManager not initialized')
    }
    return this.workspaceManager
  }
  
  /**
   * Create a new workspace
   * 
   * @param event - IPC event
   * @param options - Workspace creation options
   * @returns WorkspaceInfo for the newly created workspace
   */
  private async createWorkspace(
    event: IpcMainInvokeEvent,
    options: CreateWorkspaceOptions
  ): Promise<WorkspaceInfo> {
    const manager = this.ensureWorkspaceManager()
    logger.info('[WorkspaceHandler] Creating workspace', { name: options.name })
    
    const workspaceInfo = await manager.createWorkspace(options)
    
    logger.info('[WorkspaceHandler] Workspace created', { workspaceId: workspaceInfo.config.workspaceId })
    
    // Notify lifecycle callback (workspace is set as current after creation)
    await this.invokeOpenedCallback(workspaceInfo)
    
    return workspaceInfo
  }
  
  /**
   * Open an existing workspace
   *
   * @param event - IPC event
   * @param path - Absolute path to workspace root
   * @returns WorkspaceInfo for the opened workspace
   */
  private async openWorkspace(
    event: IpcMainInvokeEvent,
    path: string
  ): Promise<WorkspaceInfo> {
    const manager = this.ensureWorkspaceManager()
    logger.info('[WorkspaceHandler] Opening workspace', { path })
    
    // WorkspaceManager.openWorkspace auto-closes previous workspace if any
    // We need to tear down SyncManager for the previous workspace first
    if (manager.getCurrentWorkspace()) {
      await this.invokeClosedCallback()
    }
    
    const workspaceInfo = await manager.openWorkspace(path)
    
    logger.info('[WorkspaceHandler] Workspace opened', { workspaceId: workspaceInfo.config.workspaceId })
    
    // Initialize SyncManager for the new workspace
    await this.invokeOpenedCallback(workspaceInfo)
    
    return workspaceInfo
  }
  
  /**
   * Close the currently open workspace
   *
   * @param event - IPC event
   */
  private async closeWorkspace(_event: IpcMainInvokeEvent): Promise<void> {
    const manager = this.ensureWorkspaceManager()
    logger.info('[WorkspaceHandler] Closing workspace')
    
    // Tear down SyncManager before closing workspace
    await this.invokeClosedCallback()
    
    await manager.closeWorkspace()
    
    logger.info('[WorkspaceHandler] Workspace closed')
  }
  
  /**
   * Get the currently open workspace
   *
   * @param event - IPC event
   * @returns Current workspace info or null if no workspace is open
   */
  private async getCurrentWorkspace(_event: IpcMainInvokeEvent): Promise<WorkspaceInfo | null> {
    const manager = this.ensureWorkspaceManager()
    const workspace = manager.getCurrentWorkspace()
    
    logger.info('[WorkspaceHandler] Get current workspace', {
      workspaceId: workspace ? workspace.config.workspaceId : 'none'
    })
    return workspace
  }
  
  /**
   * Validate that a directory is a valid Sibylla workspace
   *
   * @param event - IPC event
   * @param path - Absolute path to workspace root
   * @returns true if valid, false otherwise
   */
  private async validateWorkspace(
    event: IpcMainInvokeEvent,
    path: string
  ): Promise<boolean> {
    const manager = this.ensureWorkspaceManager()
    logger.info('[WorkspaceHandler] Validating workspace', { path })
    
    const isValid = await manager.validateWorkspace(path)
    
    logger.info('[WorkspaceHandler] Workspace validation result', { path, isValid })
    return isValid
  }
  
  /**
   * Get the current workspace configuration
   *
   * @param event - IPC event
   * @returns WorkspaceConfig
   */
  private async getConfig(_event: IpcMainInvokeEvent): Promise<WorkspaceConfig> {
    const manager = this.ensureWorkspaceManager()
    logger.info('[WorkspaceHandler] Getting workspace config')
    
    const config = await manager.getConfig()
    
    logger.info('[WorkspaceHandler] Workspace config retrieved', { workspaceId: config.workspaceId })
    return config
  }
  
  /**
   * Update workspace configuration
   *
   * @param event - IPC event
   * @param updates - Partial configuration updates
   */
  private async updateConfig(
    event: IpcMainInvokeEvent,
    updates: Partial<WorkspaceConfig>
  ): Promise<void> {
    const manager = this.ensureWorkspaceManager()
    logger.info('[WorkspaceHandler] Updating workspace config', { updates })
    
    await manager.updateConfig(updates)
    
    logger.info('[WorkspaceHandler] Workspace config updated')
  }
  
  /**
   * Get the current workspace metadata
   *
   * @param event - IPC event
   * @returns WorkspaceMetadata
   */
  private async getMetadata(_event: IpcMainInvokeEvent): Promise<WorkspaceMetadata> {
    const manager = this.ensureWorkspaceManager()
    logger.info('[WorkspaceHandler] Getting workspace metadata')
    
    const metadata = await manager.getMetadata()
    
    logger.info('[WorkspaceHandler] Workspace metadata retrieved', { path: metadata.path })
    return metadata
  }
  
  /**
   * Show folder selection dialog
   *
   * @param event - IPC event
   * @returns Selected folder path or null if cancelled
   */
  private async selectFolder(_event: IpcMainInvokeEvent): Promise<string | null> {
    logger.info('[WorkspaceHandler] Opening folder selection dialog')
    
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Workspace Location',
      buttonLabel: 'Select Folder',
    })
    
    if (result.canceled || result.filePaths.length === 0) {
      logger.info('[WorkspaceHandler] Folder selection cancelled')
      return null
    }
    
    const selectedPath = result.filePaths[0] || null
    logger.info('[WorkspaceHandler] Folder selected', { path: selectedPath })
    return selectedPath
  }
  
  // ─── Private Helpers ──────────────────────────────────────────────────
  
  /**
   * Safely invoke the workspace opened callback
   */
  private async invokeOpenedCallback(workspaceInfo: WorkspaceInfo): Promise<void> {
    if (this.onWorkspaceOpenedCallback) {
      try {
        await this.onWorkspaceOpenedCallback(workspaceInfo)
      } catch (error) {
        logger.error('[WorkspaceHandler] Error in onWorkspaceOpened callback', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
  
  /**
   * Safely invoke the workspace closed callback
   */
  private async invokeClosedCallback(): Promise<void> {
    if (this.onWorkspaceClosedCallback) {
      try {
        await this.onWorkspaceClosedCallback()
      } catch (error) {
        logger.error('[WorkspaceHandler] Error in onWorkspaceClosed callback', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }
}
