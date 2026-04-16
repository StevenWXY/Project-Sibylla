/**
 * ConflictResolver Service
 *
 * Responsible for parsing Git conflict markers in working directory files
 * and resolving conflicts through three strategies: ours, theirs, or manual.
 *
 * Lifecycle:
 *   new ConflictResolver(gitAbstraction, workspaceDir)
 *   → getConflicts()     — scan workspace for files with conflict markers
 *   → resolve(resolution) — write resolved content + stage + commit
 *
 * Conflict marker format (standard Git):
 *   <<<<<<< HEAD
 *   (ours content)
 *   =======
 *   (theirs content)
 *   >>>>>>> origin/main
 *
 * Design decisions:
 * - Reads conflict markers directly from working tree files (not statusMatrix)
 *   because isomorphic-git statusMatrix is unreliable after merge conflicts
 * - Shared lines (outside conflict blocks) are included in both ours/theirs
 * - Uses GitAbstraction.stageFile() and commit() to avoid direct git API calls
 */

import * as path from 'path'
import * as fs from 'fs'
import type { GitAbstraction } from './git-abstraction'
import { logger } from '../utils/logger'
import type { ConflictInfo, ConflictResolution } from '../../shared/types'

const LOG_PREFIX = '[ConflictResolver]'

const MARKER_OURS_START = '<<<<<<< '
const MARKER_SEPARATOR = '======='
const MARKER_THEIRS_END = '>>>>>>> '

export class ConflictResolver {
  private readonly gitAbstraction: GitAbstraction
  private readonly workspaceDir: string

  constructor(gitAbstraction: GitAbstraction, workspaceDir: string) {
    this.gitAbstraction = gitAbstraction
    this.workspaceDir = workspaceDir
  }

  /**
   * Scan the working directory for files containing conflict markers
   * and parse each one to extract local/remote content.
   *
   * @returns Array of ConflictInfo with parsed ours/theirs content
   */
  async getConflicts(): Promise<ConflictInfo[]> {
    const conflictFilePaths = await this.findConflictFiles()
    const results: ConflictInfo[] = []

    for (const filePath of conflictFilePaths) {
      try {
        const info = await this.parseConflictFile(filePath)
        results.push(info)
      } catch (error: unknown) {
        logger.warn(`${LOG_PREFIX} Failed to parse conflict file`, {
          filePath,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    logger.info(`${LOG_PREFIX} Found ${results.length} conflict(s)`, {
      files: results.map((c) => c.filePath),
    })

    return results
  }

  /**
   * Resolve a single file conflict using the specified strategy.
   *
   * Flow: determine content → write file → stage → commit
   *
   * @param resolution - The resolution request from the renderer
   * @returns The commit OID of the resolution commit
   * @throws {Error} If manual resolution has no content
   */
  async resolve(resolution: ConflictResolution): Promise<string> {
    const { filePath, type } = resolution

    logger.info(`${LOG_PREFIX} Resolving conflict`, { filePath, type })

    let resolvedContent: string

    switch (type) {
      case 'mine': {
        const info = await this.parseConflictFile(filePath)
        resolvedContent = info.localContent
        break
      }
      case 'theirs': {
        const info = await this.parseConflictFile(filePath)
        resolvedContent = info.remoteContent
        break
      }
      case 'manual': {
        if (!resolution.content) {
          throw new Error('Manual content is required for manual resolution')
        }
        resolvedContent = resolution.content
        break
      }
      default: {
        const exhaustive: never = type
        throw new Error(`Unknown resolution type: ${exhaustive}`)
      }
    }

    await this.writeFileContent(filePath, resolvedContent)
    await this.gitAbstraction.stageFile(filePath)

    const basename = path.basename(filePath)
    const message = `[冲突解决] ${basename}`
    const oid = await this.gitAbstraction.commit(message)

    logger.info(`${LOG_PREFIX} Conflict resolved successfully`, {
      filePath,
      type,
      commitOid: oid,
    })

    return oid
  }

  /**
   * Scan working directory for files containing conflict markers.
   * Uses GitAbstraction.getStatus() to get candidate files, then
   * reads each file to check for <<<<<<< markers.
   */
  private async findConflictFiles(): Promise<string[]> {
    const conflictFiles: string[] = []

    try {
      const status = await this.gitAbstraction.getStatus()
      const candidates = [...status.modified, ...status.staged]

      for (const filepath of candidates) {
        try {
          const content = await this.readFileContent(filepath)
          if (content.includes(MARKER_OURS_START)) {
            conflictFiles.push(filepath)
          }
        } catch {
          // File may not be readable — skip silently
        }
      }
    } catch (error: unknown) {
      logger.error(`${LOG_PREFIX} Failed to enumerate conflict files`, {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return conflictFiles
  }

  /**
   * Parse a single conflict file to extract local and remote content.
   *
   * Algorithm:
   * 1. Split file into lines
   * 2. Walk through lines tracking state (outside/ours/theirs)
   * 3. Shared lines (outside conflict blocks) go into both versions
   * 4. Conflict marker lines are excluded from output
   *
   * @param filePath - Workspace-relative file path
   * @returns ConflictInfo with extracted local/remote content
   */
  private async parseConflictFile(filePath: string): Promise<ConflictInfo> {
    const content = await this.readFileContent(filePath)
    const { ours, theirs } = this.extractVersions(content)

    return {
      filePath,
      localContent: ours,
      remoteContent: theirs,
      baseContent: '',
    }
  }

  /**
   * Extract ours/theirs versions from content containing conflict markers.
   *
   * Lines outside of conflict blocks (shared lines) are included in BOTH
   * versions to produce complete file contents.
   *
   * @param content - Full file content with conflict markers
   * @returns Object with ours and theirs content strings
   */
  private extractVersions(content: string): { ours: string; theirs: string } {
    const lines = content.split('\n')
    const oursLines: string[] = []
    const theirsLines: string[] = []
    let inOurs = false
    let inTheirs = false

    for (const line of lines) {
      if (line.startsWith(MARKER_OURS_START)) {
        inOurs = true
        inTheirs = false
        continue
      }
      if (line === MARKER_SEPARATOR) {
        inOurs = false
        inTheirs = true
        continue
      }
      if (line.startsWith(MARKER_THEIRS_END)) {
        inOurs = false
        inTheirs = false
        continue
      }

      if (inOurs) {
        oursLines.push(line)
      } else if (inTheirs) {
        theirsLines.push(line)
      } else {
        oursLines.push(line)
        theirsLines.push(line)
      }
    }

    return {
      ours: oursLines.join('\n'),
      theirs: theirsLines.join('\n'),
    }
  }

  /**
   * Read file content from the working directory
   */
  private async readFileContent(filePath: string): Promise<string> {
    const fullPath = path.join(this.workspaceDir, filePath)
    return fs.promises.readFile(fullPath, 'utf-8')
  }

  /**
   * Write file content to the working directory using atomic write
   * (temp file + rename) per CLAUDE.md safety requirements.
   */
  private async writeFileContent(filePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.workspaceDir, filePath)
    const tempPath = fullPath + '.tmp'

    await fs.promises.writeFile(tempPath, content, 'utf-8')
    await fs.promises.rename(tempPath, fullPath)
  }
}
