/**
 * Workspace Manager
 * 
 * Core service for managing Sibylla workspaces:
 * - Create new workspaces with standard structure
 * - Open and validate existing workspaces
 * - Manage workspace configuration
 * - Track current workspace state
 * 
 * Design principles:
 * - File-based: All data stored as plain text files
 * - Local-first: Works offline, syncs when online
 * - Atomic operations: Use temporary files and atomic renames
 * - Comprehensive logging: All operations logged with context
 */

import * as path from 'path'
import { randomBytes } from 'crypto'
import { FileManager } from './file-manager'
import { FileOperationContext } from './types/file-manager.types'
import type {
  WorkspaceConfig,
  WorkspaceMetadata,
  WorkspaceInfo,
  CreateWorkspaceOptions,
} from '../../shared/types'
import {
  MembersConfig,
  PointsConfig,
  WorkspaceError,
  WorkspaceErrorCode,
  WORKSPACE_STRUCTURE,
} from './types/workspace.types'
import {
  getDirectoryStructure,
  generateWorkspaceConfig,
  generateMembersConfig,
  generatePointsConfig,
  generateClaudeTemplate,
  generateMemoryTemplate,
  generateRequirementsTemplate,
  generateDesignTemplate,
  generateTasksTemplate,
  generateChangelogTemplate,
  generateTokenomicsTemplate,
  generateSkillsIndexTemplate,
  generateGitignoreTemplate,
} from './workspace-templates'
import { logger } from '../utils/logger'

/**
 * WorkspaceManager - Core workspace management service
 */
export class WorkspaceManager {
  private currentWorkspace: WorkspaceInfo | null = null
  private currentWorkspacePath: string | null = null

  constructor(private fileManager: FileManager) {
    logger.info('WorkspaceManager initialized')
  }

