import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { CommandShared } from '../../shared/types'

interface CommandPaletteState {
  isOpen: boolean
  query: string
  results: CommandShared[]
  selectedIndex: number
  loading: boolean
}

interface CommandPaletteActions {
  open: () => void
  close: () => void
  toggle: () => void
  setQuery: (query: string) => Promise<void>
  selectNext: () => void
  selectPrev: () => void
  setSelectedIndex: (index: number) => void
  executeSelected: () => Promise<void>
  executeById: (id: string) => Promise<void>
}

type CommandStore = CommandPaletteState & CommandPaletteActions

const useCommandStore = create<CommandStore>()(
  devtools(
    (set, get) => ({
      isOpen: false,
      query: '',
      results: [],
      selectedIndex: 0,
      loading: false,

      open: () => {
        set({ isOpen: true, query: '', selectedIndex: 0 }, false, 'command/open')
        get().setQuery('')
      },

      close: () => {
        set({ isOpen: false, query: '', results: [] }, false, 'command/close')
      },

      toggle: () => {
        if (get().isOpen) {
          get().close()
        } else {
          get().open()
        }
      },

      setQuery: async (query: string) => {
        set({ query, loading: true, selectedIndex: 0 }, false, 'command/setQuery')
        try {
          const response = await window.electronAPI.command.search(query)
          if (response.success && response.data) {
            set({ results: response.data, loading: false }, false, 'command/setQuerySuccess')
          } else {
            set({ results: [], loading: false }, false, 'command/setQueryEmpty')
          }
        } catch {
          set({ results: [], loading: false }, false, 'command/setQueryError')
        }
      },

      selectNext: () => {
        set(
          { selectedIndex: Math.min(get().selectedIndex + 1, get().results.length - 1) },
          false,
          'command/selectNext',
        )
      },

      selectPrev: () => {
        set(
          { selectedIndex: Math.max(get().selectedIndex - 1, 0) },
          false,
          'command/selectPrev',
        )
      },

      setSelectedIndex: (index: number) => {
        set({ selectedIndex: index }, false, 'command/setSelectedIndex')
      },

      executeSelected: async () => {
        const cmd = get().results[get().selectedIndex]
        if (cmd) {
          await get().executeById(cmd.id)
        }
      },

      executeById: async (id: string) => {
        try {
          await window.electronAPI.command.execute(id)
        } catch {
          // error handled silently, command execution logs via tracer
        }
        get().close()
      },
    }),
    { name: 'CommandStore' },
  ),
)

export { useCommandStore }
export type { CommandStore, CommandPaletteState, CommandPaletteActions }
