/**
 * File Manager Service
 * 
 * Provides safe and efficient file system operations for the Sibylla application.
 * All file paths are relative to the workspace root and validated for security.
 * 
 * Key features:
 * - Atomic file writes (temp file + rename)
 * - Path traversal attack prevention
 * - System directory access protection
 * - Comprehensive error handling
 * - Structured logging
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import { logger } from '../utils/logger'
import {
  FileInfo,
  FileContent,
  WriteFileOptions,
  ReadFileOptions,
  ListFilesOptions,
  FileWatchEvent,
  FileManagerError,
  FILE_ERROR_CODES,
  FileOperationContext,
  FileOperationOptions,
} from './types/file-manager.types'
import { FileWatcher } from './file-watcher'

/**
 * Core forbidden paths that cannot be overridden for security
 * These paths are critical for system integrity and must always be protected
 */
export const CORE_FORBIDDEN_PATHS = [
  '.git',           // Git repository data
  'node_modules',   // Node.js dependencies
  '.sibylla/index', // Sibylla index files
  '.env',           // Environment variables
  '.env.local',     // Local environment variables
  '.env.production', // Production environment variables
  '.env.development', // Development environment variables
  '.ssh',           // SSH keys
  '.aws',           // AWS credentials
  '.gcp',           // Google Cloud credentials
  '.azure',         // Azure credentials
  'package-lock.json', // NPM lock file (should not be manually edited)
  'yarn.lock',      // Yarn lock file (should not be manually edited)
  'pnpm-lock.yaml', // PNPM lock file (should not be manually edited)
] as const
export type CoreForbiddenPath = typeof CORE_FORBIDDEN_PATHS[number]

/**
 * FileManager class
 *
 * Main class for file system operations. All methods operate on paths
 * relative to the workspace root.
 */
export class FileManager {
  /**
   * Core forbidden paths reference
   */
  private static readonly CORE_FORBIDDEN_PATHS = CORE_FORBIDDEN_PATHS
  
  private workspaceRoot: string
  private customForbiddenPaths: string[]
  private watcher: FileWatcher | null = null
  
  /**
   * Create a new FileManager instance
   *
   * @param workspaceRoot - Absolute path to the workspace root directory
   * @param additionalForbiddenPaths - Additional forbidden directory patterns (extends core forbidden paths)
   * @throws {FileManagerError} If workspace root is invalid
   */
  constructor(
    workspaceRoot: string,
    additionalForbiddenPaths: string[] = []
  ) {
    // Normalize and validate workspace root
    this.workspaceRoot = path.resolve(workspaceRoot)
    this.customForbiddenPaths = additionalForbiddenPaths
    
    logger.info('[FileManager] Initialized', {
      workspaceRoot: this.workspaceRoot,
      coreForbiddenPaths: FileManager.CORE_FORBIDDEN_PATHS,
      additionalForbiddenPaths,
    })
  }
  
  /**
   * Get the workspace root path
   * 
   * @returns Absolute path to workspace root
   */
  getWorkspaceRoot(): string {
    return this.workspaceRoot
  }
  
  /**
   * Update the workspace root path
   * 
   * This method allows changing the workspace root after initialization.
   * It will stop any active file watching and update the workspace root.
   * 
   * @param newWorkspaceRoot - New absolute path to workspace root
   * @throws {FileManagerError} If file watcher is active
   */
  async updateWorkspaceRoot(newWorkspaceRoot: string): Promise<void> {
    const normalizedPath = path.resolve(newWorkspaceRoot)
    
    logger.info('[FileManager] Updating workspace root', {
      oldRoot: this.workspaceRoot,
      newRoot: normalizedPath,
    })
    
    // Stop file watching if active
    if (this.watcher) {
      await this.stopWatching()
    }
    
    // Update workspace root
    this.workspaceRoot = normalizedPath
    
    logger.info('[FileManager] Workspace root updated successfully', {
      workspaceRoot: this.workspaceRoot,
    })
  }
  
  /**
   * Resolve a relative path to an absolute path
   * 
   * @param relativePath - Path relative to workspace root
   * @returns Absolute path
   */
  resolvePath(relativePath: string): string {
    // Normalize the relative path to handle '..' and '.'
    const normalized = path.normalize(relativePath)
    
    // Join with workspace root
    const fullPath = path.join(this.workspaceRoot, normalized)
    
    return fullPath
  }
  
  /**
   * Get relative path from absolute path
   * 
   * @param fullPath - Absolute path
   * @returns Path relative to workspace root
   */
  getRelativePath(fullPath: string): string {
    return path.relative(this.workspaceRoot, fullPath)
  }
  
  /**
   * Validate a path for security
   *
   * Checks:
   * 1. Path must be within workspace root (prevent path traversal)
   * 2. Path must not access forbidden system directories (context-dependent)
   * 3. Path length must not exceed OS limits (Windows MAX_PATH)
   *
   * @param fullPath - Absolute path to validate
   * @param context - Operation context (default: USER)
   * @throws {FileManagerError} If path is invalid or forbidden
   */
  validatePath(
    fullPath: string,
    context: FileOperationContext = FileOperationContext.USER
  ): void {
    // 1. Always check path traversal attacks
    const normalized = path.normalize(fullPath)
    if (!normalized.startsWith(this.workspaceRoot)) {
      throw new FileManagerError(
        FILE_ERROR_CODES.PATH_OUTSIDE_WORKSPACE,
        `Path outside workspace: ${fullPath}`,
        { fullPath, workspaceRoot: this.workspaceRoot }
      )
    }
    
    // 2. Check forbidden paths based on context
    if (context === FileOperationContext.USER) {
      // User operations: check all forbidden paths
      this.checkForbiddenPaths(fullPath)
    } else if (context === FileOperationContext.WORKSPACE_INIT) {
      // Workspace initialization: only allow .sibylla access
      this.checkWorkspaceInitPaths(fullPath)
    }
    // SYSTEM context: skip forbidden path checks
    
    // 3. Check path length (Windows MAX_PATH = 260)
    if (process.platform === 'win32' && fullPath.length > 260) {
      throw new FileManagerError(
        FILE_ERROR_CODES.PATH_TOO_LONG,
        'Path exceeds Windows MAX_PATH limit (260 characters)',
        { fullPath, length: fullPath.length }
      )
    }
    
    // 4. Log system-level operations for audit
    if (context !== FileOperationContext.USER) {
      logger.warn('[FileManager] System-level operation', {
        context,
        path: fullPath,
        stack: new Error().stack
      })
    }
  }
  
