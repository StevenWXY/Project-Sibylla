import { ChildProcess, spawn } from 'child_process'
import { createInterface } from 'readline'
import type { MCPTransport } from './types'
import type { MCPServerConfig } from '../types'
import { logger } from '../../../utils/logger'

export class StdioTransport implements MCPTransport {
  private process: ChildProcess | null = null
  private messageHandler: ((message: unknown) => void) | null = null
  private connected = false

  constructor(private readonly config: MCPServerConfig) {}

  async connect(): Promise<void> {
    if (!this.config.command) {
      throw new Error(`StdioTransport: command is required for server "${this.config.name}"`)
    }

    this.process = spawn(this.config.command, this.config.args ?? [], {
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.process.on('error', (err) => {
      logger.error(`[StdioTransport:${this.config.name}] Process error`, { error: err.message })
      this.connected = false
    })

    this.process.on('exit', (code) => {
      logger.info(`[StdioTransport:${this.config.name}] Process exited`, { code })
      this.connected = false
    })

    if (this.process.stderr) {
      this.process.stderr.on('data', (data: Buffer) => {
        logger.debug(`[StdioTransport:${this.config.name}] stderr`, {
          output: data.toString().trim(),
        })
      })
    }

    if (this.process.stdout) {
      const rl = createInterface({ input: this.process.stdout })
      rl.on('line', (line: string) => {
        if (line.trim() && this.messageHandler) {
          try {
            const parsed = JSON.parse(line)
            this.messageHandler(parsed)
          } catch {
            logger.warn(`[StdioTransport:${this.config.name}] Non-JSON line`, { line })
          }
        }
      })
    }

    this.connected = true
  }

  async send(message: unknown): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error(`StdioTransport:${this.config.name} not connected`)
    }
    const payload = JSON.stringify(message) + '\n'
    return new Promise((resolve, reject) => {
      this.process!.stdin!.write(payload, (err) => {
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
    if (!this.process) return
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL')
        }
        resolve()
      }, 2000)

      this.process!.on('exit', () => {
        clearTimeout(timeout)
        this.connected = false
        this.process = null
        resolve()
      })

      this.process!.kill('SIGTERM')
    })
  }

  isConnected(): boolean {
    return this.connected && this.process !== null && !this.process.killed
  }
}
