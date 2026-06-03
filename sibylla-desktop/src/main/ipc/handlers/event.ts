import { ipcMain, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../../shared/types'
import { IpcHandler } from '../handler'
import type { AppEventBus } from '../../services/event-bus'
import type { SibyllaEvent, SibyllaEventType, EventHandler } from '../../services/event-bus-types'

export class EventIpcHandler extends IpcHandler {
  readonly namespace = 'event'

  private readonly subscriptions = new Map<number, Set<SibyllaEventType>>()
  private unsubscribeBus?: () => void

  constructor(
    private readonly appEventBus: AppEventBus,
  ) {
    super()
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.EVENT_SUBSCRIBE,
      this.safeHandle(async (event, types: string[]): Promise<{ success: boolean }> => {
        const webContentsId = event.sender.id
        const typedTypes = types as SibyllaEventType[]

        if (!this.subscriptions.has(webContentsId)) {
          this.subscriptions.set(webContentsId, new Set())
          event.sender.once('destroyed', () => {
            this.subscriptions.delete(webContentsId)
          })
        }

        const sub = this.subscriptions.get(webContentsId)!
        for (const t of typedTypes) {
          sub.add(t)
        }

        return { success: true }
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.EVENT_UNSUBSCRIBE,
      this.safeHandle(async (event, types?: string[]): Promise<{ success: boolean }> => {
        const webContentsId = event.sender.id

        if (!types || types.length === 0) {
          this.subscriptions.delete(webContentsId)
        } else {
          const sub = this.subscriptions.get(webContentsId)
          if (sub) {
            for (const t of types as SibyllaEventType[]) {
              sub.delete(t)
            }
            if (sub.size === 0) {
              this.subscriptions.delete(webContentsId)
            }
          }
        }

        return { success: true }
      }),
    )

    const busHandler: EventHandler = (event: SibyllaEvent) => {
      this.pushToSubscribers(event)
    }
    this.unsubscribeBus = this.appEventBus.subscribeAny(busHandler)
  }

  private pushToSubscribers(event: SibyllaEvent): void {
    let serialized: SibyllaEvent
    try {
      serialized = JSON.parse(JSON.stringify(event))
    } catch {
      console.warn('[EventIpcHandler] serialization.failed', { type: event.type })
      return
    }

    const staleIds: number[] = []
    for (const [webContentsId, types] of this.subscriptions) {
      if (!types.has(event.type)) continue

      const win = BrowserWindow.getAllWindows().find(
        (w) => !w.isDestroyed() && w.webContents.id === webContentsId,
      )
      if (!win) {
        staleIds.push(webContentsId)
        continue
      }

      try {
        win.webContents.send(IPC_CHANNELS.EVENT_PUSH, serialized)
      } catch (err) {
        console.warn('[EventIpcHandler] push.failed', { webContentsId, type: event.type, err })
        staleIds.push(webContentsId)
      }
    }

    for (const id of staleIds) {
      this.subscriptions.delete(id)
    }
  }

  override cleanup(): void {
    if (this.unsubscribeBus) {
      this.unsubscribeBus()
      this.unsubscribeBus = undefined
    }
    this.subscriptions.clear()
    super.cleanup()
  }
}