  /**
   * Check if path accesses forbidden directories (for USER context)
   *
   * @param fullPath - Absolute path to check
   * @throws {FileManagerError} If path accesses forbidden directory
   */
  private checkForbiddenPaths(fullPath: string): void {
    const relativePath = path.relative(this.workspaceRoot, fullPath)
    const segments = relativePath.split(path.sep)
    
    const allForbiddenPaths = [
      ...FileManager.CORE_FORBIDDEN_PATHS,
      ...this.customForbiddenPaths
    ]
    
    for (const forbiddenPattern of allForbiddenPaths) {
      const forbiddenSegments = forbiddenPattern.split('/')
      
      for (let i = 0; i <= segments.length - forbiddenSegments.length; i++) {
        let match = true
        for (let j = 0; j < forbiddenSegments.length; j++) {
          if (segments[i + j] !== forbiddenSegments[j]) {
            match = false
            break
          }
        }
        
        if (match) {
          throw new FileManagerError(
            FILE_ERROR_CODES.ACCESS_FORBIDDEN,
            `Access to system directory forbidden: ${forbiddenPattern}`,
            { fullPath, forbiddenDir: forbiddenPattern }
          )
        }
      }
    }
  }
  
  /**
   * Check if path is valid for WORKSPACE_INIT context
   *
   * WORKSPACE_INIT can only access .sibylla directory.
   * For non-.sibylla paths, apply normal forbidden path checks.
   *
   * @param fullPath - Absolute path to check
   * @throws {FileManagerError} If path is not allowed for WORKSPACE_INIT
   */
  private checkWorkspaceInitPaths(fullPath: string): void {
    const relativePath = path.relative(this.workspaceRoot, fullPath)
    
    // WORKSPACE_INIT can only access .sibylla directory
    if (!relativePath.startsWith('.sibylla')) {
      // For non-.sibylla paths, apply normal forbidden path checks
      this.checkForbiddenPaths(fullPath)
    }
    // .sibylla paths are allowed
  }
  
  /**
   * Validate encoding
   *
   * @param encoding - Encoding to validate
   * @param relativePath - Path for error context
   * @throws {FileManagerError} If encoding is invalid
   */
  private validateEncoding(encoding: string, relativePath: string): void {
    const validEncodings: BufferEncoding[] = [
      'utf-8', 'utf8', 'ascii', 'base64', 'hex',
      'latin1', 'binary', 'ucs2', 'ucs-2', 'utf16le', 'utf-16le'
    ]
    if (!validEncodings.includes(encoding as BufferEncoding)) {
      throw new FileManagerError(
        FILE_ERROR_CODES.INVALID_ENCODING,
        `Invalid encoding: ${encoding}`,
        { relativePath, encoding }
      )
    }
  }
  
  // File operations (to be implemented in next steps)
  
