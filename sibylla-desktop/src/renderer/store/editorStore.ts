import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

interface EditorState {
  isDirty: boolean
  isSaving: boolean
  lastSavedAt: number | null
  wordCount: number
  characterCount: number
  loadError: string | null
  saveError: string | null
}

interface EditorActions {
  setDirty: (dirty: boolean) => void
  setSaving: (saving: boolean) => void
  setSaved: () => void
  setLoadError: (error: string | null) => void
  setSaveError: (error: string | null) => void
  updateCounts: (words: number, chars: number) => void
  reset: () => void
}

type EditorStore = EditorState & EditorActions

const initialState: EditorState = {
  isDirty: false,
  isSaving: false,
  lastSavedAt: null,
  wordCount: 0,
  characterCount: 0,
  loadError: null,
  saveError: null,
}

export const useEditorStore = create<EditorStore>()(
  devtools(
    (set) => ({
      ...initialState,

      setDirty: (dirty) =>
        set({ isDirty: dirty }, false, 'editor/setDirty'),

      setSaving: (saving) =>
        set({ isSaving: saving }, false, 'editor/setSaving'),

      setSaved: () =>
        set(
          { isSaving: false, isDirty: false, lastSavedAt: Date.now(), saveError: null },
          false,
          'editor/setSaved'
        ),

      setLoadError: (error) =>
        set({ loadError: error }, false, 'editor/setLoadError'),

      setSaveError: (error) =>
        set({ saveError: error, isSaving: false }, false, 'editor/setSaveError'),

      updateCounts: (words, chars) =>
        set({ wordCount: words, characterCount: chars }, false, 'editor/updateCounts'),

      reset: () =>
        set(initialState, false, 'editor/reset'),
    }),
    { name: 'EditorStore' }
  )
)

export const selectIsDirty = (state: EditorStore) => state.isDirty
export const selectIsSaving = (state: EditorStore) => state.isSaving
export const selectLastSavedAt = (state: EditorStore) => state.lastSavedAt
export const selectWordCount = (state: EditorStore) => state.wordCount
export const selectCharacterCount = (state: EditorStore) => state.characterCount
export const selectLoadError = (state: EditorStore) => state.loadError
export const selectSaveError = (state: EditorStore) => state.saveError
