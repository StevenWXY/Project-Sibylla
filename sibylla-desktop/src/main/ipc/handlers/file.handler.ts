/**
 * File Handler - IPC handler for file operations
 * 
 * This handler exposes FileManager functionality to the renderer process
 * through IPC channels. It handles all file and directory operations,
 * including file watching.
 */

import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { FileManager } from '../../services/file-manager'
import { ImportManager } from '../../services/import-manager'
import { AutoSaveManager } from '../../services/auto-save-manager'
import { IPC_CHANNELS } from '../../../shared/types'
import type {
  AutoSavedPayload,
  FileContent,
  FileReadOptions,
  FileWriteOptions,
  ListFilesOptions,
  FileInfo,
  FileWatchEvent,
  ImportOptions,
  ImportResult,
  ImportProgress,
  SaveFailedPayload,
} from '../../../shared/types'
import type {
  ReadFileOptions as ManagerReadOptions,
  WriteFileOptions as ManagerWriteOptions,
  ListFilesOptions as ManagerListOptions,
  FileInfo as ManagerFileInfo,
} from '../../services/types/file-manager.types'
import type { InternalImportOptions } from '../../services/types/import-manager.types'
import type { BatchCommitResult, SaveResult } from '../../services/types/auto-save.types'

/**
 * FileHandler class
 * 
 * Handles all file-related IPC communications between main and renderer processes.
 * Provides a bridge between the renderer's file API and the FileManager service.
 */
export class FileHandler extends IpcHandler {
  readonly namespace = 'file'
  private fileManager: FileManager | null = null
  private importManager: ImportManager | null = null
  private autoSaveManager: AutoSaveManager | null = null
  
  /**
   * Set FileManager instance
   * 
   * @param fileManager - FileManager instance to use for file operations
   */
  setFileManager(fileManager: FileManager): void {
    this.fileManager = fileManager
    console.log('[FileHandler] FileManager instance set')
  }

  /**
   * Set ImportManager instance
   *
   * @param importManager - ImportManager instance for file import operations
   */
  setImportManager(importManager: ImportManager): void {
    this.importManager = importManager
    console.log('[FileHandler] ImportManager instance set')
  }

  /**
   * Set AutoSaveManager instance and connect its events to IPC broadcasts
   *
   * @param autoSaveManager - AutoSaveManager instance for auto-save operations
   */
  setAutoSaveManager(autoSaveManager: AutoSaveManager): void {
    this.autoSaveManager = autoSaveManager

    autoSaveManager.on('committed', (result: BatchCommitResult) => {
      const payload: AutoSavedPayload = {
        files: [...result.files],
        timestamp: Date.now(),
      }
      this.broadcastToAllWindows(IPC_CHANNELS.FILE_AUTO_SAVED, payload)
    })

    autoSaveManager.on('save-failed', (failedResults: SaveResult[]) => {
      const payload: SaveFailedPayload = {
        files: failedResults.map(r => ({ path: r.filePath, error: r.error ?? 'Unknown error' })),
      }
      this.broadcastToAllWindows(IPC_CHANNELS.FILE_SAVE_FAILED, payload)
    })

    console.log('[FileHandler] AutoSaveManager instance set')
  }
  
