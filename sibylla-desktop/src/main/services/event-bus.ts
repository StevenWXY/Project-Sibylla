import { EventEmitter } from 'events'
import type { SerializedSpan } from './trace/types'
import type { TaskRecord } from './progress/types'
import type { PerformanceMetrics, PerformanceAlert } from './trace/performance-monitor'

type EventMap = {
  'trace:span-ended': [span: SerializedSpan]
  'trace:update': [traceId: string]
  'progress:task-declared': [task: TaskRecord]
  'progress:task-updated': [task: TaskRecord]
  'progress:task-completed': [task: TaskRecord]
  'progress:task-failed': [task: TaskRecord]
  'progress:user-edit-conflict': []
  'performance:metrics': [metrics: PerformanceMetrics]
  'performance:alert': [alert: PerformanceAlert]
  'performance:alert-cleared': [payload: { type: string }]
}

export class AppEventBus extends EventEmitter {
  emitSpanEnded(span: SerializedSpan): void {
    this.emit('trace:span-ended', span)
  }

  emitTraceUpdate(traceId: string): void {
    this.emit('trace:update', traceId)
  }

  emitTaskDeclared(task: TaskRecord): void {
    this.emit('progress:task-declared', task)
  }

  emitTaskUpdated(task: TaskRecord): void {
    this.emit('progress:task-updated', task)
  }

  emitTaskCompleted(task: TaskRecord): void {
    this.emit('progress:task-completed', task)
  }

  emitTaskFailed(task: TaskRecord): void {
    this.emit('progress:task-failed', task)
  }

  emitUserEditConflict(): void {
    this.emit('progress:user-edit-conflict')
  }

  emitPerformanceMetrics(metrics: PerformanceMetrics): void {
    this.emit('performance:metrics', metrics)
  }

  emitPerformanceAlert(alert: PerformanceAlert): void {
    this.emit('performance:alert', alert)
  }

  emitPerformanceAlertCleared(payload: { type: string }): void {
    this.emit('performance:alert-cleared', payload)
  }
}

export type AppEventBusEvents = keyof EventMap
