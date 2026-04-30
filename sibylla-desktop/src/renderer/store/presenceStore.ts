import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { FilteredPeerState } from '../../shared/types'

interface PresenceState {
  peers: FilteredPeerState[]
  isServiceAvailable: boolean
  isLoading: boolean
  error: string | null
}

interface PresenceActions {
  fetchPeers: () => Promise<void>
  setPeers: (peers: FilteredPeerState[]) => void
  setServiceAvailable: (available: boolean) => void
  getPeersViewingFile: (filePath: string) => FilteredPeerState[]
  reset: () => void
}

type PresenceStore = PresenceState & PresenceActions

const initialState: PresenceState = {
  peers: [],
  isServiceAvailable: false,
  isLoading: false,
  error: null,
}

let peersUpdatedUnsubscribe: (() => void) | null = null

export const usePresenceStore = create<PresenceStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchPeers: async () => {
        set({ isLoading: true, error: null }, false, 'presence/fetchStart')
        try {
          const response = await window.electronAPI.presence.getPeers()
          if (response.success && response.data) {
            set(
              {
                peers: response.data,
                isLoading: false,
                isServiceAvailable: true,
              },
              false,
              'presence/fetchSuccess',
            )
          }

          if (!peersUpdatedUnsubscribe) {
            peersUpdatedUnsubscribe = window.electronAPI.presence.onPeersUpdated((peers) => {
              set(
                { peers, isServiceAvailable: true },
                false,
                'presence/onPeersUpdated',
              )
            })
          }
        } catch (err) {
          set(
            { error: String(err), isLoading: false, isServiceAvailable: false },
            false,
            'presence/fetchError',
          )
        }
      },

      setPeers: (peers: FilteredPeerState[]) => {
        set({ peers }, false, 'presence/setPeers')
      },

      setServiceAvailable: (available: boolean) => {
        set({ isServiceAvailable: available }, false, 'presence/setServiceAvailable')
      },

      getPeersViewingFile: (filePath: string) => {
        return get().peers.filter(p => p.viewingFile === filePath)
      },

      reset: () => {
        if (peersUpdatedUnsubscribe) {
          peersUpdatedUnsubscribe()
          peersUpdatedUnsubscribe = null
        }
        set(initialState, false, 'presence/reset')
      },
    }),
    { name: 'PresenceStore' },
  ),
)

export type { PresenceStore, PresenceState, FilteredPeerState }
