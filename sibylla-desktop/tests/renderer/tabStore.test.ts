import { describe, it, expect, beforeEach } from 'vitest'
import { useTabStore, selectActiveTab, selectDirtyTabIds, selectHasDirtyTabs } from '../../src/renderer/store/tabStore'

describe('tabStore', () => {
  beforeEach(() => {
    useTabStore.setState({ tabs: [], activeTabId: null })
  })

  describe('initial state', () => {
    it('has empty tabs and null activeTabId', () => {
      const state = useTabStore.getState()
      expect(state.tabs).toEqual([])
      expect(state.activeTabId).toBeNull()
    })
  })

  describe('openTab', () => {
    it('creates a new tab and sets it as active', () => {
      useTabStore.getState().openTab('docs/readme.md', 'readme.md')

      const state = useTabStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0]).toMatchObject({
        id: 'docs/readme.md',
        filePath: 'docs/readme.md',
        fileName: 'readme.md',
        extension: 'md',
        isDirty: false,
        isPinned: false,
      })
      expect(state.activeTabId).toBe('docs/readme.md')
    })

    it('switches to existing tab without creating a duplicate', () => {
      useTabStore.getState().openTab('docs/readme.md', 'readme.md')
      useTabStore.getState().openTab('docs/other.md', 'other.md')

      useTabStore.getState().openTab('docs/readme.md', 'readme.md')

      const state = useTabStore.getState()
      expect(state.tabs).toHaveLength(2)
      expect(state.activeTabId).toBe('docs/readme.md')
    })

    it('derives extension from fileName when not provided', () => {
      useTabStore.getState().openTab('app.tsx', 'app.tsx')
      expect(useTabStore.getState().tabs[0]?.extension).toBe('tsx')

      useTabStore.getState().openTab('config.json', 'config.json')
      expect(useTabStore.getState().tabs[1]?.extension).toBe('json')
    })

    it('uses provided extension over derived one', () => {
      useTabStore.getState().openTab('Makefile', 'Makefile', 'make')
      expect(useTabStore.getState().tabs[0]?.extension).toBe('make')
    })

    it('inserts new tab after pinned tabs', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')

      useTabStore.getState().pinTab('a.md')

      useTabStore.getState().openTab('c.md', 'c.md')

      const state = useTabStore.getState()
      const ids = state.tabs.map((t) => t.id)
      expect(ids).toEqual(['a.md', 'b.md', 'c.md'])
    })

    it('normalizes path as tab ID', () => {
      useTabStore.getState().openTab('/docs/readme.md', 'readme.md')
      const state = useTabStore.getState()
      expect(state.tabs[0]?.id).toBe('docs/readme.md')
    })
  })

  describe('closeTab', () => {
    it('removes a tab and returns true', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      const result = useTabStore.getState().closeTab('a.md')
      expect(result).toBe(true)
      expect(useTabStore.getState().tabs).toHaveLength(0)
      expect(useTabStore.getState().activeTabId).toBeNull()
    })

    it('activates right neighbor when closing active tab', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().openTab('c.md', 'c.md')

      useTabStore.getState().closeTab('b.md')

      const state = useTabStore.getState()
      expect(state.tabs).toHaveLength(2)
      expect(state.activeTabId).toBe('c.md')
    })

    it('activates left neighbor when closing rightmost active tab', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')

      useTabStore.getState().closeTab('b.md')

      const state = useTabStore.getState()
      expect(state.activeTabId).toBe('a.md')
    })

    it('sets activeTabId to null when closing the last tab', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().closeTab('a.md')
      expect(useTabStore.getState().activeTabId).toBeNull()
    })

    it('returns false when tab is dirty and force is false', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().setDirty('a.md', true)

      const result = useTabStore.getState().closeTab('a.md')
      expect(result).toBe(false)
      expect(useTabStore.getState().tabs).toHaveLength(1)
    })

    it('closes dirty tab when force is true', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().setDirty('a.md', true)

      const result = useTabStore.getState().closeTab('a.md', true)
      expect(result).toBe(true)
      expect(useTabStore.getState().tabs).toHaveLength(0)
    })

    it('returns false when tab is pinned and force is false', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().pinTab('a.md')

      const result = useTabStore.getState().closeTab('a.md')
      expect(result).toBe(false)
    })

    it('closes pinned tab when force is true', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().pinTab('a.md')

      const result = useTabStore.getState().closeTab('a.md', true)
      expect(result).toBe(true)
      expect(useTabStore.getState().tabs).toHaveLength(0)
    })

    it('returns true for non-existent tab', () => {
      const result = useTabStore.getState().closeTab('nonexistent.md')
      expect(result).toBe(true)
    })

    it('does not change activeTabId when closing a non-active tab', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')

      useTabStore.getState().closeTab('a.md')
      expect(useTabStore.getState().activeTabId).toBe('b.md')
    })
  })

  describe('switchTab', () => {
    it('sets the tab as active and updates lastAccessedAt', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')

      const before = Date.now()
      useTabStore.getState().switchTab('a.md')

      const state = useTabStore.getState()
      expect(state.activeTabId).toBe('a.md')
      expect(state.tabs[0]?.lastAccessedAt).toBeGreaterThanOrEqual(before)
    })

    it('ignores non-existent tab', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().switchTab('nonexistent.md')
      expect(useTabStore.getState().activeTabId).toBe('a.md')
    })
  })

  describe('setDirty', () => {
    it('sets isDirty on the specified tab', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().setDirty('a.md', true)
      expect(useTabStore.getState().tabs[0]?.isDirty).toBe(true)

      useTabStore.getState().setDirty('a.md', false)
      expect(useTabStore.getState().tabs[0]?.isDirty).toBe(false)
    })
  })

  describe('pinTab / unpinTab', () => {
    it('pins a tab and moves it to the pinned section', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')

      useTabStore.getState().pinTab('b.md')

      const state = useTabStore.getState()
      expect(state.tabs[0]?.id).toBe('b.md')
      expect(state.tabs[0]?.isPinned).toBe(true)
    })

    it('unpins a tab and moves it to unpinned section start', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().pinTab('b.md')

      useTabStore.getState().unpinTab('b.md')

      const state = useTabStore.getState()
      expect(state.tabs.find((t) => t.id === 'b.md')?.isPinned).toBe(false)
      expect(state.tabs.map((t) => t.id)).toEqual(['b.md', 'a.md'])
    })

    it('does nothing when pinning an already pinned tab', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().pinTab('a.md')
      const before = useTabStore.getState().tabs

      useTabStore.getState().pinTab('a.md')

      expect(useTabStore.getState().tabs).toEqual(before)
    })
  })

  describe('reorderTabs', () => {
    it('reorders tabs within the same region', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().openTab('c.md', 'c.md')

      useTabStore.getState().reorderTabs(0, 2)

      const ids = useTabStore.getState().tabs.map((t) => t.id)
      expect(ids).toEqual(['b.md', 'c.md', 'a.md'])
    })

    it('does nothing when fromIndex equals toIndex', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')

      const before = useTabStore.getState().tabs
      useTabStore.getState().reorderTabs(0, 0)
      expect(useTabStore.getState().tabs).toEqual(before)
    })

    it('prevents non-pinned tab from entering pinned region', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().pinTab('a.md')

      const before = [...useTabStore.getState().tabs]
      useTabStore.getState().reorderTabs(1, 0)
      expect(useTabStore.getState().tabs).toEqual(before)
    })

    it('prevents pinned tab from entering non-pinned region', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().pinTab('a.md')

      const before = [...useTabStore.getState().tabs]
      useTabStore.getState().reorderTabs(0, 1)
      expect(useTabStore.getState().tabs).toEqual(before)
    })
  })

  describe('closeOtherTabs', () => {
    it('keeps only the specified tab and pinned tabs', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().openTab('c.md', 'c.md')

      const result = useTabStore.getState().closeOtherTabs('b.md')
      expect(result).toBe(true)

      const state = useTabStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0]?.id).toBe('b.md')
      expect(state.activeTabId).toBe('b.md')
    })

    it('keeps pinned tabs even when not the keep target', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().openTab('c.md', 'c.md')
      useTabStore.getState().pinTab('a.md')

      useTabStore.getState().closeOtherTabs('c.md')

      const ids = useTabStore.getState().tabs.map((t) => t.id)
      expect(ids).toContain('a.md')
      expect(ids).toContain('c.md')
      expect(ids).toHaveLength(2)
    })

    it('returns false when other tabs are dirty', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().setDirty('a.md', true)

      const result = useTabStore.getState().closeOtherTabs('b.md')
      expect(result).toBe(false)
    })
  })

  describe('closeTabsToRight', () => {
    it('closes tabs to the right of the specified tab', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().openTab('c.md', 'c.md')
      useTabStore.getState().openTab('d.md', 'd.md')

      useTabStore.getState().switchTab('b.md')

      const result = useTabStore.getState().closeTabsToRight('b.md')
      expect(result).toBe(true)

      const ids = useTabStore.getState().tabs.map((t) => t.id)
      expect(ids).toEqual(['a.md', 'b.md'])
    })

    it('returns false when right tabs contain dirty tabs', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().openTab('c.md', 'c.md')
      useTabStore.getState().setDirty('c.md', true)

      const result = useTabStore.getState().closeTabsToRight('a.md')
      expect(result).toBe(false)
      expect(useTabStore.getState().tabs).toHaveLength(3)
    })

    it('does not close pinned tabs to the right', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().openTab('c.md', 'c.md')
      useTabStore.getState().pinTab('c.md')

      useTabStore.getState().closeTabsToRight('a.md')

      const ids = useTabStore.getState().tabs.map((t) => t.id)
      expect(ids).toContain('c.md')
    })
  })

  describe('closeAllTabs', () => {
    it('closes all non-pinned tabs', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().pinTab('a.md')

      const result = useTabStore.getState().closeAllTabs()
      expect(result).toBe(true)

      const state = useTabStore.getState()
      expect(state.tabs).toHaveLength(1)
      expect(state.tabs[0]?.id).toBe('a.md')
    })

    it('returns false when any non-pinned tab is dirty', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().setDirty('a.md', true)

      const result = useTabStore.getState().closeAllTabs()
      expect(result).toBe(false)
    })

    it('closes everything with force=true even if dirty', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().setDirty('a.md', true)

      const result = useTabStore.getState().closeAllTabs(true)
      expect(result).toBe(true)
      expect(useTabStore.getState().tabs).toHaveLength(0)
    })
  })

  describe('getTab', () => {
    it('returns the tab by ID', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      const tab = useTabStore.getState().getTab('a.md')
      expect(tab?.fileName).toBe('a.md')
    })

    it('returns undefined for non-existent tab', () => {
      expect(useTabStore.getState().getTab('x.md')).toBeUndefined()
    })
  })

  describe('markTabDeleted', () => {
    it('force-closes the tab matching the file path', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().setDirty('a.md', true)
      useTabStore.getState().openTab('b.md', 'b.md')

      useTabStore.getState().markTabDeleted('a.md')

      expect(useTabStore.getState().tabs).toHaveLength(1)
      expect(useTabStore.getState().tabs[0]?.id).toBe('b.md')
    })
  })

  describe('derived getters', () => {
    it('activeTab returns the active tab', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')

      expect(useTabStore.getState().activeTab()?.id).toBe('b.md')
    })

    it('activeTab returns undefined when no active tab', () => {
      expect(useTabStore.getState().activeTab()).toBeUndefined()
    })

    it('dirtyTabs returns only dirty tabs', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().setDirty('a.md', true)

      const dirty = useTabStore.getState().dirtyTabs()
      expect(dirty).toHaveLength(1)
      expect(dirty[0]?.id).toBe('a.md')
    })

    it('pinnedTabs returns only pinned tabs', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().pinTab('a.md')

      const pinned = useTabStore.getState().pinnedTabs()
      expect(pinned).toHaveLength(1)
      expect(pinned[0]?.id).toBe('a.md')
    })
  })

  describe('edge cases', () => {
    it('handles path with special characters', () => {
      useTabStore.getState().openTab('docs/my file (1).md', 'my file (1).md')
      const tab = useTabStore.getState().tabs[0]
      expect(tab?.fileName).toBe('my file (1).md')
      expect(tab?.id).toBe('docs/my file (1).md')
    })

    it('handles closeTab for middle tab activation', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().openTab('c.md', 'c.md')
      useTabStore.getState().switchTab('b.md')

      useTabStore.getState().closeTab('b.md')

      expect(useTabStore.getState().activeTabId).toBe('c.md')
    })

    it('handles closeTab for rightmost tab activation', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().switchTab('b.md')

      useTabStore.getState().closeTab('b.md')

      expect(useTabStore.getState().activeTabId).toBe('a.md')
    })

    it('closeAllTabs with only pinned tabs sets active to first pinned', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().pinTab('a.md')

      useTabStore.getState().closeAllTabs()

      expect(useTabStore.getState().tabs).toHaveLength(1)
      expect(useTabStore.getState().activeTabId).toBe('a.md')
    })

    it('closeTabsToRight with tab not found returns true', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      expect(useTabStore.getState().closeTabsToRight('nonexistent.md')).toBe(true)
    })

    it('markTabDeleted normalizes the file path', () => {
      useTabStore.getState().openTab('docs/a.md', 'a.md')
      useTabStore.getState().setDirty('docs/a.md', true)

      useTabStore.getState().markTabDeleted('/docs/a.md')

      expect(useTabStore.getState().tabs).toHaveLength(0)
    })

    it('reorderTabs with out-of-bounds indices returns unchanged', () => {
      useTabStore.getState().openTab('a.md', 'a.md')

      const before = useTabStore.getState().tabs
      useTabStore.getState().reorderTabs(-1, 5)
      expect(useTabStore.getState().tabs).toEqual(before)
    })

    it('closeTabsToRight preserves pinned tabs to the right', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().openTab('b.md', 'b.md')
      useTabStore.getState().openTab('c.md', 'c.md')
      useTabStore.getState().pinTab('c.md')

      useTabStore.getState().closeTabsToRight('a.md')

      const ids = useTabStore.getState().tabs.map((t) => t.id)
      expect(ids).toContain('c.md')
      expect(ids).not.toContain('b.md')
    })

    it('handles files without extension', () => {
      useTabStore.getState().openTab('Makefile', 'Makefile')
      expect(useTabStore.getState().tabs[0]?.extension).toBe('')
    })
  })

  describe('selectors', () => {
    it('selectActiveTab returns active tab', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      const state = useTabStore.getState()
      expect(selectActiveTab(state)?.id).toBe('a.md')
    })

    it('selectDirtyTabIds returns dirty tab IDs', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      useTabStore.getState().setDirty('a.md', true)
      const state = useTabStore.getState()
      expect(selectDirtyTabIds(state)).toEqual(['a.md'])
    })

    it('selectHasDirtyTabs returns boolean', () => {
      useTabStore.getState().openTab('a.md', 'a.md')
      expect(selectHasDirtyTabs(useTabStore.getState())).toBe(false)

      useTabStore.getState().setDirty('a.md', true)
      expect(selectHasDirtyTabs(useTabStore.getState())).toBe(true)
    })
  })
})
