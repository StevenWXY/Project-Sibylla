import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface DecisionOption {
  name: string
  pros?: string
  cons?: string
  risks?: string
}

interface DecisionLog {
  id: string
  title: string
  status: 'decided' | 'in-progress' | 'reverted'
  decidedAt: string
  decidedBy: string[]
  tags: string[]
  relatedFiles: string[]
  problem: string
  options: DecisionOption[]
  chosen: string
  reason: string
  actualResult?: string
  filePath: string
  updatedAt: number
}

interface CreateDecisionInput {
  title: string
  problem: string
  options: DecisionOption[]
  chosen: string
  reason: string
  decidedBy?: string[]
  tags?: string[]
  relatedFiles?: string[]
  location?: 'memory' | 'docs'
}

interface DecisionState {
  decisions: DecisionLog[]
  selectedDecision: DecisionLog | null
  isLoading: boolean
  filterTags: string[]
  searchQuery: string
  error: string | null
}

interface DecisionActions {
  fetchDecisions: () => Promise<void>
  getDecision: (id: string) => Promise<void>
  createDecision: (input: CreateDecisionInput) => Promise<void>
  updateOutcome: (id: string, result: string) => Promise<void>
  setFilterTags: (tags: string[]) => void
  setSearchQuery: (query: string) => void
  selectDecision: (decision: DecisionLog | null) => void
  reset: () => void
}

type DecisionStore = DecisionState & DecisionActions

const initialState: DecisionState = {
  decisions: [],
  selectedDecision: null,
  isLoading: false,
  filterTags: [],
  searchQuery: '',
  error: null,
}

export const useDecisionStore = create<DecisionStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchDecisions: async () => {
        set({ isLoading: true, error: null }, false, 'decision/fetchStart')
        try {
          const { filterTags, searchQuery } = get()
          const filters: Record<string, unknown> = {}
          if (filterTags.length > 0) filters.tags = filterTags
          if (searchQuery) filters.searchQuery = searchQuery
          filters.sortBy = 'date'
          filters.sortOrder = 'desc'

          const response = await window.electronAPI.decision.list(filters)
          if (response.success && response.data) {
            set(
              { decisions: response.data as DecisionLog[], isLoading: false },
              false,
              'decision/fetchSuccess',
            )
          } else {
            set(
              { isLoading: false, error: response.error?.message ?? 'Failed to fetch decisions' },
              false,
              'decision/fetchError',
            )
          }
        } catch (err) {
          set(
            { error: String(err), isLoading: false },
            false,
            'decision/fetchError',
          )
        }
      },

      getDecision: async (id: string) => {
        try {
          const response = await window.electronAPI.decision.get(id)
          if (response.success) {
            set(
              { selectedDecision: (response.data as DecisionLog | null) ?? null },
              false,
              'decision/getSuccess',
            )
          }
        } catch (err) {
          set({ error: String(err) }, false, 'decision/getError')
        }
      },

      createDecision: async (input: CreateDecisionInput) => {
        try {
          const response = await window.electronAPI.decision.create(input as Record<string, unknown>)
          if (response.success) {
            await get().fetchDecisions()
          }
        } catch (err) {
          set({ error: String(err) }, false, 'decision/createError')
        }
      },

      updateOutcome: async (id: string, result: string) => {
        try {
          const response = await window.electronAPI.decision.updateOutcome(id, result)
          if (response.success) {
            await get().getDecision(id)
            await get().fetchDecisions()
          }
        } catch (err) {
          set({ error: String(err) }, false, 'decision/updateOutcomeError')
        }
      },

      setFilterTags: (tags: string[]) => {
        set({ filterTags: tags }, false, 'decision/setFilterTags')
      },

      setSearchQuery: (query: string) => {
        set({ searchQuery: query }, false, 'decision/setSearchQuery')
      },

      selectDecision: (decision: DecisionLog | null) => {
        set({ selectedDecision: decision }, false, 'decision/selectDecision')
      },

      reset: () => {
        set(initialState, false, 'decision/reset')
      },
    }),
    { name: 'DecisionStore' },
  ),
)

export type { DecisionStore, DecisionState, DecisionLog, CreateDecisionInput, DecisionOption }
