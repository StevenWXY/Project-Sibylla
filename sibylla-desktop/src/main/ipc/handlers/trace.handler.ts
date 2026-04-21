import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/types'
import { IpcHandler } from '../handler'
import type { TraceStore, RecentTraceInfo, TraceStats } from '../../services/trace/trace-store'
import type { TraceExporter } from '../../services/trace/trace-exporter'
import type { ReplayEngine } from '../../services/trace/replay-engine'
import type {
  PerformanceMonitor,
} from '../../services/trace/performance-monitor'
import type {
  SerializedSpanShared,
  TraceQueryFilterShared,
  ExportPreviewShared,
  TraceSnapshotShared,
  PerformanceMetricsShared,
  PerformanceAlertShared,
  RedactionRuleShared,
  TraceStatsShared,
  RecentTraceInfoShared,
} from '../../../shared/types'
import type { SerializedSpan, TraceQueryFilter } from '../../services/trace/types'

export class TraceHandler extends IpcHandler {
  readonly namespace = 'trace'

  constructor(
    private readonly traceStore: TraceStore,
    private readonly traceExporter: TraceExporter,
    private readonly replayEngine: ReplayEngine,
    private readonly performanceMonitor: PerformanceMonitor,
  ) {
    super()
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.TRACE_GET_TREE,
      this.safeHandle(async (_event, traceId: string): Promise<SerializedSpanShared[]> => {
        const spans = this.traceStore.getTraceTree(traceId)
        return spans.map(s => this.toSharedSpan(s))
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.TRACE_QUERY,
      this.safeHandle(async (_event, filter: TraceQueryFilterShared): Promise<SerializedSpanShared[]> => {
        const internalFilter = this.fromSharedFilter(filter)
        const spans = this.traceStore.query(internalFilter)
        return spans.map(s => this.toSharedSpan(s))
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.TRACE_GET_RECENT,
      this.safeHandle(async (_event, limit: number): Promise<RecentTraceInfoShared[]> => {
        const traces = this.traceStore.getRecentTraces(limit)
        return traces.map(t => this.toSharedRecentTrace(t))
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.TRACE_GET_STATS,
      this.safeHandle(async (): Promise<TraceStatsShared> => {
        const stats = this.traceStore.getStats()
        return this.toSharedStats(stats)
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.TRACE_LOCK,
      this.safeHandle(async (_event, traceId: string, reason?: string): Promise<void> => {
        this.traceStore.lockTrace(traceId, reason)
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.TRACE_UNLOCK,
      this.safeHandle(async (_event, traceId: string): Promise<void> => {
        this.traceStore.unlockTrace(traceId)
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.TRACE_CLEANUP,
      this.safeHandle(async (): Promise<{ deleted: number }> => {
        return this.traceStore.cleanup(30)
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.TRACE_PREVIEW_EXPORT,
      this.safeHandle(async (_event, traceIds: string[], customRules?: RedactionRuleShared[]): Promise<ExportPreviewShared> => {
        const rules = customRules?.map(r => this.traceExporter.fromSharedRule(r))
        return this.traceExporter.preview(traceIds, rules)
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.TRACE_EXPORT,
      this.safeHandle(async (_event, traceIds: string[], outputPath: string, customRules?: RedactionRuleShared[]): Promise<void> => {
        const rules = customRules?.map(r => this.traceExporter.fromSharedRule(r))
        await this.traceExporter.export(traceIds, outputPath, rules)
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.TRACE_IMPORT,
      this.safeHandle(async (_event, filePath: string): Promise<{ traceIds: string[] }> => {
        return this.traceExporter.import(filePath)
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.TRACE_REBUILD_SNAPSHOT,
      this.safeHandle(async (_event, traceId: string): Promise<TraceSnapshotShared> => {
        const snapshot = await this.replayEngine.rebuildSnapshot(traceId)
        return this.replayEngine.toShared(snapshot)
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.TRACE_RERUN,
      this.safeHandle(async (_event, traceId: string): Promise<{ newTraceId: string }> => {
        return this.replayEngine.rerun(traceId)
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.PERFORMANCE_GET_METRICS,
      this.safeHandle(async (): Promise<PerformanceMetricsShared | null> => {
        const metrics = this.performanceMonitor.getMetrics()
        return metrics ? this.performanceMonitor.toSharedMetrics(metrics) : null
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.PERFORMANCE_GET_ALERTS,
      this.safeHandle(async (): Promise<PerformanceAlertShared[]> => {
        const alerts = this.performanceMonitor.getAlerts()
        return alerts.map(a => this.performanceMonitor.toSharedAlert(a))
      }),
    )

    ipcMain.handle(
      IPC_CHANNELS.PERFORMANCE_SUPPRESS,
      this.safeHandle(async (_event, alertType: string, durationMs?: number): Promise<void> => {
        this.performanceMonitor.suppress(alertType, durationMs)
      }),
    )
  }

  override cleanup(): void {
    const channels = [
      IPC_CHANNELS.TRACE_GET_TREE,
      IPC_CHANNELS.TRACE_QUERY,
      IPC_CHANNELS.TRACE_GET_RECENT,
      IPC_CHANNELS.TRACE_GET_STATS,
      IPC_CHANNELS.TRACE_LOCK,
      IPC_CHANNELS.TRACE_UNLOCK,
      IPC_CHANNELS.TRACE_CLEANUP,
      IPC_CHANNELS.TRACE_PREVIEW_EXPORT,
      IPC_CHANNELS.TRACE_EXPORT,
      IPC_CHANNELS.TRACE_IMPORT,
      IPC_CHANNELS.TRACE_REBUILD_SNAPSHOT,
      IPC_CHANNELS.TRACE_RERUN,
      IPC_CHANNELS.PERFORMANCE_GET_METRICS,
      IPC_CHANNELS.PERFORMANCE_GET_ALERTS,
      IPC_CHANNELS.PERFORMANCE_SUPPRESS,
    ]
    for (const ch of channels) {
      ipcMain.removeHandler(ch)
    }
    super.cleanup()
  }

  private toSharedSpan(span: SerializedSpan): SerializedSpanShared {
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: span.kind as SerializedSpanShared['kind'],
      startTimeMs: span.startTimeMs,
      endTimeMs: span.endTimeMs,
      durationMs: span.durationMs,
      status: span.status as SerializedSpanShared['status'],
      statusMessage: span.statusMessage,
      attributes: span.attributes,
      events: span.events.map(e => ({
        name: e.name,
        timestamp: e.timestamp,
        attributes: e.attributes,
      })),
      conversationId: span.conversationId,
      taskId: span.taskId,
      userId: span.userId,
      workspaceId: span.workspaceId,
    }
  }

  private fromSharedFilter(shared: TraceQueryFilterShared): TraceQueryFilter {
    return {
      traceId: shared.traceId,
      spanName: shared.spanName,
      kind: shared.kind as TraceQueryFilter['kind'],
      status: shared.status as TraceQueryFilter['status'],
      conversationId: shared.conversationId,
      taskId: shared.taskId,
      startTimeFrom: shared.startTimeFrom,
      startTimeTo: shared.startTimeTo,
      minDurationMs: shared.minDurationMs,
      attributeFilters: shared.attributeFilters,
      limit: shared.limit,
      offset: shared.offset,
    }
  }

  private toSharedRecentTrace(info: RecentTraceInfo): RecentTraceInfoShared {
    return {
      traceId: info.traceId,
      startTime: info.startTime,
      spanCount: info.spanCount,
    }
  }

  private toSharedStats(stats: TraceStats): TraceStatsShared {
    return {
      totalSpans: stats.totalSpans,
      totalTraces: stats.totalTraces,
      dbSizeBytes: stats.dbSizeBytes,
    }
  }
}
