/**
 * Window Handler - IPC handler for window control operations
 *
 * Provides minimize, maximize, close, and fullscreen toggle
 * functionality to the renderer process through IPC channels.
 */

import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'

/**
 * WindowHandler class
 *
 * Handles all window-control IPC communications between main and renderer processes.
 * Must have its target BrowserWindow set via setWindow() before handler invocations.
 */
export class WindowHandler extends IpcHandler {
  readonly namespace = 'window'
  private window: BrowserWindow | null = null

  /**
   * Set the BrowserWindow instance to control
   *
   * @param window - BrowserWindow instance to attach window controls to
   */
  setWindow(window: BrowserWindow): void {
    this.window = window
  }

  /**
   * Register all window control IPC handlers
   */
  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.WINDOW_MINIMIZE,
      this.safeHandle(this.minimize.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.WINDOW_MAXIMIZE,
      this.safeHandle(this.maximize.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.WINDOW_CLOSE,
      this.safeHandle(this.close.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN,
      this.safeHandle(this.toggleFullscreen.bind(this)),
    )

    console.log('[WindowHandler] All handlers registered')
  }

  /**
   * Cleanup — remove all registered IPC handlers
   */
  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_MINIMIZE)
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_MAXIMIZE)
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_CLOSE)
    ipcMain.removeHandler(IPC_CHANNELS.WINDOW_TOGGLE_FULLSCREEN)
    super.cleanup()
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  /**
   * Get the focused BrowserWindow, falling back to the pre-set window
   *
   * @throws Error if no window is available
   */
  private getWindow(): BrowserWindow {
    const win = BrowserWindow.getFocusedWindow() ?? this.window
    if (!win) {
      throw new Error('No window available for control')
    }
    return win
  }

  /**
   * Minimize the window
   */
  private async minimize(_event: IpcMainInvokeEvent): Promise<void> {
    this.getWindow().minimize()
  }

  /**
   * Toggle maximize / restore the window
   *
   * @returns Whether the window is maximized after the toggle
   */
  private async maximize(_event: IpcMainInvokeEvent): Promise<boolean> {
    const win = this.getWindow()
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
    return win.isMaximized()
  }

  /**
   * Close the window
   */
  private async close(_event: IpcMainInvokeEvent): Promise<void> {
    this.getWindow().close()
  }

  /**
   * Toggle fullscreen mode
   *
   * @returns Whether the window is in fullscreen after the toggle
   */
  private async toggleFullscreen(_event: IpcMainInvokeEvent): Promise<boolean> {
    const win = this.getWindow()
    win.setFullScreen(!win.isFullScreen())
    return win.isFullScreen()
  }
}
