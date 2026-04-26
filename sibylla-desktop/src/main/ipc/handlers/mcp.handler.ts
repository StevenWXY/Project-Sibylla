import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type {
  MCPServerConfigShared,
  MCPServerInfoShared,
  MCPToolShared,
  MCPToolResultShared,
  MCPPermissionLevelShared,
  SyncTaskConfigShared,
  SyncProgressShared,
  SyncTaskWithStateShared,
} from '../../../shared/types'
import type { MCPClient } from '../../services/mcp/mcp-client'
import type { MCPRegistry } from '../../services/mcp/mcp-registry'
import type { MCPPermission } from '../../services/mcp/mcp-permission'
import type { MCPAuditLog } from '../../services/mcp/mcp-audit'
import type { McpSyncManager } from '../../services/mcp/mcp-sync'
import type { AIHandler } from './ai.handler'
import { logger } from '../../utils/logger'

export class McpHandler extends IpcHandler {
  readonly namespace = 'mcp'
  private syncManager: McpSyncManager | null = null

  constructor(
    private readonly client: MCPClient,
    private readonly registry: MCPRegistry,
    private readonly permission: MCPPermission,
    private readonly auditLog: MCPAuditLog,
    private readonly aiHandler: AIHandler,
  ) {
    super()
  }

  /**
   * Set the sync manager after construction (TASK043).
   * Called during main process assembly once McpSyncManager is initialized.
   */
  setSyncManager(syncManager: McpSyncManager): void {
    this.syncManager = syncManager
  }

  register(): void {
    ipcMain.handle(IPC_CHANNELS.MCP_CONNECT, this.safeHandle(this.handleConnect.bind(this)))
    ipcMain.handle(IPC_CHANNELS.MCP_DISCONNECT, this.safeHandle(this.handleDisconnect.bind(this)))
    ipcMain.handle(IPC_CHANNELS.MCP_LIST_SERVERS, this.safeHandle(this.handleListServers.bind(this)))
    ipcMain.handle(IPC_CHANNELS.MCP_LIST_TOOLS, this.safeHandle(this.handleListTools.bind(this)))
    ipcMain.handle(IPC_CHANNELS.MCP_CALL_TOOL, this.safeHandle(this.handleCallTool.bind(this)))
    ipcMain.handle(IPC_CHANNELS.MCP_GRANT_PERMISSION, this.safeHandle(this.handleGrantPermission.bind(this)))
    ipcMain.handle(IPC_CHANNELS.MCP_REVOKE_PERMISSION, this.safeHandle(this.handleRevokePermission.bind(this)))

    this.client.onServerEvent((event) => {
      if (event.type === 'connected' || event.type === 'disconnected' || event.type === 'error') {
        for (const window of BrowserWindow.getAllWindows()) {
          if (!window.isDestroyed()) {
            window.webContents.send(IPC_CHANNELS.MCP_SERVER_STATUS_CHANGED, {
              name: event.serverName,
              state: event.type === 'connected' ? 'connected' as const : event.type === 'error' ? 'error' as const : 'disconnected' as const,
              toolCount: this.client.getTools(event.serverName).length,
              error: event.type === 'error' ? String(event.data) : undefined,
            })
          }
        }
      }
    })

    logger.info('[McpHandler] All handlers registered')
  }

