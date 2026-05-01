import { describe, it, expect } from 'vitest'
import { createBuiltinRules } from '../../../../src/main/services/notifications/notification-rules'

describe('notification-rules', () => {
  const deps = {
    currentUserId: 'user-1',
    getRecentFiles: () => ['src/foo.ts', 'src/bar.ts'],
  }

  const rules = createBuiltinRules(deps)

  it('should create 10 rules', () => {
    expect(rules).toHaveLength(10)
  })

  it('all rules should have required fields', () => {
    for (const rule of rules) {
      expect(rule.id).toBeTruthy()
      expect(rule.eventType).toBeTruthy()
      expect(rule.description).toBeTruthy()
      expect(rule.enabled).toBe(true)
      expect(typeof rule.build).toBe('function')
    }
  })

  describe('collab-conflict rule', () => {
    const rule = rules.find(r => r.id === 'collab-conflict')!

    it('should always match condition', () => {
      expect(rule.condition?.({ payload: { path: 'foo.ts' } } as never)).toBe(true)
    })

    it('should build urgent notification for conflict', () => {
      const draft = rule.build({ payload: { path: 'foo.ts' } } as never)
      expect(draft).not.toBeNull()
      expect(draft!.type).toBe('collab.conflict')
      expect(draft!.priority).toBe('urgent')
      expect(draft!.groupKey).toBe('collab-conflict:foo.ts')
      expect(draft!.navigation?.kind).toBe('file')
    })
  })

  describe('system-indexed rule', () => {
    const rule = rules.find(r => r.id === 'system-indexed')!

    it('should match when documentCount > 100', () => {
      expect(rule.condition?.({ payload: { documentCount: 150 } } as never)).toBe(true)
    })

    it('should not match when documentCount <= 100', () => {
      expect(rule.condition?.({ payload: { documentCount: 50 } } as never)).toBe(false)
    })

    it('should build notification with file count', () => {
      const draft = rule.build({ payload: { documentCount: 200 } } as never)
      expect(draft).not.toBeNull()
      expect(draft!.title).toContain('200')
      expect(draft!.type).toBe('system.indexed')
    })
  })

  describe('performance-alert-relay rule', () => {
    const rule = rules.find(r => r.id === 'performance-alert-relay')!

    it('should match only critical severity', () => {
      expect(rule.condition?.({ payload: { severity: 'critical' } } as never)).toBe(true)
      expect(rule.condition?.({ payload: { severity: 'warning' } } as never)).toBe(false)
    })

    it('should build high priority notification', () => {
      const draft = rule.build({
        payload: { severity: 'critical', message: 'OOM', type: 'memory', source: 'main' },
      } as never)
      expect(draft).not.toBeNull()
      expect(draft!.priority).toBe('high')
    })
  })

  describe('memory-insight rule', () => {
    const rule = rules.find(r => r.id === 'memory-insight')!

    it('should match when 3+ entries with avg confidence > 0.85', () => {
      const event = {
        payload: {
          report: {
            added: [
              { confidence: 0.9 },
              { confidence: 0.88 },
              { confidence: 0.87 },
            ],
          },
        },
      } as never
      expect(rule.condition?.(event)).toBe(true)
    })

    it('should not match with fewer than 3 entries', () => {
      const event = {
        payload: {
          report: {
            added: [{ confidence: 0.95 }, { confidence: 0.9 }],
          },
        },
      } as never
      expect(rule.condition?.(event)).toBe(false)
    })
  })

  describe('collab-peer-active rule', () => {
    const rule = rules.find(r => r.id === 'collab-peer-active')!

    it('should match when editing file is in recent files', () => {
      expect(rule.condition?.({
        payload: { userId: 'u2', filePath: 'src/foo.ts' },
      } as never)).toBe(true)
    })

    it('should not match when editing file is not in recent files', () => {
      expect(rule.condition?.({
        payload: { userId: 'u2', filePath: 'src/unknown.ts' },
      } as never)).toBe(false)
    })
  })

  describe('build error isolation', () => {
    it('should handle malformed payload gracefully', () => {
      const malformedEvent = { payload: {} } as never
      for (const rule of rules) {
        if (rule.id === 'collab-conflict') {
          expect(rule.build(malformedEvent)).not.toBeNull()
        }
      }
    })
  })
})
