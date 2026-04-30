import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NotificationStore } from '../../../../src/main/services/notifications/notification-store'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('NotificationStore', () => {
  let store: NotificationStore
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notif-test-'))
    store = new NotificationStore(tmpDir)
    await store.initialize()
  })

  afterEach(() => {
    store.close()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('create()', () => {
    it('should create a notification and return it with id and createdAt', () => {
      const notification = store.create({
        type: 'collab.conflict',
        priority: 'urgent',
        source: { provider: 'git' },
        title: 'Conflict detected',
        body: 'A conflict was detected',
        groupKey: 'collab-conflict:foo.ts',
        navigation: { kind: 'file', path: 'foo.ts' },
        metadata: {},
      })

      expect(notification.id).toBeTruthy()
      expect(notification.createdAt).toBeGreaterThan(0)
      expect(notification.type).toBe('collab.conflict')
      expect(notification.priority).toBe('urgent')
      expect(notification.title).toBe('Conflict detected')
      expect(notification.stale).toBe(false)
    })
  })

  describe('getById()', () => {
    it('should return notification by id', () => {
      const created = store.create({
        type: 'system.indexed',
        priority: 'normal',
        source: { provider: 'indexer' },
        title: 'Indexed',
        body: '500 files',
        groupKey: 'system-indexed',
        metadata: {},
      })

      const fetched = store.getById(created.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(created.id)
      expect(fetched!.title).toBe('Indexed')
    })

    it('should return null for non-existent id', () => {
      expect(store.getById('non-existent')).toBeNull()
    })
  })

  describe('getUnread()', () => {
    it('should return unread notifications sorted by priority then time', () => {
      store.create({
        type: 'system.indexed',
        priority: 'low',
        source: { provider: 'indexer' },
        title: 'Low priority',
        body: '',
        groupKey: 'low-1',
        metadata: {},
      })

      store.create({
        type: 'collab.conflict',
        priority: 'urgent',
        source: { provider: 'git' },
        title: 'Urgent',
        body: '',
        groupKey: 'urgent-1',
        metadata: {},
      })

      store.create({
        type: 'performance.alert',
        priority: 'high',
        source: { provider: 'perf' },
        title: 'High priority',
        body: '',
        groupKey: 'high-1',
        metadata: {},
      })

      const unread = store.getUnread()
      expect(unread).toHaveLength(3)
      expect(unread[0].priority).toBe('urgent')
      expect(unread[1].priority).toBe('high')
      expect(unread[2].priority).toBe('low')
    })

    it('should exclude read and archived notifications', () => {
      const n = store.create({
        type: 'system.indexed',
        priority: 'normal',
        source: { provider: 'indexer' },
        title: 'Test',
        body: '',
        groupKey: 'test-1',
        metadata: {},
      })

      store.markRead(n.id)
      expect(store.getUnread()).toHaveLength(0)
    })
  })

  describe('findByGroupKeyRecent()', () => {
    it('should find notification within window', () => {
      store.create({
        type: 'collab.conflict',
        priority: 'urgent',
        source: { provider: 'git' },
        title: 'Conflict',
        body: 'foo.ts',
        groupKey: 'collab-conflict:foo.ts',
        metadata: {},
      })

      const found = store.findByGroupKeyRecent('collab-conflict:foo.ts', 60 * 60 * 1000)
      expect(found).not.toBeNull()
      expect(found!.groupKey).toBe('collab-conflict:foo.ts')
    })

    it('should return null when no match in window', () => {
      const found = store.findByGroupKeyRecent('nonexistent', 60 * 60 * 1000)
      expect(found).toBeNull()
    })
  })

  describe('updateExisting()', () => {
    it('should update title and body', () => {
      const n = store.create({
        type: 'collab.conflict',
        priority: 'urgent',
        source: { provider: 'git' },
        title: 'Old title',
        body: 'Old body',
        groupKey: 'test-update',
        metadata: {},
      })

      store.updateExisting(n.id, { title: 'New title', body: 'New body' })

      const updated = store.getById(n.id)
      expect(updated!.title).toBe('New title')
      expect(updated!.body).toBe('New body')
    })
  })

  describe('markRead / markDismissed / markStale', () => {
    it('should mark notification as read', () => {
      const n = store.create({
        type: 'system.indexed',
        priority: 'normal',
        source: { provider: 'indexer' },
        title: 'Test',
        body: '',
        groupKey: 'mark-test',
        metadata: {},
      })

      store.markRead(n.id)
      const updated = store.getById(n.id)
      expect(updated!.readAt).toBeGreaterThan(0)
    })

    it('should mark notification as dismissed', () => {
      const n = store.create({
        type: 'system.indexed',
        priority: 'normal',
        source: { provider: 'indexer' },
        title: 'Test',
        body: '',
        groupKey: 'dismiss-test',
        metadata: {},
      })

      store.markDismissed(n.id)
      const updated = store.getById(n.id)
      expect(updated!.dismissedAt).toBeGreaterThan(0)
    })

    it('should mark notification as stale', () => {
      const n = store.create({
        type: 'system.indexed',
        priority: 'normal',
        source: { provider: 'indexer' },
        title: 'Test',
        body: '',
        groupKey: 'stale-test',
        metadata: {},
      })

      store.markStale(n.id)
      const updated = store.getById(n.id)
      expect(updated!.stale).toBe(true)
    })
  })

  describe('recordAction() and getDismissStats()', () => {
    it('should record actions and compute dismiss stats', () => {
      const n = store.create({
        type: 'system.indexed',
        priority: 'normal',
        source: { provider: 'indexer' },
        title: 'Test',
        body: '',
        groupKey: 'stats-test',
        metadata: {},
      })

      store.recordAction(n.id, 'system.indexed', 'indexer', 'dismiss')
      store.recordAction(n.id, 'system.indexed', 'indexer', 'dismiss')
      store.recordAction(n.id, 'system.indexed', 'indexer', 'click')

      const stats = store.getDismissStats('system.indexed', 'indexer', 60 * 60 * 1000)
      expect(stats.total).toBe(3)
      expect(stats.dismissed).toBe(2)
    })
  })

  describe('getUnreadCount()', () => {
    it('should count unread notifications', () => {
      store.create({
        type: 'system.indexed',
        priority: 'normal',
        source: { provider: 'indexer' },
        title: 'A',
        body: '',
        groupKey: 'count-a',
        metadata: {},
      })

      store.create({
        type: 'system.indexed',
        priority: 'normal',
        source: { provider: 'indexer' },
        title: 'B',
        body: '',
        groupKey: 'count-b',
        metadata: {},
      })

      expect(store.getUnreadCount()).toBe(2)
    })
  })
})
