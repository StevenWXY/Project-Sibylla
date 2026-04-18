import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { SearchIndexStatus, SearchIndexProgress } from '../../shared/types'
import type { SearchResultItem } from '../components/studio/types'

const SEARCH_DEBOUNCE_MS = 260

interface SearchState {
  query: string
  results: SearchResultItem[]
  isSearching: boolean
  indexStatus: SearchIndexStatus | null
  isIndexing: boolean
  selectedIndex: number
  error: string | null
}

interface SearchActions {
  setQuery: (query: string) => void
  search: (query: string) => Promise<void>
  selectResult: (index: number) => void
  clearResults: () => void
  fetchIndexStatus: () => Promise<void>
  reindex: () => Promise<void>
  setIndexProgress: (progress: SearchIndexProgress) => void
}

type SearchStore = SearchState & SearchActions

const initialState: SearchState = {
  query: '',
  results: [],
  isSearching: false,
  indexStatus: null,
  isIndexing: false,
  selectedIndex: -1,
  error: null,
}

export const useSearchStore = create<SearchStore>()(
  devtools(
    (set, get) => {
      let debounceTimer: ReturnType<typeof setTimeout> | null = null

      return {
      ...initialState,

      setQuery: (query) => {
        set({ query }, false, 'search/setQuery')

        if (debounceTimer) {
          clearTimeout(debounceTimer)
        }

        const trimmed = query.trim()
        if (!trimmed) {
          set({ results: [], isSearching: false, error: null }, false, 'search/clearQuery')
          return
        }

        set({ isSearching: true }, false, 'search/debounceStart')
        debounceTimer = setTimeout(() => {
          void get().search(trimmed)
        }, SEARCH_DEBOUNCE_MS)
      },

      search: async (query) => {
        if (!query.trim()) {
          set({ results: [], isSearching: false }, false, 'search/emptyQuery')
          return
        }

        try {
          const response = await window.electronAPI.search.query({
            query: query.trim(),
            limit: 20,
          })

          if (response.success && response.data) {
            const results: SearchResultItem[] = response.data.map((r) => ({
              id: r.id,
              path: r.path,
              lineNumber: r.lineNumber ?? 0,
              preview: r.snippet.replace(/<\/?mark>/g, ''),
              snippet: r.snippet,
              rank: r.rank,
              matchCount: r.matchCount,
            }))
            set({ results, isSearching: false, error: null }, false, 'search/success')
          } else {
            set(
              { results: [], isSearching: false, error: response.error?.message ?? 'Search failed' },
              false,
              'search/error',
            )
          }
        } catch (error) {
          set(
            { results: [], isSearching: false, error: error instanceof Error ? error.message : 'Search failed' },
            false,
            'search/error',
          )
        }
      },

      selectResult: (index) => {
        set({ selectedIndex: index }, false, 'search/selectResult')
      },

      clearResults: () => {
        set({ results: [], query: '', isSearching: false, selectedIndex: -1, error: null }, false, 'search/clear')
      },

      fetchIndexStatus: async () => {
        try {
          const response = await window.electronAPI.search.indexStatus()
          if (response.success && response.data) {
            set({ indexStatus: response.data }, false, 'search/fetchIndexStatus')
          }
        } catch {
          // Silent fail for status check
        }
      },

      reindex: async () => {
        set({ isIndexing: true }, false, 'search/reindexStart')
        try {
          await window.electronAPI.search.reindex()
        } finally {
          set({ isIndexing: false }, false, 'search/reindexEnd')
        }
      },

      setIndexProgress: (progress) => {
        set(
          { isIndexing: progress.phase !== 'complete' && progress.phase !== 'error' },
          false,
          'search/setIndexProgress',
        )
      },
    }
    },
    { name: 'SearchStore' },
  ),
)

export const selectResults = (state: SearchStore) => state.results
export const selectIsSearching = (state: SearchStore) => state.isSearching
export const selectQuery = (state: SearchStore) => state.query
export const selectIndexStatus = (state: SearchStore) => state.indexStatus
export const selectIsIndexing = (state: SearchStore) => state.isIndexing
