import type { AppEventBus } from '../event-bus'
import { logger } from '../../utils/logger'
import type { PresenceConfig, PresenceMessage, SelfState, PeerState } from './types'
import { PresenceStore } from './presence-store'
import { PrivacyFilter } from './privacy-filter'
import { DEFAULT_PRESENCE_CONFIG } from './constants'

type WebSocketLike = {
  send: (data: string) => void
  close: () => void
  onopen: (() => void) | null
  onmessage: ((event: { data: string }) => void) | null
  onclose: (() => void) | null
  onerror: ((err: unknown) => void) | null
}

export class PresenceClient {
  private readonly config: PresenceConfig
  private readonly eventBus: AppEventBus
  private readonly store: PresenceStore
  private ws: WebSocketLike | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private idleTimer: ReturnType<typeof setInterval> | null = null
  private editingTimer: ReturnType<typeof setTimeout> | null = null
  private viewDebounceTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectAttempt = 0
  private _serviceAvailable = false
  private _lastActivityAt = Date.now()
  private _currentSelf: SelfState | null = null
  private consecutiveHeartbeatFailures = 0
  private pendingViewingFile: string | undefined
  private connectArgs: { workspaceId: string; token: string } | null = null

  constructor(
    config: Partial<PresenceConfig>,
    eventBus: AppEventBus,
    store: PresenceStore,
    _privacyFilter: PrivacyFilter,
  ) {
    this.config = { ...DEFAULT_PRESENCE_CONFIG, ...config }
    this.eventBus = eventBus
    this.store = store
  }

  async connect(workspaceId: string, userId: string, token: string): Promise<void> {
    this.connectArgs = { workspaceId, token }
    this._currentSelf = {
      userId,
      status: 'online',
      viewingFile: undefined,
      isEditing: false,
      broadcastEnabled: this.config.broadcastEnabled,
    }

    // NOTE: WebSocket URL must include auth token as query param (standard limitation).
    // The token in a WebSocket URL is unavoidable without a custom auth handshake.
    // For SSE fallback, we only pass workspaceId — heartbeat uses Authorization header below.
    const wsUrl = `${this.config.serviceUrl}/presence?workspaceId=${workspaceId}&token=${token}`
    const sseUrl = `${this.config.serviceUrl}/presence/stream?workspaceId=${workspaceId}`

    try {
      await this.setupWebSocket(wsUrl)
    } catch {
      logger.info('[PresenceClient] WebSocket failed, trying SSE fallback')
      try {
        this.setupSSE(sseUrl, token)
      } catch {
        this._serviceAvailable = false
        this.store.setServiceAvailable(false)
        logger.warn('[PresenceClient] Both WebSocket and SSE failed, Presence unavailable')
      }
    }
  }

  private setupWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const ws = this.createWebSocket(url)
        let resolved = false

        ws.onopen = () => {
          this.ws = ws
          this._serviceAvailable = true
          this.store.setServiceAvailable(true)
          this.consecutiveHeartbeatFailures = 0
          this.reconnectAttempt = 0
          this.startHeartbeat()
          this.startIdleDetection()
          this.broadcastState({ status: 'online' })
          resolved = true
          resolve()
          this.eventBus.emitEvent({
            type: 'presence.user-online',
            source: 'presence-client',
            payload: {
              userId: this._currentSelf?.userId ?? '',
              userName: this._currentSelf?.userId,
            },
          })
        }

        ws.onmessage = (event: { data: string }) => {
          try {
            const message = JSON.parse(event.data) as PresenceMessage
            this.handleMessage(message)
          } catch (err) {
            logger.debug('[PresenceClient] Failed to parse message', { error: err })
          }
        }

        ws.onclose = () => {
          if (this.ws === ws) this.ws = null
          if (!resolved) {
            reject(new Error('WebSocket closed before open'))
            return
          }
          this.reconnect()
        }

        ws.onerror = (err: unknown) => {
          logger.debug('[PresenceClient] WebSocket error', { error: err })
          if (!resolved) reject(err)
        }

