import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface TabInfo {
  id: string
  filePath: string
  fileName: string
  extension: string
  isDirty: boolean
  isPinned: boolean
  lastAccessedAt: number
}

export type TabContextAction =
  | 'close'
  | 'closeOthers'
  | 'closeRight'
  | 'closeAll'
  | 'pin'
  | 'unpin'
  | 'copyPath'
  | 'revealInTree'

export interface CloseConfirmProps {
  fileName: string
  onSave: () => Promise<void>
  onDiscard: () => void
  onCancel: () => void
}

export interface TabState {
  tabs: TabInfo[]
  activeTabId: string | null

  openTab: (filePath: string, fileName: string, extension?: string) => void
  closeTab: (tabId: string, force?: boolean) => boolean
  switchTab: (tabId: string) => void
  setDirty: (tabId: string, isDirty: boolean) => void
  pinTab: (tabId: string) => void
  unpinTab: (tabId: string) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  closeOtherTabs: (keepTabId: string) => boolean
  closeTabsToRight: (tabId: string) => boolean
  closeAllTabs: (force?: boolean) => boolean
  getTab: (tabId: string) => TabInfo | undefined
  markTabDeleted: (filePath: string) => void

  activeTab: () => TabInfo | undefined
  dirtyTabs: () => TabInfo[]
  pinnedTabs: () => TabInfo[]
}

function deriveExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex <= 0) return ''
  return fileName.slice(dotIndex + 1).toLowerCase()
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\//, '')
}

const initialState = {
  tabs: [] as TabInfo[],
  activeTabId: null as string | null,
}

