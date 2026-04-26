export type {
  MCPTransportType,
  MCPServerConfig,
  MCPTool,
  MCPToolResult,
  MCPConnectionState,
  MCPServerInfo,
  MCPEvent,
  MCPPermissionLevel,
  MCPPermissionEntry,
  MCPPermissionPrompt,
  MCPAuditEntry,
  MCPTemplate,
  MCPCredentialField,
  MCPDependency,
  ToolCallIntent,
  MCPWorkspaceConfig,
  // TASK043 sync types
  SyncTaskConfig,
  SyncState,
  SyncProgress,
  SyncScenarioTemplate,
} from './types'

export type { MCPTransport } from './transport/types'
export { StdioTransport } from './transport/stdio-transport'
export { SSETransport } from './transport/sse-transport'
export { WebSocketTransport } from './transport/websocket-transport'

export { MCPClient } from './mcp-client'
export { MCPRegistry } from './mcp-registry'
export { MCPPermission } from './mcp-permission'
export { MCPCredentials } from './mcp-credentials'
export { MCPAuditLog } from './mcp-audit'
export { MCPTemplateLoader, loadSyncScenarioTemplates, createSyncTaskFromScenario } from './mcp-templates'

// TASK043 sync modules
export { McpSyncManager } from './mcp-sync'
export { SyncDataTransformer } from './sync-data-transformer'
