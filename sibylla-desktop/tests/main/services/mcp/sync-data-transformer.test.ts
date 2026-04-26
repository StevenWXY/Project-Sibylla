import { describe, it, expect } from 'vitest'
import { SyncDataTransformer } from '../../../../src/main/services/mcp/sync-data-transformer'

describe('SyncDataTransformer', () => {
  const transformer = new SyncDataTransformer()

  // ─── Test 1: GitHub issues transform ───

  describe('transform() with github-issues template', () => {
    it('produces correct Markdown list format', () => {
      const input = {
        items: [
          {
            number: 42,
            title: 'Fix login bug',
            state: 'open',
            html_url: 'https://github.com/test/repo/issues/42',
            labels: [{ name: 'bug' }, { name: 'P1' }],
          },
        ],
      }

      const result = transformer.transform(input, 'github-issues')

      expect(result).toMatch(/^# GitHub Issues/)
      expect(result).toContain('- #42 Fix login bug [open]')
      expect(result).toContain('Labels: bug, P1')
      expect(result).toContain('https://github.com/test/repo/issues/42')
    })
  })

  // ─── Test 2: GitHub PRs transform ───

  describe('transform() with github-prs template', () => {
    it('produces correct format with author mention', () => {
      const input = {
        items: [
          {
            number: 15,
            title: 'Refactor auth module',
            state: 'open',
            author: { login: 'alice' },
            html_url: 'https://github.com/test/repo/pulls/15',
          },
        ],
      }

      const result = transformer.transform(input, 'github-prs')

      expect(result).toMatch(/^# Pull Requests/)
      expect(result).toContain('- #15 Refactor auth module [open] @alice')
      expect(result).toContain('https://github.com/test/repo/pulls/15')
    })
  })

  // ─── Test 3: Slack messages grouped by channel ───

  describe('transform() with slack-messages template', () => {
    it('groups messages by channel correctly', () => {
      const input = {
        messages: [
          {
            user: 'alice',
            text: 'We should review the new design',
            ts: '1745640600',
            channel: 'general',
          },
          {
            user: 'bob',
            text: 'Agreed',
            ts: '1745641500',
            channel: 'general',
          },
        ],
      }

      const result = transformer.transform(input, 'slack-messages')

      expect(result).toContain('## #general')
      expect(result).toContain('> **@alice**')
      expect(result).toContain('We should review the new design')
      expect(result).toContain('> **@bob**')
      expect(result).toContain('Agreed')
    })
  })

  // ─── Test 4: Generic list with nested JSON ───

  describe('transform() with generic-list template', () => {
    it('transforms nested JSON within depth limit to markdown list items', () => {
      const input = {
        items: [{ name: 'test', value: 123 }],
      }

      const result = transformer.transform(input, 'generic-list')

      // generic-list sees { items: [...] } and recurses into the items array
      // Each item becomes a "- " prefixed list entry with key-value pairs
      expect(result).toContain('- ')
      expect(result).toContain('name')
      expect(result).toContain('test')
      expect(result).toContain('value')
      expect(result).toContain('123')
    })

    it('uses generic-list as default when no template is provided', () => {
      const input = { items: [{ name: 'default-test', value: 456 }] }

      const result = transformer.transform(input)

      expect(result).toContain('default-test')
      expect(result).toContain('456')
    })
  })

  // ─── Test 5: resolveTargetPath date replacement ───

  describe('resolveTargetPath()', () => {
    it('replaces YYYY/MM/DD placeholders correctly', () => {
      const result = transformer.resolveTargetPath(
        'docs/logs/slack/YYYY-MM-DD.md',
        new Date('2026-04-26'),
      )

      expect(result).toBe('docs/logs/slack/2026-04-26.md')
    })

    it('handles multiple occurrences of date variables', () => {
      const result = transformer.resolveTargetPath(
        'YYYY/MM/DD/report-YYYY-MM-DD.md',
        new Date('2026-01-05'),
      )

      expect(result).toBe('2026/01/05/report-2026-01-05.md')
    })

    it('pads single-digit months and days with leading zeros', () => {
      const result = transformer.resolveTargetPath(
        'logs/YYYY-MM-DD.md',
        new Date('2026-03-07'),
      )

      expect(result).toBe('logs/2026-03-07.md')
    })
  })

  // ─── Test 6: Empty data handling ───

  describe('transform() with empty/null/undefined data', () => {
    it('returns empty string for null input', () => {
      const result = transformer.transform(null, 'github-issues')
      expect(result).toBe('')
    })

    it('returns empty string for undefined input', () => {
      const result = transformer.transform(undefined, 'github-prs')
      expect(result).toBe('')
    })

    it('returns empty string for object with empty items array', () => {
      const result = transformer.transform({ items: [] }, 'github-issues')
      expect(result).toBe('')
    })

    it('returns empty string for object with empty messages array', () => {
      const result = transformer.transform({ messages: [] }, 'slack-messages')
      expect(result).toBe('')
    })

    it('returns empty string for null with generic-list', () => {
      const result = transformer.transform(null, 'generic-list')
      expect(result).toBe('')
    })

    it('returns empty string for null with no template', () => {
      const result = transformer.transform(null)
      expect(result).toBe('')
    })
  })
})
