import type { MCPTransport } from './types'
import type { MCPServerConfig } from '../types'
import { logger } from '../../../utils/logger'

export class SSETransport implements MCPTransport {
  private eventSource: EventSource | null = null
  private messageHandler: ((message: unknown) => void) | null = null
  private connected = false
  private readonly baseUrl: string
  private readonly headers: Record<string, string>

  constructor(private readonly config: MCPServerConfig) {
    if (!config.url) {
      throw new Error(`SSETransport: url is required for server "${config.name}"`)
    }
    this.baseUrl = config.url
    this.headers = config.headers ?? {}
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sseUrl = new URL('/sse', this.baseUrl).toString()

      this.eventSource = new EventSource(sseUrl)

      this.eventSource.onopen = () => {
        logger.info(`[SSETransport:${this.config.name}] Connected`)
        this.connected = true
        resolve()
      }

      this.eventSource.onerror = (event) => {
        logger.error(`[SSETransport:${this.config.name}] Connection error`, { event })
        if (!this.connected) {
          reject(new Error(`SSETransport: connection failed for "${this.config.name}"`))
        } else {
          this.connected = false
        }
      }

      this.eventSource.addEventListener('message', (event: MessageEvent) => {
        if (this.messageHandler) {
          try {
            const parsed = JSON.parse(event.data as string)
            this.messageHandler(parsed)
          } catch {
            logger.warn(`[SSETransport:${this.config.name}] Non-JSON message`, {
              data: event.data,
            })
          }
        }
      })
    })
  }

  async send(message: unknown): Promise<void> {
    if (!this.connected) {
      throw new Error(`SSETransport:${this.config.name} not connected`)
    }
    const messageUrl = new URL('/message', this.baseUrl).toString()
    const response = await fetch(messageUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.headers,
      },
      body: JSON.stringify(message),
    })
    if (!response.ok) {
      throw new Error(`SSETransport:${this.config.name} send failed: ${response.status}`)
    }
  }

  onMessage(handler: (message: unknown) => void): void {
    this.messageHandler = handler
  }

  async close(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
    this.connected = false
  }

  isConnected(): boolean {
    return this.connected
  }
}