  /**
   * Create a new workspace with standard structure
   *
   * @param options - Workspace creation options
   * @returns WorkspaceInfo for the newly created workspace
   * @throws WorkspaceError if creation fails
   */
  async createWorkspace(options: CreateWorkspaceOptions): Promise<WorkspaceInfo> {
    const startTime = Date.now()
    logger.info('Creating workspace', { name: options.name, path: options.path })

    // Save original FileManager root to restore on failure
    const originalRoot = this.fileManager.getWorkspaceRoot()

    try {
      // Step 0: Validate input options
      this.validateCreateOptions(options)
      
      // Step 1: Validate path
      await this.validateWorkspacePath(options.path)

      // Step 2: Update FileManager workspace root early so it can be used for file operations
      await this.fileManager.updateWorkspaceRoot(options.path)
      logger.info('Updated FileManager workspace root for creation', { path: options.path })

      // Step 3: Generate workspace ID
      const workspaceId = this.generateWorkspaceId()
      logger.info('Generated workspace ID', { workspaceId })

      // Step 4: Create directory structure
      await this.createDirectoryStructure(options.path)
      logger.info('Created directory structure')

      // Step 5: Generate and write configuration files
      const config = generateWorkspaceConfig(options, workspaceId)
      await this.writeConfig(options.path, config)
      logger.info('Wrote workspace config')

      const membersConfig = generateMembersConfig(options)
      await this.writeMembersConfig(options.path, membersConfig)
      logger.info('Wrote members config')

      const pointsConfig = generatePointsConfig()
      await this.writePointsConfig(options.path, pointsConfig)
      logger.info('Wrote points config')

      // Step 6: Generate and write initial documents
      await this.generateInitialDocuments(options.path, options)
      logger.info('Generated initial documents')

      // Step 7: Initialize Git repository (optional, will be implemented in TASK010)
      // TODO: Initialize Git repository when Git abstraction layer is ready

      // Step 8: Create remote workspace (optional, requires cloud sync)
      if (options.enableCloudSync) {
        logger.info('Cloud sync requested but not yet implemented')
        // TODO: Implement cloud workspace creation when cloud integration is ready
      }

      // Step 9: Load and return workspace info
      const workspaceInfo = await this.loadWorkspaceInfo(options.path)

      // Step 10: Set as current workspace
      this.currentWorkspace = workspaceInfo
      this.currentWorkspacePath = options.path

      const duration = Date.now() - startTime
      logger.info('Workspace created successfully', {
        workspaceId,
        name: options.name,
        path: options.path,
        duration: `${duration}ms`,
      })

      return workspaceInfo
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error('Failed to create workspace', {
        name: options.name,
        path: options.path,
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`,
      })

      // Clean up on failure - restore state and remove partial workspace
      let cleanupFailed = false
      
      try {
        // Step 1: Restore FileManager root to original state
        await this.fileManager.updateWorkspaceRoot(originalRoot)
        logger.info('Restored FileManager workspace root after failure', { originalRoot })
        
        // Step 2: Reset internal workspace state
        this.currentWorkspace = null
        this.currentWorkspacePath = null
        
        // Step 3: Clean up partial workspace directory
        const exists = await this.fileManager.exists(options.path)
        if (exists) {
          await this.fileManager.deleteDirectory(options.path, { recursive: true })
          logger.info('Cleaned up partial workspace after failure')
        }
      } catch (cleanupError) {
        cleanupFailed = true
        logger.error('Failed to clean up partial workspace - manual cleanup may be required', {
          path: options.path,
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        })
      }

      const wrappedError = this.wrapError(error, WorkspaceErrorCode.UNKNOWN_ERROR, 'Failed to create workspace')
      
      // Add cleanup failure information to error details if cleanup failed
      if (cleanupFailed && wrappedError.details) {
        wrappedError.details.cleanupFailed = true
        wrappedError.details.cleanupPath = options.path
      }
      
      throw wrappedError
    }
  }

  /**
   * Validate CreateWorkspaceOptions input
   *
   * @param options - Options to validate
   * @throws WorkspaceError if options are invalid
   */
  private validateCreateOptions(options: CreateWorkspaceOptions): void {
    // Validate name
    if (!options.name || options.name.trim().length === 0) {
      throw new WorkspaceError(
        WorkspaceErrorCode.CONFIG_INVALID,
        'Workspace name cannot be empty',
        { name: options.name }
      )
    }
    
    if (options.name.length > 100) {
      throw new WorkspaceError(
        WorkspaceErrorCode.CONFIG_INVALID,
        'Workspace name too long (max 100 characters)',
        { name: options.name, length: options.name.length }
      )
    }
    
    // Validate description
    if (options.description && options.description.length > 500) {
      throw new WorkspaceError(
        WorkspaceErrorCode.CONFIG_INVALID,
        'Workspace description too long (max 500 characters)',
        { description: options.description, length: options.description.length }
      )
    }
    
    // Validate icon (basic check - should be emoji or URL)
    if (!options.icon || options.icon.trim().length === 0) {
      throw new WorkspaceError(
        WorkspaceErrorCode.CONFIG_INVALID,
        'Workspace icon cannot be empty',
        { icon: options.icon }
      )
    }
    
    // Validate owner information
    if (!options.owner.name || options.owner.name.trim().length === 0) {
      throw new WorkspaceError(
        WorkspaceErrorCode.CONFIG_INVALID,
        'Owner name cannot be empty',
        { ownerName: options.owner.name }
      )
    }
    
    if (!options.owner.email || options.owner.email.trim().length === 0) {
      throw new WorkspaceError(
        WorkspaceErrorCode.CONFIG_INVALID,
        'Owner email cannot be empty',
        { ownerEmail: options.owner.email }
      )
    }
    
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(options.owner.email)) {
      throw new WorkspaceError(
        WorkspaceErrorCode.CONFIG_INVALID,
        'Invalid email format',
        { ownerEmail: options.owner.email }
      )
    }
    
    // Validate optional fields
    if (options.syncInterval !== undefined && options.syncInterval < 0) {
      throw new WorkspaceError(
        WorkspaceErrorCode.CONFIG_INVALID,
        'Sync interval cannot be negative',
        { syncInterval: options.syncInterval }
      )
    }
  }

  /**
   * Validate that the workspace path is suitable for creation
   *
   * @param workspacePath - Path to validate
   * @throws WorkspaceError if path is invalid
   */
  private async validateWorkspacePath(workspacePath: string): Promise<void> {
    // Check if path is absolute
    if (!path.isAbsolute(workspacePath)) {
      throw new WorkspaceError(
        WorkspaceErrorCode.PATH_INVALID,
        'Workspace path must be absolute',
        { path: workspacePath }
      )
    }

    // SECURITY NOTE: We intentionally bypass FileManager here because:
    // 1. The workspace root may not be set yet when this is called
    // 2. We need to verify the path exists and is empty before creating workspace
    // 3. This is a one-time validation during workspace creation, not a regular file operation
    // 4. The path is already validated to be absolute (line 273)
    const fs = await import('fs')
    
    try {
      // Check if path exists
      const stats = await fs.promises.stat(workspacePath)
      
      // Path exists - check if it's a directory
      if (!stats.isDirectory()) {
        throw new WorkspaceError(
          WorkspaceErrorCode.PATH_NOT_DIRECTORY,
          'Workspace path exists but is not a directory',
          { path: workspacePath }
        )
      }

      // Check if directory is empty
      const files = await fs.promises.readdir(workspacePath)
      if (files.length > 0) {
        throw new WorkspaceError(
          WorkspaceErrorCode.PATH_NOT_EMPTY,
          'Workspace directory must be empty',
          { path: workspacePath, fileCount: files.length }
        )
      }
    } catch (error) {
      // If it's already a WorkspaceError, re-throw it
      if (error instanceof WorkspaceError) {
        throw error
      }
      
      // Handle ENOENT - path doesn't exist, which is fine
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        // Path doesn't exist - check if parent directory exists and is writable
        const parentDir = path.dirname(workspacePath)
        
        try {
          const parentStats = await fs.promises.stat(parentDir)
          if (!parentStats.isDirectory()) {
            throw new WorkspaceError(
              WorkspaceErrorCode.PATH_NOT_DIRECTORY,
              'Parent path exists but is not a directory',
              { path: workspacePath, parentDir }
            )
          }
          
          // Verify parent directory is writable by attempting to access it
          await fs.promises.access(parentDir, fs.constants.W_OK)
        } catch (parentError) {
          const parentCode = (parentError as NodeJS.ErrnoException).code
          
          if (parentCode === 'ENOENT') {
            throw new WorkspaceError(
              WorkspaceErrorCode.PATH_NOT_FOUND,
              'Parent directory does not exist',
              { path: workspacePath, parentDir }
            )
          }
          
          if (parentCode === 'EACCES' || parentCode === 'EPERM') {
            throw new WorkspaceError(
              WorkspaceErrorCode.PATH_NO_PERMISSION,
              'No permission to write to parent directory',
              { path: workspacePath, parentDir }
            )
          }
          
          // Re-throw other errors
          throw parentError
        }
      } else {
        // Other errors should be thrown
        throw error
      }
    }
  }

  /**
   * Generate a unique workspace ID
   * 
   * @returns Workspace ID in format: ws-xxxxxxxx (8 random hex characters)
   */
  private generateWorkspaceId(): string {
    const randomHex = randomBytes(4).toString('hex') // 8 hex characters
    return `ws-${randomHex}`
  }

  /**
   * Create the standard directory structure for a workspace
   * 
   * @param workspacePath - Absolute path to workspace root
   */
  private async createDirectoryStructure(workspacePath: string): Promise<void> {
    const structure = getDirectoryStructure(workspacePath)

    // Use FileManager with SYSTEM context to create system directories
    // This allows creating .sibylla and other system directories safely
    for (const node of structure) {
      if (node.type === 'directory') {
        await this.fileManager.createDirectory(node.path, {
          recursive: true,
          context: FileOperationContext.SYSTEM
        })
      }
    }
  }

  /**
   * Write workspace configuration file
   * 
   * @param workspacePath - Absolute path to workspace root
   * @param config - Workspace configuration
   */
  private async writeConfig(workspacePath: string, config: WorkspaceConfig): Promise<void> {
    // Use FileManager with SYSTEM context to write system config files
    const configJson = JSON.stringify(config, null, 2)
    await this.fileManager.writeFile(WORKSPACE_STRUCTURE.SYSTEM_CONFIG, configJson, {
      context: FileOperationContext.SYSTEM
    })
  }

  /**
   * Write members configuration file
   *
   * @param workspacePath - Absolute path to workspace root
   * @param membersConfig - Members configuration
   */
  private async writeMembersConfig(
    workspacePath: string,
    membersConfig: MembersConfig
  ): Promise<void> {
    // Use FileManager with SYSTEM context to write system config files
    const membersJson = JSON.stringify(membersConfig, null, 2)
    await this.fileManager.writeFile(WORKSPACE_STRUCTURE.SYSTEM_MEMBERS, membersJson, {
      context: FileOperationContext.SYSTEM
    })
  }

  /**
   * Write points configuration file
   *
   * @param workspacePath - Absolute path to workspace root
   * @param pointsConfig - Points configuration
   */
  private async writePointsConfig(
    workspacePath: string,
    pointsConfig: PointsConfig
  ): Promise<void> {
    // Use FileManager with SYSTEM context to write system config files
    const pointsJson = JSON.stringify(pointsConfig, null, 2)
    await this.fileManager.writeFile(WORKSPACE_STRUCTURE.SYSTEM_POINTS, pointsJson, {
      context: FileOperationContext.SYSTEM
    })
  }

  /**
   * Generate all initial documents for a new workspace
   * 
   * @param workspacePath - Absolute path to workspace root
   * @param options - Workspace creation options
   */
  private async generateInitialDocuments(
    workspacePath: string,
    options: CreateWorkspaceOptions
  ): Promise<void> {
    const documents = [
      {
        path: WORKSPACE_STRUCTURE.ROOT_CLAUDE,
        content: generateClaudeTemplate(options),
      },
      {
        path: WORKSPACE_STRUCTURE.ROOT_MEMORY,
        content: generateMemoryTemplate(options),
      },
      {
        path: WORKSPACE_STRUCTURE.ROOT_REQUIREMENTS,
        content: generateRequirementsTemplate(options),
      },
      {
        path: WORKSPACE_STRUCTURE.ROOT_DESIGN,
        content: generateDesignTemplate(options),
      },
      {
        path: WORKSPACE_STRUCTURE.ROOT_TASKS,
        content: generateTasksTemplate(options),
      },
      {
        path: WORKSPACE_STRUCTURE.ROOT_CHANGELOG,
        content: generateChangelogTemplate(options),
      },
      {
        path: WORKSPACE_STRUCTURE.ROOT_TOKENOMICS,
        content: generateTokenomicsTemplate(options),
      },
      {
        path: WORKSPACE_STRUCTURE.SKILLS_INDEX,
        content: generateSkillsIndexTemplate(options),
      },
      {
        path: '.gitignore',
        content: generateGitignoreTemplate(),
      },
    ]

    // Use FileManager with SYSTEM context to write initial documents
    for (const doc of documents) {
      await this.fileManager.writeFile(doc.path, doc.content, {
        context: FileOperationContext.SYSTEM
      })
    }
  }

  /**
   * Load workspace information from disk
   * 
   * @param workspacePath - Absolute path to workspace root
   * @returns WorkspaceInfo
   */
  private async loadWorkspaceInfo(workspacePath: string): Promise<WorkspaceInfo> {
    // Load configuration using FileManager with SYSTEM context
    const configResult = await this.fileManager.readFile(WORKSPACE_STRUCTURE.SYSTEM_CONFIG, {
      context: FileOperationContext.SYSTEM
    })
    const config: WorkspaceConfig = JSON.parse(configResult.content)

    // Generate metadata
    const metadata = await this.generateMetadata(workspacePath)

    return { config, metadata }
  }

  /**
   * Generate workspace metadata by scanning the workspace
   * 
   * @param workspacePath - Absolute path to workspace root
   * @returns WorkspaceMetadata
   */
  private async generateMetadata(workspacePath: string): Promise<WorkspaceMetadata> {
    // Get all files recursively
    // Use '.' to list from workspace root (FileManager's workspace root is already set to workspacePath)
    const files = await this.fileManager.listFiles('.', { recursive: true })

    // Calculate total size
    let totalSize = 0
    let lastModified = new Date(0)

    for (const file of files) {
      if (!file.isDirectory) {
        totalSize += file.size
        const fileModified = new Date(file.modifiedTime)
        if (fileModified > lastModified) {
          lastModified = fileModified
        }
      }
    }

    return {
      path: workspacePath,
      sizeBytes: totalSize,
      fileCount: files.filter(f => !f.isDirectory).length,
      lastModifiedAt: lastModified.toISOString(),
      isSyncing: false,
      hasUncommittedChanges: false, // Will be updated by Git layer
    }
  }

  /**
   * Wrap an error in a WorkspaceError
   * 
   * @param error - Original error
   * @param code - Workspace error code
   * @param message - Error message
   * @returns WorkspaceError
   */
  private wrapError(
    error: unknown,
    defaultCode: WorkspaceErrorCode,
    message: string
  ): WorkspaceError {
    if (error instanceof WorkspaceError) {
      return error
    }

    // Map Node.js errors to specific codes
    const nodeError = error as NodeJS.ErrnoException
    let code = defaultCode
    
    if (nodeError.code === 'ENOENT') {
      code = WorkspaceErrorCode.PATH_NOT_FOUND
    } else if (nodeError.code === 'EACCES' || nodeError.code === 'EPERM') {
      code = WorkspaceErrorCode.PATH_NO_PERMISSION
    } else if (nodeError.code === 'ENOTDIR') {
      code = WorkspaceErrorCode.PATH_NOT_DIRECTORY
    } else if (nodeError.code === 'EEXIST') {
      code = WorkspaceErrorCode.WORKSPACE_ALREADY_EXISTS
    }

    return new WorkspaceError(code, message, {
      originalError: error instanceof Error ? error.message : String(error),
      originalCode: nodeError.code,
    })
  }

  /**
   * Get the currently open workspace
   * 
   * @returns Current workspace info or null if no workspace is open
   */
  getCurrentWorkspace(): WorkspaceInfo | null {
    return this.currentWorkspace
  }

  /**
   * Get the path of the currently open workspace
   * 
   * @returns Current workspace path or null if no workspace is open
   */
  getWorkspacePath(): string | null {
    return this.currentWorkspacePath
  }

  /**
   * Open an existing workspace
   *
   * @param workspacePath - Absolute path to workspace root
   * @returns WorkspaceInfo for the opened workspace
   * @throws WorkspaceError if workspace is invalid or cannot be opened
   */
  async openWorkspace(workspacePath: string): Promise<WorkspaceInfo> {
    const startTime = Date.now()
    logger.info('Opening workspace', { path: workspacePath })

    try {
      // Auto-close current workspace if one is already open
      if (this.currentWorkspace) {
        logger.info('Auto-closing current workspace before opening new one', {
          current: this.currentWorkspacePath,
          new: workspacePath
        })
        await this.closeWorkspace()
      }

      // Validate workspace
      const isValid = await this.validateWorkspace(workspacePath)
      if (!isValid) {
        throw new WorkspaceError(
          WorkspaceErrorCode.WORKSPACE_INVALID,
          'Invalid workspace directory',
          { path: workspacePath }
        )
      }

      // Load workspace info
      const workspaceInfo = await this.loadWorkspaceInfo(workspacePath)

      // Update FileManager workspace root
      await this.fileManager.updateWorkspaceRoot(workspacePath)
      logger.info('Updated FileManager workspace root', { path: workspacePath })

      // Set as current workspace
      this.currentWorkspace = workspaceInfo
      this.currentWorkspacePath = workspacePath

      const duration = Date.now() - startTime
      logger.info('Workspace opened successfully', {
        workspaceId: workspaceInfo.config.workspaceId,
        name: workspaceInfo.config.name,
        path: workspacePath,
        duration: `${duration}ms`,
      })

      return workspaceInfo
    } catch (error) {
      const duration = Date.now() - startTime
      logger.error('Failed to open workspace', {
        path: workspacePath,
        error: error instanceof Error ? error.message : String(error),
        duration: `${duration}ms`,
      })

      throw this.wrapError(error, WorkspaceErrorCode.UNKNOWN_ERROR, 'Failed to open workspace')
    }
  }

  /**
   * Close the currently open workspace
   *
   * @throws WorkspaceError if no workspace is open
   */
  async closeWorkspace(): Promise<void> {
    logger.info('Closing workspace', { path: this.currentWorkspacePath })

    if (!this.currentWorkspace) {
      throw new WorkspaceError(
        WorkspaceErrorCode.WORKSPACE_NOT_OPEN,
        'No workspace is currently open'
      )
    }

    // Clear current workspace
    const closedPath = this.currentWorkspacePath
    this.currentWorkspace = null
    this.currentWorkspacePath = null

    logger.info('Workspace closed successfully', { path: closedPath })
  }

  /**
   * Validate that a directory is a valid Sibylla workspace
   *
   * @param workspacePath - Absolute path to workspace root
   * @returns true if valid, false otherwise
   */
  async validateWorkspace(workspacePath: string): Promise<boolean> {
    try {
      // Check if path is absolute
      if (!path.isAbsolute(workspacePath)) {
        logger.warn('Workspace validation failed: path is not absolute', { path: workspacePath })
        return false
      }

      // SECURITY NOTE: We intentionally bypass FileManager here because:
      // 1. We're validating a workspace that may not be the current workspace
      // 2. FileManager's workspace root may be set to a different path
      // 3. This is a read-only validation operation
      // 4. The path is already validated to be absolute
      const fs = await import('fs')

      // Check if directory exists
      let stats
      try {
        stats = await fs.promises.stat(workspacePath)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          logger.warn('Workspace validation failed: directory does not exist', { path: workspacePath })
          return false
        }
        throw error
      }

      // Check if it's a directory
      if (!stats.isDirectory()) {
        logger.warn('Workspace validation failed: path is not a directory', { path: workspacePath })
        return false
      }

      // Check for required system directory
      const systemDir = path.join(workspacePath, WORKSPACE_STRUCTURE.SYSTEM_DIR)
      try {
        const systemStats = await fs.promises.stat(systemDir)
        if (!systemStats.isDirectory()) {
          logger.warn('Workspace validation failed: .sibylla is not a directory', { path: workspacePath })
          return false
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          logger.warn('Workspace validation failed: .sibylla directory not found', { path: workspacePath })
          return false
        }
        throw error
      }

      // Check for required config file
      const configPath = path.join(workspacePath, WORKSPACE_STRUCTURE.SYSTEM_CONFIG)
      try {
        const configStats = await fs.promises.stat(configPath)
        if (!configStats.isFile()) {
          logger.warn('Workspace validation failed: config.json is not a file', { path: workspacePath })
          return false
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          logger.warn('Workspace validation failed: config.json not found', { path: workspacePath })
          return false
        }
        throw error
      }

      // Try to parse config file
      try {
        const fileContent = await fs.promises.readFile(configPath, 'utf-8')
        const config = JSON.parse(fileContent) as WorkspaceConfig
        
        // Validate required config fields
        if (!config.workspaceId || !config.name || !config.createdAt) {
          logger.warn('Workspace validation failed: invalid config structure', { path: workspacePath })
          return false
        }
      } catch (parseError) {
        logger.warn('Workspace validation failed: cannot parse config.json', {
          path: workspacePath,
          error: parseError instanceof Error ? parseError.message : String(parseError),
        })
        return false
      }

      logger.info('Workspace validation passed', { path: workspacePath })
      return true
    } catch (error) {
      logger.error('Workspace validation error', {
        path: workspacePath,
        error: error instanceof Error ? error.message : String(error),
      })
      return false
    }
  }

  /**
   * Check if a directory is a Sibylla workspace
   *
   * @param workspacePath - Absolute path to check
   * @returns true if it's a workspace directory, false otherwise
   */
  async isWorkspaceDirectory(workspacePath: string): Promise<boolean> {
    return this.validateWorkspace(workspacePath)
  }

  /**
   * Get the current workspace configuration
   *
   * @returns WorkspaceConfig
   * @throws WorkspaceError if no workspace is open
   */
  async getConfig(): Promise<WorkspaceConfig> {
    if (!this.currentWorkspace) {
      throw new WorkspaceError(
        WorkspaceErrorCode.WORKSPACE_NOT_OPEN,
        'No workspace is currently open'
      )
    }

    return this.currentWorkspace.config
  }

  /**
   * Update workspace configuration
   *
   * @param updates - Partial configuration updates
   * @throws WorkspaceError if no workspace is open or update fails
   */
  async updateConfig(updates: Partial<WorkspaceConfig>): Promise<void> {
    if (!this.currentWorkspace || !this.currentWorkspacePath) {
      throw new WorkspaceError(
        WorkspaceErrorCode.WORKSPACE_NOT_OPEN,
        'No workspace is currently open'
      )
    }

    logger.info('Updating workspace config', { updates })

    try {
      // Merge updates with current config
      const newConfig: WorkspaceConfig = {
        ...this.currentWorkspace.config,
        ...updates,
        // Prevent updating immutable fields
        workspaceId: this.currentWorkspace.config.workspaceId,
        createdAt: this.currentWorkspace.config.createdAt,
      }

      // Write updated config
      await this.writeConfig(this.currentWorkspacePath, newConfig)

      // Update in-memory config
      this.currentWorkspace = {
        ...this.currentWorkspace,
        config: newConfig,
      }

      logger.info('Workspace config updated successfully')
    } catch (error) {
      logger.error('Failed to update workspace config', {
        error: error instanceof Error ? error.message : String(error),
      })

      throw new WorkspaceError(
        WorkspaceErrorCode.CONFIG_WRITE_ERROR,
        'Failed to update workspace configuration',
        { error: error instanceof Error ? error.message : String(error) }
      )
    }
  }

  /**
   * Get the current workspace metadata
   *
   * @returns WorkspaceMetadata
   * @throws WorkspaceError if no workspace is open
   */
  async getMetadata(): Promise<WorkspaceMetadata> {
    if (!this.currentWorkspace || !this.currentWorkspacePath) {
      throw new WorkspaceError(
        WorkspaceErrorCode.WORKSPACE_NOT_OPEN,
        'No workspace is currently open'
      )
    }

    // Regenerate metadata to get fresh data
    const metadata = await this.generateMetadata(this.currentWorkspacePath)

    // Update in-memory metadata
    this.currentWorkspace = {
      ...this.currentWorkspace,
      metadata,
    }

    return metadata
  }
}
