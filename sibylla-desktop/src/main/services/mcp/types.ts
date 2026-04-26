export type MCPTransportType = 'stdio' | 'sse' | 'websocket'

export interface MCPServerConfig {
  name: string
  transport: MCPTransportType
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  timeout?: number
  autoReconnect?: boolean
  maxRetries?: number
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverName: string
}

export interface MCPToolResult {
  content: string | Array<{ type: string; text: string }>
  isError?: boolean
}

export type MCPConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

export interface MCPServerInfo {
  name: string
  state: MCPConnectionState
  toolCount: number
  lastConnectedAt?: number
  error?: string
}

export interface MCPEvent {
  type: 'connected' | 'disconnected' | 'error' | 'tools_changed'
  serverName: string
  data?: unknown
}

export type MCPPermissionLevel = 'once' | 'session' | 'permanent' | 'deny'

export interface MCPPermissionEntry {
  serverName: string
  toolName: string
  level: MCPPermissionLevel
  grantedAt: number
  grantedBySession?: string
}

export interface MCPPermissionPrompt {
  serverName: string
  toolName: string
  toolDescription: string
  args: Record<string, unknown>
  isSensitive: boolean
}

export interface MCPAuditEntry {
  timestamp: number
  serverName: string
  toolName: string
  args: string
  result: 'success' | 'error' | 'denied'
  durationMs: number
  userDecision: 'confirmed' | 'auto' | 'denied'
  error?: string
}

export interface MCPTemplate {
  id: string
  name: string
  description: string
  icon: string
  category: string
  serverConfig: MCPServerConfig
  credentialFields: MCPCredentialField[]
  dependencies: MCPDependency[]
  tools: string[]
  sensitiveToolPatterns: string[]
}

export interface MCPCredentialField {
  key: string
  label: string
  type: 'password' | 'text'
  required: boolean
  placeholder?: string
}

export interface MCPDependency {
  name: string
  checkCommand: string
  installUrl: string
}

export interface ToolCallIntent {
  serverName: string
  toolName: string
  args: Record<string, unknown>
}

export interface MCPWorkspaceConfig {
  enabled: boolean
  servers: Record<string, MCPServerConfig>
  auditEnabled: boolean
}

// ─── TASK043: MCP 持续同步调度类型 ───

/**
 * Sync task configuration — defines how/when/where to sync external data.
 */
export interface SyncTaskConfig {
  /** UUID, unique identifier */
  id: string
  /** Human-readable name, e.g. "GitHub Issues 同步" */
  name: string
  /** MCPRegistry server name */
  serverName: string
  /** Tool name within the server */
  toolName: string
  /** Tool call arguments */
  args: Record<string, unknown>
  /** Sync interval in minutes. 0 = manual trigger only */
  intervalMinutes: number
  /** Target file path template, supports YYYY/MM/DD variables */
  targetPath: string
  /** Write mode: append to existing file or replace entirely */
  writeMode: 'append' | 'replace'
  /** Data transform template identifier */
  transformTemplate?: string
  /** Conflict resolution strategy (MVP: last-write-wins only) */
  conflictStrategy: 'last-write-wins'
  /** Whether this sync task is enabled */
  enabled: boolean
}

/**
 * Sync state — tracks the runtime state of a sync task.
 * Persisted to .sibylla/mcp/sync-state.json for restart recovery.
 */
export interface SyncState {
  /** Corresponding task ID */
  taskId: string
  /** Last successful sync timestamp (epoch ms), null = never synced */
  lastSyncAt: number | null
  /** Pagination cursor / etag for incremental sync, null = full sync */
  cursor: string | null
  /** Consecutive error count */
  errorCount: number
  /** Current sync status */
  status: 'active' | 'paused' | 'error'
  /** Last error message */
  lastError?: string
  /** Duration of last sync operation in ms */
  lastSyncDurationMs?: number
  /** Total number of items synced across all runs */
  totalSyncedItems?: number
}

/**
 * Sync progress — pushed to renderer via IPC for real-time status updates.
 */
export interface SyncProgress {
  /** Task ID */
  taskId: string
  /** Task human-readable name */
  taskName: string
  /** Current sync status */
  status: 'running' | 'success' | 'error'
  /** Number of items synced in this run */
  itemsSynced: number
  /** Duration of this sync run in ms */
  durationMs: number
  /** Error message if status is 'error' */
  error?: string
  /** Timestamp of this progress event */
  timestamp: number
}

/**
 * Sync scenario template — pre-configured sync patterns for common data sources.
 */
export interface SyncScenarioTemplate {
  /** Template identifier */
  id: string
  /** Human-readable name */
  name: string
  /** Description of the sync scenario */
  description: string
  /** Corresponding TASK042 MCP connection template ID */
  serverTemplateId: string
  /** Tool name to use for syncing */
  toolName: string
  /** Default tool call arguments */
  defaultArgs: Record<string, unknown>
  /** Default sync interval in minutes */
  defaultIntervalMinutes: number
  /** Default target path template */
  targetPathTemplate: string
  /** Default write mode */
  writeMode: 'append' | 'replace'
  /** Data transform template identifier */
  transformTemplate: string
}
