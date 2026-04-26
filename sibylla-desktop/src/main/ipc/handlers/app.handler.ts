import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type { AppConfig } from '../../../shared/types'

/**
 * IPC Handler for application configuration
 *
 * Manages reading and writing `.sibylla/config.json` for persistent
 * app-level settings such as onboarding completion status.
 *
 * Security: Only whitelisted fields can be updated via IPC.
 */
export class AppHandler extends IpcHandler {
  readonly namespace = 'app'
  private configPath: string

  constructor(private readonly workspaceRoot: string) {
    super()
    this.configPath = path.join(workspaceRoot, '.sibylla', 'config.json')
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.APP_GET_CONFIG,
      this.safeHandle(this.handleGetConfig.bind(this))
    )
    ipcMain.handle(
      IPC_CHANNELS.APP_UPDATE_CONFIG,
      this.safeHandle(this.handleUpdateConfig.bind(this))
    )
  }

  private async handleGetConfig(
    _event: IpcMainInvokeEvent
  ): Promise<AppConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8')
      const config = JSON.parse(content) as AppConfig
      return config
    } catch {
      // Config file does not exist or parse failed, return defaults
      return {
        version: '1.0.0',
        environment: 'production',
        onboardingCompleted: false,
      }
    }
  }

  private async handleUpdateConfig(
    _event: IpcMainInvokeEvent,
    updates: Partial<AppConfig>
  ): Promise<void> {
    // Whitelist: only allow updating these fields via IPC
    const allowedKeys: Array<keyof AppConfig> = ['onboardingCompleted']

    const filteredUpdates: Partial<AppConfig> = {}
    for (const key of allowedKeys) {
      if (Object.hasOwn(updates, key)) {
        const record = filteredUpdates as Record<string, unknown>
        record[key] = (updates as Record<string, unknown>)[key]
      }
    }

    let currentConfig: AppConfig
    try {
      const content = await fs.readFile(this.configPath, 'utf-8')
      currentConfig = JSON.parse(content) as AppConfig
    } catch {
      currentConfig = {
        version: '1.0.0',
        environment: 'production',
        onboardingCompleted: false,
      }
    }

    const newConfig = { ...currentConfig, ...filteredUpdates }

    // Ensure .sibylla directory exists
    const sibyllaDir = path.dirname(this.configPath)
    await fs.mkdir(sibyllaDir, { recursive: true })

    // Atomic write: write to temp file then rename
    const tempPath = `${this.configPath}.tmp`
    try {
      await fs.writeFile(tempPath, JSON.stringify(newConfig, null, 2), 'utf-8')
      await fs.rename(tempPath, this.configPath)
    } catch (writeErr) {
      try { await fs.unlink(tempPath) } catch { /* ignore cleanup failure */ }
      throw writeErr
    }
  }
}