        setTimeout(() => {
          if (!resolved) {
            reject(new Error('WebSocket connection timeout'))
          }
        }, 3000)
      } catch (err) {
        reject(err)
      }
    })
  }

  private setupSSE(url: string, token: string): void {
    const eventSource = this.createEventSource(url)
    let connected = false

    eventSource.onmessage = (event: MessageEvent) => {
      if (!connected) {
        connected = true
        this._serviceAvailable = true
        this.store.setServiceAvailable(true)
        this.startHeartbeat()
        this.startIdleDetection()
      }
      try {
        const message = JSON.parse(event.data as string) as PresenceMessage
        this.handleMessage(message)
      } catch (err) {
        logger.debug('[PresenceClient] SSE parse error', { error: err })
      }
    }

    eventSource.onerror = () => {
      eventSource.close()
      this._serviceAvailable = false
      this.store.setServiceAvailable(false)
      this.reconnect()
    }

    this.ws = {
      send: (data: string) => {
        // Token no longer in URL; use Authorization header instead
        fetch(`${this.config.serviceUrl}/presence/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: data,
        }).catch(() => {
          this.consecutiveHeartbeatFailures++
        })
      },
      close: () => eventSource.close(),
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
    } satisfies WebSocketLike

    this._serviceAvailable = true
    this.store.setServiceAvailable(true)
    this.broadcastState({ status: 'online' })
  }

  private handleMessage(message: PresenceMessage): void {
    this.consecutiveHeartbeatFailures = 0

    if (message.type === 'heartbeat') {
      const payload = message.payload as PeerState
      const existing = this.store.getPeerById(payload.userId)
      if (existing) {
        this.store.updatePeer({ ...existing, lastActiveAt: Date.now() })
      }
      return
    }

    if (message.type === 'state-change') {
      const peerState = message.payload as PeerState
      const existing = this.store.getPeerById(peerState.userId)
      if (!existing) {
        this.eventBus.emitEvent({
          type: 'presence.user-online',
          source: 'presence-client',
          payload: {
            userId: peerState.userId,
            userName: peerState.displayName,
          },
        })
      }
      this.store.updatePeer(peerState)
      return
    }

    if (message.type === 'bye') {
      const payload = message.payload as PeerState
      this.store.removePeer(payload.userId)
    }
  }

  broadcastState(partial: Partial<SelfState>): void {
    if (!this._currentSelf || !this.ws) return

    Object.assign(this._currentSelf, partial)

    const payload: Partial<SelfState> = { ...partial }
    if (!this._currentSelf.broadcastEnabled) {
      delete payload.viewingFile
      delete payload.isEditing
    }

    const message: PresenceMessage = {
      type: 'state-change',
      payload: { ...this._currentSelf, ...payload } as SelfState,
      timestamp: Date.now(),
    }

    try {
      this.ws.send(JSON.stringify(message))
    } catch (err) {
      logger.debug('[PresenceClient] Failed to send state', { error: err })
    }
  }

  updateViewingFile(filePath: string | undefined): void {
    this._lastActivityAt = Date.now()
    this.pendingViewingFile = filePath

    if (this.viewDebounceTimer) clearTimeout(this.viewDebounceTimer)
    this.viewDebounceTimer = setTimeout(() => {
      this.broadcastState({ viewingFile: this.pendingViewingFile })
      this.viewDebounceTimer = null
    }, this.config.viewUpdateDebounceMs)
  }

  setEditing(isEditing: boolean): void {
    this._lastActivityAt = Date.now()

    if (this.editingTimer) {
      clearTimeout(this.editingTimer)
      this.editingTimer = null
    }

    this.broadcastState({ isEditing })

    if (isEditing) {
      this.editingTimer = setTimeout(() => {
        this.broadcastState({ isEditing: false })
        this.editingTimer = null
      }, this.config.editingTimeoutMs)
    }
  }

  isServiceAvailable(): boolean {
    return this._serviceAvailable
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      try {
        const byeMessage: PresenceMessage = {
          type: 'bye',
          payload: this._currentSelf ?? { userId: '', status: 'offline', isEditing: false, broadcastEnabled: false },
          timestamp: Date.now(),
        }
        this.ws.send(JSON.stringify(byeMessage))
      } catch {
        // best-effort
      }
      this.ws.close()
      this.ws = null
    }

    this._serviceAvailable = false
    this.stopHeartbeat()
    this.stopIdleDetection()
    if (this.editingTimer) {
      clearTimeout(this.editingTimer)
      this.editingTimer = null
    }
    if (this.viewDebounceTimer) {
      clearTimeout(this.viewDebounceTimer)
      this.viewDebounceTimer = null
    }
  }

  shutdown(): void {
    void this.disconnect()
    this.store.shutdown()
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws) return

      const heartbeatMsg: PresenceMessage = {
        type: 'heartbeat',
        payload: this._currentSelf ?? { userId: '', status: 'online', isEditing: false, broadcastEnabled: false },
        timestamp: Date.now(),
      }

      try {
        this.ws.send(JSON.stringify(heartbeatMsg))
        this.consecutiveHeartbeatFailures = 0
      } catch {
        this.consecutiveHeartbeatFailures++
        if (this.consecutiveHeartbeatFailures >= 3) {
          logger.warn('[PresenceClient] 3 consecutive heartbeat failures, reconnecting')
          this.consecutiveHeartbeatFailures = 0
          this.reconnect()
        }
      }
    }, this.config.heartbeatIntervalMs)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private startIdleDetection(): void {
    this.stopIdleDetection()
    this.idleTimer = setInterval(() => {
      if (!this._currentSelf) return
      const idleMs = Date.now() - this._lastActivityAt
      if (idleMs >= this.config.idleTimeoutMs && this._currentSelf.status === 'online') {
        this.broadcastState({ status: 'idle' })
      }
    }, this.config.idleTimeoutMs)
  }

  private stopIdleDetection(): void {
    if (this.idleTimer) {
      clearInterval(this.idleTimer)
      this.idleTimer = null
    }
  }

  private reconnect(): void {
    if (this.reconnectAttempt >= this.config.reconnectMaxRetries) {
      this._serviceAvailable = false
      this.store.setServiceAvailable(false)
      logger.warn('[PresenceClient] Max reconnect attempts reached')
      return
    }

    this.reconnectAttempt++
    const delay = this.config.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempt - 1)
    logger.info('[PresenceClient] Reconnecting', {
      attempt: this.reconnectAttempt,
      delayMs: delay,
    })

    setTimeout(() => {
      if (this._currentSelf && this.connectArgs) {
        void this.connect(
          this.connectArgs.workspaceId,
          this._currentSelf.userId,
          this.connectArgs.token,
        )
      }
    }, delay)
  }

  protected createWebSocket(_url: string): WebSocketLike {
    throw new Error('WebSocket not available in this environment')
  }

  protected createEventSource(_url: string): EventSource {
    return new EventSource(_url)
  }
}
