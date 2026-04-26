import * as fs from 'fs'
import * as path from 'path'
import type { MCPServerConfig, MCPTool, MCPServerInfo } from './types'
import type { MCPClient } from './mcp-client'
import type { MCPCredentials } from './mcp-credentials'
import { logger } from '../../utils/logger'

export class MCPRegistry {
  private servers = new Map<string, MCPServerConfig>()
  private serverInfo = new Map<string, MCPServerInfo>()

  constructor(
    private readonly client: MCPClient,
    private readonly credentials: MCPCredentials,
    private readonly configPath: string,
  ) {}

  async initialize(): Promise<void> {
    const config = await this.readConfig()
    const mcpServers = config?.mcp?.servers ?? {}

    for (const [name, serverConfig] of Object.entries(mcpServers)) {
      this.servers.set(name, serverConfig)
      try {
        const resolvedConfig = await this.resolveConfig(serverConfig)
        await this.client.connect(resolvedConfig)
        this.updateServerInfo(name, 'connected', this.client.getTools(name).length)
      } catch (err) {
        logger.warn(`[MCPRegistry] Failed to connect "${name}" on startup`, {
          error: err instanceof Error ? err.message : String(err),
        })
        this.updateServerInfo(name, 'error', 0, err instanceof Error ? err.message : String(err))
      }
    }

    this.client.onServerEvent((event) => {
      if (event.type === 'connected') {
        const tools = this.client.getTools(event.serverName)
        this.updateServerInfo(event.serverName, 'connected', tools.length)
      } else if (event.type === 'disconnected') {
        this.updateServerInfo(event.serverName, 'disconnected', 0)
      } else if (event.type === 'error') {
        const info = this.serverInfo.get(event.serverName)
        this.updateServerInfo(event.serverName, 'error', info?.toolCount ?? 0, String(event.data))
      }
    })

    logger.info(`[MCPRegistry] Initialized`, {
      servers: this.servers.size,
      connected: [...this.serverInfo.values()].filter(s => s.state === 'connected').length,
    })
  }

  async addServer(config: MCPServerConfig): Promise<void> {
    if (this.servers.has(config.name)) {
      throw new Error(`MCPRegistry: server "${config.name}" already exists`)
    }

    const resolvedConfig = await this.resolveConfig(config)
    await this.client.connect(resolvedConfig)

    this.servers.set(config.name, config)
    const tools = this.client.getTools(config.name)
    this.updateServerInfo(config.name, 'connected', tools.length)

    await this.persistConfig()
    logger.info(`[MCPRegistry] Added server "${config.name}"`, { tools: tools.length })
  }

  async removeServer(serverName: string): Promise<void> {
    await this.client.disconnect(serverName)
    this.servers.delete(serverName)
    this.serverInfo.delete(serverName)
    await this.persistConfig()
    logger.info(`[MCPRegistry] Removed server "${serverName}"`)
  }

  listServers(): MCPServerInfo[] {
    return [...this.serverInfo.values()]
  }

  listAllTools(): MCPTool[] {
    return this.client.getCachedTools()
  }

  getTool(serverName: string, toolName: string): MCPTool | null {
    const tools = this.client.getTools(serverName)
    return tools.find(t => t.name === toolName) ?? null
  }

  getServerConfig(serverName: string): MCPServerConfig | undefined {
    return this.servers.get(serverName)
  }

  private async resolveConfig(config: MCPServerConfig): Promise<MCPServerConfig> {
    if (!config.env) return config
    const resolvedEnv = await this.credentials.replacePlaceholders(config.env, config.name)
    return { ...config, env: resolvedEnv }
  }

  private updateServerInfo(
    name: string,
    state: MCPServerInfo['state'],
    toolCount: number,
    error?: string,
  ): void {
    this.serverInfo.set(name, {
      name,
      state,
      toolCount,
      lastConnectedAt: state === 'connected' ? Date.now() : this.serverInfo.get(name)?.lastConnectedAt,
      error,
    })
  }

  private async readConfig(): Promise<{ mcp?: { servers?: Record<string, MCPServerConfig> } } | null> {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = await fs.promises.readFile(this.configPath, 'utf-8')
        return JSON.parse(content) as { mcp?: { servers?: Record<string, MCPServerConfig> } }
      }
    } catch (err) {
      logger.warn('[MCPRegistry] Failed to read config', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return null
  }

  private async persistConfig(): Promise<void> {
    try {
      let existing: Record<string, unknown> = {}
      if (fs.existsSync(this.configPath)) {
        const content = await fs.promises.readFile(this.configPath, 'utf-8')
        existing = JSON.parse(content) as Record<string, unknown>
      }

      const servers: Record<string, MCPServerConfig> = {}
      for (const [name, config] of this.servers) {
        servers[name] = config
      }

      const updated = {
        ...existing,
        mcp: {
          ...((existing.mcp as Record<string, unknown>) ?? {}),
          servers,
        },
      }

      const dir = path.dirname(this.configPath)
      await fs.promises.mkdir(dir, { recursive: true })
      await fs.promises.writeFile(this.configPath, JSON.stringify(updated, null, 2), 'utf-8')
    } catch (err) {
      logger.error('[MCPRegistry] Failed to persist config', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async dispose(): Promise<void> {
    const names = [...this.servers.keys()]
    await Promise.allSettled(names.map(n => this.removeServer(n)))
  }
}