export const useTabStore = create<TabState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      openTab: (filePath, fileName, extension?) => {
        const tabId = normalizePath(filePath)
        const existing = get().tabs.find((t) => t.id === tabId)

        if (existing) {
          set(
            (state) => ({
              activeTabId: tabId,
              tabs: state.tabs.map((t) =>
                t.id === tabId ? { ...t, lastAccessedAt: Date.now() } : t
              ),
            }),
            false,
            'tab/openTab(existing)'
          )
          return
        }

        const newTab: TabInfo = {
          id: tabId,
          filePath: tabId,
          fileName,
          extension: extension ?? deriveExtension(fileName),
          isDirty: false,
          isPinned: false,
          lastAccessedAt: Date.now(),
        }

        set(
          (state) => {
            const nextTabs = [...state.tabs, newTab]
            return { tabs: nextTabs, activeTabId: tabId }
          },
          false,
          'tab/openTab(new)'
        )
      },

      closeTab: (tabId, force = false) => {
        const { tabs, activeTabId } = get()
        const tab = tabs.find((t) => t.id === tabId)
        if (!tab) return true
        if (tab.isPinned && !force) return false
        if (tab.isDirty && !force) return false

        const tabIndex = tabs.findIndex((t) => t.id === tabId)
        const nextTabs = tabs.filter((t) => t.id !== tabId)

        let nextActiveId = activeTabId
        if (activeTabId === tabId) {
          if (nextTabs.length === 0) {
            nextActiveId = null
          } else {
            const rightNeighbor = nextTabs[tabIndex] ?? null
            const leftNeighbor = tabIndex > 0 ? nextTabs[tabIndex - 1] : null
            nextActiveId = rightNeighbor?.id ?? leftNeighbor?.id ?? null
          }
        }

        set(
          { tabs: nextTabs, activeTabId: nextActiveId },
          false,
          'tab/closeTab'
        )
        return true
      },

      switchTab: (tabId) => {
        const { tabs } = get()
        if (!tabs.some((t) => t.id === tabId)) return

        set(
          (state) => ({
            activeTabId: tabId,
            tabs: state.tabs.map((t) =>
              t.id === tabId ? { ...t, lastAccessedAt: Date.now() } : t
            ),
          }),
          false,
          'tab/switchTab'
        )
      },

      setDirty: (tabId, isDirty) => {
        set(
          (state) => ({
            tabs: state.tabs.map((t) =>
              t.id === tabId ? { ...t, isDirty } : t
            ),
          }),
          false,
          'tab/setDirty'
        )
      },

      pinTab: (tabId) => {
        set(
          (state) => {
            const tab = state.tabs.find((t) => t.id === tabId)
            if (!tab || tab.isPinned) return state

            const updated = state.tabs.map((t) =>
              t.id === tabId ? { ...t, isPinned: true } : t
            )
            const pinned = updated.filter((t) => t.isPinned)
            const unpinned = updated.filter((t) => !t.isPinned)
            return { tabs: [...pinned, ...unpinned] }
          },
          false,
          'tab/pinTab'
        )
      },

      unpinTab: (tabId) => {
        set(
          (state) => {
            const tab = state.tabs.find((t) => t.id === tabId)
            if (!tab || !tab.isPinned) return state

            const updated = state.tabs.map((t) =>
              t.id === tabId ? { ...t, isPinned: false } : t
            )
            const pinned = updated.filter((t) => t.isPinned)
            const unpinned = updated.filter((t) => !t.isPinned)
            return { tabs: [...pinned, ...unpinned] }
          },
          false,
          'tab/unpinTab'
        )
      },

      reorderTabs: (fromIndex, toIndex) => {
        set(
          (state) => {
            if (fromIndex === toIndex) return state
            if (fromIndex < 0 || fromIndex >= state.tabs.length) return state
            if (toIndex < 0 || toIndex >= state.tabs.length) return state

            const sourceTab = state.tabs[fromIndex]
            if (!sourceTab) return state

            const pinnedCount = state.tabs.filter((t) => t.isPinned).length

            if (!sourceTab.isPinned && toIndex < pinnedCount) return state
            if (sourceTab.isPinned && toIndex >= pinnedCount) return state

            const nextTabs = [...state.tabs]
            const [moved] = nextTabs.splice(fromIndex, 1)
            nextTabs.splice(toIndex, 0, moved)
            return { tabs: nextTabs }
          },
          false,
          'tab/reorderTabs'
        )
      },

      closeOtherTabs: (keepTabId) => {
        const { tabs } = get()
        const toClose = tabs.filter(
          (t) => t.id !== keepTabId && !t.isPinned
        )
        if (toClose.some((t) => t.isDirty)) return false

        const onlyKeepAndPinned = [
          ...tabs.filter((t) => t.isPinned),
          ...tabs.filter((t) => !t.isPinned && t.id === keepTabId),
        ]

        set(
          { tabs: onlyKeepAndPinned, activeTabId: keepTabId },
          false,
          'tab/closeOtherTabs'
        )
        return true
      },

      closeTabsToRight: (tabId) => {
        const { tabs, activeTabId } = get()
        const tabIndex = tabs.findIndex((t) => t.id === tabId)
        if (tabIndex === -1) return true

        const toClose = tabs.slice(tabIndex + 1).filter((t) => !t.isPinned)
        if (toClose.some((t) => t.isDirty)) return false

        const keep = tabs.filter((t) => {
          if (t.isPinned) return true
          const idx = tabs.indexOf(t)
          return idx <= tabIndex
        })

        let nextActiveId = activeTabId
        if (nextActiveId && !keep.some((t) => t.id === nextActiveId)) {
          nextActiveId = tabId
        }

        set(
          { tabs: keep, activeTabId: nextActiveId },
          false,
          'tab/closeTabsToRight'
        )
        return true
      },

      closeAllTabs: (force = false) => {
        const { tabs } = get()
        const nonPinned = tabs.filter((t) => !t.isPinned)

        if (!force && nonPinned.some((t) => t.isDirty)) return false

        const pinned = tabs.filter((t) => t.isPinned)
        set(
          { tabs: pinned, activeTabId: pinned.length > 0 ? pinned[0]!.id : null },
          false,
          'tab/closeAllTabs'
        )
        return true
      },

      getTab: (tabId) => {
        return get().tabs.find((t) => t.id === tabId)
      },

      markTabDeleted: (filePath) => {
        const tabId = normalizePath(filePath)
        get().closeTab(tabId, true)
      },

      activeTab: () => {
        const { tabs, activeTabId } = get()
        return tabs.find((t) => t.id === activeTabId)
      },

      dirtyTabs: () => {
        return get().tabs.filter((t) => t.isDirty)
      },

      pinnedTabs: () => {
        return get().tabs.filter((t) => t.isPinned)
      },
    }),
    { name: 'TabStore' }
  )
)

export const selectTabs = (state: TabState) => state.tabs
export const selectActiveTabId = (state: TabState) => state.activeTabId
export const selectActiveTab = (state: TabState) =>
  state.tabs.find((t) => t.id === state.activeTabId)
export const selectDirtyTabIds = (state: TabState) =>
  state.tabs.filter((t) => t.isDirty).map((t) => t.id)
export const selectHasDirtyTabs = (state: TabState) =>
  state.tabs.some((t) => t.isDirty)
