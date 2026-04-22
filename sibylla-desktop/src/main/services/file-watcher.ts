/**
 * FileWatcher - File system monitoring service
 *
 * Monitors file system changes in the workspace using chokidar.
 * Provides real-time notifications for file/directory add, change, and delete events.
 */

import chokidar from 'chokidar'
import path from 'path'
import { Stats, promises as fsp } from 'fs'
import { FileInfo, FileWatchEvent, FileManagerError, FILE_ERROR_CODES } from './types/file-manager.types'
import { logger } from '../utils/logger'

/**
 * FileWatcher class for monitoring file system changes
 */
export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null
  private workspaceRoot: string
  private ignoredPaths: (string | RegExp)[]

  /**
   * Create a new FileWatcher instance
   * @param workspaceRoot - Absolute path to the workspace root directory
   * @param ignoredPaths - Additional paths to ignore (beyond hidden files)
   */
  constructor(workspaceRoot: string, ignoredPaths: string[] = []) {
    this.workspaceRoot = workspaceRoot
    // Build ignored patterns: hidden files + provided paths
    this.ignoredPaths = [
      /(^|[/\\])\../, // Hidden files (starting with .)
      ...ignoredPaths.map(p => `**/${p}/**`)
    ]
    logger.info('[FileWatcher] Initialized', {
      workspaceRoot,
      ignoredPaths: this.ignoredPaths
    })
  }

  /**
   * Start watching the workspace for file system changes
   * @param callback - Callback function to handle file watch events
   * @throws Error if watcher is already started
   */
  async start(callback: (event: FileWatchEvent) => void): Promise<void> {
    if (this.watcher) {
      throw new FileManagerError(
        FILE_ERROR_CODES.WATCHER_ALREADY_STARTED,
        'Watcher already started'
      )
    }

    logger.info('[FileWatcher] Starting file watcher', { workspaceRoot: this.workspaceRoot })

    // Initialize chokidar watcher with configuration
    this.watcher = chokidar.watch(this.workspaceRoot, {
      ignored: this.ignoredPaths,
      persistent: true,
      ignoreInitial: true
    })

    // Register event listeners
    this.watcher
      .on('add', async (filePath, stats) => {
        const relativePath = path.relative(this.workspaceRoot, filePath)
        logger.debug('[FileWatcher] File added', { path: relativePath })
        callback({
          type: 'add',
          path: relativePath,
          stats: await this.statsToFileInfo(filePath, stats)
        })
      })
      .on('change', async (filePath, stats) => {
        const relativePath = path.relative(this.workspaceRoot, filePath)
        logger.debug('[FileWatcher] File changed', { path: relativePath })
        callback({
          type: 'change',
          path: relativePath,
          stats: await this.statsToFileInfo(filePath, stats)
        })
      })
      .on('unlink', (filePath) => {
        const relativePath = path.relative(this.workspaceRoot, filePath)
        logger.debug('[FileWatcher] File deleted', { path: relativePath })
        callback({
          type: 'unlink',
          path: relativePath
        })
      })
      .on('addDir', (dirPath) => {
        const relativePath = path.relative(this.workspaceRoot, dirPath)
        logger.debug('[FileWatcher] Directory added', { path: relativePath })
        callback({
          type: 'addDir',
          path: relativePath
        })
      })
      .on('unlinkDir', (dirPath) => {
        const relativePath = path.relative(this.workspaceRoot, dirPath)
        logger.debug('[FileWatcher] Directory deleted', { path: relativePath })
        callback({
          type: 'unlinkDir',
          path: relativePath
        })
      })
      .on('error', (error) => {
        logger.error('[FileWatcher] Watcher error', { error: error.message })
      })

    await new Promise<void>((resolve, reject) => {
      this.watcher!.on('ready', () => {
        logger.info('[FileWatcher] Ready and watching', { workspaceRoot: this.workspaceRoot })
        resolve()
      })
      this.watcher!.on('error', (error) => {
        logger.error('[FileWatcher] Watcher error during initialization', { error: error.message })
        reject(error)
      })
    })
  }

  /**
   * Stop watching the workspace
   */
  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
      logger.info('[FileWatcher] Stopped watching')
    }
  }

  /**
   * Convert chokidar stats to FileInfo
   * @param filePath - Absolute file path
   * @param stats - File stats object from chokidar
   * @returns FileInfo object or undefined if stats is missing
   */
  private async statsToFileInfo(filePath: string, stats: Stats | undefined): Promise<FileInfo | undefined> {
    try {
      const resolvedStats = stats ?? await fsp.stat(filePath)
      return {
        name: path.basename(filePath),
        path: path.relative(this.workspaceRoot, filePath),
        isDirectory: resolvedStats.isDirectory(),
        size: resolvedStats.size,
        modifiedTime: resolvedStats.mtimeMs,
        createdTime: resolvedStats.birthtimeMs,
        extension: path.extname(filePath)
      }
    } catch (error) {
      logger.warn('[FileWatcher] Failed to stat file', { filePath, error: String(error) })
      return undefined
    }
  }
}
