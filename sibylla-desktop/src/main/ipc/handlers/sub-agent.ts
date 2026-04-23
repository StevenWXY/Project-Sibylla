import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/types'
import type { SubAgentMetadata, SubAgentTemplate, SubAgentTrace } from '../../../shared/types'
import { IpcHandler } from '../handler'
import type { SubAgentRegistry } from '../../services/sub-agent/SubAgentRegistry'
import type { SubAgentExecutor } from '../../services/sub-agent/SubAgentExecutor'
import type { TraceStore } from '../../services/trace/trace-store'

export class SubAgentHandler extends IpcHandler {
  readonly namespace = 'sub-agent'

  private channelList = IPC_CHANNELS.SUB_AGENT_LIST
  private channelCreate = IPC_CHANNELS.SUB_AGENT_CREATE
  private channelTrace = IPC_CHANNELS.SUB_AGENT_TRACE

  constructor(
    private readonly subAgentRegistry: SubAgentRegistry,
    private readonly subAgentExecutor: SubAgentExecutor,
    private readonly traceStore?: TraceStore,
  ) {
    super()
  }

  register(): void {
    ipcMain.handle(this.channelList, this.safeHandle(async () => {
      return this.subAgentRegistry.getAll()
    }))

    ipcMain.handle(this.channelCreate, this.safeHandle(async (_event, template: SubAgentTemplate) => {
      return this.subAgentRegistry.createFromTemplate(template)
    }))

    ipcMain.handle(this.channelTrace, this.safeHandle(async (_event, traceId: string) => {
      if (!this.traceStore) {
        throw new Error('Trace store not available')
      }

      const spans = this.traceStore.getTraceTree(traceId)
      const firstSpan = spans[0]

      const result: SubAgentTrace = {
        traceId,
        parentTraceId: firstSpan?.attributes?.['parent_trace_id'] as string ?? '',
        spans,
        agentId: firstSpan?.attributes?.['agent.id'] as string ?? '',
        startedAt: firstSpan?.startTimeMs ?? 0,
        endedAt: spans.length > 0 ? spans[spans.length - 1]!.endTimeMs : 0,
      }

      return result
    }))
  }

  cleanup(): void {
    ipcMain.removeHandler(this.channelList)
    ipcMain.removeHandler(this.channelCreate)
    ipcMain.removeHandler(this.channelTrace)
    super.cleanup()
  }
}
