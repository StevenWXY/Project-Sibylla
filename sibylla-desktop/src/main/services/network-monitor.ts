/**
 * NetworkMonitor Service
 *
 * Independent network status monitoring service that uses periodic HTTP HEAD
 * probes to detect connectivity changes. Emits typed events on state transitions:
 * - 'status-changed': fired on any online/offline transition
 * - 'reconnected': fired when transitioning from offline to online
 * - 'disconnected': fired when transitioning from online to offline
 *
 * Designed to complement ElectronNetworkProvider's synchronous isOnline() check.
 * NetworkMonitor provides proactive detection via polling, while ElectronNetworkProvider
 * remains the lightweight synchronous check used inside scheduledSync().
 *
 * @see plans/phase1-task006-auto-sync-push-pull-plan.md §5 NetworkMonitor design
 */

import { EventEmitter } from 'events'
import { logger } from '../utils/logger'
import type { TypedEventEmitter } from './utils/typed-event-emitter'

const LOG_PREFIX = '[NetworkMonitor]'

export interface NetworkMonitorConfig {
  /** Health check URL for HTTP HEAD probe */
  readonly checkUrl: string
  /** Polling interval in milliseconds */
  readonly checkIntervalMs: number
  /** Request timeout in milliseconds */
  readonly requestTimeoutMs: number
}

export interface NetworkMonitorEvents {
  'status-changed': [isOnline: boolean]
  'reconnected': []
  'disconnected': []
}

const DEFAULT_NETWORK_MONITOR_CONFIG: NetworkMonitorConfig = {
  checkUrl: 'https://api.sibylla.io/health',
  checkIntervalMs: 10000,
  requestTimeoutMs: 5000,
}

export class NetworkMonitor extends (EventEmitter as new () => TypedEventEmitter<NetworkMonitorEvents> & EventEmitter) {
  private isOnline: boolean = false
  private checkInterval: ReturnType<typeof setInterval> | null = null
  private readonly config: NetworkMonitorConfig

  constructor(config?: Partial<NetworkMonitorConfig>) {
    super()
    this.config = { ...DEFAULT_NETWORK_MONITOR_CONFIG, ...config }
  }

  start(): void {
    if (this.checkInterval !== null) {
      logger.warn(`${LOG_PREFIX} Already started, ignoring start() call`)
      return
    }

    logger.info(`${LOG_PREFIX} Starting`, {
      checkUrl: this.config.checkUrl,
      checkIntervalMs: this.config.checkIntervalMs,
    })

    this.checkOnlineStatus().catch((error: unknown) => {
      logger.error(`${LOG_PREFIX} Initial check failed`, { error })
    })

    this.checkInterval = setInterval(() => {
      this.checkOnlineStatus().catch((error: unknown) => {
        logger.error(`${LOG_PREFIX} Periodic check failed`, { error })
      })
    }, this.config.checkIntervalMs)
  }

  stop(): void {
    if (this.checkInterval !== null) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
      logger.info(`${LOG_PREFIX} Stopped`)
    }
  }

  getIsOnline(): boolean {
    return this.isOnline
  }

  private async checkOnlineStatus(): Promise<void> {
    const wasOnline = this.isOnline

    try {
      const response = await fetch(this.config.checkUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.config.requestTimeoutMs),
      })
      this.isOnline = response.ok
    } catch {
      this.isOnline = false
    }

    if (wasOnline !== this.isOnline) {
      logger.info(`${LOG_PREFIX} Status changed`, {
        wasOnline,
        isOnline: this.isOnline,
      })

      this.emit('status-changed', this.isOnline)

      if (this.isOnline) {
        this.emit('reconnected')
      } else {
        this.emit('disconnected')
      }
    }
  }
}
