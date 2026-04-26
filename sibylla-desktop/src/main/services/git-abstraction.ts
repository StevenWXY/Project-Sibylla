/**
 * Git Abstraction Layer
 *
 * Core service that encapsulates all Git operations behind semantic interfaces.
 * Upper-layer code must use this module exclusively — direct calls to
 * isomorphic-git API are strictly prohibited (CLAUDE.md §4 "Git 抽象层").
 *
 * Design principles:
 * - Git invisible: No Git terminology leaks to users
 * - File-level collaboration: Minimum collaboration unit is file
 * - Local-first: Works offline, syncs when online
 * - Atomic operations: Use temporary files and atomic renames
 * - Comprehensive logging: All operations logged with context
 *
 * This file implements Phase 0 TASK010 — Steps 3-8 (init, config, staging,
 * commit, status, history, diff, utility methods).
 */

import * as path from 'path'
import * as fs from 'fs'
import { EventEmitter } from 'events'
import git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import { structuredPatch } from 'diff'
import { logger } from '../utils/logger'
import { retryWithBackoff } from '../utils/retry'
import type {
  GitAbstractionConfig,
  GitStatus,
  FileStatus,
  CommitInfo,
  HistoryOptions,
  FileDiff,
  DiffHunk,
  DiffLine,
  PushResult,
  PullResult,
  SyncResult,
  SyncProgressData,
} from './types/git-abstraction.types'
import {
  GitAbstractionError,
  GitAbstractionErrorCode,
  FileStatusType,
  DEFAULT_GITIGNORE_ENTRIES,
} from './types/git-abstraction.types'

/** Log prefix for all GitAbstraction operations */
const LOG_PREFIX = '[GitAbstraction]'

/**
 * Git Abstraction Layer
 * 
 * Encapsulates all Git operations for the Sibylla workspace.
 * Provides semantic interfaces such as saveFile(), getHistory(), getStatus()
 * so that upper-layer code never needs to interact with isomorphic-git directly.
 * 
 * @example
 * ```typescript
 * const gitAbstraction = new GitAbstraction({
 *   workspaceDir: '/path/to/workspace',
 *   authorName: 'Sibylla User',
 *   authorEmail: 'user@sibylla.local',
 * });
 * 
 * await gitAbstraction.init();
 * ```
 */
export class GitAbstraction extends EventEmitter {
  /** Absolute path to the workspace directory */
  private readonly workspaceDir: string

  /** Author information for Git commits */
  private authorName: string
  private authorEmail: string

  /** Default branch name */
  private readonly defaultBranch: string

  /** Cached initialization state to avoid redundant filesystem checks */
  private initializedCache: boolean = false

  /** Remote repository URL (set via setRemote()) */
  private remoteUrl?: string

  /** Authentication token for remote operations (set via setRemote()) */
  private authToken?: string

  /**
   * Create a new GitAbstraction instance
   *
   * @param config - Configuration for the Git abstraction layer
   * @throws {GitAbstractionError} If workspaceDir, authorName, or authorEmail is empty
   */
  constructor(config: GitAbstractionConfig) {
    super()

    if (!config.workspaceDir || config.workspaceDir.trim() === '') {
      throw new GitAbstractionError(
        GitAbstractionErrorCode.INVALID_PATH,
        'Workspace directory path cannot be empty',
        { workspaceDir: config.workspaceDir }
      )
    }

    if (!config.authorName || config.authorName.trim() === '') {
      throw new GitAbstractionError(
        GitAbstractionErrorCode.CONFIG_FAILED,
        'Author name cannot be empty',
        { authorName: config.authorName }
      )
    }

    if (!config.authorEmail || config.authorEmail.trim() === '') {
      throw new GitAbstractionError(
        GitAbstractionErrorCode.CONFIG_FAILED,
        'Author email cannot be empty',
        { authorEmail: config.authorEmail }
      )
    }

    this.workspaceDir = path.resolve(config.workspaceDir)
    this.authorName = config.authorName
    this.authorEmail = config.authorEmail
    this.defaultBranch = config.defaultBranch || 'main'

    logger.debug(`${LOG_PREFIX} Created instance`, {
      workspaceDir: this.workspaceDir,
      authorName: this.authorName,
      defaultBranch: this.defaultBranch,
    })
  }

  getWorkspaceDir(): string {
    return this.workspaceDir
  }

  /**
   * Initialize a new Git repository in the workspace directory
   * 
   * This method:
   * 1. Initializes a bare Git repository with the configured default branch
   * 2. Sets author/committer configuration
   * 3. Creates a default .gitignore file
   * 4. Stages and commits the .gitignore as the initial commit
   * 
   * @throws {GitAbstractionError} If the repository is already initialized
   * @throws {GitAbstractionError} If initialization fails for any reason
   */
  async init(): Promise<void> {
    const startTime = Date.now()
    logger.info(`${LOG_PREFIX} Initializing repository`, {
      workspaceDir: this.workspaceDir,
      defaultBranch: this.defaultBranch,
    })

    try {
      // Check if already initialized
      const initialized = await this.isInitialized()
      if (initialized) {
        throw new GitAbstractionError(
          GitAbstractionErrorCode.ALREADY_INITIALIZED,
          `Repository already initialized at: ${this.workspaceDir}`,
          { workspaceDir: this.workspaceDir }
        )
      }

      // Initialize Git repository
      await git.init({
        fs,
        dir: this.workspaceDir,
        defaultBranch: this.defaultBranch,
      })

      // Set user configuration
      await this.setConfig('user.name', this.authorName)
      await this.setConfig('user.email', this.authorEmail)

      // Create default .gitignore
      await this.createDefaultGitignore()

      // Stage and commit .gitignore as initial commit
      await git.add({
        fs,
        dir: this.workspaceDir,
        filepath: '.gitignore',
      })

      await git.commit({
        fs,
        dir: this.workspaceDir,
        message: 'Initial commit: workspace created',
        author: {
          name: this.authorName,
          email: this.authorEmail,
        },
      })

      // Mark as initialized in cache
      this.initializedCache = true

      const elapsed = Date.now() - startTime
      logger.info(`${LOG_PREFIX} Repository initialized successfully`, {
        workspaceDir: this.workspaceDir,
        defaultBranch: this.defaultBranch,
        elapsedMs: elapsed,
      })
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to initialize repository`, {
        workspaceDir: this.workspaceDir,
        error: errorMessage,
      })

      // Attempt to clean up partial .git directory on failure
      try {
        const gitDir = path.join(this.workspaceDir, '.git')
        await fs.promises.rm(gitDir, { recursive: true, force: true })
        logger.warn(`${LOG_PREFIX} Cleaned up partial .git directory after init failure`)
      } catch {
        // Cleanup failed, log and continue with original error
        logger.warn(`${LOG_PREFIX} Failed to clean up .git directory after init failure`)
      }

      throw new GitAbstractionError(
        GitAbstractionErrorCode.UNKNOWN_ERROR,
        `Failed to initialize Git repository: ${errorMessage}`,
        { workspaceDir: this.workspaceDir, originalError: errorMessage }
      )
    }
  }

  /**
   * Check if the workspace has a fully initialized Git repository
   *
   * A repository is considered "fully initialized" when it has a .git
   * directory AND at least one commit (i.e., HEAD can be resolved).
   *
   * Note: Returns false for repositories that have been `git init`'d
   * but have no commits yet. This is intentional — the init() method
   * creates an initial commit, so a partially initialized state
   * (no commits) indicates a failed or incomplete initialization.
   *
   * @returns true if the repository is fully initialized with at least one commit
   */
  async isInitialized(): Promise<boolean> {
    try {
      // Check if .git directory exists first (faster than resolveRef)
      const gitDir = path.join(this.workspaceDir, '.git')
      try {
        await fs.promises.access(gitDir)
      } catch {
        return false
      }

      // Verify it's a valid git repository by resolving HEAD
      await git.resolveRef({
        fs,
        dir: this.workspaceDir,
        ref: 'HEAD',
      })
      return true
    } catch {
      return false
    }
  }

  /**
   * Update author information for future commits
   *
   * @param name - Author name (must be non-empty)
   * @param email - Author email (must be non-empty)
   * @throws {GitAbstractionError} If name or email is empty
   * @throws {GitAbstractionError} If updating author config fails
   */
  async setAuthor(name: string, email: string): Promise<void> {
    if (!name || name.trim() === '') {
      throw new GitAbstractionError(
        GitAbstractionErrorCode.CONFIG_FAILED,
        'Author name cannot be empty',
        { authorName: name }
      )
    }

    if (!email || email.trim() === '') {
      throw new GitAbstractionError(
        GitAbstractionErrorCode.CONFIG_FAILED,
        'Author email cannot be empty',
        { authorEmail: email }
      )
    }

    await this.setConfig('user.name', name)
    await this.setConfig('user.email', email)
  }

  // ─── Config Methods ────────────────────────────────────────────────

  /**
   * Set a Git configuration value
   *
   * @param key - Configuration key (e.g., 'user.name', 'user.email')
   * @param value - Configuration value
   * @throws {GitAbstractionError} If setting the config fails
   */
  async setConfig(key: string, value: string): Promise<void> {
    logger.debug(`${LOG_PREFIX} Setting config`, { key, value })

    try {
      await git.setConfig({
        fs,
        dir: this.workspaceDir,
        path: key,
        value,
      })

      // Update internal state if author info is changed
      if (key === 'user.name') {
        this.authorName = value
      } else if (key === 'user.email') {
        this.authorEmail = value
      }

      logger.debug(`${LOG_PREFIX} Config set successfully`, { key, value })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to set config`, {
        key,
        value,
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.CONFIG_FAILED,
        `Failed to set Git config '${key}': ${errorMessage}`,
        { key, value, originalError: errorMessage }
      )
    }
  }

