/**
 * MemorySyncManager — encrypted MEMORY.md sync via beforePush/afterPull hooks
 *
 * This module does NOT modify SyncManager. Instead it provides hook methods
 * that are called before SyncManager.push() and after SyncManager.pull()
 * from the main process assembly layer.
 *
 * Lifecycle:
 *   beforePush() → encrypt MEMORY.md → write MEMORY.encrypted → SyncManager.push()
 *   SyncManager.pull() → afterPull() → detect MEMORY.encrypted → decrypt → atomic write MEMORY.md
 *
 * @see plans/phase2/phase2-task005-sync-enhancement-citation-tracing-plan.md §Phase C
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import { logger } from '../../utils/logger'
import type { FileManager } from '../file-manager'
import type { AppEventBus } from '../event-bus'
import { deriveKeyFromPassword, encrypt, decrypt, DecryptionError } from './encryption'

const LOG_PREFIX = '[MemorySyncManager]'

const MEMORY_DIR = '.sibylla/memory'
const MEMORY_PLAIN = `${MEMORY_DIR}/MEMORY.md`
const MEMORY_ENCRYPTED = `${MEMORY_DIR}/MEMORY.encrypted`

export interface MemorySyncConfig {
  syncMemory: boolean
  workspaceId: string
}

export class MemorySyncManager {
  private userPassword?: string
  private readonly workspaceRoot: string

  constructor(
    private readonly fileManager: FileManager,
    private readonly eventBus: AppEventBus,
    private readonly config: MemorySyncConfig,
  ) {
    this.workspaceRoot = fileManager.getWorkspaceRoot()
    logger.info(`${LOG_PREFIX} Initialized`, {
      syncMemory: config.syncMemory,
      workspaceId: config.workspaceId,
    })
  }

  setPassword(password: string): void {
    this.userPassword = password
    logger.info(`${LOG_PREFIX} Password set (stored in memory only)`)
  }

  clearPassword(): void {
    this.userPassword = undefined
    logger.info(`${LOG_PREFIX} Password cleared`)
  }

  isPasswordSet(): boolean {
    return this.userPassword !== undefined && this.userPassword.length > 0
  }

  async isLocked(): Promise<boolean> {
    const encryptedPath = path.join(this.workspaceRoot, MEMORY_ENCRYPTED)
    try {
      await fs.access(encryptedPath)
    } catch {
      return false
    }

    if (!this.isPasswordSet()) {
      return true
    }

    try {
      const raw = await fs.readFile(encryptedPath, 'utf-8')
      const key = deriveKeyFromPassword(this.userPassword!, this.config.workspaceId)
      decrypt(raw.trim(), key)
      return false
    } catch {
      return true
    }
  }

  async beforePush(): Promise<void> {
    if (!this.config.syncMemory) {
      logger.debug(`${LOG_PREFIX} beforePush skipped — memory sync disabled`)
      return
    }

    if (!this.isPasswordSet()) {
      logger.debug(`${LOG_PREFIX} beforePush skipped — no password set`)
      return
    }

    try {
      const plainPath = path.join(this.workspaceRoot, MEMORY_PLAIN)
      let plaintext: string
      try {
        plaintext = await fs.readFile(plainPath, 'utf-8')
      } catch {
        logger.debug(`${LOG_PREFIX} beforePush skipped — MEMORY.md does not exist`)
        return
      }

      const key = deriveKeyFromPassword(this.userPassword!, this.config.workspaceId)
      const ciphertext = encrypt(plaintext, key)

      const encryptedDir = path.join(this.workspaceRoot, MEMORY_DIR)
      await fs.mkdir(encryptedDir, { recursive: true })

      const encryptedPath = path.join(this.workspaceRoot, MEMORY_ENCRYPTED)
      await this.atomicWrite(encryptedPath, ciphertext)

      logger.info(`${LOG_PREFIX} beforePush — MEMORY.md encrypted`, {
        plainSize: plaintext.length,
        encryptedSize: ciphertext.length,
      })
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      logger.error(`${LOG_PREFIX} beforePush failed`, { error: msg })
    }
  }

  async afterPull(): Promise<void> {
    if (!this.config.syncMemory) {
      logger.debug(`${LOG_PREFIX} afterPull skipped — memory sync disabled`)
      return
    }

    const encryptedPath = path.join(this.workspaceRoot, MEMORY_ENCRYPTED)
    let exists: boolean
    try {
      await fs.access(encryptedPath)
      exists = true
    } catch {
      exists = false
    }

    if (!exists) {
      logger.debug(`${LOG_PREFIX} afterPull skipped — no MEMORY.encrypted found`)
      return
    }

    if (!this.isPasswordSet()) {
      logger.warn(`${LOG_PREFIX} afterPull — MEMORY.encrypted exists but no password set, marking as locked`)
      this.publishLockedEvent('Password not set — cannot decrypt synced memory')
      return
    }

    try {
      const ciphertext = (await fs.readFile(encryptedPath, 'utf-8')).trim()
      const key = deriveKeyFromPassword(this.userPassword!, this.config.workspaceId)
      const plaintext = decrypt(ciphertext, key)

      await this.fileManager.writeFile(MEMORY_PLAIN, plaintext, {
        atomic: true,
        createDirs: true,
      })

      logger.info(`${LOG_PREFIX} afterPull — MEMORY.md decrypted and written`, {
        size: plaintext.length,
      })
    } catch (error: unknown) {
      if (error instanceof DecryptionError) {
        logger.error(`${LOG_PREFIX} afterPull — decryption failed`, {
          error: error.message,
        })
        this.publishLockedEvent('Decryption failed — wrong password or corrupted data')
      } else {
        const msg = error instanceof Error ? error.message : String(error)
        logger.error(`${LOG_PREFIX} afterPull failed`, { error: msg })
      }
    }
  }

  updateConfig(config: Partial<MemorySyncConfig>): void {
    if (config.syncMemory !== undefined) {
      this.config.syncMemory = config.syncMemory
    }
    if (config.workspaceId !== undefined) {
      this.config.workspaceId = config.workspaceId
    }
    logger.info(`${LOG_PREFIX} Config updated`, config)
  }

  getConfig(): Readonly<MemorySyncConfig> {
    return { ...this.config }
  }

  private publishLockedEvent(reason: string): void {
    this.eventBus.emitEvent({
      type: 'memory.sync-locked',
      source: 'memory-sync',
      payload: { reason },
    })
    logger.info(`${LOG_PREFIX} Published memory.sync-locked event`, { reason })
  }

  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
    await fs.writeFile(tempPath, content, 'utf-8')
    await fs.rename(tempPath, filePath)
  }
}
