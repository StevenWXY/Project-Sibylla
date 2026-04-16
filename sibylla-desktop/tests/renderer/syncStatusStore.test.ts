import { describe, expect, it, beforeEach } from 'vitest'
import { useSyncStatusStore, selectStatus, selectLastSyncedAt, selectErrorMessage, selectConflictFiles } from '../../src/renderer/store/syncStatusStore'
import type { SyncStatusData } from '../../src/shared/types'

describe('syncStatusStore', () => {
  beforeEach(() => {
    useSyncStatusStore.getState().reset()
  })

  it('has correct initial state', () => {
    const state = useSyncStatusStore.getState()
    expect(state.status).toBe('idle')
    expect(state.lastSyncedAt).toBeNull()
    expect(state.errorMessage).toBeNull()
    expect(state.conflictFiles).toEqual([])
  })

  it('setState updates all fields from SyncStatusData', () => {
    const data: SyncStatusData = {
      status: 'error',
      timestamp: 1000,
      message: 'Network error',
      conflictFiles: ['/a.md', '/b.md'],
    }
    useSyncStatusStore.getState().setState(data)

    const state = useSyncStatusStore.getState()
    expect(state.status).toBe('error')
    expect(state.errorMessage).toBe('Network error')
    expect(state.conflictFiles).toEqual(['/a.md', '/b.md'])
  })

  it('updates lastSyncedAt only when status is synced', () => {
    useSyncStatusStore.getState().setState({ status: 'syncing', timestamp: 1000 })
    expect(useSyncStatusStore.getState().lastSyncedAt).toBeNull()

    useSyncStatusStore.getState().setState({ status: 'synced', timestamp: 2000 })
    expect(useSyncStatusStore.getState().lastSyncedAt).toBe(2000)

    useSyncStatusStore.getState().setState({ status: 'error', timestamp: 3000 })
    expect(useSyncStatusStore.getState().lastSyncedAt).toBeNull()
  })

  it('sets errorMessage to null when message is undefined', () => {
    useSyncStatusStore.getState().setState({ status: 'synced', timestamp: 1000 })
    expect(useSyncStatusStore.getState().errorMessage).toBeNull()
  })

  it('sets conflictFiles to empty when conflictFiles is undefined', () => {
    useSyncStatusStore.getState().setState({ status: 'syncing', timestamp: 1000 })
    expect(useSyncStatusStore.getState().conflictFiles).toEqual([])
  })

  it('reset clears all state back to initial', () => {
    useSyncStatusStore.getState().setState({
      status: 'conflict',
      timestamp: 5000,
      message: 'Conflict detected',
      conflictFiles: ['/x.md'],
    })
    useSyncStatusStore.getState().reset()

    const state = useSyncStatusStore.getState()
    expect(state.status).toBe('idle')
    expect(state.lastSyncedAt).toBeNull()
    expect(state.errorMessage).toBeNull()
    expect(state.conflictFiles).toEqual([])
  })

  it('multiple setState calls only keep the latest', () => {
    useSyncStatusStore.getState().setState({ status: 'syncing', timestamp: 1000 })
    useSyncStatusStore.getState().setState({ status: 'synced', timestamp: 2000 })
    useSyncStatusStore.getState().setState({ status: 'offline', timestamp: 3000 })

    expect(useSyncStatusStore.getState().status).toBe('offline')
    expect(useSyncStatusStore.getState().lastSyncedAt).toBeNull()
  })

  describe('selectors', () => {
    it('selectStatus returns status', () => {
      useSyncStatusStore.getState().setState({ status: 'syncing', timestamp: 1 })
      const result = selectStatus(useSyncStatusStore.getState())
      expect(result).toBe('syncing')
    })

    it('selectLastSyncedAt returns lastSyncedAt', () => {
      useSyncStatusStore.getState().setState({ status: 'synced', timestamp: 42 })
      const result = selectLastSyncedAt(useSyncStatusStore.getState())
      expect(result).toBe(42)
    })

    it('selectErrorMessage returns errorMessage', () => {
      useSyncStatusStore.getState().setState({ status: 'error', timestamp: 1, message: 'fail' })
      const result = selectErrorMessage(useSyncStatusStore.getState())
      expect(result).toBe('fail')
    })

    it('selectConflictFiles returns conflictFiles', () => {
      useSyncStatusStore.getState().setState({ status: 'conflict', timestamp: 1, conflictFiles: ['/a.md'] })
      const result = selectConflictFiles(useSyncStatusStore.getState())
      expect(result).toEqual(['/a.md'])
    })
  })
})
