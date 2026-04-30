import type { AppEventBus } from '../event-bus'
import type { PeerState, PresenceStatus } from './types'
import { PEER_TTL_MS, PRESENCE_MAX_PEERS } from './constants'

export class PresenceStore {
  private readonly peers = new Map<string, PeerState>()
  private readonly eventBus: AppEventBus
  private ttlTimer: ReturnType<typeof setInterval> | null = null
  private _serviceAvailable = false
  private readonly updateListeners = new Set<() => void>()
  private readonly removeListeners = new Set<() => void>()

  constructor(eventBus: AppEventBus) {
    this.eventBus = eventBus
  }

  initialize(): void {
    this.peers.clear()
    if (this.ttlTimer) clearInterval(this.ttlTimer)
    this.ttlTimer = setInterval(() => this.expireStalePeers(), 30000)
  }

  onPeerUpdate(listener: () => void): () => void {
    this.updateListeners.add(listener)
    return () => { this.updateListeners.delete(listener) }
  }

  onPeerRemove(listener: () => void): () => void {
    this.removeListeners.add(listener)
    return () => { this.removeListeners.delete(listener) }
  }

  updatePeer(peerState: PeerState): void {
    const existing = this.peers.get(peerState.userId)
    const prevStatus = existing?.status
    const prevIsEditing = existing?.isEditing ?? false
    const prevViewingFile = existing?.viewingFile

    if (this.peers.size >= PRESENCE_MAX_PEERS && !existing) {
      const oldest = this.findOldestPeer()
      if (oldest) {
        this.eventBus.emitEvent({
          type: 'presence.user-offline',
          source: 'presence-store',
          payload: { userId: oldest.userId },
        })
        this.peers.delete(oldest.userId)
      }
    }

    this.peers.set(peerState.userId, { ...peerState })

    if (!existing) {
      this.notifyUpdateListeners()
      return
    }

    if (
      prevStatus !== 'offline' &&
      peerState.status === 'offline'
    ) {
      this.eventBus.emitEvent({
        type: 'presence.user-offline',
        source: 'presence-store',
        payload: { userId: peerState.userId },
      })
    }

    if (!prevIsEditing && peerState.isEditing) {
      this.eventBus.emitEvent({
        type: 'presence.user-editing',
        source: 'presence-store',
        payload: {
          userId: peerState.userId,
          userName: peerState.displayName,
          filePath: peerState.viewingFile ?? '',
        },
      })
    }

    if (prevViewingFile !== peerState.viewingFile && peerState.viewingFile) {
      this.eventBus.emitEvent({
        type: 'presence.user-viewing',
        source: 'presence-store',
        payload: {
          userId: peerState.userId,
          userName: peerState.displayName,
          filePath: peerState.viewingFile,
        },
      })
    }

    this.notifyUpdateListeners()
  }

  removePeer(userId: string): void {
    const peer = this.peers.get(userId)
    if (!peer) return
    peer.status = 'offline' as PresenceStatus
    peer.lastActiveAt = Date.now()
    this.notifyRemoveListeners()
  }

  getPeers(): PeerState[] {
    const result: PeerState[] = []
    for (const peer of this.peers.values()) {
      if (peer.status !== 'offline') result.push(peer)
    }
    return result
  }

  getOnlineMembers(): PeerState[] {
    const result: PeerState[] = []
    for (const peer of this.peers.values()) {
      if (peer.status === 'online') result.push(peer)
    }
    return result
  }

  getPeersViewingFile(filePath: string): PeerState[] {
    const result: PeerState[] = []
    for (const peer of this.peers.values()) {
      if (peer.viewingFile === filePath && peer.status !== 'offline') {
        result.push(peer)
      }
    }
    return result
  }

  getPeerById(userId: string): PeerState | undefined {
    return this.peers.get(userId)
  }

  setServiceAvailable(available: boolean): void {
    this._serviceAvailable = available
  }

  isServiceAvailable(): boolean {
    return this._serviceAvailable
  }

  clear(): void {
    for (const peer of this.peers.values()) {
      if (peer.status !== 'offline') {
        this.eventBus.emitEvent({
          type: 'presence.user-offline',
          source: 'presence-store',
          payload: { userId: peer.userId },
        })
      }
    }
    this.peers.clear()
  }

  shutdown(): void {
    if (this.ttlTimer) {
      clearInterval(this.ttlTimer)
      this.ttlTimer = null
    }
    this.clear()
  }

  private expireStalePeers(): void {
    const now = Date.now()
    for (const [userId, peer] of this.peers) {
      if (
        peer.status !== 'offline' &&
        now - peer.lastActiveAt > PEER_TTL_MS
      ) {
        peer.status = 'offline'
        peer.lastActiveAt = now
        this.eventBus.emitEvent({
          type: 'presence.user-offline',
          source: 'presence-store',
          payload: { userId },
        })
      }
    }
  }

  private findOldestPeer(): PeerState | undefined {
    let oldest: PeerState | undefined
    for (const peer of this.peers.values()) {
      if (!oldest || peer.lastActiveAt < oldest.lastActiveAt) {
        oldest = peer
      }
    }
    return oldest
  }

  private notifyUpdateListeners(): void {
    for (const listener of this.updateListeners) {
      try { listener() } catch { /* skip */ }
    }
  }

  private notifyRemoveListeners(): void {
    for (const listener of this.removeListeners) {
      try { listener() } catch { /* skip */ }
    }
  }
}
