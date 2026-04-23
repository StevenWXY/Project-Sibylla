import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type { HookMetadataShared, HookExecutionLogShared } from '../../../shared/types'
import type { HookRegistry } from '../../services/hooks/HookRegistry'
import type { Tracer } from '../../services/trace/tracer'

export class HookHandler extends IpcHandler {
  readonly namespace = 'hook'

  constructor(
    private readonly registry: HookRegistry,
    private readonly tracer?: Tracer,
  ) {
    super()
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.HOOK_LIST,
      this.safeHandle(async (): Promise<HookMetadataShared[]> => {
        return this.registry.getAll().map(m => ({
          id: m.id,
          version: m.version,
          name: m.name,
          description: m.description,
          nodes: [...m.nodes],
          priority: m.priority,
          source: m.source,
          condition: m.condition,
          enabled: this.registry.isEnabled(m.id),
        }))
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.HOOK_ENABLE,
      this.safeHandle(async (_event: IpcMainInvokeEvent, hookId: string): Promise<void> => {
        this.registry.enable(hookId)
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.HOOK_DISABLE,
      this.safeHandle(async (_event: IpcMainInvokeEvent, hookId: string): Promise<void> => {
        this.registry.disable(hookId)
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.HOOK_TRACE,
      this.safeHandle(async (_event: IpcMainInvokeEvent, traceId: string): Promise<HookExecutionLogShared[]> => {
        if (!this.tracer?.isEnabled()) return []
        return []
      }),
    )
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.HOOK_LIST)
    ipcMain.removeHandler(IPC_CHANNELS.HOOK_ENABLE)
    ipcMain.removeHandler(IPC_CHANNELS.HOOK_DISABLE)
    ipcMain.removeHandler(IPC_CHANNELS.HOOK_TRACE)
    super.cleanup()
  }
}
