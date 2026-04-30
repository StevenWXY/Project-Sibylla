import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

type OverlayId = 'onboarding' | 'suggestion'

interface OverlayState {
  activeOverlay: OverlayId | null
  requestOverlay: (id: OverlayId) => boolean
  releaseOverlay: (id: OverlayId) => void
}

type OverlayStore = OverlayState

export const useOverlayStore = create<OverlayStore>()(
  devtools(
    (set, get) => ({
      activeOverlay: null,

      requestOverlay: (id: OverlayId): boolean => {
        const { activeOverlay } = get()
        if (activeOverlay !== null) return false
        set({ activeOverlay: id }, false, 'overlay/request')
        return true
      },

      releaseOverlay: (id: OverlayId) => {
        const { activeOverlay } = get()
        if (activeOverlay === id) {
          set({ activeOverlay: null }, false, 'overlay/release')
        }
      },
    }),
    { name: 'OverlayStore' },
  ),
)
