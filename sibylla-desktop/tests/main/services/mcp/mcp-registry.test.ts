import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MCPRegistry } from '../../../../src/main/services/mcp/mcp-registry'
import type { MCPClient } from '../../../../src/main/services/mcp/mcp-client'
import type { MCPCredentials } from '../../../../src/main/services/mcp/mcp-credentials'
import type { MCPTool, MCPServerConfig } from '../../../../src/main/services/mcp/types'
import * as fs from 'fs'

vi.mock('fs', () => ({
  ...vi.importActual('fs'),
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    promises: {
      readFile: vi.fn().mockResolvedValue('{}'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  },
  existsSync: vi.fn().mockReturnValue(false),
  promises: {
    readFile: vi.fn().mockResolvedValue('{}'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
  },
}))

function createMockClient(): MCPClient {
  const tools: MCPTool[] = [
    { name: 'search', description: 'Search', inputSchema: {}, serverName: 'test-server' },
  ]
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getTools: vi.fn().mockReturnValue(tools),
    getCachedTools: vi.fn().mockReturnValue(tools),
    onServerEvent: vi.fn(),
    removeServerEventHandler: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
  } as unknown as MCPClient
}

function createMockCredentials(): MCPCredentials {
  return {
    replacePlaceholders: vi.fn().mockResolvedValue({ API_KEY: 'resolved-value' }),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as unknown as MCPCredentials
}

describe('MCPRegistry', () => {
  let registry: MCPRegistry
  let client: MCPClient
  let credentials: MCPCredentials

  beforeEach(() => {
    client = createMockClient()
    credentials = createMockCredentials()
    registry = new MCPRegistry(client, credentials, '/tmp/.sibylla/config.json')
  })

  describe('addServer', () => {
    it('should add a server and connect', async () => {
      const config: MCPServerConfig = {
        name: 'test-server',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', 'test-mcp'],
        env: { API_KEY: '{{SECRET}}' },
      }
      await registry.addServer(config)
      expect(client.connect).toHaveBeenCalled()
      const servers = registry.listServers()
      expect(servers).toHaveLength(1)
      expect(servers[0]!.name).toBe('test-server')
    })

    it('should reject duplicate server names', async () => {
      const config: MCPServerConfig = { name: 'dup', transport: 'stdio', command: 'test' }
      await registry.addServer(config)
      await expect(registry.addServer(config)).rejects.toThrow('already exists')
    })
  })

  describe('removeServer', () => {
    it('should disconnect and remove a server', async () => {
      const config: MCPServerConfig = { name: 'removeme', transport: 'stdio', command: 'test' }
      await registry.addServer(config)
      await registry.removeServer('removeme')
      expect(client.disconnect).toHaveBeenCalledWith('removeme')
      expect(registry.listServers()).toHaveLength(0)
    })
  })

  describe('listAllTools', () => {
    it('should return all cached tools', async () => {
      const config: MCPServerConfig = { name: 'tools-server', transport: 'stdio', command: 'test' }
      await registry.addServer(config)
      const tools = registry.listAllTools()
      expect(tools.length).toBeGreaterThan(0)
    })
  })

  describe('getTool', () => {
    it('should find a specific tool', async () => {
      const config: MCPServerConfig = { name: 'lookup', transport: 'stdio', command: 'test' }
      await registry.addServer(config)
      const tool = registry.getTool('lookup', 'search')
      expect(tool).toBeDefined()
      expect(tool!.name).toBe('search')
    })

    it('should return null for unknown tool', async () => {
      const tool = registry.getTool('unknown', 'nope')
      expect(tool).toBeNull()
    })
  })
})