  /**
   * Register TASK043 sync IPC handlers.
   * Called after setSyncManager() during main process assembly.
   */
  registerSyncHandlers(): void {
    if (!this.syncManager) {
      logger.warn('[McpHandler] Cannot register sync handlers: syncManager not set')
      return
    }

    // mcp:configureSync — Add/update sync task
    ipcMain.handle(IPC_CHANNELS.MCP_CONFIGURE_SYNC, this.safeHandle(
      async (_event: IpcMainInvokeEvent, config: SyncTaskConfigShared): Promise<void> => {
        if (!this.syncManager) throw new Error('SyncManager not initialized')
        await this.syncManager.addTask(config)
      }
    ))

    // mcp:triggerSync — Manual sync trigger
    ipcMain.handle(IPC_CHANNELS.MCP_TRIGGER_SYNC, this.safeHandle(
      async (_event: IpcMainInvokeEvent, taskId: string): Promise<SyncProgressShared> => {
        if (!this.syncManager) throw new Error('SyncManager not initialized')
        return await this.syncManager.triggerSync(taskId)
      }
    ))

    // mcp:listSyncTasks — List all sync tasks with states
    ipcMain.handle(IPC_CHANNELS.MCP_LIST_SYNC_TASKS, this.safeHandle(
      async (_event: IpcMainInvokeEvent): Promise<SyncTaskWithStateShared[]> => {
        if (!this.syncManager) throw new Error('SyncManager not initialized')
        return this.syncManager.listTasks()
      }
    ))

    // mcp:pauseSync — Pause a sync task
    ipcMain.handle(IPC_CHANNELS.MCP_PAUSE_SYNC, this.safeHandle(
      async (_event: IpcMainInvokeEvent, taskId: string): Promise<void> => {
        if (!this.syncManager) throw new Error('SyncManager not initialized')
        await this.syncManager.pauseTask(taskId)
      }
    ))

    // mcp:resumeSync — Resume a sync task
    ipcMain.handle(IPC_CHANNELS.MCP_RESUME_SYNC, this.safeHandle(
      async (_event: IpcMainInvokeEvent, taskId: string): Promise<void> => {
        if (!this.syncManager) throw new Error('SyncManager not initialized')
        await this.syncManager.resumeTask(taskId)
      }
    ))

    logger.info('[McpHandler] Sync handlers registered')
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.MCP_CONNECT)
    ipcMain.removeHandler(IPC_CHANNELS.MCP_DISCONNECT)
    ipcMain.removeHandler(IPC_CHANNELS.MCP_LIST_SERVERS)
    ipcMain.removeHandler(IPC_CHANNELS.MCP_LIST_TOOLS)
    ipcMain.removeHandler(IPC_CHANNELS.MCP_CALL_TOOL)
    ipcMain.removeHandler(IPC_CHANNELS.MCP_GRANT_PERMISSION)
    ipcMain.removeHandler(IPC_CHANNELS.MCP_REVOKE_PERMISSION)
    // TASK043 sync handlers
    ipcMain.removeHandler(IPC_CHANNELS.MCP_CONFIGURE_SYNC)
    ipcMain.removeHandler(IPC_CHANNELS.MCP_TRIGGER_SYNC)
    ipcMain.removeHandler(IPC_CHANNELS.MCP_LIST_SYNC_TASKS)
    ipcMain.removeHandler(IPC_CHANNELS.MCP_PAUSE_SYNC)
    ipcMain.removeHandler(IPC_CHANNELS.MCP_RESUME_SYNC)
    super.cleanup()
  }

  private async handleConnect(
    _event: IpcMainInvokeEvent,
    config: MCPServerConfigShared,
  ): Promise<void> {
    await this.registry.addServer(config)
  }

  private async handleDisconnect(
    _event: IpcMainInvokeEvent,
    serverName: string,
  ): Promise<void> {
    await this.registry.removeServer(serverName)
  }

  private async handleListServers(
    _event: IpcMainInvokeEvent,
  ): Promise<MCPServerInfoShared[]> {
    return this.registry.listServers()
  }

  private async handleListTools(
    _event: IpcMainInvokeEvent,
  ): Promise<MCPToolShared[]> {
    return this.registry.listAllTools()
  }

  private async handleCallTool(
    _event: IpcMainInvokeEvent,
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResultShared> {
    const existingPermission = this.permission.checkPermission(serverName, toolName)
    if (existingPermission === 'deny') {
      return { content: 'Permission denied', isError: true }
    }

    return await this.client.callTool(serverName, toolName, args)
  }

  private async handleGrantPermission(
    _event: IpcMainInvokeEvent,
    requestId: string,
    level: MCPPermissionLevelShared,
  ): Promise<void> {
    this.aiHandler.resolvePermissionRequest(requestId, level)
  }

  private async handleRevokePermission(
    _event: IpcMainInvokeEvent,
    serverName: string,
    toolName: string,
  ): Promise<void> {
    this.permission.revokePermission(serverName, toolName)
  }
}