  /**
   * Get a Git configuration value
   *
   * @param key - Configuration key (e.g., 'user.name', 'user.email')
   * @returns The configuration value, or undefined if not set
   * @throws {GitAbstractionError} If reading the config fails
   */
  async getConfig(key: string): Promise<string | undefined> {
    logger.debug(`${LOG_PREFIX} Getting config`, { key })

    try {
      const value = await git.getConfig({
        fs,
        dir: this.workspaceDir,
        path: key,
      })

      logger.debug(`${LOG_PREFIX} Config retrieved`, { key, value })
      return value ?? undefined
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to get config`, {
        key,
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.CONFIG_FAILED,
        `Failed to get Git config '${key}': ${errorMessage}`,
        { key, originalError: errorMessage }
      )
    }
  }

  // ─── Staging & Commit Methods ─────────────────────────────────────────

  /**
   * Stage a single file for the next commit
   *
   * Adds the specified file to the Git staging area (index).
   * If the file has been deleted from the working directory, it stages
   * the removal instead.
   *
   * @param filepath - Path to the file to stage (absolute or relative)
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If the file path is invalid
   * @throws {GitAbstractionError} If staging fails
   */
  async stageFile(filepath: string): Promise<void> {
    const normalizedPath = this.normalizePath(filepath)
    logger.debug(`${LOG_PREFIX} Staging file`, { filepath: normalizedPath })

    try {
      await this.ensureInitialized()

      // Check if file exists in working directory or is a deletion
      const fullPath = path.join(this.workspaceDir, normalizedPath)
      let fileExists = true
      try {
        await fs.promises.access(fullPath)
      } catch {
        fileExists = false
      }

      if (fileExists) {
        await git.add({
          fs,
          dir: this.workspaceDir,
          filepath: normalizedPath,
        })
      } else {
        // File was deleted — stage the removal
        await git.remove({
          fs,
          dir: this.workspaceDir,
          filepath: normalizedPath,
        })
      }

      logger.info(`${LOG_PREFIX} File staged`, { filepath: normalizedPath })
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to stage file`, {
        filepath: normalizedPath,
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.STAGE_FAILED,
        `Failed to stage file '${normalizedPath}': ${errorMessage}`,
        { filepath: normalizedPath, originalError: errorMessage }
      )
    }
  }

  /**
   * Stage all changed files for the next commit
   *
   * Walks the working directory using statusMatrix and stages every file
   * that differs from HEAD or the current index. Handles new, modified,
   * and deleted files automatically.
   *
   * @returns The number of files that were staged
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If staging fails
   */
  async stageAll(): Promise<number> {
    logger.debug(`${LOG_PREFIX} Staging all changes`)

    try {
      await this.ensureInitialized()

      const matrix = await git.statusMatrix({
        fs,
        dir: this.workspaceDir,
      })

      let stagedCount = 0

      for (const [filepath, headStatus, workdirStatus, stageStatus] of matrix) {
        // Skip files that are already in sync (unmodified & staged)
        if (headStatus === 1 && workdirStatus === 1 && stageStatus === 1) {
          continue
        }

        if (workdirStatus === 0) {
          // File deleted from working directory — stage removal
          if (stageStatus !== 0) {
            await git.remove({
              fs,
              dir: this.workspaceDir,
              filepath,
            })
            stagedCount++
          }
        } else {
          // File added or modified — stage it
          if (headStatus !== workdirStatus || stageStatus !== workdirStatus) {
            await git.add({
              fs,
              dir: this.workspaceDir,
              filepath,
            })
            stagedCount++
          }
        }
      }

      logger.info(`${LOG_PREFIX} All changes staged`, { stagedCount })

      return stagedCount
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to stage all changes`, {
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.STAGE_FAILED,
        `Failed to stage all changes: ${errorMessage}`,
        { originalError: errorMessage }
      )
    }
  }

  /**
   * Unstage a file (remove it from the staging area)
   *
   * Resets the index entry for the given file path back to its HEAD state,
   * effectively un-staging any changes without modifying the working directory.
   * Uses `git.resetIndex` to perform the operation.
   *
   * @param filepath - Path to the file to unstage (absolute or relative)
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If unstaging fails
   */
  async unstageFile(filepath: string): Promise<void> {
    const normalizedPath = this.normalizePath(filepath)
    logger.debug(`${LOG_PREFIX} Unstaging file`, { filepath: normalizedPath })

    try {
      await this.ensureInitialized()

      await git.resetIndex({
        fs,
        dir: this.workspaceDir,
        filepath: normalizedPath,
      })

      logger.info(`${LOG_PREFIX} File unstaged`, { filepath: normalizedPath })
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to unstage file`, {
        filepath: normalizedPath,
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.STAGE_FAILED,
        `Failed to unstage file '${normalizedPath}': ${errorMessage}`,
        { filepath: normalizedPath, originalError: errorMessage }
      )
    }
  }

