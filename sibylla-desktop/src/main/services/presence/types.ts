import type { PresenceStatus } from '../../../shared/types'

export type { PresenceStatus }

export interface PeerState {
  userId: string
  displayName: string
  avatar: string
  status: PresenceStatus
  viewingFile?: string
  isEditing: boolean
  lastActiveAt: number
}

export interface SelfState {
  userId: string
  status: PresenceStatus
  viewingFile?: string
  isEditing: boolean
  broadcastEnabled: boolean
}

export interface PresenceMessage {
  type: 'heartbeat' | 'state-change' | 'bye'
  payload: PeerState | SelfState
  timestamp: number
}

export interface PresenceConfig {
  serviceUrl: string
  heartbeatIntervalMs: number
  idleTimeoutMs: number
  editingTimeoutMs: number
  viewUpdateDebounceMs: number
  reconnectMaxRetries: number
  reconnectBaseDelayMs: number
  broadcastEnabled: boolean
}

export type { FilteredPeerState } from '../../../shared/types'
