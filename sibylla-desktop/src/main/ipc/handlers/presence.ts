import { BrowserWindow } from 'electron'
import type { PresenceStore } from '../../services/presence/presence-store'
import type { PresenceClient } from '../../services/presence/presence-client'
import type { PrivacyFilter } from '../../services/presence/privacy-filter'
import type { PresenceConfig } from '../../services/presence/types'
import type { MemberRole } from '../../../shared/types/member.types'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'

export function registerPresenceHandlers(
  ipcMainInstance: Electron.IpcMain,
  presenceStore: PresenceStore,
  presenceClient: PresenceClient,
  privacyFilter: PrivacyFilter,
  config: PresenceConfig,
  getViewerRole: () => MemberRole,
  mainWindowGetter: () => BrowserWindow | null,
): () => void {
  ipcMainInstance.handle(IPC_CHANNELS.PRESENCE_GET_PEERS, async () => {
    try {
      const peers = presenceStore.getPeers()
      const viewerRole = getViewerRole()
      return peers.map(peer => privacyFilter.filterPeerStateForViewer(peer, viewerRole))
    } catch (error) {
      logger.error('presence.ipc.error', {
        channel: 'presence:getPeers',
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })

  ipcMainInstance.handle(
    IPC_CHANNELS.PRESENCE_BROADCAST_VIEW,
    async (_event, { filePath }: { filePath: string | undefined }) => {
      try {
        const viewerRole = getViewerRole()
        if (!privacyFilter.shouldBroadcastViewingFile(viewerRole, config.broadcastEnabled)) {
          return
        }
        presenceClient.updateViewingFile(filePath)
      } catch (error) {
        logger.error('presence.ipc.error', {
          channel: 'presence:broadcastView',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.PRESENCE_TOGGLE_BROADCAST,
        async (_event, { enabled }: { enabled: boolean }) => {
        try {
          config.broadcastEnabled = enabled
          presenceClient.broadcastState({ broadcastEnabled: enabled })
      } catch (error) {
        logger.error('presence.ipc.error', {
          channel: 'presence:toggleBroadcast',
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  const pushPeersUpdate = () => {
    const peers = presenceStore.getPeers()
    const viewerRole = getViewerRole()
    const filtered = peers.map(peer => privacyFilter.filterPeerStateForViewer(peer, viewerRole))

    const win = mainWindowGetter()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.PRESENCE_PEERS_UPDATED, filtered)
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && window !== win) {
        window.webContents.send(IPC_CHANNELS.PRESENCE_PEERS_UPDATED, filtered)
      }
    }
  }

  const unsubOnline = presenceStore.onPeerUpdate(pushPeersUpdate)
  const unsubOffline = presenceStore.onPeerRemove(pushPeersUpdate)

  pushPeersUpdate()

  return () => {
    unsubOnline()
    unsubOffline()
  }
}
