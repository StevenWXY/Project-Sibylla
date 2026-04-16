/**
 * NetworkMonitor — Unit Tests
 *
 * Tests for TASK006: NetworkMonitor proactive network detection service.
 * Covers lifecycle, status detection, event emission, and polling behavior.
 *
 * Strategy:
 * - Uses vi.useFakeTimers() for deterministic timer control
 * - Mocks global fetch for HTTP HEAD probe simulation
 * - Target coverage ≥ 80%
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { NetworkMonitor } from '../../src/main/services/network-monitor'

describe('NetworkMonitor', () => {
  let monitor: NetworkMonitor
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    if (monitor) {
      monitor.stop()
      monitor.removeAllListeners()
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  // ─── 1. Lifecycle Tests ──────────────────────────────────────────────

  describe('Lifecycle', () => {
    it('should start polling on start()', () => {
      fetchSpy.mockResolvedValue({ ok: true })
      monitor = new NetworkMonitor({ checkIntervalMs: 10000 })

      monitor.start()

      expect(fetchSpy).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(10000)
      expect(fetchSpy).toHaveBeenCalledTimes(2)

      vi.advanceTimersByTime(10000)
      expect(fetchSpy).toHaveBeenCalledTimes(3)
    })

    it('should stop polling on stop()', () => {
      fetchSpy.mockResolvedValue({ ok: true })
      monitor = new NetworkMonitor({ checkIntervalMs: 10000 })

      monitor.start()
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      monitor.stop()

      vi.advanceTimersByTime(30000)
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })

    it('should be idempotent — repeated start() calls have no effect', () => {
      fetchSpy.mockResolvedValue({ ok: true })
      monitor = new NetworkMonitor({ checkIntervalMs: 10000 })

      monitor.start()
      monitor.start()

      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })

  // ─── 2. Initial State Tests ──────────────────────────────────────────

  describe('Initial State', () => {
    it('should report offline as default before any check', () => {
      monitor = new NetworkMonitor()
      expect(monitor.getIsOnline()).toBe(false)
    })

    it('should detect online status after successful probe', async () => {
      fetchSpy.mockResolvedValue({ ok: true })
      monitor = new NetworkMonitor()

      monitor.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(monitor.getIsOnline()).toBe(true)
    })

    it('should detect offline status after failed probe', async () => {
      fetchSpy.mockRejectedValue(new Error('Network error'))
      monitor = new NetworkMonitor()

      monitor.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(monitor.getIsOnline()).toBe(false)
    })

    it('should detect offline status when response.ok is false', async () => {
      fetchSpy.mockResolvedValue({ ok: false })
      monitor = new NetworkMonitor()

      monitor.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(monitor.getIsOnline()).toBe(false)
    })
  })

  // ─── 3. Status Change Event Tests ────────────────────────────────────

  describe('Status Change Events', () => {
    it('should emit "reconnected" when transitioning from offline to online', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('Network error'))
      fetchSpy.mockResolvedValue({ ok: true })

      monitor = new NetworkMonitor({ checkIntervalMs: 10000 })
      const reconnectedSpy = vi.fn()
      const statusChangedSpy = vi.fn()
      monitor.on('reconnected', reconnectedSpy)
      monitor.on('status-changed', statusChangedSpy)

      monitor.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(monitor.getIsOnline()).toBe(false)
      expect(reconnectedSpy).not.toHaveBeenCalled()

      vi.advanceTimersByTime(10000)
      await vi.advanceTimersByTimeAsync(0)

      expect(monitor.getIsOnline()).toBe(true)
      expect(reconnectedSpy).toHaveBeenCalledTimes(1)
      expect(statusChangedSpy).toHaveBeenCalledWith(true)
    })

    it('should emit "disconnected" when transitioning from online to offline', async () => {
      fetchSpy.mockResolvedValueOnce({ ok: true })
      fetchSpy.mockRejectedValue(new Error('Network error'))

      monitor = new NetworkMonitor({ checkIntervalMs: 10000 })
      const disconnectedSpy = vi.fn()
      const statusChangedSpy = vi.fn()
      monitor.on('disconnected', disconnectedSpy)
      monitor.on('status-changed', statusChangedSpy)

      monitor.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(monitor.getIsOnline()).toBe(true)
      expect(disconnectedSpy).not.toHaveBeenCalled()

      vi.advanceTimersByTime(10000)
      await vi.advanceTimersByTimeAsync(0)

      expect(monitor.getIsOnline()).toBe(false)
      expect(disconnectedSpy).toHaveBeenCalledTimes(1)
      expect(statusChangedSpy).toHaveBeenCalledWith(false)
    })

    it('should NOT emit events when status does not change', async () => {
      fetchSpy.mockResolvedValue({ ok: true })

      monitor = new NetworkMonitor({ checkIntervalMs: 10000 })
      const statusChangedSpy = vi.fn()
      monitor.on('status-changed', statusChangedSpy)

      monitor.start()
      await vi.advanceTimersByTimeAsync(0)

      expect(statusChangedSpy).toHaveBeenCalledTimes(1)
      statusChangedSpy.mockClear()

      vi.advanceTimersByTime(10000)
      await vi.advanceTimersByTimeAsync(0)

      vi.advanceTimersByTime(10000)
      await vi.advanceTimersByTimeAsync(0)

      expect(statusChangedSpy).not.toHaveBeenCalled()
    })
  })

  // ─── 4. Configuration Tests ──────────────────────────────────────────

  describe('Configuration', () => {
    it('should use custom checkIntervalMs', () => {
      fetchSpy.mockResolvedValue({ ok: true })
      monitor = new NetworkMonitor({ checkIntervalMs: 5000 })

      monitor.start()
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(5000)
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })

    it('should use default config when no config provided', () => {
      fetchSpy.mockResolvedValue({ ok: true })
      monitor = new NetworkMonitor()

      monitor.start()
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(10000)
      expect(fetchSpy).toHaveBeenCalledTimes(2)
    })
  })
})
