import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MCPClient } from '../../../../src/main/services/mcp/mcp-client'
import type { MCPAuditLog } from '../../../../src/main/services/mcp/mcp-audit'
import type { MCPTransport } from '../../../../src/main/services/mcp/transport/types'
import type { MCPServerConfig, MCPEvent } from '../../../../src/main/services/mcp/types'

function createMockTransport(): MCPTransport {
  let messageHandler: ((message: unknown) => void) | null = null
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockImplementation((msg: unknown) => {
      const req = msg as { id: string; method: string; params?: Record<string, unknown> }
      if (req.id && messageHandler) {
        setImmediate(() => {
          if (req.method === 'tools/list') {
            messageHandler!({
              jsonrpc: '2.0',
              id: req.id,
              result: {
                tools: [
                  { name: 'search', description: 'Search documents', inputSchema: { type: 'object' } },
                  { name: 'read', description: 'Read a file', inputSchema: { type: 'object' } },
                ],
              },
            })
          } else if (req.method === 'tools/call') {
            messageHandler!({
              jsonrpc: '2.0',
              id: req.id,
              result: { content: 'tool result text', isError: false },
            })
          } else if (req.method === 'initialize') {
            messageHandler!({
              jsonrpc: '2.0',
              id: req.id,
              result: { protocolVersion: '2024-11-05' },
            })
          } else {
            messageHandler!({
              jsonrpc: '2.0',
              id: req.id,
              result: {},
            })
          }
        })
      }
      return Promise.resolve()
    }),
    onMessage: vi.fn().mockImplementation((handler: (message: unknown) => void) => {
      messageHandler = handler
    }),
    close: vi.fn().mockResolvedValue(undefined),
    isConnected: vi.fn().mockReturnValue(true),
  }
}

function createMockAuditLog(): MCPAuditLog {
  return {
    record: vi.fn().mockResolvedValue(undefined),
  } as unknown as MCPAuditLog
}

vi.mock('../../../../src/main/services/mcp/transport/stdio-transport', () => ({
  StdioTransport: vi.fn().mockImplementation(() => createMockTransport()),
}))
vi.mock('../../../../src/main/services/mcp/transport/sse-transport', () => ({
  SSETransport: vi.fn().mockImplementation(() => createMockTransport()),
}))
vi.mock('../../../../src/main/services/mcp/transport/websocket-transport', () => ({
  WebSocketTransport: vi.fn().mockImplementation(() => createMockTransport()),
}))
vi.mock('../../../../src/main/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

const serverConfig: MCPServerConfig = {
  name: 'test-server',
  transport: 'stdio',
  command: 'node',
  args: ['server.js'],
}

describe('MCPClient', () => {
  let client: MCPClient
  let auditLog: MCPAuditLog

  beforeEach(() => {
    vi.clearAllMocks()
    auditLog = createMockAuditLog()
    client = new MCPClient(auditLog)
  })

  describe('connect', () => {
    it('should connect and emit connected event', async () => {
      const handler = vi.fn()
      client.onServerEvent(handler)
      await client.connect(serverConfig)
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'connected', serverName: 'test-server' })
      )
    })

    it('should set connection state to connected', async () => {
      await client.connect(serverConfig)
      expect(client.getConnectionState('test-server')).toBe('connected')
    })

    it('should disconnect existing connection before reconnecting', async () => {
      await client.connect(serverConfig)
      await client.connect(serverConfig)
      expect(client.getConnectionState('test-server')).toBe('connected')
    })
  })

  describe('disconnect', () => {
    it('should disconnect and emit disconnected event', async () => {
      const handler = vi.fn()
      client.onServerEvent(handler)
      await client.connect(serverConfig)
      await client.disconnect('test-server')
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'disconnected', serverName: 'test-server' })
      )
      expect(client.getConnectionState('test-server')).toBe('disconnected')
    })

    it('should not throw when disconnecting unknown server', async () => {
      await expect(client.disconnect('unknown')).resolves.toBeUndefined()
    })
  })

  describe('listTools', () => {
    it('should return tools after connect', async () => {
      await client.connect(serverConfig)
      const tools = client.getTools('test-server')
      expect(tools.length).toBeGreaterThan(0)
      expect(tools[0]!.name).toBe('search')
      expect(tools[0]!.serverName).toBe('test-server')
    })

    it('should throw when server not connected', async () => {
      await expect(client.listTools('unknown')).rejects.toThrow('not connected')
    })
  })

  describe('callTool', () => {
    it('should call tool and return result', async () => {
      await client.connect(serverConfig)
      const result = await client.callTool('test-server', 'search', { query: 'test' })
      expect(result.content).toBe('tool result text')
      expect(result.isError).toBeFalsy()
    })

    it('should record audit log on success', async () => {
      await client.connect(serverConfig)
      await client.callTool('test-server', 'search', { query: 'test' })
      expect(auditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName: 'test-server',
          toolName: 'search',
          result: 'success',
        })
      )
    })

    it('should throw when server not connected', async () => {
      await expect(client.callTool('unknown', 'tool', {})).rejects.toThrow('not connected')
    })
  })

  describe('onServerEvent / removeServerEventHandler', () => {
    it('should register and receive events', async () => {
      const handler = vi.fn()
      client.onServerEvent(handler)
      await client.connect(serverConfig)
      expect(handler).toHaveBeenCalled()
    })

    it('should stop receiving events after removal', async () => {
      const handler = vi.fn()
      client.onServerEvent(handler)
      client.removeServerEventHandler(handler)
      await client.connect(serverConfig)
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('getCachedTools', () => {
    it('should return empty array when no connections', () => {
      expect(client.getCachedTools()).toEqual([])
    })

    it('should return all tools from connected servers', async () => {
      await client.connect(serverConfig)
      const cached = client.getCachedTools()
      expect(cached.length).toBeGreaterThan(0)
    })
  })

  describe('dispose', () => {
    it('should disconnect all servers', async () => {
      await client.connect(serverConfig)
      await client.dispose()
      expect(client.getCachedTools()).toEqual([])
    })
  })
})