  /**
   * Create a commit from currently staged files
   *
   * Commits all staged changes with the given message and returns the
   * commit OID (SHA-1 hash). Automatically attaches author/committer
   * information and a timestamp.
   *
   * @param message - Commit message
   * @returns The SHA-1 OID of the newly created commit
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If there are no staged changes to commit
   * @throws {GitAbstractionError} If the commit operation fails
   */
  async commit(message: string): Promise<string> {
    logger.debug(`${LOG_PREFIX} Creating commit`, { message })

    try {
      await this.ensureInitialized()

      // Check if there are staged changes
      const hasStagedChanges = await this.hasStagedChanges()
      if (!hasStagedChanges) {
        throw new GitAbstractionError(
          GitAbstractionErrorCode.NOTHING_TO_COMMIT,
          'No staged changes to commit',
          { message }
        )
      }

      return await this.commitInternal(message)
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to create commit`, {
        message,
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.COMMIT_FAILED,
        `Failed to create commit: ${errorMessage}`,
        { message, originalError: errorMessage }
      )
    }
  }

  /**
   * Stage all changes and create a commit in one operation
   *
   * Convenience method that combines stageAll() + commit() into a single
   * call. If there are no changes to stage, throws NOTHING_TO_COMMIT.
   * Uses commitInternal() directly to avoid the redundant statusMatrix
   * scan that commit()'s hasStagedChanges() check would cause.
   *
   * @param message - Commit message
   * @returns The SHA-1 OID of the newly created commit
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If there are no changes to commit
   * @throws {GitAbstractionError} If staging or commit fails
   */
  async commitAll(message: string): Promise<string> {
    logger.debug(`${LOG_PREFIX} Committing all changes`, { message })

    // stageAll() returns the number of files staged, avoiding an extra
    // statusMatrix call that hasStagedChanges() would require
    const stagedCount = await this.stageAll()

    if (stagedCount === 0) {
      throw new GitAbstractionError(
        GitAbstractionErrorCode.NOTHING_TO_COMMIT,
        'No changes found to commit after staging',
        { message }
      )
    }

    // Use commitInternal() directly — stageAll() already confirmed
    // there are staged changes, so skip the redundant hasStagedChanges() check
    return this.commitInternal(message)
  }

  // ─── Status Query Methods ─────────────────────────────────────────────

  /**
   * Get the aggregated status of all files in the repository
   *
   * Walks every file in the working tree using statusMatrix and
   * categorizes them into modified, staged, untracked, and deleted lists.
   *
   * statusMatrix returns [filepath, HEAD, WORKDIR, STAGE]:
   *   HEAD: 0 = absent, 1 = present
   *   WORKDIR: 0 = absent, 2 = present
   *   STAGE: 0 = absent, 1 = same as HEAD, 2 = different / staged, 3 = same as WORKDIR
   *
   * @returns Aggregated repository status
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If querying status fails
   */
  async getStatus(): Promise<GitStatus> {
    logger.debug(`${LOG_PREFIX} Querying repository status`)
    const startTime = Date.now()

    try {
      await this.ensureInitialized()

      const matrix = await git.statusMatrix({
        fs,
        dir: this.workspaceDir,
      })

      const modified: string[] = []
      const staged: string[] = []
      const untracked: string[] = []
      const deleted: string[] = []

      for (const [filepath, headStatus, workdirStatus, stageStatus] of matrix) {
        // Skip .git internal files
        if (filepath.startsWith('.git/') || filepath === '.git') {
          continue
        }

        // Untracked: not in HEAD, present in workdir, not staged
        if (headStatus === 0 && workdirStatus === 2 && stageStatus === 0) {
          untracked.push(filepath)
        }
        // Staged new file: not in HEAD, present in workdir, staged
        else if (headStatus === 0 && workdirStatus === 2 && stageStatus === 2) {
          staged.push(filepath)
        }
        // Staged new file (workdir matches stage): not in HEAD, present, staged as workdir
        else if (headStatus === 0 && workdirStatus === 2 && stageStatus === 3) {
          staged.push(filepath)
        }
        // Modified (unstaged): in HEAD, modified in workdir, stage still matches HEAD
        else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 1) {
          modified.push(filepath)
        }
        // Staged modification: in HEAD, modified in workdir, staged
        else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 2) {
          staged.push(filepath)
        }
        // Staged modification (workdir matches stage): in HEAD, modified, staged as workdir
        else if (headStatus === 1 && workdirStatus === 2 && stageStatus === 3) {
          staged.push(filepath)
        }
        // Deleted (unstaged): in HEAD, absent from workdir, stage matches HEAD
        else if (headStatus === 1 && workdirStatus === 0 && stageStatus === 1) {
          deleted.push(filepath)
        }
        // Deleted and staged: in HEAD, absent from workdir, staged removal
        // Appears in both 'staged' and 'deleted' — consistent with resolveFileStatusType() returning DELETED_STAGED
        else if (headStatus === 1 && workdirStatus === 0 && stageStatus === 0) {
          staged.push(filepath)
          deleted.push(filepath)
        }
      }

      const elapsed = Date.now() - startTime
      logger.info(`${LOG_PREFIX} Status retrieved`, {
        modified: modified.length,
        staged: staged.length,
        untracked: untracked.length,
        deleted: deleted.length,
        elapsedMs: elapsed,
      })

      return { modified, staged, untracked, deleted }
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to query status`, {
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.STATUS_FAILED,
        `Failed to query repository status: ${errorMessage}`,
        { originalError: errorMessage }
      )
    }
  }

  /**
   * Get the status of a single file
   *
   * Returns a FileStatus object with the file's path and its current
   * status type (unmodified, modified, staged, untracked, etc.).
   *
   * @param filepath - Path to the file (absolute or relative)
   * @returns The file's current status
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If querying status fails
   */
  async getFileStatus(filepath: string): Promise<FileStatus> {
    const normalizedPath = this.normalizePath(filepath)
    logger.debug(`${LOG_PREFIX} Querying file status`, { filepath: normalizedPath })

    try {
      await this.ensureInitialized()

      const matrix = await git.statusMatrix({
        fs,
        dir: this.workspaceDir,
        filepaths: [normalizedPath],
      })

      if (matrix.length === 0) {
        // File is not known to git at all
        return {
          filepath: normalizedPath,
          status: FileStatusType.UNTRACKED,
        }
      }

      const [, headStatus, workdirStatus, stageStatus] = matrix[0]!
      const status = this.resolveFileStatusType(headStatus, workdirStatus, stageStatus)

      logger.debug(`${LOG_PREFIX} File status resolved`, {
        filepath: normalizedPath,
        status,
      })

      return {
        filepath: normalizedPath,
        status,
      }
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to query file status`, {
        filepath: normalizedPath,
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.STATUS_FAILED,
        `Failed to query status of '${normalizedPath}': ${errorMessage}`,
        { filepath: normalizedPath, originalError: errorMessage }
      )
    }
  }

  // ─── History Query Methods ────────────────────────────────────────────

  /**
   * Query commit history
   *
   * Returns a list of CommitInfo objects, optionally filtered by depth,
   * starting ref, and file path. When a filepath is specified, only commits
   * that affected that file are returned (by comparing adjacent commit trees).
   *
   * Note: isomorphic-git returns timestamps in seconds — this method
   * converts them to milliseconds for JavaScript Date compatibility.
   *
   * @param options - Optional query parameters (depth, filepath, ref)
   * @returns Array of commit information objects
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If querying history fails
   */
  async getHistory(options?: HistoryOptions): Promise<readonly CommitInfo[]> {
    const depth = options?.depth ?? 50
    const ref = options?.ref ?? 'HEAD'
    const filepath = options?.filepath

    logger.debug(`${LOG_PREFIX} Querying commit history`, { depth, ref, filepath })
    const startTime = Date.now()

    try {
      await this.ensureInitialized()

      const commits = await git.log({
        fs,
        dir: this.workspaceDir,
        ref,
        depth,
      })

      let history: CommitInfo[] = commits.map((entry) => ({
        oid: entry.oid,
        message: entry.commit.message,
        authorName: entry.commit.author.name,
        authorEmail: entry.commit.author.email,
        // isomorphic-git returns seconds, convert to milliseconds
        timestamp: entry.commit.author.timestamp * 1000,
        parents: entry.commit.parent,
      }))

      // Filter by filepath if specified
      if (filepath) {
        const normalizedFilepath = this.normalizePath(filepath)
        history = await this.filterHistoryByFile(history, normalizedFilepath)
      }

      const elapsed = Date.now() - startTime
      logger.info(`${LOG_PREFIX} History retrieved`, {
        commitCount: history.length,
        depth,
        filepath,
        elapsedMs: elapsed,
      })

      return history
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to query history`, {
        depth,
        ref,
        filepath,
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.LOG_FAILED,
        `Failed to query commit history: ${errorMessage}`,
        { depth, ref, filepath, originalError: errorMessage }
      )
    }
  }

