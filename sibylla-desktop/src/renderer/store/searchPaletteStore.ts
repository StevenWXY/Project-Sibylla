import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface SearchPaletteState {
  isOpen: boolean
}

interface SearchPaletteActions {
  open: () => void
  close: () => void
  toggle: () => void
}

type SearchPaletteStore = SearchPaletteState & SearchPaletteActions

export const useSearchPaletteStore = create<SearchPaletteStore>()(
  devtools(
    (set, get) => ({
      isOpen: false,

      open: () => {
        set({ isOpen: true }, false, 'searchPalette/open')
      },

      close: () => {
        set({ isOpen: false }, false, 'searchPalette/close')
      },

      toggle: () => {
        set({ isOpen: !get().isOpen }, false, 'searchPalette/toggle')
      },
    }),
    { name: 'SearchPaletteStore' },
  ),
)
