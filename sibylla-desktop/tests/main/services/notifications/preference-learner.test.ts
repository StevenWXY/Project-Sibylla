import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { PreferenceLearner } from '../../../../src/main/services/notifications/preference-learner'

describe('PreferenceLearner', () => {
  let learner: PreferenceLearner
  let tmpDir: string
  let mockStore: {
    getDismissStats: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pref-test-'))
    fs.mkdirSync(path.join(tmpDir, '.sibylla', 'notifications'), { recursive: true })

    mockStore = {
      getDismissStats: vi.fn().mockReturnValue({ total: 0, dismissed: 0 }),
    }

    learner = new PreferenceLearner(mockStore, tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('load()', () => {
    it('should return default preferences when no file exists', () => {
      const prefs = learner.load()
      expect(prefs.schemaVersion).toBe(1)
      expect(prefs.mutedRules).toHaveLength(0)
    })

    it('should load preferences from file', () => {
      const prefsPath = path.join(tmpDir, '.sibylla', 'notifications', 'preferences.json')
      fs.writeFileSync(prefsPath, JSON.stringify({
        schemaVersion: 1,
        mutedRules: [{ type: 'system.indexed', mutedAt: Date.now() }],
      }))

      const prefs = learner.load()
      expect(prefs.mutedRules).toHaveLength(1)
      expect(prefs.mutedRules[0].type).toBe('system.indexed')
    })

    it('should fallback to defaults on corrupt file', () => {
      const prefsPath = path.join(tmpDir, '.sibylla', 'notifications', 'preferences.json')
      fs.writeFileSync(prefsPath, 'invalid json{{{')

      const prefs = learner.load()
      expect(prefs.schemaVersion).toBe(1)
      expect(prefs.mutedRules).toHaveLength(0)
    })
  })

  describe('isMuted() / mute() / unmute()', () => {
    beforeEach(() => {
      learner.load()
    })

    it('should return false when nothing is muted', () => {
      expect(learner.isMuted('system.indexed')).toBe(false)
    })

    it('should mute and detect muted type', () => {
      learner.mute('system.indexed')
      expect(learner.isMuted('system.indexed')).toBe(true)
      expect(learner.isMuted('system.indexed', 'indexer')).toBe(true)
    })

    it('should mute with specific source provider', () => {
      learner.mute('system.indexed', 'indexer')
      expect(learner.isMuted('system.indexed', 'indexer')).toBe(true)
    })

    it('should unmute specific rule', () => {
      learner.mute('system.indexed')
      learner.unmute('system.indexed')
      expect(learner.isMuted('system.indexed')).toBe(false)
    })

    it('should persist mute to file', () => {
      learner.mute('system.indexed')
      const prefsPath = path.join(tmpDir, '.sibylla', 'notifications', 'preferences.json')
      expect(fs.existsSync(prefsPath)).toBe(true)
      const content = JSON.parse(fs.readFileSync(prefsPath, 'utf-8'))
      expect(content.mutedRules).toHaveLength(1)
    })
  })

  describe('checkAndSuggestMute()', () => {
    it('should not suggest when dismiss count < threshold', () => {
      mockStore.getDismissStats.mockReturnValue({ total: 2, dismissed: 2 })
      const mockEngine = { store: { create: vi.fn() } }
      learner.setNotificationEngine(mockEngine)
      learner.load()

      learner.checkAndSuggestMute('system.indexed', 'indexer')
      expect(mockEngine.store.create).not.toHaveBeenCalled()
    })

    it('should suggest mute when dismiss count >= 3', () => {
      mockStore.getDismissStats.mockReturnValue({ total: 3, dismissed: 3 })
      const mockEngine = { store: { create: vi.fn().mockReturnValue({ id: 'test' }) } }
      learner.setNotificationEngine(mockEngine)
      learner.load()

      learner.checkAndSuggestMute('system.indexed', 'indexer')
      expect(mockEngine.store.create).toHaveBeenCalledTimes(1)
      const draft = mockEngine.store.create.mock.calls[0][0]
      expect(draft.type).toBe('system.suggestion')
      expect(draft.title).toContain('Mute')
    })
  })

  describe('scheduledFocus', () => {
    beforeEach(() => {
      learner.load()
    })

    it('should get and set scheduled focus config', () => {
      expect(learner.getScheduledFocus()).toBeUndefined()

      learner.setScheduledFocus({ enabled: true, startHour: 9, endHour: 12 })
      expect(learner.getScheduledFocus()).toEqual({
        enabled: true,
        startHour: 9,
        endHour: 12,
      })
    })
  })
})