  /**
   * Get detailed information about a single commit
   *
   * Reads the commit object identified by its OID and returns a
   * CommitInfo structure with all metadata.
   *
   * @param oid - The SHA-1 OID of the commit
   * @returns Commit information
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If the commit OID is invalid or not found
   */
  async getCommit(oid: string): Promise<CommitInfo> {
    logger.debug(`${LOG_PREFIX} Reading commit`, { oid })

    try {
      await this.ensureInitialized()

      const commitData = await git.readCommit({
        fs,
        dir: this.workspaceDir,
        oid,
      })

      const commitInfo: CommitInfo = {
        oid: commitData.oid,
        message: commitData.commit.message,
        authorName: commitData.commit.author.name,
        authorEmail: commitData.commit.author.email,
        // isomorphic-git returns seconds, convert to milliseconds
        timestamp: commitData.commit.author.timestamp * 1000,
        parents: commitData.commit.parent,
      }

      logger.debug(`${LOG_PREFIX} Commit read successfully`, {
        oid: commitData.oid.slice(0, 7),
        message: commitData.commit.message,
      })

      return commitInfo
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.warn(`${LOG_PREFIX} Failed to read commit`, {
        oid,
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.INVALID_REF,
        `Failed to read commit '${oid}': ${errorMessage}`,
        { oid, originalError: errorMessage }
      )
    }
  }

  // ─── Diff Query Methods ───────────────────────────────────────────────

  /**
   * Get the diff of a single file between two versions
   *
   * Compares the file content at two different points in history and
   * produces structured diff hunks using the `diff` npm package.
   *
   * - When neither commitA nor commitB is specified, compares HEAD vs working directory.
   * - When only commitA is specified, compares commitA vs working directory.
   * - When both are specified, compares commitA vs commitB.
   *
   * @param filepath - Path to the file (absolute or relative to workspace)
   * @param commitA - OID of the base commit (default: HEAD)
   * @param commitB - OID of the target commit (default: working directory)
   * @returns FileDiff with old/new content and structured hunks
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If reading file content fails
   * @throws {GitAbstractionError} If computing diff fails
   */
  async getFileDiff(filepath: string, commitA?: string, commitB?: string): Promise<FileDiff> {
    const normalizedPath = this.normalizePath(filepath)
    logger.debug(`${LOG_PREFIX} Computing file diff`, {
      filepath: normalizedPath,
      commitA: commitA ?? 'HEAD',
      commitB: commitB ?? 'WORKDIR',
    })
    const startTime = Date.now()

    try {
      await this.ensureInitialized()

      // Resolve base ref (commitA defaults to HEAD)
      const baseRef = commitA ?? await this.resolveHead()

      // Read old content from base ref
      const oldContent = await this.getFileContent(normalizedPath, baseRef)

      // Read new content — from commitB or working directory
      let newContent: string
      if (commitB) {
        newContent = await this.getFileContent(normalizedPath, commitB)
      } else {
        newContent = await this.readWorkingFile(normalizedPath)
      }

      // Compute hunks
      const hunks = this.computeDiffHunks(normalizedPath, oldContent, newContent)

      const elapsed = Date.now() - startTime
      logger.info(`${LOG_PREFIX} File diff computed`, {
        filepath: normalizedPath,
        hunkCount: hunks.length,
        elapsedMs: elapsed,
      })

      return {
        filepath: normalizedPath,
        oldContent,
        newContent,
        hunks,
      }
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to compute file diff`, {
        filepath: normalizedPath,
        commitA,
        commitB,
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.DIFF_FAILED,
        `Failed to compute diff for '${normalizedPath}': ${errorMessage}`,
        { filepath: normalizedPath, commitA, commitB, originalError: errorMessage }
      )
    }
  }

  /**
   * Get all file diffs for a specific commit
   *
   * Compares the commit's tree against its parent's tree and returns
   * a FileDiff for each file that was changed. For the initial commit
   * (no parent), compares against an empty tree.
   *
   * @param oid - The SHA-1 OID of the commit to inspect
   * @returns Array of FileDiff objects for all changed files
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If the commit OID is invalid
   * @throws {GitAbstractionError} If computing diff fails
   */
  async getCommitDiff(oid: string): Promise<readonly FileDiff[]> {
    logger.debug(`${LOG_PREFIX} Computing commit diff`, { oid })
    const startTime = Date.now()

    try {
      await this.ensureInitialized()

      // Read the commit to get parent info
      const commitData = await git.readCommit({
        fs,
        dir: this.workspaceDir,
        oid,
      })

      const parentOid = commitData.commit.parent[0]

      // Find changed files by walking both trees
      const changedFiles = await this.findChangedFiles(oid, parentOid)

      // Compute diffs for each changed file
      const diffs: FileDiff[] = []
      for (const filepath of changedFiles) {
        // Read old content (from parent, or empty if initial commit)
        const oldContent = parentOid
          ? await this.getFileContent(filepath, parentOid)
          : ''

        // Read new content from this commit
        const newContent = await this.getFileContent(filepath, oid)

        const hunks = this.computeDiffHunks(filepath, oldContent, newContent)

        diffs.push({
          filepath,
          oldContent,
          newContent,
          hunks,
        })
      }

      const elapsed = Date.now() - startTime
      logger.info(`${LOG_PREFIX} Commit diff computed`, {
        oid: oid.slice(0, 7),
        changedFiles: diffs.length,
        elapsedMs: elapsed,
      })

      return diffs
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to compute commit diff`, {
        oid,
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.DIFF_FAILED,
        `Failed to compute diff for commit '${oid}': ${errorMessage}`,
        { oid, originalError: errorMessage }
      )
    }
  }

  // ─── Utility Methods ──────────────────────────────────────────────────

  /**
   * Read file content at a specific commit (public API)
   *
   * Wraps the private getFileContent() method with path normalization
   * and structured logging for safe external consumption.
   *
   * @param filepath - Path to the file (absolute or relative to workspace)
   * @param ref - Commit OID or ref name to read from
   * @returns The file content as a UTF-8 string, or empty string if not found
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If the file path is invalid
   */
  async readFileAtCommit(filepath: string, ref: string): Promise<string> {
    const normalizedPath = this.normalizePath(filepath)
    logger.debug(`${LOG_PREFIX} Reading file at commit`, { filepath: normalizedPath, ref })

    await this.ensureInitialized()
    return this.getFileContent(normalizedPath, ref)
  }

  /**
   * Restore a file to the content at a specific commit
   *
   * Writes the file content from the specified commit to the working directory,
   * stages it, and creates a new commit. This preserves history (not a revert).
   *
   * @param filepath - Path to the file (absolute or relative to workspace)
   * @param commitSha - The SHA-1 OID of the commit to restore from
   * @returns The SHA-1 OID of the newly created commit
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If the file path is invalid
   * @throws {GitAbstractionError} If there are no changes to commit (content identical)
   */
  async restoreVersion(filepath: string, commitSha: string): Promise<string> {
    const normalizedPath = this.normalizePath(filepath)
    logger.info(`${LOG_PREFIX} Restoring file to version`, { filepath: normalizedPath, commitSha })

    await this.ensureInitialized()

    const content = await this.getFileContent(normalizedPath, commitSha)
    const fullPath = path.join(this.workspaceDir, normalizedPath)
    await fs.promises.writeFile(fullPath, content, 'utf-8')

    await this.stageFile(normalizedPath)

    const shortSha = commitSha.slice(0, 7)
    const message = `恢复 ${path.basename(normalizedPath)} 到版本 ${shortSha}`
    const oid = await this.commit(message)

    logger.info(`${LOG_PREFIX} File restored`, { filepath: normalizedPath, commitOid: oid })
    return oid
  }

  /**
   * Get the current branch name
   *
   * Reads the symbolic ref that HEAD points to and returns the branch name.
   * Returns 'HEAD' if in detached HEAD state.
   *
   * @returns The current branch name (e.g., 'main')
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If reading the branch name fails
   */
  async getCurrentBranch(): Promise<string> {
    logger.debug(`${LOG_PREFIX} Getting current branch`)

    try {
      await this.ensureInitialized()

      const branch = await git.currentBranch({
        fs,
        dir: this.workspaceDir,
        fullname: false,
      })

      const branchName = branch ?? 'HEAD'
      logger.debug(`${LOG_PREFIX} Current branch`, { branch: branchName })
      return branchName
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to get current branch`, {
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.UNKNOWN_ERROR,
        `Failed to get current branch: ${errorMessage}`,
        { originalError: errorMessage }
      )
    }
  }

  /**
   * List all tracked files in the repository
   *
   * Returns a list of all file paths currently tracked in the Git index.
   * This includes staged files but excludes untracked files.
   *
   * @returns Array of relative file paths tracked by Git
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If listing files fails
   */
  async listFiles(): Promise<readonly string[]> {
    logger.debug(`${LOG_PREFIX} Listing tracked files`)
    const startTime = Date.now()

    try {
      await this.ensureInitialized()

      const files = await git.listFiles({
        fs,
        dir: this.workspaceDir,
        ref: 'HEAD',
      })

      const elapsed = Date.now() - startTime
      logger.info(`${LOG_PREFIX} Tracked files listed`, {
        fileCount: files.length,
        elapsedMs: elapsed,
      })

      return files
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to list tracked files`, {
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.UNKNOWN_ERROR,
        `Failed to list tracked files: ${errorMessage}`,
        { originalError: errorMessage }
      )
    }
  }

  // ─── Remote Sync Methods ──────────────────────────────────────────────

  /**
   * Configure the remote repository URL and authentication token
   *
   * Sets up the remote named 'origin' for push/pull operations.
   * If a remote named 'origin' already exists, it will be replaced.
   *
   * @param url - Remote repository URL (HTTPS)
   * @param token - Authentication token for the remote
   * @throws {GitAbstractionError} If url or token is empty (REMOTE_CONFIG_FAILED)
   * @throws {GitAbstractionError} If git remote configuration fails (REMOTE_CONFIG_FAILED)
   */
  async setRemote(url: string, token: string): Promise<void> {
    logger.info(`${LOG_PREFIX} Configuring remote repository`, {
      url,
    })

    if (!url || url.trim() === '') {
      throw new GitAbstractionError(
        GitAbstractionErrorCode.REMOTE_CONFIG_FAILED,
        'Remote URL cannot be empty',
        { url }
      )
    }

    if (!token || token.trim() === '') {
      throw new GitAbstractionError(
        GitAbstractionErrorCode.REMOTE_CONFIG_FAILED,
        'Authentication token cannot be empty',
        { url }
      )
    }

    try {
      this.remoteUrl = url
      this.authToken = token

      // Try to add remote; if it already exists, remove and re-add
      try {
        await git.addRemote({
          fs,
          dir: this.workspaceDir,
          remote: 'origin',
          url,
        })
      } catch (addError: unknown) {
        // Remote already exists — remove and re-add
        await git.deleteRemote({
          fs,
          dir: this.workspaceDir,
          remote: 'origin',
        })
        await git.addRemote({
          fs,
          dir: this.workspaceDir,
          remote: 'origin',
          url,
        })
      }

      logger.info(`${LOG_PREFIX} Remote repository configured successfully`, {
        url,
        remote: 'origin',
      })
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to configure remote repository`, {
        url,
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.REMOTE_CONFIG_FAILED,
        `Failed to configure remote: ${errorMessage}`,
        { url, originalError: errorMessage }
      )
    }
  }

  /**
   * Push local commits to the remote repository
   *
   * Pushes the current branch to the configured remote origin.
   * Uses exponential backoff retry for transient network errors.
   * Emits 'sync:progress' events during the push operation.
   *
   * @returns Push operation result indicating success or failure
   * @throws {GitAbstractionError} If remote is not configured (REMOTE_NOT_CONFIGURED)
   * @throws {GitAbstractionError} If repository is not initialized (NOT_INITIALIZED)
   */
  async push(): Promise<PushResult> {
    const startTime = Date.now()
    logger.info(`${LOG_PREFIX} Starting push operation`)

    try {
      this.requireRemoteConfig()
      await this.ensureInitialized()

      await this.retryRemoteOperation(async () => {
        await git.push({
          fs,
          http,
          dir: this.workspaceDir,
          remote: 'origin',
          ref: this.defaultBranch,
          onAuth: () => this.getAuthCallback(),
          onProgress: (progress) => {
            this.emit('sync:progress', {
              phase: 'push' as const,
              loaded: progress.loaded ?? 0,
              total: progress.total ?? 0,
            } satisfies SyncProgressData)
          },
        })
      })

      const elapsed = Date.now() - startTime
      logger.info(`${LOG_PREFIX} Push completed successfully`, {
        elapsedMs: elapsed,
      })

      return { success: true }
    } catch (error: unknown) {
      // State errors (not initialized, remote not configured) should be thrown
      if (
        error instanceof GitAbstractionError &&
        (error.code === GitAbstractionErrorCode.NOT_INITIALIZED ||
          error.code === GitAbstractionErrorCode.REMOTE_NOT_CONFIGURED)
      ) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Push failed`, {
        error: errorMessage,
      })

      return { success: false, error: errorMessage }
    }
  }

