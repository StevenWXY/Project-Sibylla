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
 * WorkspaceHandler class
 * 
 * Handles all workspace-related IPC communications between main and renderer processes.
 * Provides a bridge between the renderer's workspace API and the WorkspaceManager service.
 */
export class WorkspaceHandler extends IpcHandler {
  readonly namespace = 'workspace'
  private workspaceManager: WorkspaceManager | null = null
  
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
   * Cleanup resources
   */
  override cleanup(): void {
    logger.info('[WorkspaceHandler] Cleanup completed')
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
    
    const workspaceInfo = await manager.openWorkspace(path)
    
    logger.info('[WorkspaceHandler] Workspace opened', { workspaceId: workspaceInfo.config.workspaceId })
    return workspaceInfo
  }
  
  /**
   * Close the currently open workspace
   *
   * @param event - IPC event
   */
  private async closeWorkspace(event: IpcMainInvokeEvent): Promise<void> {
    const manager = this.ensureWorkspaceManager()
    logger.info('[WorkspaceHandler] Closing workspace')
    
    await manager.closeWorkspace()
    
    logger.info('[WorkspaceHandler] Workspace closed')
  }
  
  /**
   * Get the currently open workspace
   *
   * @param event - IPC event
   * @returns Current workspace info or null if no workspace is open
   */
  private async getCurrentWorkspace(event: IpcMainInvokeEvent): Promise<WorkspaceInfo | null> {
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
  private async getConfig(event: IpcMainInvokeEvent): Promise<WorkspaceConfig> {
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
  private async getMetadata(event: IpcMainInvokeEvent): Promise<WorkspaceMetadata> {
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
  private async selectFolder(event: IpcMainInvokeEvent): Promise<string | null> {
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
}
