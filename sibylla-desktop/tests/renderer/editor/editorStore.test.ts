import { describe, it, expect, beforeEach } from 'vitest'
import { useEditorStore } from '../../../src/renderer/store/editorStore'

describe('editorStore', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
  })

  it('has correct initial state', () => {
    const state = useEditorStore.getState()
    expect(state.isDirty).toBe(false)
    expect(state.isSaving).toBe(false)
    expect(state.lastSavedAt).toBeNull()
    expect(state.wordCount).toBe(0)
    expect(state.characterCount).toBe(0)
    expect(state.loadError).toBeNull()
    expect(state.saveError).toBeNull()
  })

  it('setDirty updates dirty state', () => {
    useEditorStore.getState().setDirty(true)
    expect(useEditorStore.getState().isDirty).toBe(true)

    useEditorStore.getState().setDirty(false)
    expect(useEditorStore.getState().isDirty).toBe(false)
  })

  it('setSaving updates saving state', () => {
    useEditorStore.getState().setSaving(true)
    expect(useEditorStore.getState().isSaving).toBe(true)

    useEditorStore.getState().setSaving(false)
    expect(useEditorStore.getState().isSaving).toBe(false)
  })

  it('setSaved clears dirty and saving, sets lastSavedAt', () => {
    useEditorStore.getState().setDirty(true)
    useEditorStore.getState().setSaving(true)

    const before = Date.now()
    useEditorStore.getState().setSaved()
    const after = Date.now()

    const state = useEditorStore.getState()
    expect(state.isDirty).toBe(false)
    expect(state.isSaving).toBe(false)
    expect(state.lastSavedAt).toBeGreaterThanOrEqual(before)
    expect(state.lastSavedAt).toBeLessThanOrEqual(after)
    expect(state.saveError).toBeNull()
  })

  it('setLoadError sets error', () => {
    useEditorStore.getState().setLoadError('File not found')
    expect(useEditorStore.getState().loadError).toBe('File not found')

    useEditorStore.getState().setLoadError(null)
    expect(useEditorStore.getState().loadError).toBeNull()
  })

  it('setSaveError sets error and clears saving', () => {
    useEditorStore.getState().setSaving(true)
    useEditorStore.getState().setSaveError('Write failed')

    const state = useEditorStore.getState()
    expect(state.saveError).toBe('Write failed')
    expect(state.isSaving).toBe(false)
  })

  it('updateCounts sets word and character counts', () => {
    useEditorStore.getState().updateCounts(42, 256)
    const state = useEditorStore.getState()
    expect(state.wordCount).toBe(42)
    expect(state.characterCount).toBe(256)
  })

  it('reset restores initial state', () => {
    useEditorStore.getState().setDirty(true)
    useEditorStore.getState().setSaving(true)
    useEditorStore.getState().updateCounts(10, 50)
    useEditorStore.getState().setLoadError('err')
    useEditorStore.getState().setSaveError('err')

    useEditorStore.getState().reset()

    const state = useEditorStore.getState()
    expect(state.isDirty).toBe(false)
    expect(state.isSaving).toBe(false)
    expect(state.lastSavedAt).toBeNull()
    expect(state.wordCount).toBe(0)
    expect(state.characterCount).toBe(0)
    expect(state.loadError).toBeNull()
    expect(state.saveError).toBeNull()
  })
})