  /**
   * Pull changes from the remote repository (fetch + merge)
   *
   * Performs a two-phase operation:
   * 1. Fetch: Downloads new objects and refs from the remote
   * 2. Merge: Merges the remote branch into the local branch
   *
   * If conflicts are detected during merge, returns conflict information
   * without attempting to resolve them.
   *
   * @returns Pull result with conflict information if applicable
   * @throws {GitAbstractionError} If remote is not configured (REMOTE_NOT_CONFIGURED)
   * @throws {GitAbstractionError} If repository is not initialized (NOT_INITIALIZED)
   */
  async pull(): Promise<PullResult> {
    const startTime = Date.now()
    logger.info(`${LOG_PREFIX} Starting pull operation`)

    try {
      this.requireRemoteConfig()
      await this.ensureInitialized()

      // Phase 1: Fetch
      await this.retryRemoteOperation(async () => {
        await git.fetch({
          fs,
          http,
          dir: this.workspaceDir,
          remote: 'origin',
          ref: this.defaultBranch,
          singleBranch: true,
          onAuth: () => this.getAuthCallback(),
          onProgress: (progress) => {
            this.emit('sync:progress', {
              phase: 'fetch' as const,
              loaded: progress.loaded ?? 0,
              total: progress.total ?? 0,
            } satisfies SyncProgressData)
          },
        })
      })

      logger.debug(`${LOG_PREFIX} Fetch completed, starting merge`)

      // Phase 2: Try fast-forward first, then fall back to merge
      let mergeOid: string | undefined

      // Resolve local and remote refs to check relationship
      const localOid = await git.resolveRef({
        fs,
        dir: this.workspaceDir,
        ref: this.defaultBranch,
      })
      let remoteOid: string | undefined
      try {
        remoteOid = await git.resolveRef({
          fs,
          dir: this.workspaceDir,
          ref: `remotes/origin/${this.defaultBranch}`,
        })
      } catch {
        // Remote ref doesn't exist — nothing to pull
        const elapsed = Date.now() - startTime
        logger.info(`${LOG_PREFIX} No remote branch found, nothing to pull`, {
          elapsedMs: elapsed,
        })
        return { success: true }
      }

      // If already up-to-date, skip merge
      if (localOid === remoteOid) {
        const elapsed = Date.now() - startTime
        logger.info(`${LOG_PREFIX} Already up-to-date`, { elapsedMs: elapsed })
        return { success: true }
      }

      // Phase 2a: Check if local can be fast-forwarded to remote
      // (remote is a descendant of local — local is simply behind)
      let canFastForward = false
      try {
        canFastForward = await git.isDescendent({
          fs,
          dir: this.workspaceDir,
          oid: remoteOid,
          ancestor: localOid,
          depth: -1,
        })
      } catch {
        // isDescendent may fail on unrelated histories; treat as non-fast-forward
        canFastForward = false
      }

      if (canFastForward) {
        // Simple fast-forward: just update the local branch ref
        await git.writeRef({
          fs,
          dir: this.workspaceDir,
          ref: `refs/heads/${this.defaultBranch}`,
          value: remoteOid,
          force: true,
        })

        mergeOid = remoteOid
        logger.debug(`${LOG_PREFIX} Fast-forward succeeded`, { oid: mergeOid })
      } else {
        // Phase 2b: Try merge (local has unique commits not in remote)
        try {
          const mergeResult = await git.merge({
            fs,
            dir: this.workspaceDir,
            ours: this.defaultBranch,
            theirs: `remotes/origin/${this.defaultBranch}`,
            author: {
              name: this.authorName,
              email: this.authorEmail,
            },
          })

          // Check for conflicts
          if (mergeResult.tree === undefined) {
            const conflictFiles = await this.enumerateConflictFiles()
            const elapsed = Date.now() - startTime
            logger.warn(`${LOG_PREFIX} Pull completed with conflicts`, {
              elapsedMs: elapsed,
              conflictCount: conflictFiles.length,
            })

            return {
              success: false,
              hasConflicts: true,
              conflicts: conflictFiles,
            }
          }

          mergeOid = mergeResult.oid
        } catch (mergeError: unknown) {
          const mergeMsg = mergeError instanceof Error ? mergeError.message : String(mergeError)

          // Phase 2c: Merge not supported (unrelated histories / complex merge)
          // This typically happens on first pull when local has auto-generated
          // init commit that diverges from remote. Reset local branch to remote.
          if (
            mergeMsg.includes('Merges with conflicts are not supported') ||
            mergeMsg.includes('MergeNotSupportedError') ||
            mergeMsg.includes('merge not supported')
          ) {
            logger.info(
              `${LOG_PREFIX} Merge not supported — resetting local branch to remote (first-pull scenario)`,
              { error: mergeMsg }
            )

            // Point local branch directly to remote branch's HEAD
            await git.writeRef({
              fs,
              dir: this.workspaceDir,
              ref: `refs/heads/${this.defaultBranch}`,
              value: remoteOid,
              force: true,
            })

            mergeOid = remoteOid
          } else {
            throw mergeError
          }
        }
      }

      // Phase 3: Checkout — update working directory to match merged HEAD
      // Merge/fast-forward only updates Git refs and object store, not the working tree.
      // Without this step, the working directory files would remain at their pre-pull state.
      await git.checkout({
        fs,
        dir: this.workspaceDir,
        ref: this.defaultBranch,
        force: true,
      })

      const elapsed = Date.now() - startTime
      logger.info(`${LOG_PREFIX} Pull completed successfully`, {
        elapsedMs: elapsed,
        oid: mergeOid,
      })

      return { success: true }
    } catch (error: unknown) {
      // State errors (not initialized, remote not configured) should be thrown
      if (
        error instanceof GitAbstractionError &&
        (error.code === GitAbstractionErrorCode.NOT_INITIALIZED ||
          error.code === GitAbstractionErrorCode.REMOTE_NOT_CONFIGURED)
      ) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Pull failed`, {
        error: errorMessage,
      })

      return { success: false, error: errorMessage }
    }
  }

  /**
   * Synchronize local repository with remote (pull then push)
   *
   * Performs a complete sync cycle:
   * 1. Pull: Fetch and merge remote changes
   * 2. Push: Push local commits to remote (only if pull succeeds without conflicts)
   *
   * If conflicts are detected during pull, the sync stops and returns
   * conflict information for the caller to handle.
   *
   * @returns Sync result indicating overall success or conflict/error details
   */
  async sync(): Promise<SyncResult> {
    logger.info(`${LOG_PREFIX} Starting sync process`)

    try {
      // Step 1: Pull (fetch + merge)
      const pullResult = await this.pull()

      // Pull found conflicts — abort sync, let caller handle
      if (!pullResult.success && pullResult.hasConflicts) {
        return {
          success: false,
          hasConflicts: true,
          conflicts: pullResult.conflicts,
        }
      }

      // Pull failed (network/auth error)
      if (!pullResult.success) {
        return { success: false, error: pullResult.error }
      }

      // Step 2: Push
      const pushResult = await this.push()

      if (!pushResult.success) {
        return { success: false, error: pushResult.error }
      }

      logger.info(`${LOG_PREFIX} Sync completed successfully`)
      return { success: true }
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Sync failed`, {
        error: errorMessage,
      })

      this.emit('sync:error', error instanceof Error ? error : new Error(errorMessage))
      return { success: false, error: errorMessage }
    }
  }

  // ─── Private Utility Methods ──────────────────────────────────────────

  /**
   * Ensure the repository is initialized before performing operations
   *
   * Uses a cached initialization state to avoid redundant filesystem checks
   * on every method call. Falls back to isInitialized() when the cache
   * has not been set (e.g., when opening an existing workspace).
   *
   * @throws {GitAbstractionError} If the repository has not been initialized
   */
  private async ensureInitialized(): Promise<void> {
    // Fast path: already verified as initialized
    if (this.initializedCache) {
      return
    }

    const initialized = await this.isInitialized()
    if (!initialized) {
      throw new GitAbstractionError(
        GitAbstractionErrorCode.NOT_INITIALIZED,
        `Repository not initialized at: ${this.workspaceDir}`,
        { workspaceDir: this.workspaceDir }
      )
    }

    // Cache the result for subsequent calls
    this.initializedCache = true
  }

  /**
   * Ensure remote repository is configured before performing remote operations
   *
   * @throws {GitAbstractionError} If remoteUrl or authToken is not set (REMOTE_NOT_CONFIGURED)
   */
  private requireRemoteConfig(): void {
    if (!this.remoteUrl || !this.authToken) {
      throw new GitAbstractionError(
        GitAbstractionErrorCode.REMOTE_NOT_CONFIGURED,
        'Remote repository is not configured. Call setRemote() first.',
        { hasUrl: !!this.remoteUrl, hasToken: !!this.authToken }
      )
    }
  }

  /**
   * Get authentication callback for isomorphic-git remote operations
   *
   * Uses Token authentication: username = token, password = 'x-oauth-basic'
   * This format is supported by both Gitea and GitHub.
   *
   * @returns Authentication credentials object
   */
  private getAuthCallback(): { username: string; password: string } {
    if (!this.authToken) {
      throw new GitAbstractionError(
        GitAbstractionErrorCode.REMOTE_NOT_CONFIGURED,
        'Authentication token is not available. Call setRemote() first.',
        { hasUrl: !!this.remoteUrl, hasToken: false }
      )
    }

    return {
      username: this.authToken,
      password: 'x-oauth-basic',
    }
  }

  /**
   * Retry an async operation with exponential backoff
   *
   * Delegates to the standalone retryWithBackoff utility function
   * with Git-specific error handling: authentication errors (401/403)
   * abort immediately, and exhausted retries throw NETWORK_ERROR.
   *
   * @param operation - The async operation to retry
   * @param maxRetries - Maximum number of attempts (default: 3)
   * @returns The result of the successful operation
   * @throws {GitAbstractionError} AUTH_FAILED for 401/403 errors
   * @throws {GitAbstractionError} NETWORK_ERROR after all retries exhausted
   */
  private async retryRemoteOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    return retryWithBackoff(operation, {
      maxRetries,
      shouldAbort: (error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error)
        const isAuthError =
          /\b(401|403)\b/.test(errorMessage) &&
          /\b(HTTP|Unauthorized|Forbidden|auth)/i.test(errorMessage)

        if (isAuthError) {
          throw new GitAbstractionError(
            GitAbstractionErrorCode.AUTH_FAILED,
            `Authentication failed: ${errorMessage}`,
          )
        }

        return false
      },
      onExhausted: (error: unknown, attempts: number) => {
        const errorMessage = error instanceof Error ? error.message : String(error)
        throw new GitAbstractionError(
          GitAbstractionErrorCode.NETWORK_ERROR,
          `Operation failed after ${attempts} attempts: ${errorMessage}`,
          { attempts }
        )
      },
    })
  }

  /**
   * Check whether there are any staged changes ready to be committed
   *
   * Compares the staging area (index) against HEAD to determine if any
   * files differ. Returns true if at least one file has staged changes.
   *
   * Note: When called right after stageAll(), prefer using stageAll()'s
   * return value (staged count) instead of calling this method separately,
   * to avoid a redundant statusMatrix scan. This method is still useful
   * for standalone checks (e.g., in commit()).
   *
   * @returns true if staged changes exist, false otherwise
   */
  private async hasStagedChanges(): Promise<boolean> {
    const matrix = await git.statusMatrix({
      fs,
      dir: this.workspaceDir,
    })

    for (const [, headStatus, , stageStatus] of matrix) {
      // A file is staged if its stage status differs from HEAD
      if (headStatus !== stageStatus) {
        return true
      }
    }

    return false
  }

  /**
   * Resolve a statusMatrix tuple into a FileStatusType enum value
   *
   * Maps the [HEAD, WORKDIR, STAGE] triple from isomorphic-git's
   * statusMatrix to the application's FileStatusType enum.
   *
   * @param headStatus - 0 = absent from HEAD, 1 = present in HEAD
   * @param workdirStatus - 0 = absent, 2 = present in working directory
   * @param stageStatus - 0 = absent, 1 = same as HEAD, 2 = staged diff, 3 = same as WORKDIR
   * @returns The resolved FileStatusType
   */
  private resolveFileStatusType(
    headStatus: number,
    workdirStatus: number,
    stageStatus: number
  ): FileStatusType {
    // Unmodified: in HEAD, unchanged in workdir, stage matches HEAD
    if (headStatus === 1 && workdirStatus === 1 && stageStatus === 1) {
      return FileStatusType.UNMODIFIED
    }
    // Untracked: not in HEAD, present in workdir, not staged
    if (headStatus === 0 && workdirStatus === 2 && stageStatus === 0) {
      return FileStatusType.UNTRACKED
    }
    // Added (staged): not in HEAD, present in workdir, staged
    if (headStatus === 0 && workdirStatus === 2 && (stageStatus === 2 || stageStatus === 3)) {
      return FileStatusType.ADDED
    }
    // Modified (unstaged): in HEAD, modified in workdir, stage matches HEAD
    if (headStatus === 1 && workdirStatus === 2 && stageStatus === 1) {
      return FileStatusType.MODIFIED
    }
    // Modified and staged: in HEAD, modified in workdir, staged
    if (headStatus === 1 && workdirStatus === 2 && (stageStatus === 2 || stageStatus === 3)) {
      return FileStatusType.MODIFIED_STAGED
    }
    // Deleted (unstaged): in HEAD, absent from workdir, stage matches HEAD
    if (headStatus === 1 && workdirStatus === 0 && stageStatus === 1) {
      return FileStatusType.DELETED
    }
    // Deleted and staged: in HEAD, absent from workdir, staged removal
    if (headStatus === 1 && workdirStatus === 0 && stageStatus === 0) {
      return FileStatusType.DELETED_STAGED
    }

    // Fallback for any unhandled combination
    logger.warn(`${LOG_PREFIX} Unknown status combination`, {
      headStatus, workdirStatus, stageStatus,
    })
    return FileStatusType.MODIFIED
  }

  /**
   * Filter commit history to only include commits that affected a specific file
   *
   * Compares each commit's tree with its parent's tree to determine
   * whether the specified file was changed. Uses readBlob to compare
   * file content OIDs efficiently.
   *
   * Performance note: This method performs up to 2 * N readBlob calls where N
   * is the number of commits. For large histories, consider using git.walk()
   * with TREE() for tree-level comparison instead of blob-level reads.
   * Acceptable for Phase 0 with default depth ≤ 50.
   *
   * @param history - Full commit history to filter
   * @param filepath - The file path to filter by
   * @returns Filtered array of commits that modified the file
   */
  private async filterHistoryByFile(
    history: CommitInfo[],
    filepath: string
  ): Promise<CommitInfo[]> {
    const filtered: CommitInfo[] = []

    for (const commit of history) {
      try {
        // Get the blob OID for this file in the current commit
        let currentBlobOid: string | null = null
        try {
          const blob = await git.readBlob({
            fs,
            dir: this.workspaceDir,
            oid: commit.oid,
            filepath,
          })
          currentBlobOid = blob.oid
        } catch {
          // File doesn't exist in this commit
          currentBlobOid = null
        }

        // Get the blob OID in the parent commit
        let parentBlobOid: string | null = null
        if (commit.parents.length > 0) {
          try {
            const parentBlob = await git.readBlob({
              fs,
              dir: this.workspaceDir,
              oid: commit.parents[0]!,
              filepath,
            })
            parentBlobOid = parentBlob.oid
          } catch {
            // File doesn't exist in parent commit
            parentBlobOid = null
          }
        }

        // If the blob OID changed, the file was modified in this commit
        if (currentBlobOid !== parentBlobOid) {
          filtered.push(commit)
        }
      } catch {
        // Skip commits that can't be analyzed
        logger.warn(`${LOG_PREFIX} Skipping commit during file filter`, {
          oid: commit.oid,
          filepath,
        })
      }
    }

    return filtered
  }

  /**
   * Normalize a file path relative to the workspace directory
   *
   * Resolves the path against the workspace directory and validates
   * that the result remains within the workspace. Converts to
   * forward slashes (Git convention).
   *
   * Security: Uses path.resolve() + startsWith() to prevent
   * path traversal attacks (e.g., 'src/../../../etc/passwd').
   * This follows the same pattern as FileManager.validatePath().
   *
   * @param filepath - The file path to normalize (absolute or relative)
   * @returns Normalized relative path with forward slashes
   * @throws {GitAbstractionError} If the resolved path is outside the workspace
   */
  private normalizePath(filepath: string): string {
    // Resolve to absolute path to catch embedded traversal sequences
    const resolvedFull = path.resolve(this.workspaceDir, filepath)

    // Verify the resolved path is still within the workspace directory
    if (!resolvedFull.startsWith(this.workspaceDir + path.sep) && resolvedFull !== this.workspaceDir) {
      throw new GitAbstractionError(
        GitAbstractionErrorCode.INVALID_PATH,
        `Path traverses outside workspace: ${filepath}`,
        { filepath, resolvedPath: resolvedFull }
      )
    }

    // Compute relative path from workspace root
    let relativePath = path.relative(this.workspaceDir, resolvedFull)

    // Normalize to forward slashes (Git convention)
    relativePath = relativePath.split(path.sep).join('/')

    return relativePath
  }

  /**
   * Create the default .gitignore file in the workspace
   * 
   * Writes the standard Sibylla .gitignore entries to exclude
   * index files, cache, node_modules, and OS-specific files.
   */
  private async createDefaultGitignore(): Promise<void> {
    const gitignorePath = path.join(this.workspaceDir, '.gitignore')
    const content = DEFAULT_GITIGNORE_ENTRIES.join('\n') + '\n'

    try {
      // Check if .gitignore already exists
      try {
        await fs.promises.access(gitignorePath)
        // File exists, append our entries if not already present
        const existingContent = await fs.promises.readFile(gitignorePath, 'utf-8')
        if (!existingContent.includes('.sibylla/index/')) {
          await fs.promises.appendFile(gitignorePath, '\n' + content)
          logger.debug(`${LOG_PREFIX} Appended default entries to existing .gitignore`)
        }
      } catch {
        // File doesn't exist, create it
        await fs.promises.writeFile(gitignorePath, content, 'utf-8')
        logger.debug(`${LOG_PREFIX} Created default .gitignore`)
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.warn(`${LOG_PREFIX} Failed to create .gitignore`, {
        error: errorMessage,
      })
      // Non-fatal: don't throw, just log warning
    }
  }

  /**
   * Resolve HEAD to a commit OID
   *
   * @returns The SHA-1 OID of the current HEAD commit
   * @throws {GitAbstractionError} If HEAD cannot be resolved
   */
  private async resolveHead(): Promise<string> {
    try {
      return await git.resolveRef({
        fs,
        dir: this.workspaceDir,
        ref: 'HEAD',
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      throw new GitAbstractionError(
        GitAbstractionErrorCode.INVALID_REF,
        `Failed to resolve HEAD: ${errorMessage}`,
        { originalError: errorMessage }
      )
    }
  }

  /**
   * Create a commit from the current index without pre-checking staged changes
   *
   * This internal method is used by commitAll() to avoid a redundant
   * statusMatrix scan after stageAll() has already confirmed that
   * staged changes exist. External callers should use commit() instead.
   *
   * @param message - Commit message
   * @returns The SHA-1 OID of the newly created commit
   */
  private async commitInternal(message: string): Promise<string> {
    const startTime = Date.now()

    const oid = await git.commit({
      fs,
      dir: this.workspaceDir,
      message,
      author: {
        name: this.authorName,
        email: this.authorEmail,
      },
    })

    const elapsed = Date.now() - startTime
    logger.info(`${LOG_PREFIX} Commit created`, {
      oid: oid.slice(0, 7),
      message,
      elapsedMs: elapsed,
    })

    return oid
  }

  /**
   * Read file content from a specific commit
   *
   * Uses `git.readBlob()` to retrieve the file content at a given ref.
   * Returns an empty string if the file does not exist in the specified commit.
   *
   * @remarks Only suitable for text files. Binary files will produce
   * garbled content as the blob is decoded using UTF-8 TextDecoder.
   * Future phases should add binary file detection before decoding.
   *
   * @param filepath - Normalized relative file path
   * @param ref - Commit OID or ref name to read from
   * @returns The file content as a UTF-8 string, or empty string if not found
   */
  private async getFileContent(filepath: string, ref: string): Promise<string> {
    try {
      const { blob } = await git.readBlob({
        fs,
        dir: this.workspaceDir,
        oid: ref,
        filepath,
      })

      return new TextDecoder().decode(blob)
    } catch {
      // File does not exist in this commit — return empty string
      return ''
    }
  }

  /**
   * Read file content from the working directory
   *
   * @param filepath - Normalized relative file path
   * @returns The file content as a UTF-8 string, or empty string if not found
   */
  private async readWorkingFile(filepath: string): Promise<string> {
    const fullPath = path.join(this.workspaceDir, filepath)

    try {
      return await fs.promises.readFile(fullPath, 'utf-8')
    } catch {
      // File does not exist in working directory — return empty string
      return ''
    }
  }

  /**
   * Compute structured diff hunks between two strings
   *
   * Uses the `diff` npm package's `structuredPatch()` function to generate
   * standard unified diff hunks with line-level detail.
   *
   * @param filepath - File path (used in patch header)
   * @param oldContent - Content of the old version
   * @param newContent - Content of the new version
   * @returns Array of DiffHunk objects
   */
  private computeDiffHunks(filepath: string, oldContent: string, newContent: string): DiffHunk[] {
    const patch = structuredPatch(
      filepath,
      filepath,
      oldContent,
      newContent,
      '', // old header
      '', // new header
    )

    return patch.hunks.map((hunk) => {
      const lines: DiffLine[] = hunk.lines.map((line) => {
        if (line.startsWith('+')) {
          return { type: 'add' as const, content: line.slice(1) }
        } else if (line.startsWith('-')) {
          return { type: 'delete' as const, content: line.slice(1) }
        } else {
          // Context line (starts with ' ') or empty — strip leading space
          return { type: 'context' as const, content: line.startsWith(' ') ? line.slice(1) : line }
        }
      })

      return {
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        lines,
      }
    })
  }

  /**
   * Find files that changed between two commits
   *
   * Walks the trees of both commits using `git.walk()` with `TREE()` to
   * identify files that were added, modified, or deleted.
   *
   * For the initial commit (no parent), returns all files in the commit.
   *
   * @param commitOid - The target commit OID
   * @param parentOid - The parent commit OID (undefined for initial commit)
   * @returns Array of file paths that changed
   */
  private async findChangedFiles(
    commitOid: string,
    parentOid: string | undefined
  ): Promise<string[]> {
    const changedFiles: string[] = []

    if (!parentOid) {
      // Initial commit — all files are "changed" (added)
      try {
        const files = await git.listFiles({
          fs,
          dir: this.workspaceDir,
          ref: commitOid,
        })
        return files
      } catch {
        return []
      }
    }

    // Compare trees of both commits by reading blobs for each file
    // Get all files from both commits
    const [filesInCommit, filesInParent] = await Promise.all([
      this.listFilesAtRef(commitOid),
      this.listFilesAtRef(parentOid),
    ])

    // Union of all file paths
    const allFiles = new Set([...filesInCommit, ...filesInParent])

    for (const filepath of allFiles) {
      let commitBlobOid: string | null = null
      let parentBlobOid: string | null = null

      try {
        const blob = await git.readBlob({
          fs,
          dir: this.workspaceDir,
          oid: commitOid,
          filepath,
        })
        commitBlobOid = blob.oid
      } catch {
        // File does not exist in commit
      }

      try {
        const blob = await git.readBlob({
          fs,
          dir: this.workspaceDir,
          oid: parentOid,
          filepath,
        })
        parentBlobOid = blob.oid
      } catch {
        // File does not exist in parent
      }

      if (commitBlobOid !== parentBlobOid) {
        changedFiles.push(filepath)
      }
    }

    return changedFiles
  }

  /**
   * List all files tracked at a specific ref
   *
   * @param ref - Commit OID or ref name
   * @returns Array of file paths
   */
  private async listFilesAtRef(ref: string): Promise<string[]> {
    try {
      return await git.listFiles({
        fs,
        dir: this.workspaceDir,
        ref,
      })
    } catch {
      return []
    }
  }

  /**
   * Enumerate files containing conflict markers in the working directory
   *
   * After isomorphic-git merge fails with conflicts, conflict markers
   * (<<<<<<< HEAD, =======, >>>>>>>) remain in the working tree files.
   * This method scans modified files for these markers.
   *
   * @returns Array of workspace-relative file paths containing conflict markers
   */
  private async enumerateConflictFiles(): Promise<string[]> {
    const conflictFiles: string[] = []

    try {
      const status = await this.getStatus()

      const candidates = [...status.modified, ...status.staged]
      for (const filepath of candidates) {
        try {
          const fullPath = path.join(this.workspaceDir, filepath)
          const content = await fs.promises.readFile(fullPath, 'utf-8')
          if (content.includes('<<<<<<< ') && content.includes('=======')) {
            conflictFiles.push(filepath)
          }
        } catch {
          // File may not be readable — skip silently
        }
      }

      // Also scan untracked files that might have conflict markers
      // (edge case: new file with conflict content)
    } catch (error: unknown) {
      logger.warn(`${LOG_PREFIX} Failed to enumerate conflict files`, {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return conflictFiles
  }

  // ─── Import Pipeline Extension Methods (TASK040) ────────────────────────

  /**
   * Create a branch without switching to it
   *
   * @param name - Branch name to create
   * @throws {GitAbstractionError} If the repository is not initialized
   * @throws {GitAbstractionError} If the branch already exists
   */
  async createBranch(name: string): Promise<void> {
    logger.info(`${LOG_PREFIX} Creating branch`, { name })

    try {
      await this.ensureInitialized()

      await git.branch({
        fs,
        dir: this.workspaceDir,
        ref: name,
        checkout: false,
      })

      logger.info(`${LOG_PREFIX} Branch created`, { name })
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to create branch`, {
        name,
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.UNKNOWN_ERROR,
        `Failed to create branch '${name}': ${errorMessage}`,
        { name, originalError: errorMessage }
      )
    }
  }

  /**
   * Create a tag at the current HEAD
   *
   * Creates an annotated tag if a message is provided, otherwise a lightweight tag.
   *
   * @param tagName - Tag name (e.g., 'sibylla-import/2026-04-24-001')
   * @param message - Optional annotation message for the tag
   * @throws {GitAbstractionError} If the repository is not initialized
   */
  async createTag(tagName: string, message?: string): Promise<void> {
    logger.info(`${LOG_PREFIX} Creating tag`, { tagName, hasMessage: !!message })

    try {
      await this.ensureInitialized()

      if (message) {
        await git.annotatedTag({
          fs,
          dir: this.workspaceDir,
          ref: tagName,
          message,
          author: {
            name: this.authorName,
            email: this.authorEmail,
          },
        })
      } else {
        await git.tag({
          fs,
          dir: this.workspaceDir,
          ref: tagName,
        })
      }

      logger.info(`${LOG_PREFIX} Tag created`, { tagName })
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to create tag`, {
        tagName,
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.UNKNOWN_ERROR,
        `Failed to create tag '${tagName}': ${errorMessage}`,
        { tagName, originalError: errorMessage }
      )
    }
  }

  /**
   * Revert a commit by creating a new commit that undoes its changes
   *
   * Reads the target commit's diff against its parent, then applies
   * reverse changes and creates a new revert commit.
   *
   * @param commitHash - The SHA-1 hash of the commit to revert
   * @returns The SHA-1 hash of the newly created revert commit
   * @throws {GitAbstractionError} If the repository is not initialized
   */
  async revertCommit(commitHash: string): Promise<string> {
    logger.info(`${LOG_PREFIX} Reverting commit`, { commitHash: commitHash.slice(0, 7) })

    try {
      await this.ensureInitialized()

      const commitData = await git.readCommit({
        fs,
        dir: this.workspaceDir,
        oid: commitHash,
      })

      const parentOid = commitData.commit.parent[0]

      const changedFiles = await this.findChangedFiles(commitHash, parentOid)

      for (const filepath of changedFiles) {
        if (parentOid) {
          const parentContent = await this.getFileContent(filepath, parentOid)
          const fullPath = path.join(this.workspaceDir, filepath)

          if (parentContent === '') {
            try {
              await fs.promises.unlink(fullPath)
            } catch {
              // file may already be gone
            }
            await git.remove({ fs, dir: this.workspaceDir, filepath })
          } else {
            await fs.promises.mkdir(path.dirname(fullPath), { recursive: true })
            await fs.promises.writeFile(fullPath, parentContent, 'utf-8')
            await git.add({ fs, dir: this.workspaceDir, filepath })
          }
        }
      }

      const oid = await this.commitInternal(`还原导入操作`)

      logger.info(`${LOG_PREFIX} Commit reverted`, {
        originalCommit: commitHash.slice(0, 7),
        revertCommit: oid.slice(0, 7),
      })

      return oid
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to revert commit`, {
        commitHash,
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.COMMIT_FAILED,
        `Failed to revert commit '${commitHash.slice(0, 7)}': ${errorMessage}`,
        { commitHash, originalError: errorMessage }
      )
    }
  }

  /**
   * Get the current HEAD commit hash
   *
   * @returns The SHA-1 hash of the current HEAD commit
   * @throws {GitAbstractionError} If the repository is not initialized
   */
  async getCommitHash(): Promise<string> {
    logger.debug(`${LOG_PREFIX} Getting HEAD commit hash`)

    try {
      await this.ensureInitialized()
      return await this.resolveHead()
    } catch (error: unknown) {
      if (error instanceof GitAbstractionError) {
        throw error
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} Failed to get commit hash`, {
        error: errorMessage,
      })

      throw new GitAbstractionError(
        GitAbstractionErrorCode.INVALID_REF,
        `Failed to get HEAD commit hash: ${errorMessage}`,
        { originalError: errorMessage }
      )
    }
  }
}
