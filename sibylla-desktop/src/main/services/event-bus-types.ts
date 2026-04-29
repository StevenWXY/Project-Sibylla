import type { SerializedSpan } from './trace/types'
import type { TaskRecord } from './progress/types'
import type { PerformanceMetrics, PerformanceAlert } from './trace/performance-monitor'

export type SibyllaEventType =
  | 'file.created'
  | 'file.updated'
  | 'file.deleted'
  | 'file.renamed'
  | 'memory.entry-added'
  | 'memory.entry-updated'
  | 'memory.entry-deleted'
  | 'memory.checkpoint-completed'
  | 'memory.compression-completed'
  | 'mcp.connected'
  | 'mcp.disconnected'
  | 'mcp.sync-completed'
  | 'mcp.tool-called'
  | 'index.document-added'
  | 'index.document-updated'
  | 'index.completed'
  | 'ai.message-completed'
  | 'ai.tool-called'
  | 'ai.degraded'
  | 'wiki-links.updated'
  | 'search.executed'
  | 'trace.span-ended'
  | 'trace.update'
  | 'progress.task-declared'
  | 'progress.task-updated'
  | 'progress.task-completed'
  | 'progress.task-failed'
  | 'progress.user-edit-conflict'
  | 'performance.alert'
  | 'performance.metrics'
  | 'performance.alert-cleared'
  | 'aiMode.changed'
  | 'plan.created'
  | 'plan.execution-started'
  | 'plan.steps-completed'
  | 'plan.archived'
  | 'plan.abandoned'
  | 'datasource.rate-limit-exhausted'
  | 'datasource.provider-registered'
  | 'conversation.export'
  | 'model.switched'
  | 'collab.user-joined'
  | 'collab.conflict-detected'
  | 'task.created'
  | 'task.completed'
  | 'notification.created'
  | 'git.pull-completed'
  | 'memory.sync-locked'
  | 'task.cross-device-resumeable'

export interface SibyllaEvent<T = unknown> {
  readonly id: string
  readonly type: SibyllaEventType
  readonly source: string
  readonly timestamp: number
  readonly payload: T
  readonly workspaceId?: string
  readonly traceId?: string
  readonly persist?: boolean
}

export type EventHandler<T = unknown> = (event: SibyllaEvent<T>) => void | Promise<void>

export interface EventPayloadMap {
  'file.created': { path: string; size: number }
  'file.updated': { path: string; changes: string }
  'file.deleted': { path: string }
  'file.renamed': { oldPath: string; newPath: string }
  'memory.entry-added': unknown
  'memory.entry-updated': unknown
  'memory.entry-deleted': unknown
  'memory.checkpoint-completed': unknown
  'memory.compression-completed': unknown
  'mcp.connected': { serverName: string }
  'mcp.disconnected': { serverName: string }
  'mcp.sync-completed': { taskId: string }
  'mcp.tool-called': { serverName: string; toolName: string }
  'index.document-added': { path: string }
  'index.document-updated': { path: string }
  'index.completed': { documentCount: number }
  'ai.message-completed': { conversationId: string }
  'ai.tool-called': { toolName: string }
  'ai.degraded': { reason: string }
  'wiki-links.updated': { path: string }
  'search.executed': { query: string; resultCount: number }
  'trace.span-ended': SerializedSpan
  'trace.update': string
  'progress.task-declared': TaskRecord
  'progress.task-updated': TaskRecord
  'progress.task-completed': TaskRecord
  'progress.task-failed': TaskRecord
  'progress.user-edit-conflict': undefined
  'performance.alert': PerformanceAlert
  'performance.metrics': PerformanceMetrics
  'performance.alert-cleared': { type: string }
  'aiMode.changed': { conversationId: string; from?: string; to: string }
  'plan.created': Record<string, unknown>
  'plan.execution-started': Record<string, unknown>
  'plan.steps-completed': Record<string, unknown>
  'plan.archived': Record<string, unknown>
  'plan.abandoned': Record<string, unknown>
  'datasource.rate-limit-exhausted': { providerId: string; resetAt: number }
  'datasource.provider-registered': { id: string; name: string }
  'conversation.export': { format: string; conversationId: string }
  'model.switched': { conversationId: string; oldModel: string; newModel: string }
  'collab.user-joined': { userId: string }
  'collab.conflict-detected': { path: string }
  'task.created': { taskId: string }
  'task.completed': { taskId: string }
  'notification.created': { notificationId: string }
  'git.pull-completed': { commitCount: number }
  'memory.sync-locked': { reason: string }
  'task.cross-device-resumeable': { taskId: string; lastSessionId?: string }
}

export const EVENT_MAP_BRIDGE: ReadonlyMap<string, SibyllaEventType> = new Map([
  ['trace:span-ended', 'trace.span-ended'],
  ['trace:update', 'trace.update'],
  ['progress:task-declared', 'progress.task-declared'],
  ['progress:task-updated', 'progress.task-updated'],
  ['progress:task-completed', 'progress.task-completed'],
  ['progress:task-failed', 'progress.task-failed'],
  ['progress:user-edit-conflict', 'progress.user-edit-conflict'],
  ['performance:metrics', 'performance.metrics'],
  ['performance:alert', 'performance.alert'],
  ['performance:alert-cleared', 'performance.alert-cleared'],
  ['aiMode:changed', 'aiMode.changed'],
  ['plan:created', 'plan.created'],
  ['plan:execution-started', 'plan.execution-started'],
  ['plan:steps-completed', 'plan.steps-completed'],
  ['plan:archived', 'plan.archived'],
  ['plan:abandoned', 'plan.abandoned'],
  ['datasource:rate-limit-exhausted', 'datasource.rate-limit-exhausted'],
  ['datasource:provider-registered', 'datasource.provider-registered'],
  ['conversation:export', 'conversation.export'],
  ['model:switched', 'model.switched'],
  ['git:pull-completed', 'git.pull-completed'],
  ['memory:sync-locked', 'memory.sync-locked'],
  ['task:cross-device-resumeable', 'task.cross-device-resumeable'],
])
