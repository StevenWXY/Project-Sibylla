import type {
  MCPServerConfig,
  MCPTool,
  MCPToolResult,
  MCPEvent,
  MCPConnectionState,
} from './types'
import type { MCPTransport } from './transport/types'
import { StdioTransport } from './transport/stdio-transport'
import { SSETransport } from './transport/sse-transport'
import { WebSocketTransport } from './transport/websocket-transport'
import type { MCPAuditLog } from './mcp-audit'
import { logger } from '../../utils/logger'

interface MCPConnection {
  transport: MCPTransport
  config: MCPServerConfig
  tools: MCPTool[]
  state: MCPConnectionState
  retryCount: number
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

function generateId(): string {
  return `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
}

export class MCPClient {
  private connections = new Map<string, MCPConnection>()
  private eventHandlers: ((event: MCPEvent) => void)[] = []
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void
    reject: (reason: Error) => void
    timeout: ReturnType<typeof setTimeout>
  }>()
  private disposed = false

  constructor(private readonly auditLog: MCPAuditLog) {}

  async connect(config: MCPServerConfig): Promise<void> {
    if (this.connections.has(config.name)) {
      await this.disconnect(config.name)
    }

    const transport = this.createTransport(config)
    const connection: MCPConnection = {
      transport,
      config,
      tools: [],
      state: 'connecting',
      retryCount: 0,
    }

    this.connections.set(config.name, connection)

    const connectTimeout = config.timeout ?? 10000
    await this.withTimeout(transport.connect(), connectTimeout, `connect:${config.name}`)

    transport.onMessage((msg) => this.handleMessage(config.name, msg))

    try {
      await this.initializeProtocol(config.name)
      connection.tools = await this.listTools(config.name, true)
      connection.state = 'connected'
      connection.retryCount = 0
    } catch (err) {
      connection.state = 'error'
      logger.warn(`[MCPClient] Post-connect setup failed for "${config.name}"`, {
        error: err instanceof Error ? err.message : String(err),
      })
      this.emitEvent({ type: 'error', serverName: config.name, data: err })
      return
    }

    this.emitEvent({ type: 'connected', serverName: config.name })
    logger.info(`[MCPClient] Connected to "${config.name}"`, {
      transport: config.transport,
      tools: connection.tools.length,
    })
  }

  async disconnect(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName)
    if (!connection) return

    try {
      await this.sendRequest(serverName, 'shutdown', {})
    } catch {
      // shutdown may not be supported
    }

    await this.withTimeout(connection.transport.close(), 2000, `disconnect:${serverName}`)
    this.connections.delete(serverName)
    this.emitEvent({ type: 'disconnected', serverName })
    logger.info(`[MCPClient] Disconnected from "${serverName}"`)
  }

  async listTools(serverName: string, _internal?: boolean): Promise<MCPTool[]> {
    const connection = this.connections.get(serverName)
    if (!connection || (!_internal && connection.state !== 'connected')) {
      throw new Error(`MCPClient: server "${serverName}" not connected`)
    }

    const response = await this.sendRequest(serverName, 'tools/list', {})
    const tools = this.parseToolsResponse(response, serverName)
    connection.tools = tools
    return tools
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    const connection = this.connections.get(serverName)
    if (!connection || connection.state !== 'connected') {
      throw new Error(`MCPClient: server "${serverName}" not connected`)
    }

    const startTime = Date.now()
    try {
      const response = await this.sendRequest(serverName, 'tools/call', {
        name: toolName,
        arguments: args,
      })

      const result = this.parseToolResult(response)
      const durationMs = Date.now() - startTime

      await this.auditLog.record({
        timestamp: Date.now(),
        serverName,
        toolName,
        args: JSON.stringify(args),
        result: result.isError ? 'error' : 'success',
        durationMs,
        userDecision: 'auto',
      })

      return result
    } catch (err) {
      const durationMs = Date.now() - startTime
      const errorMsg = err instanceof Error ? err.message : String(err)

      await this.auditLog.record({
        timestamp: Date.now(),
        serverName,
        toolName,
        args: JSON.stringify(args),
        result: 'error',
        durationMs,
        userDecision: 'auto',
        error: errorMsg,
      })

      return {
        content: `Tool call failed: ${errorMsg}`,
        isError: true,
      }
    }
  }

  onServerEvent(handler: (event: MCPEvent) => void): void {
    this.eventHandlers.push(handler)
  }

  removeServerEventHandler(handler: (event: MCPEvent) => void): void {
    this.eventHandlers = this.eventHandlers.filter(h => h !== handler)
  }

  getConnectionState(serverName: string): MCPConnectionState {
    return this.connections.get(serverName)?.state ?? 'disconnected'
  }

  getTools(serverName: string): MCPTool[] {
    return this.connections.get(serverName)?.tools ?? []
  }

  getCachedTools(): MCPTool[] {
    const allTools: MCPTool[] = []
    for (const connection of this.connections.values()) {
      if (connection.state === 'connected') {
        allTools.push(...connection.tools)
      }
    }
    return allTools
  }

  async dispose(): Promise<void> {
    this.disposed = true
    const names = [...this.connections.keys()]
    await Promise.allSettled(names.map(n => this.disconnect(n)))
    this.eventHandlers = []
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Client disposed'))
    }
    this.pendingRequests.clear()
  }

  private createTransport(config: MCPServerConfig): MCPTransport {
    switch (config.transport) {
      case 'stdio':
        return new StdioTransport(config)
      case 'sse':
        return new SSETransport(config)
      case 'websocket':
        return new WebSocketTransport(config)
      default:
        throw new Error(`MCPClient: unsupported transport "${config.transport}"`)
    }
  }

  private async initializeProtocol(serverName: string): Promise<void> {
    await this.sendRequest(serverName, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'sibylla-mcp-client', version: '1.0.0' },
    })
  }

  private async sendRequest(serverName: string, method: string, params: Record<string, unknown>): Promise<unknown> {
    const connection = this.connections.get(serverName)
    if (!connection) {
      throw new Error(`MCPClient: server "${serverName}" not found`)
    }

    const id = generateId()
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`MCPClient: request "${method}" timed out for "${serverName}"`))
      }, 30000)

      this.pendingRequests.set(id, { resolve, reject, timeout })

      connection.transport.send(request).catch((err) => {
        clearTimeout(timeout)
        this.pendingRequests.delete(id)
        reject(err)
      })
    })
  }

  private handleMessage(serverName: string, message: unknown): void {
    const response = message as JsonRpcResponse
    if (response.id && this.pendingRequests.has(response.id)) {
      const pending = this.pendingRequests.get(response.id)!
      clearTimeout(pending.timeout)
      this.pendingRequests.delete(response.id)

      if (response.error) {
        pending.reject(new Error(response.error.message))
      } else {
        pending.resolve(response.result)
      }
      return
    }

    if ((message as { method?: string }).method === 'notifications/tools/list_changed') {
      const connection = this.connections.get(serverName)
      if (connection && connection.state === 'connected') {
        this.listTools(serverName).catch((err) => {
          logger.warn(`[MCPClient] Failed to refresh tools for "${serverName}"`, {
            error: err instanceof Error ? err.message : String(err),
          })
        })
      }
    }
  }

  private parseToolsResponse(response: unknown, serverName: string): MCPTool[] {
    if (!response || typeof response !== 'object') return []
    const result = response as { tools?: Array<Record<string, unknown>> }
    if (!Array.isArray(result.tools)) return []
    return result.tools.map((tool) => ({
      name: (tool.name as string) ?? '',
      description: (tool.description as string) ?? '',
      inputSchema: (tool.inputSchema as Record<string, unknown>) ?? {},
      serverName,
    }))
  }

  private parseToolResult(response: unknown): MCPToolResult {
    if (!response || typeof response !== 'object') {
      return { content: String(response) }
    }
    const result = response as { content?: unknown; isError?: boolean }
    if (typeof result.content === 'string') {
      return { content: result.content, isError: result.isError }
    }
    if (Array.isArray(result.content)) {
      return {
        content: result.content as Array<{ type: string; text: string }>,
        isError: result.isError,
      }
    }
    return { content: JSON.stringify(response) }
  }

  private emitEvent(event: MCPEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event)
      } catch (err) {
        logger.warn('[MCPClient] Event handler error', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`MCPClient: timeout for "${label}" after ${ms}ms`)), ms)
      ),
    ])
  }

  async handleDisconnect(config: MCPServerConfig): Promise<void> {
    const maxRetries = config.maxRetries ?? 10
    const autoReconnect = config.autoReconnect ?? true

    if (!autoReconnect || this.disposed) {
      this.connections.delete(config.name)
      this.emitEvent({ type: 'disconnected', serverName: config.name })
      return
    }

    const connection = this.connections.get(config.name)
    if (connection) {
      connection.state = 'reconnecting'
    }

    for (let retry = 1; retry <= maxRetries; retry++) {
      if (this.disposed) {
        logger.info(`[MCPClient] Reconnect cancelled (disposed) for "${config.name}"`)
        return
      }

      const delay = Math.min(Math.pow(2, retry) * 1000, 30000)
      await new Promise((resolve) => setTimeout(resolve, delay))

      if (this.disposed) {
        logger.info(`[MCPClient] Reconnect cancelled (disposed) for "${config.name}"`)
        return
      }

      logger.info(`[MCPClient] Reconnect attempt ${retry}/${maxRetries} for "${config.name}"`)
      try {
        await this.connect(config)
        return
      } catch {
        continue
      }
    }

    if (connection) {
      connection.state = 'error'
    }
    this.emitEvent({
      type: 'error',
      serverName: config.name,
      data: `Reconnect failed after ${maxRetries} attempts`,
    })
  }
}
