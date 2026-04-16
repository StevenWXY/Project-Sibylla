import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SyncStatusIndicator } from '../../src/renderer/components/statusbar/SyncStatusIndicator'
import { useSyncStatusStore } from '../../src/renderer/store/syncStatusStore'
import type { SyncStatusData } from '../../src/shared/types'

function setStatus(data: SyncStatusData): void {
  useSyncStatusStore.getState().setState(data)
}

describe('SyncStatusIndicator', () => {
  beforeEach(() => {
    useSyncStatusStore.getState().reset()
  })

  it('renders idle status with 等待同步 label', () => {
    render(<SyncStatusIndicator />)
    expect(screen.getByText('等待同步')).toBeInTheDocument()
  })

  it('renders synced status with 已同步 label', () => {
    setStatus({ status: 'synced', timestamp: Date.now() })
    render(<SyncStatusIndicator />)
    expect(screen.getByText('已同步')).toBeInTheDocument()
  })

  it('renders syncing status with 同步中 label', () => {
    setStatus({ status: 'syncing', timestamp: Date.now() })
    render(<SyncStatusIndicator />)
    expect(screen.getByText('同步中')).toBeInTheDocument()
  })

  it('renders offline status with 离线 label', () => {
    setStatus({ status: 'offline', timestamp: Date.now() })
    render(<SyncStatusIndicator />)
    expect(screen.getByText('离线（本地已保存）')).toBeInTheDocument()
  })

  it('renders conflict status with 有冲突 label', () => {
    setStatus({ status: 'conflict', timestamp: Date.now() })
    render(<SyncStatusIndicator />)
    expect(screen.getByText('有冲突')).toBeInTheDocument()
  })

  it('renders error status with 同步失败 label', () => {
    setStatus({ status: 'error', timestamp: Date.now() })
    render(<SyncStatusIndicator />)
    expect(screen.getByText('同步失败')).toBeInTheDocument()
  })

  it('syncing state has animate-spin class on icon', () => {
    setStatus({ status: 'syncing', timestamp: Date.now() })
    render(<SyncStatusIndicator />)
    const button = screen.getByRole('button')
    const svg = button.querySelector('svg')
    expect(svg?.classList.contains('animate-spin')).toBe(true)
  })

  it('synced state does not have animate-spin class', () => {
    setStatus({ status: 'synced', timestamp: Date.now() })
    render(<SyncStatusIndicator />)
    const button = screen.getByRole('button')
    const svg = button.querySelector('svg')
    expect(svg?.classList.contains('animate-spin')).toBe(false)
  })

  it('shows time text when lastSyncedAt is set and variant is default', () => {
    const ts = new Date(2026, 0, 1, 10, 23, 0).getTime()
    setStatus({ status: 'synced', timestamp: ts })
    render(<SyncStatusIndicator variant="default" />)
    const button = screen.getByRole('button')
    const timeSpan = button.querySelector('.text-gray-500')
    expect(timeSpan).toBeInTheDocument()
  })

  it('does not show time text in compact variant', () => {
    const ts = new Date(2026, 0, 1, 10, 23, 0).getTime()
    setStatus({ status: 'synced', timestamp: ts })
    render(<SyncStatusIndicator variant="compact" />)
    const button = screen.getByRole('button')
    const timeSpan = button.querySelector('.text-gray-500')
    expect(timeSpan).not.toBeInTheDocument()
  })

  it('does not show time text when lastSyncedAt is null', () => {
    setStatus({ status: 'idle', timestamp: Date.now() })
    render(<SyncStatusIndicator />)
    const button = screen.getByRole('button')
    const timeSpan = button.querySelector('.text-gray-500')
    expect(timeSpan).not.toBeInTheDocument()
  })

  it('clicking opens detail panel with 同步详情 header', () => {
    setStatus({ status: 'synced', timestamp: Date.now() })
    render(<SyncStatusIndicator />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('同步详情')).toBeInTheDocument()
  })

  it('applies emerald color class for synced status', () => {
    setStatus({ status: 'synced', timestamp: Date.now() })
    render(<SyncStatusIndicator />)
    const button = screen.getByRole('button')
    expect(button.classList.contains('text-emerald-500')).toBe(true)
  })

  it('applies blue color class for syncing status', () => {
    setStatus({ status: 'syncing', timestamp: Date.now() })
    render(<SyncStatusIndicator />)
    const button = screen.getByRole('button')
    expect(button.classList.contains('text-blue-500')).toBe(true)
  })

  it('applies red color class for conflict status', () => {
    setStatus({ status: 'conflict', timestamp: Date.now() })
    render(<SyncStatusIndicator />)
    const button = screen.getByRole('button')
    expect(button.classList.contains('text-red-500')).toBe(true)
  })

  it('applies amber color class for error status', () => {
    setStatus({ status: 'error', timestamp: Date.now() })
    render(<SyncStatusIndicator />)
    const button = screen.getByRole('button')
    expect(button.classList.contains('text-amber-500')).toBe(true)
  })
})
