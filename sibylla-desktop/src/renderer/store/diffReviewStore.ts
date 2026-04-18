import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { ParsedFileDiff } from '../components/studio/types'

interface DiffReviewState {
  proposals: readonly ParsedFileDiff[]
  activeIndex: number
  isApplying: boolean
  isEditing: boolean
  editingContent: string
  appliedPaths: readonly string[]
  failedPath: string | null
  errorMessage: string | null
}

interface DiffReviewActions {
  setProposals: (proposals: ParsedFileDiff[]) => void
  setActiveIndex: (index: number) => void
  applyProposal: (filePath: string) => Promise<void>
  applyAll: () => Promise<void>
  startEditing: () => void
  cancelEditing: () => void
  updateEditingContent: (content: string) => void
  applyEdited: () => Promise<void>
  rollbackApplied: () => Promise<void>
  dismiss: () => void
  clearError: () => void
}

type DiffReviewStore = DiffReviewState & DiffReviewActions

const initialState: DiffReviewState = {
  proposals: [],
  activeIndex: 0,
  isApplying: false,
  isEditing: false,
  editingContent: '',
  appliedPaths: [],
  failedPath: null,
  errorMessage: null,
}

export const useDiffReviewStore = create<DiffReviewStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setProposals: (proposals) =>
        set({ ...initialState, proposals }, false, 'diffReview/setProposals'),

      setActiveIndex: (index) =>
        set({ activeIndex: index, isEditing: false }, false, 'diffReview/setActiveIndex'),

      applyProposal: async (filePath) => {
        const state = get()
        const proposal = state.proposals.find((p) => p.filePath === filePath)
        if (!proposal) return

        set({ isApplying: true, failedPath: null, errorMessage: null }, false, 'diffReview/applyStart')

        try {
          const response = await window.electronAPI.file.write(
            proposal.filePath,
            proposal.fullNewContent,
            { atomic: true, createDirs: true }
          )

          if (!response.success) {
            set(
              {
                isApplying: false,
                failedPath: proposal.filePath,
                errorMessage: response.error?.message ?? '写入文件失败',
              },
              false,
              'diffReview/applyFailed'
            )
            return
          }

          const newApplied = [...state.appliedPaths, proposal.filePath]
          const allApplied = newApplied.length >= state.proposals.length

          set(
            {
              isApplying: false,
              appliedPaths: newApplied,
              ...(allApplied ? { proposals: [], activeIndex: 0 } : {}),
            },
            false,
            'diffReview/applied'
          )
        } catch (error) {
          set(
            {
              isApplying: false,
              failedPath: proposal.filePath,
              errorMessage: error instanceof Error ? error.message : '写入文件失败',
            },
            false,
            'diffReview/applyError'
          )
        }
      },

      applyAll: async () => {
        const state = get()
        set({ isApplying: true, failedPath: null, errorMessage: null }, false, 'diffReview/applyAllStart')

        const applied: string[] = [...state.appliedPaths]

        for (const proposal of state.proposals) {
          if (applied.includes(proposal.filePath)) continue

          try {
            const response = await window.electronAPI.file.write(
              proposal.filePath,
              proposal.fullNewContent,
              { atomic: true, createDirs: true }
            )

            if (!response.success) {
              set(
                {
                  isApplying: false,
                  appliedPaths: applied,
                  failedPath: proposal.filePath,
                  errorMessage: response.error?.message ?? '写入文件失败',
                },
                false,
                'diffReview/applyAllFailed'
              )
              return
            }

            applied.push(proposal.filePath)
          } catch (error) {
            set(
              {
                isApplying: false,
                appliedPaths: applied,
                failedPath: proposal.filePath,
                errorMessage: error instanceof Error ? error.message : '写入文件失败',
              },
              false,
              'diffReview/applyAllError'
            )
            return
          }
        }

        set(
          {
            isApplying: false,
            appliedPaths: applied,
            proposals: [],
            activeIndex: 0,
          },
          false,
          'diffReview/applyAllDone'
        )
      },

      startEditing: () => {
        const state = get()
        const proposal = state.proposals[state.activeIndex]
        if (!proposal) return
        set(
          { isEditing: true, editingContent: proposal.fullNewContent },
          false,
          'diffReview/startEditing'
        )
      },

      cancelEditing: () =>
        set({ isEditing: false, editingContent: '' }, false, 'diffReview/cancelEditing'),

      updateEditingContent: (content) =>
        set({ editingContent: content }, false, 'diffReview/updateEditingContent'),

      applyEdited: async () => {
        const state = get()
        const proposal = state.proposals[state.activeIndex]
        if (!proposal) return

        set({ isApplying: true, failedPath: null, errorMessage: null }, false, 'diffReview/applyEditedStart')

        try {
          const response = await window.electronAPI.file.write(
            proposal.filePath,
            state.editingContent,
            { atomic: true, createDirs: true }
          )

          if (!response.success) {
            set(
              {
                isApplying: false,
                failedPath: proposal.filePath,
                errorMessage: response.error?.message ?? '写入文件失败',
              },
              false,
              'diffReview/applyEditedFailed'
            )
            return
          }

          const newApplied = [...state.appliedPaths, proposal.filePath]
          set(
            {
              isApplying: false,
              isEditing: false,
              editingContent: '',
              appliedPaths: newApplied,
            },
            false,
            'diffReview/applyEditedDone'
          )
        } catch (error) {
          set(
            {
              isApplying: false,
              failedPath: proposal.filePath,
              errorMessage: error instanceof Error ? error.message : '写入文件失败',
            },
            false,
            'diffReview/applyEditedError'
          )
        }
      },

      rollbackApplied: async () => {
        const state = get()
        set({ isApplying: true }, false, 'diffReview/rollbackStart')

        for (const appliedPath of state.appliedPaths) {
          const proposal = state.proposals.find((p) => p.filePath === appliedPath)
          if (!proposal) continue

          try {
            await window.electronAPI.file.write(
              proposal.filePath,
              proposal.fullOldContent,
              { atomic: true }
            )
          } catch {
            // continue rolling back remaining files
          }
        }

        set(
          {
            isApplying: false,
            appliedPaths: [],
            failedPath: null,
            errorMessage: null,
          },
          false,
          'diffReview/rollbackDone'
        )
      },

      dismiss: () => set(initialState, false, 'diffReview/dismiss'),

      clearError: () =>
        set({ failedPath: null, errorMessage: null }, false, 'diffReview/clearError'),
    }),
    { name: 'DiffReviewStore' }
  )
)

export const selectProposals = (state: DiffReviewStore) => state.proposals
export const selectActiveIndex = (state: DiffReviewStore) => state.activeIndex
export const selectIsApplying = (state: DiffReviewStore) => state.isApplying
export const selectIsEditing = (state: DiffReviewStore) => state.isEditing
export const selectEditingContent = (state: DiffReviewStore) => state.editingContent
export const selectAppliedPaths = (state: DiffReviewStore) => state.appliedPaths
export const selectFailedPath = (state: DiffReviewStore) => state.failedPath
export const selectErrorMessage = (state: DiffReviewStore) => state.errorMessage

export type { DiffReviewStore, DiffReviewState, DiffReviewActions }
