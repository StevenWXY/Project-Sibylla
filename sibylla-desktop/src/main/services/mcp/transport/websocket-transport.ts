import type { MCPTransport } from './types'
import type { MCPServerConfig } from '../types'
import { logger } from '../../../utils/logger'

/**
 * WebSocket interface matching the `ws` library API surface used by this transport.
 * Declared locally so the module compiles even when `ws` is not installed.
 */
interface WsLike {
  readonly OPEN: number
  readonly readyState: number
  on(event: string, listener: (...args: unknown[]) => void): void
  send(data: string, cb?: (err?: Error) => void): void
  close(): void
  terminate(): void
}

interface WsConstructor {
  new (url: string, options?: { headers?: Record<string, string> }): WsLike
  readonly OPEN: number
}

let WsModule: WsConstructor | null = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  WsModule = require('ws') as WsConstructor
} catch {
  // ws not available — WebSocket transport will fail at connect time
}

export class WebSocketTransport implements MCPTransport {
  private ws: WsLike | null = null
  private messageHandler: ((message: unknown) => void) | null = null
  private connected = false

  constructor(private readonly config: MCPServerConfig) {
    if (!config.url) {
      throw new Error(`WebSocketTransport: url is required for server "${config.name}"`)
    }
  }

  async connect(): Promise<void> {
    if (!WsModule) {
      throw new Error(`WebSocketTransport: 'ws' module is not installed`)
    }
    return new Promise((resolve, reject) => {
      this.ws = new WsModule!(this.config.url!, {
        headers: this.config.headers,
      })

      const timeout = setTimeout(() => {
        if (!this.connected) {
          this.ws?.terminate()
          reject(new Error(`WebSocketTransport: connection timeout for "${this.config.name}"`))
        }
      }, this.config.timeout ?? 10000)

      this.ws.on('open', () => {
        clearTimeout(timeout)
        logger.info(`[WebSocketTransport:${this.config.name}] Connected`)
        this.connected = true
        resolve()
      })

      this.ws.on('error', (...args: unknown[]) => {
        clearTimeout(timeout)
        const err = args[0] as Error | undefined
        logger.error(`[WebSocketTransport:${this.config.name}] Error`, { error: err?.message ?? 'unknown' })
        if (!this.connected) {
          reject(err ?? new Error('WebSocket error'))
        }
      })

      this.ws.on('close', () => {
        this.connected = false
      })

      this.ws.on('message', (...args: unknown[]) => {
        const data = args[0]
        if (this.messageHandler) {
          try {
            const parsed = JSON.parse(String(data))
            this.messageHandler(parsed)
          } catch {
            logger.warn(`[WebSocketTransport:${this.config.name}] Non-JSON message`)
          }
        }
      })
    })
  }

  async send(message: unknown): Promise<void> {
    if (!this.ws || !WsModule || this.ws.readyState !== WsModule.OPEN) {
      throw new Error(`WebSocketTransport:${this.config.name} not connected`)
    }
    return new Promise((resolve, reject) => {
      this.ws!.send(JSON.stringify(message), (err?: Error) => {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  onMessage(handler: (message: unknown) => void): void {
    this.messageHandler = handler
  }

  async close(): Promise<void> {
    if (!this.ws) return
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.ws?.terminate()
        resolve()
      }, 2000)

      this.ws!.on('close', () => {
        clearTimeout(timeout)
        this.connected = false
        this.ws = null
        resolve()
      })

      if (WsModule && this.ws!.readyState === WsModule.OPEN) {
        this.ws!.close()
      } else {
        this.ws!.terminate()
      }
    })
  }

  isConnected(): boolean {
    return this.connected && this.ws !== null && WsModule !== null && this.ws.readyState === WsModule.OPEN
  }
}