  /**
   * Read a file
   *
   * @param relativePath - Path relative to workspace root
   * @param options - Read options
   * @returns File content and metadata
   */
  async readFile(relativePath: string, options?: ReadFileOptions): Promise<FileContent> {
    const startTime = Date.now()
    const fullPath = this.resolvePath(relativePath)
    this.validatePath(fullPath, options?.context)
    
    const opts = {
      encoding: options?.encoding || 'utf-8',
      maxSize: options?.maxSize || 10 * 1024 * 1024, // Default 10MB
    }
    
    // Validate encoding
    this.validateEncoding(opts.encoding, relativePath)
    
    logger.info("[FileManager] Reading file", { relativePath })
    
    try {
      // Check file size first to avoid reading huge files
      const stats = await fs.stat(fullPath)
      
      // Check if it's a directory
      if (stats.isDirectory()) {
        throw new FileManagerError(
          FILE_ERROR_CODES.IS_DIRECTORY,
          `Cannot read directory as file: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Check file size limit
      if (stats.size > opts.maxSize) {
        throw new FileManagerError(
          FILE_ERROR_CODES.FILE_TOO_LARGE,
          `File size ${stats.size} exceeds limit ${opts.maxSize}`,
          { relativePath, size: stats.size, maxSize: opts.maxSize }
        )
      }
      
      // Read file content
      const content = await fs.readFile(fullPath, opts.encoding as BufferEncoding)
      
      // Log success with duration
      const duration = Date.now() - startTime
      logger.info('[FileManager] File read successfully', {
        relativePath,
        size: stats.size,
        duration,
      })
      
      return {
        path: relativePath,
        content,
        encoding: opts.encoding,
        size: stats.size,
      }
    } catch (error) {
      const duration = Date.now() - startTime
      
      // If it's already a FileManagerError, rethrow
      if (error instanceof FileManagerError) {
        logger.error(
          `[FileManager] readFile failed: ${error.message} - ${relativePath} (${duration}ms)`
        )
        throw error
      }
      
      const code = (error as NodeJS.ErrnoException).code
      
      // Handle file not found
      if (code === 'ENOENT') {
        logger.error(
          `[FileManager] readFile failed: File not found - ${relativePath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.FILE_NOT_FOUND,
          `File not found: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Handle permission denied
      if (code === 'EACCES' || code === 'EPERM') {
        logger.error(
          `[FileManager] readFile failed: Permission denied - ${relativePath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.PERMISSION_DENIED,
          `Permission denied: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Unknown error - log and rethrow
      logger.error(
        `[FileManager] readFile failed: Unexpected error - ${relativePath} (${duration}ms)`,
        error
      )
      throw error
    }
  }
  
  /**
   * Write a file with atomic write mechanism
   *
   * Uses atomic write by default (temp file + rename) to prevent file corruption.
   * The atomic write process:
   * 1. Write content to a temporary file with unique name
   * 2. Atomically rename temp file to target file
   * 3. Clean up temp file on error
   *
   * @param relativePath - Path relative to workspace root
   * @param content - File content to write
   * @param options - Write options (encoding, atomic, createDirs)
   * @throws {FileManagerError} If write fails or path is invalid
   */
  async writeFile(relativePath: string, content: string, options?: WriteFileOptions): Promise<void> {
    const startTime = Date.now()
    const fullPath = this.resolvePath(relativePath)
    this.validatePath(fullPath, options?.context)
    
    const opts = {
      encoding: options?.encoding || 'utf-8',
      atomic: options?.atomic !== false, // Default true
      createDirs: options?.createDirs !== false, // Default true
    }
    
    // Validate encoding
    this.validateEncoding(opts.encoding, relativePath)
    
    logger.info(
      `[FileManager] Writing file: ${relativePath} ` +
      `(atomic: ${opts.atomic}, createDirs: ${opts.createDirs})`
    )
    
    try {
      // Ensure parent directory exists
      if (opts.createDirs) {
        const dir = path.dirname(fullPath)
        await fs.mkdir(dir, { recursive: true })
      }
      
      if (opts.atomic) {
        // Atomic write: temp file + rename
        // Generate unique temp file name with timestamp + random string
        // Using shorter identifier to avoid MAX_PATH issues on Windows
        
        // Pre-check path length on Windows before generating temp file
        // Temp suffix format: .tmp.{13-digit-timestamp}.{6-char-random} ≈ 25 chars
        const estimatedTempPathLength = fullPath.length + 25
        if (process.platform === 'win32' && estimatedTempPathLength > 260) {
          throw new FileManagerError(
            FILE_ERROR_CODES.PATH_TOO_LONG,
            'Path too long for atomic write operation on Windows (MAX_PATH: 260)',
            { fullPath, estimatedLength: estimatedTempPathLength }
          )
        }
        
        const tempPath = `${fullPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
        
        // Retry logic for concurrent writes (especially on Windows)
        const maxRetries = 3
        let lastError: Error | null = null
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            // Write to temp file
            await fs.writeFile(tempPath, content, opts.encoding as BufferEncoding)
            
            // Atomic rename - this is atomic on most file systems
            // On Windows, concurrent renames may fail with EACCES/EPERM
            await fs.rename(tempPath, fullPath)
            
            // Log success
            const duration = Date.now() - startTime
            logger.info(
              `[FileManager] File written successfully (atomic): ${relativePath} ` +
              `(${content.length} chars, ${duration}ms${attempt > 0 ? `, retry: ${attempt}` : ''})`
            )
            
            // Success - exit retry loop
            lastError = null
            break
          } catch (error) {
            lastError = error as Error
            const code = (error as NodeJS.ErrnoException).code
            
            // Clean up temp file
            try {
              await fs.unlink(tempPath)
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
            
            // Retry on permission errors (common in concurrent writes on Windows)
            if ((code === 'EACCES' || code === 'EPERM') && attempt < maxRetries - 1) {
              // Wait a bit before retrying (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, 10 * Math.pow(2, attempt)))
              continue
            }
            
            // For other errors or final attempt, throw
            throw error
          }
        }
        
        // If we exhausted retries, throw the last error
        if (lastError) {
          throw lastError
        }
      } else {
        // Direct write (non-atomic)
        await fs.writeFile(fullPath, content, opts.encoding as BufferEncoding)
        
        const duration = Date.now() - startTime
        logger.info(
          `[FileManager] File written successfully (direct): ${relativePath} ` +
          `(${content.length} chars, ${duration}ms)`
        )
      }
    } catch (error) {
      const duration = Date.now() - startTime
      const code = (error as NodeJS.ErrnoException).code
      
      // Handle permission denied
      if (code === 'EACCES' || code === 'EPERM') {
        logger.error(
          `[FileManager] writeFile failed: Permission denied - ${relativePath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.PERMISSION_DENIED,
          `Permission denied: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Handle disk full
      if (code === 'ENOSPC') {
        logger.error(
          `[FileManager] writeFile failed: Disk full - ${relativePath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.DISK_FULL,
          `Disk full: cannot write ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Handle trying to write to a directory
      if (code === 'EISDIR') {
        logger.error(
          `[FileManager] writeFile failed: Is a directory - ${relativePath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.IS_DIRECTORY,
          `Cannot write to directory: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Handle parent directory not found (when createDirs is false)
      if (code === 'ENOENT') {
        logger.error(
          `[FileManager] writeFile failed: Parent directory not found - ${relativePath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.FILE_NOT_FOUND,
          `Parent directory not found: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Unknown error - log and rethrow
      logger.error(
        `[FileManager] writeFile failed: Unexpected error - ${relativePath} (${duration}ms)`,
        error
      )
      throw error
    }
  }
  
  /**
   * Delete a file
   *
   * @param relativePath - Path relative to workspace root
   * @throws {FileManagerError} If file not found, is a directory, or permission denied
   *
   * @example
   * ```typescript
   * await fileManager.deleteFile('docs/old-file.md')
   * ```
   */
  async deleteFile(relativePath: string, options?: FileOperationOptions): Promise<void> {
    const startTime = Date.now()
    const fullPath = this.resolvePath(relativePath)
    this.validatePath(fullPath, options?.context)
    
    logger.info(`[FileManager] Deleting file: ${relativePath}`)
    
    try {
      // Get file info to verify it's not a directory
      // This also checks if file exists
      const stats = await fs.stat(fullPath)
      
      if (stats.isDirectory()) {
        throw new FileManagerError(
          FILE_ERROR_CODES.IS_DIRECTORY,
          `Cannot delete directory as file: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Delete the file
      await fs.unlink(fullPath)
      
      // Log success with duration
      const duration = Date.now() - startTime
      logger.info(
        `[FileManager] File deleted successfully: ${relativePath} ` +
        `(${stats.size} bytes, ${duration}ms)`
      )
    } catch (error) {
      const duration = Date.now() - startTime
      
      // If it's already a FileManagerError, rethrow
      if (error instanceof FileManagerError) {
        logger.error(
          `[FileManager] deleteFile failed: ${error.message} - ${relativePath} (${duration}ms)`
        )
        throw error
      }
      
      const code = (error as NodeJS.ErrnoException).code
      
      // Handle file not found
      if (code === 'ENOENT') {
        logger.error(
          `[FileManager] deleteFile failed: File not found - ${relativePath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.FILE_NOT_FOUND,
          `File not found: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Handle permission denied
      if (code === 'EACCES' || code === 'EPERM') {
        logger.error(
          `[FileManager] deleteFile failed: Permission denied - ${relativePath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.PERMISSION_DENIED,
          `Permission denied: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Handle trying to delete a directory (race condition fallback)
      if (code === 'EISDIR') {
        logger.error(
          `[FileManager] deleteFile failed: Is a directory - ${relativePath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.IS_DIRECTORY,
          `Cannot delete directory as file: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Unknown error - log and rethrow
      logger.error(
        `[FileManager] deleteFile failed: Unexpected error - ${relativePath} (${duration}ms)`,
        error
      )
      throw error
    }
  }
  
  /**
   * Copy a file
   *
   * @param sourcePath - Source path relative to workspace root
   * @param destPath - Destination path relative to workspace root
   * @throws {FileManagerError} If source not found, is a directory, or permission denied
   *
   * @example
   * ```typescript
   * await fileManager.copyFile('docs/file.md', 'backup/file.md')
   * ```
   */
  async copyFile(sourcePath: string, destPath: string, options?: FileOperationOptions): Promise<void> {
    const startTime = Date.now()
    const sourceFullPath = this.resolvePath(sourcePath)
    const destFullPath = this.resolvePath(destPath)
    
    this.validatePath(sourceFullPath, options?.context)
    this.validatePath(destFullPath, options?.context)
    
    logger.info(`[FileManager] Copying file: ${sourcePath} -> ${destPath}`)
    
    try {
      // Check source exists and is a file
      const sourceStats = await fs.stat(sourceFullPath)
      
      if (sourceStats.isDirectory()) {
        throw new FileManagerError(
          FILE_ERROR_CODES.IS_DIRECTORY,
          `Cannot copy directory as file: ${sourcePath}`,
          { sourcePath, sourceFullPath }
        )
      }
      
      // Ensure destination directory exists
      const destDir = path.dirname(destFullPath)
      await fs.mkdir(destDir, { recursive: true })
      
      // Copy file
      await fs.copyFile(sourceFullPath, destFullPath)
      
      // Log success with duration
      const duration = Date.now() - startTime
      logger.info(
        `[FileManager] File copied successfully: ${sourcePath} -> ${destPath} ` +
        `(${sourceStats.size} bytes, ${duration}ms)`
      )
    } catch (error) {
      // If it's already a FileManagerError, rethrow it
      if (error instanceof FileManagerError) {
        throw error
      }
      
      const duration = Date.now() - startTime
      const code = (error as NodeJS.ErrnoException).code
      
      // Handle source file not found
      if (code === 'ENOENT') {
        logger.error(
          `[FileManager] copyFile failed: Source file not found - ${sourcePath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.FILE_NOT_FOUND,
          `Source file not found: ${sourcePath}`,
          { sourcePath, sourceFullPath }
        )
      }
      
      // Handle permission denied
      if (code === 'EACCES' || code === 'EPERM') {
        logger.error(
          `[FileManager] copyFile failed: Permission denied - ${sourcePath} -> ${destPath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.PERMISSION_DENIED,
          `Permission denied`,
          { sourcePath, destPath }
        )
      }
      
      // Handle disk full
      if (code === 'ENOSPC') {
        logger.error(
          `[FileManager] copyFile failed: Disk full - ${destPath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.DISK_FULL,
          `Disk full: cannot copy to ${destPath}`,
          { sourcePath, destPath }
        )
      }
      
      // Unknown error - log and rethrow
      logger.error(
        `[FileManager] copyFile failed: Unexpected error - ${sourcePath} -> ${destPath} (${duration}ms)`,
        error
      )
      throw error
    }
  }
  
  /**
   * Move a file to a new location (rename)
   *
   * Moves a file from source to destination. If the move crosses filesystem boundaries,
   * automatically falls back to copy + delete.
   *
   * @param sourcePath - Source path relative to workspace root
   * @param destPath - Destination path relative to workspace root
   * @throws {FileManagerError} If source not found, is a directory, or permission denied
   *
   * @example
   * ```typescript
   * // Move file within same directory (rename)
   * await fileManager.moveFile('docs/old-name.md', 'docs/new-name.md')
   *
   * // Move file to different directory
   * await fileManager.moveFile('docs/file.md', 'archive/file.md')
   * ```
   */
  async moveFile(sourcePath: string, destPath: string, options?: FileOperationOptions): Promise<void> {
    const startTime = Date.now()
    const sourceFullPath = this.resolvePath(sourcePath)
    const destFullPath = this.resolvePath(destPath)
    
    this.validatePath(sourceFullPath, options?.context)
    this.validatePath(destFullPath, options?.context)
    
    logger.info(`[FileManager] Moving file: ${sourcePath} -> ${destPath}`)
    
    try {
      // Check source exists and is a file
      const sourceStats = await fs.stat(sourceFullPath)
      
      if (sourceStats.isDirectory()) {
        throw new FileManagerError(
          FILE_ERROR_CODES.IS_DIRECTORY,
          `Cannot move directory as file: ${sourcePath}`,
          { sourcePath, sourceFullPath }
        )
      }
      
      // Ensure destination directory exists
      const destDir = path.dirname(destFullPath)
      await fs.mkdir(destDir, { recursive: true })
      
      // Move file (rename)
      await fs.rename(sourceFullPath, destFullPath)
      
      // Log success with duration
      const duration = Date.now() - startTime
      logger.info(
        `[FileManager] File moved successfully: ${sourcePath} -> ${destPath} ` +
        `(${sourceStats.size} bytes, ${duration}ms)`
      )
    } catch (error) {
      // If it's already a FileManagerError, rethrow it
      if (error instanceof FileManagerError) {
        throw error
      }
      
      const duration = Date.now() - startTime
      const code = (error as NodeJS.ErrnoException).code
      
      // Handle source file not found
      if (code === 'ENOENT') {
        logger.error(
          `[FileManager] moveFile failed: Source file not found - ${sourcePath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.FILE_NOT_FOUND,
          `Source file not found: ${sourcePath}`,
          { sourcePath, sourceFullPath }
        )
      }
      
      // Handle permission denied
      if (code === 'EACCES' || code === 'EPERM') {
        logger.error(
          `[FileManager] moveFile failed: Permission denied - ${sourcePath} -> ${destPath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.PERMISSION_DENIED,
          `Permission denied`,
          { sourcePath, destPath }
        )
      }
      
      // Handle cross-device move (EXDEV)
      // When moving across different filesystems, rename() fails
      // Fall back to copy + delete
      if (code === 'EXDEV') {
        logger.info(
          `[FileManager] Cross-device move detected, falling back to copy + delete: ${sourcePath} -> ${destPath}`
        )
        
        try {
          // Copy file to destination
          await this.copyFile(sourcePath, destPath)
          
          // Delete source file — if this fails, rollback by removing the copy
          try {
            await this.deleteFile(sourcePath)
          } catch (deleteError) {
            logger.error(
              `[FileManager] moveFile: Source delete failed after copy, rolling back destination: ${destPath}`,
              deleteError
            )
            
            // Rollback: remove the destination copy to prevent duplicate files
            try {
              await this.deleteFile(destPath)
              logger.info(
                `[FileManager] moveFile: Rollback successful, destination copy removed: ${destPath}`
              )
            } catch (rollbackError) {
              // Critical: both delete and rollback failed — log for manual intervention
              logger.error(
                `[FileManager] moveFile: CRITICAL — Rollback also failed, duplicate file may exist at: ${destPath}`,
                rollbackError
              )
            }
            
            throw deleteError
          }
          
          const totalDuration = Date.now() - startTime
          logger.info(
            `[FileManager] File moved successfully (via copy+delete): ${sourcePath} -> ${destPath} (${totalDuration}ms)`
          )
          return
        } catch (fallbackError) {
          logger.error(
            `[FileManager] moveFile failed: Cross-device fallback failed - ${sourcePath} -> ${destPath}`,
            fallbackError
          )
          throw fallbackError
        }
      }
      
      // Handle disk full
      if (code === 'ENOSPC') {
        logger.error(
          `[FileManager] moveFile failed: Disk full - ${destPath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.DISK_FULL,
          `Disk full: cannot move to ${destPath}`,
          { sourcePath, destPath }
        )
      }
      
      // Unknown error - log and rethrow
      logger.error(
        `[FileManager] moveFile failed: Unexpected error - ${sourcePath} -> ${destPath} (${duration}ms)`,
        error
      )
      throw error
    }
  }
  
  // Directory operations (to be implemented in next steps)
  
  /**
   * Create a directory
   * 
   * @param relativePath - Path relative to workspace root
   * @param recursive - Create parent directories if needed
   */
  /**
   * Create a directory
   *
   * Creates a new directory at the specified path.
   * Supports recursive creation of parent directories (like `mkdir -p`).
   * If the directory already exists, the operation succeeds (idempotent).
   *
   * Features:
   * - Recursive creation: Automatically creates parent directories
   * - Idempotent: No error if directory already exists
   * - Path validation: Ensures path is within workspace
   * - Error handling: Clear error messages for common failures
   *
   * @param relativePath - Path relative to workspace root
   * @param recursive - Create parent directories if needed (default: true)
   * @throws {FileManagerError} If path exists but is not a directory, or permission denied
   *
   * @example
   * ```typescript
   * // Create single directory
   * await fileManager.createDirectory('new-dir')
   *
   * // Create nested directories
   * await fileManager.createDirectory('a/b/c', true)
   *
   * // Directory already exists (no error)
   * await fileManager.createDirectory('existing-dir')
   * ```
   */
  async createDirectory(relativePath: string, options?: FileOperationOptions & { recursive?: boolean } | boolean): Promise<void> {
    const startTime = Date.now()
    const fullPath = this.resolvePath(relativePath)
    
    // Handle both boolean and options object
    const recursive = typeof options === 'boolean' ? options : (options?.recursive !== false)
    const context = typeof options === 'object' ? options?.context : undefined
    
    this.validatePath(fullPath, context)
    
    logger.info(
      `[FileManager] Creating directory: ${relativePath} (recursive: ${recursive})`
    )
    
    try {
      // Check if directory already exists
      try {
        const stats = await fs.stat(fullPath)
        if (stats.isDirectory()) {
          // Directory already exists - idempotent operation
          const duration = Date.now() - startTime
          logger.info(
            `[FileManager] Directory already exists: ${relativePath} (${duration}ms)`
          )
          return
        } else {
          // Path exists but is not a directory
          throw new FileManagerError(
            FILE_ERROR_CODES.NOT_A_DIRECTORY,
            `Path exists but is not a directory: ${relativePath}`,
            { relativePath, fullPath }
          )
        }
      } catch (error) {
        // If ENOENT, directory doesn't exist - continue to create
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
      
      // If not recursive, check parent directory exists
      if (!recursive) {
        const parentDir = path.dirname(fullPath)
        try {
          await fs.access(parentDir)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new FileManagerError(
              FILE_ERROR_CODES.FILE_NOT_FOUND,
              `Parent directory does not exist: ${path.dirname(relativePath)}`,
              { relativePath, fullPath }
            )
          }
          throw error
        }
      }
      
      // Create directory
      await fs.mkdir(fullPath, { recursive })
      
      // Log success
      const duration = Date.now() - startTime
      logger.info(
        `[FileManager] Directory created successfully: ${relativePath} (${duration}ms)`
      )
    } catch (error) {
      const duration = Date.now() - startTime
      
      // Re-throw FileManagerError
      if (error instanceof FileManagerError) {
        logger.error(
          `[FileManager] createDirectory failed: ${error.message} (${duration}ms)`
        )
        throw error
      }
      
      // Handle Node.js errors
      const code = (error as NodeJS.ErrnoException).code
      
      if (code === 'EACCES' || code === 'EPERM') {
        throw new FileManagerError(
          FILE_ERROR_CODES.PERMISSION_DENIED,
          `Permission denied: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      if (code === 'EEXIST') {
        // This should not happen (already checked), but handle it anyway
        throw new FileManagerError(
          FILE_ERROR_CODES.ALREADY_EXISTS,
          `Path already exists: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      if (code === 'ENOENT' && !recursive) {
        throw new FileManagerError(
          FILE_ERROR_CODES.FILE_NOT_FOUND,
          `Parent directory does not exist (use recursive=true): ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Unexpected error
      logger.error(
        `[FileManager] createDirectory failed: Unexpected error (${duration}ms)`,
        error
      )
      throw error
    }
  }
  
  /**
   * Delete a directory
   *
   * Deletes a directory at the specified path.
   * By default, only empty directories can be deleted (safe mode).
   * Use recursive=true to delete non-empty directories.
   *
   * Features:
   * - Safe mode: Only deletes empty directories by default
   * - Recursive mode: Deletes directory and all contents
   * - Path validation: Ensures path is within workspace
   * - Error handling: Clear error messages for common failures
   *
   * @param relativePath - Path relative to workspace root
   * @param recursive - Delete contents recursively (default: false)
   * @throws {FileManagerError} If directory not found, not a directory, not empty, or permission denied
   *
   * @example
   * ```typescript
   * // Delete empty directory
   * await fileManager.deleteDirectory('empty-dir')
   *
   * // Delete directory with contents
   * await fileManager.deleteDirectory('dir-with-files', true)
   * ```
   */
  async deleteDirectory(relativePath: string, options?: FileOperationOptions & { recursive?: boolean } | boolean): Promise<void> {
    const startTime = Date.now()
    const fullPath = this.resolvePath(relativePath)
    
    // Handle both boolean and options object
    const recursive = typeof options === 'boolean' ? options : (options?.recursive || false)
    const context = typeof options === 'object' ? options?.context : undefined
    
    this.validatePath(fullPath, context)
    
    logger.info(
      `[FileManager] Deleting directory: ${relativePath} (recursive: ${recursive})`
    )
    
    try {
      // Verify path exists and is a directory
      const stats = await fs.stat(fullPath)
      if (!stats.isDirectory()) {
        throw new FileManagerError(
          FILE_ERROR_CODES.NOT_A_DIRECTORY,
          `Path is not a directory: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Delete directory
      if (recursive) {
        // Recursive delete: use fs.rm() which supports recursive option
        await fs.rm(fullPath, { recursive: true, force: false })
      } else {
        // Safe mode: use fs.rmdir() which only deletes empty directories
        await fs.rmdir(fullPath)
      }
      
      // Log success
      const duration = Date.now() - startTime
      logger.info(
        `[FileManager] Directory deleted successfully: ${relativePath} (${duration}ms)`
      )
    } catch (error) {
      const duration = Date.now() - startTime
      
      // Re-throw FileManagerError
      if (error instanceof FileManagerError) {
        logger.error(
          `[FileManager] deleteDirectory failed: ${error.message} (${duration}ms)`
        )
        throw error
      }
      
      // Handle Node.js errors
      const code = (error as NodeJS.ErrnoException).code
      
      if (code === 'ENOENT') {
        throw new FileManagerError(
          FILE_ERROR_CODES.FILE_NOT_FOUND,
          `Directory not found: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      if (code === 'EACCES' || code === 'EPERM') {
        throw new FileManagerError(
          FILE_ERROR_CODES.PERMISSION_DENIED,
          `Permission denied: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      if (code === 'ENOTEMPTY' || code === 'EEXIST') {
        // Only throw if not in recursive mode
        if (!recursive) {
          throw new FileManagerError(
            FILE_ERROR_CODES.DIRECTORY_NOT_EMPTY,
            `Directory not empty (use recursive=true to force delete): ${relativePath}`,
            { relativePath, fullPath }
          )
        }
        // In recursive mode, this shouldn't happen with fs.rm, but if it does, re-throw
        logger.error(
          `[FileManager] deleteDirectory failed: Unexpected ENOTEMPTY in recursive mode (${duration}ms)`,
          error
        )
        throw error
      }
      
      // Unexpected error
      logger.error(
        `[FileManager] deleteDirectory failed: Unexpected error (${duration}ms)`,
        error
      )
      throw error
    }
  }
  
  /**
   * List files in a directory
   *
   * Lists all files and subdirectories in the specified directory.
   * Supports recursive traversal, hidden file filtering, and custom filters.
   *
   * Features:
   * - Non-recursive listing (default): Lists only direct children
   * - Recursive listing: Traverses all subdirectories
   * - Hidden file filtering: Optionally exclude files starting with '.'
   * - Custom filter function: Apply custom filtering logic
   *
   * @param relativePath - Path relative to workspace root
   * @param options - List options
   * @param options.recursive - Recursively list subdirectories (default: false)
   * @param options.includeHidden - Include hidden files (default: false)
   * @param options.filter - Custom filter function
   * @returns Array of file information
   * @throws {FileManagerError} If directory not found, not a directory, or access denied
   *
   * @example
   * ```typescript
   * // List direct children only
   * const files = await fileManager.listFiles('docs')
   *
   * // List all files recursively
   * const allFiles = await fileManager.listFiles('docs', { recursive: true })
   *
   * // Filter Markdown files
   * const mdFiles = await fileManager.listFiles('docs', {
   *   recursive: true,
   *   filter: (file) => file.extension === '.md'
   * })
   * ```
   */
  async listFiles(relativePath: string, options?: ListFilesOptions): Promise<FileInfo[]> {
    const startTime = Date.now()
    const fullPath = this.resolvePath(relativePath)
    this.validatePath(fullPath, options?.context)
    
    // Default options
    const opts = {
      recursive: options?.recursive ?? false,
      includeHidden: options?.includeHidden ?? false,
      filter: options?.filter,
    }
    
    logger.info(
      `[FileManager] Listing files: ${relativePath} ` +
      `(recursive: ${opts.recursive}, includeHidden: ${opts.includeHidden})`
    )
    
    try {
      // Verify path exists and is a directory
      const stats = await fs.stat(fullPath)
      if (!stats.isDirectory()) {
        throw new FileManagerError(
          FILE_ERROR_CODES.NOT_A_DIRECTORY,
          `Path is not a directory: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      const results: FileInfo[] = []
      
      // Recursive traversal helper
      const traverse = async (dirPath: string, baseRelPath: string): Promise<void> => {
        const entries = await fs.readdir(dirPath, { withFileTypes: true })
        
        for (const entry of entries) {
          // Skip hidden files if not included
          if (!opts.includeHidden && entry.name.startsWith('.')) {
            continue
          }
          
          const entryFullPath = path.join(dirPath, entry.name)
          const entryRelPath = path.join(baseRelPath, entry.name)
          
          // Get file stats
          const entryStats = await fs.stat(entryFullPath)
          
          // Build FileInfo object
          const fileInfo: FileInfo = {
            name: entry.name,
            path: entryRelPath,
            isDirectory: entry.isDirectory(),
            size: entryStats.size,
            modifiedTime: entryStats.mtime.getTime(),
            createdTime: entryStats.birthtime.getTime(),
            extension: entry.isFile() ? path.extname(entry.name) : undefined,
          }
          
          // Apply custom filter
          if (!opts.filter || opts.filter(fileInfo)) {
            results.push(fileInfo)
          }
          
          // Recursively traverse subdirectories
          if (opts.recursive && entry.isDirectory()) {
            await traverse(entryFullPath, entryRelPath)
          }
        }
      }
      
      // Start traversal
      await traverse(fullPath, relativePath)
      
      // Log success
      const duration = Date.now() - startTime
      logger.info(
        `[FileManager] listFiles success: ${relativePath} ` +
        `(${results.length} items, ${duration}ms)`
      )
      
      return results
    } catch (error) {
      const duration = Date.now() - startTime
      
      // Re-throw FileManagerError
      if (error instanceof FileManagerError) {
        logger.error(`[FileManager] listFiles failed: ${error.message} (${duration}ms)`)
        throw error
      }
      
      // Handle Node.js errors
      const code = (error as NodeJS.ErrnoException).code
      
      if (code === 'ENOENT') {
        throw new FileManagerError(
          FILE_ERROR_CODES.FILE_NOT_FOUND,
          `Directory not found: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      if (code === 'EACCES' || code === 'EPERM') {
        throw new FileManagerError(
          FILE_ERROR_CODES.PERMISSION_DENIED,
          `Permission denied: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Unexpected error
      logger.error(`[FileManager] listFiles failed: Unexpected error (${duration}ms)`, error)
      throw error
    }
  }
  
  /**
   * Get file information
   *
   * Retrieves comprehensive metadata about a file or directory including:
   * - Name and path
   * - Type (file or directory)
   * - Size in bytes
   * - Timestamps (creation and modification)
   * - File extension (for files only)
   *
   * @param relativePath - Path relative to workspace root
   * @returns File metadata
   * @throws {FileManagerError} If file not found or access denied
   */
  async getFileInfo(relativePath: string): Promise<FileInfo> {
    const startTime = Date.now()
    const fullPath = this.resolvePath(relativePath)
    this.validatePath(fullPath)
    
    try {
      // Get file statistics
      const stats = await fs.stat(fullPath)
      
      // Build FileInfo object
      const fileInfo: FileInfo = {
        name: path.basename(fullPath),
        path: relativePath,
        isDirectory: stats.isDirectory(),
        size: stats.size,
        modifiedTime: stats.mtime.getTime(),
        createdTime: stats.birthtime.getTime(),
        extension: !stats.isDirectory() ? path.extname(fullPath) : undefined,
      }
      
      // Log success
      const duration = Date.now() - startTime
      logger.info(
        `[FileManager] getFileInfo success: ${relativePath} ` +
        `(${stats.isDirectory() ? 'directory' : 'file'}, ${stats.size} bytes, ${duration}ms)`
      )
      
      return fileInfo
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      const duration = Date.now() - startTime
      
      // Handle specific error cases
      if (code === 'ENOENT') {
        logger.error(
          `[FileManager] getFileInfo failed: File not found - ${relativePath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.FILE_NOT_FOUND,
          `File not found: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      if (code === 'EACCES' || code === 'EPERM') {
        logger.error(
          `[FileManager] getFileInfo failed: Permission denied - ${relativePath} (${duration}ms)`
        )
        throw new FileManagerError(
          FILE_ERROR_CODES.PERMISSION_DENIED,
          `Permission denied: ${relativePath}`,
          { relativePath, fullPath }
        )
      }
      
      // Handle unexpected errors - rethrow original error
      logger.error(
        `[FileManager] getFileInfo failed: Unexpected error - ${relativePath} (${duration}ms)`,
        error
      )
      throw error
    }
  }
  
  /**
   * Check if a file or directory exists
   *
   * This method returns false for non-existent files and permission denied errors.
   * Path validation errors (e.g., accessing forbidden directories) will throw exceptions
   * to prevent security issues from being silently ignored.
   *
   * @param relativePath - Path relative to workspace root
   * @returns True if exists and accessible, false if not found or permission denied
   * @throws {FileManagerError} If path validation fails (security violations)
   */
  async exists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(relativePath)
      // Let path validation errors propagate - they indicate security issues
      this.validatePath(fullPath)
      
      // Use fs.access to check if file exists and is accessible
      await fs.access(fullPath)
      
      return true
    } catch (error) {
      // Path validation errors should propagate
      if (error instanceof FileManagerError) {
        throw error
      }
      
      const code = (error as NodeJS.ErrnoException).code
      
      // ENOENT means file doesn't exist - this is expected
      if (code === 'ENOENT') {
        return false
      }
      
      // EACCES means permission denied - treat as non-existent
      if (code === 'EACCES') {
        logger.warn('[FileManager] Permission denied checking existence', {
          relativePath,
        })
        return false
      }
      
      // Other unexpected errors - log and rethrow
      logger.error('[FileManager] Unexpected error checking existence', {
        relativePath,
        error,
      })
      throw error
    }
  }
  
  // ============================================================================
  // File Watching
  // ============================================================================
  
  /**
   * Start watching for file changes
   *
   * @param callback - Callback function for file change events
   * @throws {FileManagerError} If watcher is already started
   */
  async startWatching(callback: (event: FileWatchEvent) => void): Promise<void> {
    // Guard: reject duplicate start before entering the try/catch so this
    // expected validation error is not logged as an unexpected failure.
    if (this.watcher) {
      throw new FileManagerError(
        FILE_ERROR_CODES.WATCHER_ALREADY_STARTED,
        'File watcher is already started'
      )
    }
    
    const startTime = Date.now()
    
    try {
      // Create and start the file watcher with forbidden paths
      const allForbiddenPaths = [
        ...FileManager.CORE_FORBIDDEN_PATHS,
        ...this.customForbiddenPaths
      ]
      this.watcher = new FileWatcher(this.workspaceRoot, allForbiddenPaths)
      await this.watcher.start(callback)
      
      const duration = Date.now() - startTime
      logger.info('[FileManager] File watcher started', {
        workspaceRoot: this.workspaceRoot,
        duration: `${duration}ms`,
      })
    } catch (error) {
      const duration = Date.now() - startTime
      
      // If it's already a FileManagerError, rethrow
      if (error instanceof FileManagerError) {
        logger.error('[FileManager] Failed to start file watcher', {
          workspaceRoot: this.workspaceRoot,
          error: error.message,
          code: error.code,
          duration: `${duration}ms`,
        })
        throw error
      }
      
      // Wrap other errors in FileManagerError
      logger.error('[FileManager] Failed to start file watcher', {
        workspaceRoot: this.workspaceRoot,
        error,
        duration: `${duration}ms`,
      })
      throw new FileManagerError(
        FILE_ERROR_CODES.OPERATION_TIMEOUT,
        `Failed to start file watcher: ${error instanceof Error ? error.message : String(error)}`,
        { originalError: error }
      )
    }
  }
  
  /**
   * Stop watching for file changes
   */
  async stopWatching(): Promise<void> {
    const startTime = Date.now()
    
    try {
      if (this.watcher) {
        await this.watcher.stop()
        this.watcher = null
        
        const duration = Date.now() - startTime
        logger.info('[FileManager] File watcher stopped', {
          workspaceRoot: this.workspaceRoot,
          duration: `${duration}ms`,
        })
      } else {
        logger.debug('[FileManager] No file watcher to stop')
      }
    } catch (error) {
      const duration = Date.now() - startTime
      // Best-effort: log error but don't throw
      // Stopping watcher should not fail the application
      logger.warn('[FileManager] Failed to stop file watcher (non-fatal)', {
        workspaceRoot: this.workspaceRoot,
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`,
      })
      // Still set watcher to null to prevent memory leaks
      this.watcher = null
    }
  }
}
