import { ipcMain, IpcMainInvokeEvent, app } from 'electron'
import { IPC_CHANNELS, SystemInfo } from '../../../shared/types'
import { IpcHandler } from '../handler'

/**
 * System IPC Handler
 * 
 * Provides system information and platform details.
 * Used for debugging, analytics, and platform-specific features.
 * 
 * @example
 * ```typescript
 * // In main process
 * const systemHandler = new SystemHandler()
 * ipcManager.registerHandler(systemHandler)
 * 
 * // In renderer process
 * const info = await window.electronAPI.getSystemInfo()
 * console.log(info.data.platform) // 'darwin', 'win32', etc.
 * ```
 */
export class SystemHandler extends IpcHandler {
  readonly namespace = 'system'

  /**
   * Register all system-related IPC handlers
   */
  register(): void {
    console.log('[System Handler] Registering handlers...')

    ipcMain.handle(
      IPC_CHANNELS.SYSTEM_INFO,
      this.safeHandle(this.handleGetSystemInfo.bind(this))
    )

    ipcMain.handle(
      IPC_CHANNELS.SYSTEM_PLATFORM,
      this.safeHandle(this.handleGetPlatform.bind(this))
    )

    ipcMain.handle(
      IPC_CHANNELS.SYSTEM_VERSION,
      this.safeHandle(this.handleGetVersion.bind(this))
    )

    console.log('[System Handler] Handlers registered successfully')
  }

  /**
   * Handle get system information request
   * 
   * Returns comprehensive system information including platform,
   * architecture, and runtime versions.
   * 
   * @param _event - IPC event (unused)
   * @returns System information object
   */
  private async handleGetSystemInfo(_event: IpcMainInvokeEvent): Promise<SystemInfo> {
    console.log('[System Handler] Getting system info')

    const systemInfo: SystemInfo = {
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
    }

    return systemInfo
  }

  /**
   * Handle get platform request
   * 
   * Returns the operating system platform.
   * 
   * @param _event - IPC event (unused)
   * @returns Platform identifier (darwin, win32, linux, etc.)
   */
  private async handleGetPlatform(_event: IpcMainInvokeEvent): Promise<NodeJS.Platform> {
    console.log('[System Handler] Getting platform')
    return process.platform
  }

  /**
   * Handle get version request
   * 
   * Returns the application version from package.json.
   * 
   * @param _event - IPC event (unused)
   * @returns Application version string
   */
  private async handleGetVersion(_event: IpcMainInvokeEvent): Promise<string> {
    console.log('[System Handler] Getting app version')
    return app.getVersion()
  }

  /**
   * Cleanup system handler resources
   */
  override cleanup(): void {
    console.log('[System Handler] Cleaning up...')
    ipcMain.removeHandler(IPC_CHANNELS.SYSTEM_INFO)
    ipcMain.removeHandler(IPC_CHANNELS.SYSTEM_PLATFORM)
    ipcMain.removeHandler(IPC_CHANNELS.SYSTEM_VERSION)
    super.cleanup()
  }
}
