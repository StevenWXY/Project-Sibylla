import type { MemoryEventBus } from './memory/memory-event-bus'
import type { AppEventBus } from './event-bus'
import type { SibyllaEventType } from './event-bus-types'

interface BridgeMapping {
  memoryEvent: string
  sibyllaType: SibyllaEventType
}

const BRIDGE_MAPPINGS: readonly BridgeMapping[] = [
  { memoryEvent: 'memory:checkpoint-completed', sibyllaType: 'memory.checkpoint-completed' },
  { memoryEvent: 'memory:entry-added', sibyllaType: 'memory.entry-added' },
  { memoryEvent: 'memory:entry-updated', sibyllaType: 'memory.entry-updated' },
  { memoryEvent: 'memory:entry-deleted', sibyllaType: 'memory.entry-deleted' },
  { memoryEvent: 'memory:compression-completed', sibyllaType: 'memory.compression-completed' },
] as const

export class MemoryEventBusBridge {
  private readonly disposers: Array<() => void> = []

  constructor(
    private readonly memBus: MemoryEventBus,
    private readonly appBus: AppEventBus,
  ) {
    this.registerBridges()
  }

  private registerBridges(): void {
    for (const mapping of BRIDGE_MAPPINGS) {
      const handler = (payload: unknown) => {
        this.appBus.emitEvent({
          type: mapping.sibyllaType,
          source: 'memory-manager',
          payload,
        })
      }
      this.memBus.on(mapping.memoryEvent, handler)
      this.disposers.push(() => this.memBus.off(mapping.memoryEvent, handler))
    }
  }

  dispose(): void {
    for (const disposer of this.disposers) disposer()
    this.disposers.length = 0
  }
}
