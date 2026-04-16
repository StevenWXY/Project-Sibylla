import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useSyncStatus } from '../../src/renderer/hooks/useSyncStatus'
import { useSyncStatusStore } from '../../src/renderer/store/syncStatusStore'
import type { SyncStatusData } from '../../src/shared/types'

describe('useSyncStatus', () => {
  let statusChangeCallback: ((data: SyncStatusData) => void) | null = null

  beforeEach(() => {
    useSyncStatusStore.getState().reset()
    statusChangeCallback = null

    vi.mocked(window.electronAPI.sync.onStatusChange).mockImplementation((cb) => {
      statusChangeCallback = cb
      return vi.fn()
    })
  })

  it('registers onStatusChange listener on mount', () => {
    renderHook(() => useSyncStatus())
    expect(window.electronAPI.sync.onStatusChange).toHaveBeenCalledOnce()
  })

  it('updates store when IPC event fires', () => {
    renderHook(() => useSyncStatus())

    const data: SyncStatusData = {
      status: 'synced',
      timestamp: 1000,
    }

    statusChangeCallback?.(data)

    const state = useSyncStatusStore.getState()
    expect(state.status).toBe('synced')
    expect(state.lastSyncedAt).toBe(1000)
  })

  it('resets store on unmount', () => {
    const { unmount } = renderHook(() => useSyncStatus())

    statusChangeCallback?.({ status: 'synced', timestamp: 1000 })
    expect(useSyncStatusStore.getState().status).toBe('synced')

    unmount()

    expect(useSyncStatusStore.getState().status).toBe('idle')
    expect(useSyncStatusStore.getState().lastSyncedAt).toBeNull()
  })

  it('only keeps latest state from multiple events', () => {
    renderHook(() => useSyncStatus())

    statusChangeCallback?.({ status: 'syncing', timestamp: 1000 })
    statusChangeCallback?.({ status: 'synced', timestamp: 2000 })
    statusChangeCallback?.({ status: 'offline', timestamp: 3000 })

    const state = useSyncStatusStore.getState()
    expect(state.status).toBe('offline')
    expect(state.lastSyncedAt).toBeNull()
  })

  it('handles error status with message', () => {
    renderHook(() => useSyncStatus())

    statusChangeCallback?.({
      status: 'error',
      timestamp: 1000,
      message: 'Connection refused',
    })

    const state = useSyncStatusStore.getState()
    expect(state.status).toBe('error')
    expect(state.errorMessage).toBe('Connection refused')
  })

  it('handles conflict status with conflictFiles', () => {
    renderHook(() => useSyncStatus())

    statusChangeCallback?.({
      status: 'conflict',
      timestamp: 1000,
      conflictFiles: ['/a.md', '/b.md'],
    })

    const state = useSyncStatusStore.getState()
    expect(state.status).toBe('conflict')
    expect(state.conflictFiles).toEqual(['/a.md', '/b.md'])
  })
})