  /**
   * Register all file operation IPC handlers
   */
  register(): void {
    // File read/write operations
    ipcMain.handle(IPC_CHANNELS.FILE_READ, this.safeHandle(this.readFile.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_WRITE, this.safeHandle(this.writeFile.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_DELETE, this.safeHandle(this.deleteFile.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_COPY, this.safeHandle(this.copyFile.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_MOVE, this.safeHandle(this.moveFile.bind(this)))
    
    // File information
    ipcMain.handle(IPC_CHANNELS.FILE_INFO, this.safeHandle(this.getFileInfo.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_EXISTS, this.safeHandle(this.exists.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_LIST, this.safeHandle(this.listFiles.bind(this)))
    
    // Directory operations
    ipcMain.handle(IPC_CHANNELS.DIR_CREATE, this.safeHandle(this.createDirectory.bind(this)))
    ipcMain.handle(IPC_CHANNELS.DIR_DELETE, this.safeHandle(this.deleteDirectory.bind(this)))
    
    // File watching
    ipcMain.handle(IPC_CHANNELS.FILE_WATCH_START, this.safeHandle(this.startWatching.bind(this)))
    ipcMain.handle(IPC_CHANNELS.FILE_WATCH_STOP, this.safeHandle(this.stopWatching.bind(this)))
    
    // File import
    ipcMain.handle(IPC_CHANNELS.FILE_IMPORT, this.safeHandle(this.importFiles.bind(this)))
    
    // Auto-save: file:notifyChange (send/on, one-way notification)
    ipcMain.on(IPC_CHANNELS.FILE_NOTIFY_CHANGE, (_event, filePath: string, content: string) => {
      if (!this.autoSaveManager) {
        console.warn('[FileHandler] AutoSaveManager not initialized, ignoring notifyChange')
        return
      }
      this.autoSaveManager.onFileChanged(filePath, content)
    })

    // Auto-save: file:retrySave (invoke/handle, user-initiated retry)
    ipcMain.handle(IPC_CHANNELS.FILE_RETRY_SAVE, this.safeHandle(this.retrySave.bind(this)))
    
    console.log('[FileHandler] All handlers registered')
  }
  
  /**
   * Cleanup — remove all registered IPC handlers and release resources
   */
  override cleanup(): void {
    // Remove all registered IPC handlers
    ipcMain.removeHandler(IPC_CHANNELS.FILE_READ)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_WRITE)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_DELETE)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_COPY)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_MOVE)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_INFO)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_EXISTS)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_LIST)
    ipcMain.removeHandler(IPC_CHANNELS.DIR_CREATE)
    ipcMain.removeHandler(IPC_CHANNELS.DIR_DELETE)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_WATCH_START)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_WATCH_STOP)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_IMPORT)
    ipcMain.removeHandler(IPC_CHANNELS.FILE_RETRY_SAVE)
    ipcMain.removeAllListeners(IPC_CHANNELS.FILE_NOTIFY_CHANGE)
    
    if (this.fileManager) {
      // Stop file watching
      this.fileManager.stopWatching().catch(err => {
        console.error('[FileHandler] Error stopping file watcher:', err)
      })
      // Clear reference to allow garbage collection
      this.fileManager = null
    }
    super.cleanup()
  }
  
  /**
   * Read file content
   */
  private async readFile(
    _event: IpcMainInvokeEvent,
    path: string,
    options?: FileReadOptions
  ): Promise<FileContent> {
    if (!this.fileManager) {
      throw new Error('Workspace not initialized. Please open or create a workspace first.')
    }
    
    // Convert shared types to manager types
    const managerOptions: ManagerReadOptions = {
      encoding: options?.encoding,
      maxSize: options?.maxSize,
    }
    
    const result = await this.fileManager.readFile(path, managerOptions)
    
    return result
  }
  
  /**
   * Write file content
   */
  private async writeFile(
    _event: IpcMainInvokeEvent,
    path: string,
    content: string,
    options?: FileWriteOptions
  ): Promise<void> {
    if (!this.fileManager) {
      throw new Error('Workspace not initialized. Please open or create a workspace first.')
    }
    
    const managerOptions: ManagerWriteOptions = {
      encoding: options?.encoding,
      atomic: options?.atomic,
      createDirs: options?.createDirs,
    }
    
    await this.fileManager.writeFile(path, content, managerOptions)
  }
  
  /**
   * Delete file
   */
  private async deleteFile(
    _event: IpcMainInvokeEvent,
    path: string
  ): Promise<void> {
    if (!this.fileManager) {
      throw new Error('Workspace not initialized. Please open or create a workspace first.')
    }
    
    await this.fileManager.deleteFile(path)
  }
  
  /**
   * Copy file
   */
  private async copyFile(
    _event: IpcMainInvokeEvent,
    sourcePath: string,
    destPath: string
  ): Promise<void> {
    if (!this.fileManager) {
      throw new Error('Workspace not initialized. Please open or create a workspace first.')
    }
    
    await this.fileManager.copyFile(sourcePath, destPath)
  }
  
  /**
   * Move file
   */
  private async moveFile(
    _event: IpcMainInvokeEvent,
    sourcePath: string,
    destPath: string
  ): Promise<void> {
    if (!this.fileManager) {
      throw new Error('Workspace not initialized. Please open or create a workspace first.')
    }
    
    await this.fileManager.moveFile(sourcePath, destPath)
  }
  
  /**
   * Get file information
   */
  private async getFileInfo(
    _event: IpcMainInvokeEvent,
    path: string
  ): Promise<FileInfo> {
    if (!this.fileManager) {
      throw new Error('Workspace not initialized. Please open or create a workspace first.')
    }
    
    const info = await this.fileManager.getFileInfo(path)
    
    // Convert Date objects to ISO 8601 strings
    return this.convertFileInfo(info)
  }
  
  /**
   * Check if file exists
   */
  private async exists(
    _event: IpcMainInvokeEvent,
    path: string
  ): Promise<boolean> {
    if (!this.fileManager) {
      throw new Error('Workspace not initialized. Please open or create a workspace first.')
    }
    
    return await this.fileManager.exists(path)
  }
  
  /**
   * List files in directory
   */
  private async listFiles(
    _event: IpcMainInvokeEvent,
    path: string,
    options?: ListFilesOptions
  ): Promise<FileInfo[]> {
    if (!this.fileManager) {
      throw new Error('Workspace not initialized. Please open or create a workspace first.')
    }
    
    const managerOptions: ManagerListOptions = {
      recursive: options?.recursive,
      includeHidden: options?.includeHidden,
    }
    
    const files = await this.fileManager.listFiles(path, managerOptions)
    
    // Convert Date objects to ISO 8601 strings
    return files.map(file => this.convertFileInfo(file))
  }
  
  /**
   * Create directory
   */
  private async createDirectory(
    _event: IpcMainInvokeEvent,
    path: string,
    recursive?: boolean
  ): Promise<void> {
    if (!this.fileManager) {
      throw new Error('Workspace not initialized. Please open or create a workspace first.')
    }
    
    await this.fileManager.createDirectory(path, recursive)
  }
  
  /**
   * Delete directory
   */
  private async deleteDirectory(
    _event: IpcMainInvokeEvent,
    path: string,
    recursive?: boolean
  ): Promise<void> {
    if (!this.fileManager) {
      throw new Error('Workspace not initialized. Please open or create a workspace first.')
    }
    
    await this.fileManager.deleteDirectory(path, recursive)
  }
  
  /**
   * Start file watching
   */
  private async startWatching(
    event: IpcMainInvokeEvent
  ): Promise<void> {
    if (!this.fileManager) {
      throw new Error('Workspace not initialized. Please open or create a workspace first.')
    }
    
    // Store webContents reference
    const webContents = event.sender
    
    // Start file watching with event callback
    await this.fileManager.startWatching((watchEvent) => {
      // Check if webContents is still alive before sending
      if (!webContents || webContents.isDestroyed()) {
        console.warn('[FileHandler] WebContents destroyed, skipping file watch event')
        return
      }
      
      // Convert event format
      const ipcEvent: FileWatchEvent = {
        type: watchEvent.type,
        path: watchEvent.path,
        stats: watchEvent.stats ? this.convertFileInfo(watchEvent.stats) : undefined,
      }
      
      // Push event to renderer process
      webContents.send(IPC_CHANNELS.FILE_WATCH_EVENT, ipcEvent)
    })
    
    console.log('[FileHandler] File watching started')
  }
  
  /**
   * Stop file watching
   */
  private async stopWatching(
    _event: IpcMainInvokeEvent
  ): Promise<void> {
    if (!this.fileManager) {
      throw new Error('Workspace not initialized. Please open or create a workspace first.')
    }
    
    await this.fileManager.stopWatching()
    console.log('[FileHandler] File watching stopped')
  }
  
  /**
   * Import files from external paths into the workspace
   */
  private async importFiles(
    _event: IpcMainInvokeEvent,
    sourcePaths: string[],
    options?: ImportOptions
  ): Promise<ImportResult> {
    if (!this.importManager) {
      throw new Error('ImportManager not initialized')
    }

    const internalOptions: InternalImportOptions = {
      ...options,
      onProgress: (current, total, fileName) => {
        const payload: ImportProgress = { current, total, fileName }
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send(IPC_CHANNELS.FILE_IMPORT_PROGRESS, payload)
          }
        })
      },
    }

    return this.importManager.importFiles(sourcePaths, internalOptions)
  }

  /**
   * Convert FileInfo from manager format to shared format
   * 
   * Converts Unix timestamps to ISO 8601 strings for JSON serialization.
   */
  private convertFileInfo(info: ManagerFileInfo): FileInfo {
    return {
      name: info.name,
      path: info.path,
      isDirectory: info.isDirectory,
      size: info.size,
      modifiedTime: new Date(info.modifiedTime).toISOString(),
      createdTime: new Date(info.createdTime).toISOString(),
      extension: info.extension,
    }
  }

  /**
   * Manual retry for a failed save
   */
  private async retrySave(
    _event: IpcMainInvokeEvent,
    filePath: string,
  ): Promise<void> {
    if (!this.autoSaveManager) {
      throw new Error('AutoSaveManager not initialized')
    }
    await this.autoSaveManager.retrySave(filePath)
  }

  /**
   * Broadcast a message to all open BrowserWindows
   */
  private broadcastToAllWindows(channel: string, data: unknown): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data)
      }
    })
  }
}
