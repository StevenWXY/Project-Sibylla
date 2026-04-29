import { describe, it, expect } from 'vitest'
import {
  parseCitation,
  extractCitations,
  citationToMarkdown,
  isFileCitation,
  isMemoryCitation,
  isMcpCitation,
} from '../../src/shared/citation-parser'

describe('citation-parser', () => {
  describe('parseCitation', () => {
    it('should parse file citation', () => {
      const result = parseCitation('[file:docs/auth-design.md]')
      expect(result).toEqual({
        kind: 'file',
        path: 'docs/auth-design.md',
      })
    })

    it('should parse file citation with line number', () => {
      const result = parseCitation('[file:docs/auth.md#L42]')
      expect(result).toEqual({
        kind: 'file',
        path: 'docs/auth.md',
        line: 42,
      })
    })

    it('should parse memory citation', () => {
      const result = parseCitation('[memory:dec-001]')
      expect(result).toEqual({
        kind: 'memory',
        entryId: 'dec-001',
      })
    })

    it('should parse handbook citation', () => {
      const result = parseCitation('[handbook:modes/plan]')
      expect(result).toEqual({
        kind: 'handbook',
        entryId: 'modes/plan',
      })
    })

    it('should parse mcp citation with three segments', () => {
      const result = parseCitation('[mcp:github:issue/234]')
      expect(result).toEqual({
        kind: 'mcp',
        provider: 'github',
        ref: 'issue/234',
      })
    })

    it('should parse plan citation', () => {
      const result = parseCitation('[plan:plan-20260418-103000]')
      expect(result).toEqual({
        kind: 'plan',
        planId: 'plan-20260418-103000',
      })
    })

    it('should return null for invalid format', () => {
      expect(parseCitation('[invalid:something]')).toBeNull()
    })

    it('should return null for empty value', () => {
      expect(parseCitation('[file:]')).toBeNull()
    })

    it('should return null for non-citation text', () => {
      expect(parseCitation('just some text')).toBeNull()
    })

    it('should return null for mcp with no colon separator', () => {
      expect(parseCitation('[mcp:noseparator]')).toBeNull()
    })

    it('should return null for mcp with colon at start', () => {
      expect(parseCitation('[mcp::ref]')).toBeNull()
    })

    it('should return null for mcp with trailing colon', () => {
      expect(parseCitation('[mcp:provider:]')).toBeNull()
    })
  })

  describe('extractCitations', () => {
    it('should extract multiple citations from mixed text', () => {
      const text = '根据 [memory:dec-001]，参考 [file:docs/auth.md#L42] 和 [mcp:github:issue/234]'
      const results = extractCitations(text)

      expect(results).toHaveLength(3)
      expect(results[0]!.citation.kind).toBe('memory')
      expect(results[0]!.index).toBe(3)
      expect(results[1]!.citation.kind).toBe('file')
      expect(results[2]!.citation.kind).toBe('mcp')
    })

    it('should return empty array for text without citations', () => {
      const results = extractCitations('no citations here')
      expect(results).toHaveLength(0)
    })

    it('should include correct raw strings', () => {
      const text = 'see [file:test.md] for details'
      const results = extractCitations(text)
      expect(results[0]!.raw).toBe('[file:test.md]')
    })

    it('should handle consecutive citations', () => {
      const text = '[file:a.md][memory:b][plan:c]'
      const results = extractCitations(text)
      expect(results).toHaveLength(3)
      expect(results[0]!.index).toBe(0)
      expect(results[1]!.index).toBe(11)
      expect(results[2]!.index).toBe(21)
    })
  })

  describe('citationToMarkdown', () => {
    it('should serialize file citation without line', () => {
      expect(citationToMarkdown({ kind: 'file', path: 'docs/test.md' })).toBe(
        '[file:docs/test.md]',
      )
    })

    it('should serialize file citation with line', () => {
      expect(
        citationToMarkdown({ kind: 'file', path: 'docs/test.md', line: 42 }),
      ).toBe('[file:docs/test.md#L42]')
    })

    it('should serialize memory citation', () => {
      expect(citationToMarkdown({ kind: 'memory', entryId: 'dec-001' })).toBe(
        '[memory:dec-001]',
      )
    })

    it('should serialize handbook citation', () => {
      expect(citationToMarkdown({ kind: 'handbook', entryId: 'modes/plan' })).toBe(
        '[handbook:modes/plan]',
      )
    })

    it('should serialize mcp citation', () => {
      expect(
        citationToMarkdown({ kind: 'mcp', provider: 'github', ref: 'issue/234' }),
      ).toBe('[mcp:github:issue/234]')
    })

    it('should serialize plan citation', () => {
      expect(citationToMarkdown({ kind: 'plan', planId: 'plan-001' })).toBe(
        '[plan:plan-001]',
      )
    })

    it('should roundtrip all citation types', () => {
      const citations = [
        { kind: 'file' as const, path: 'docs/a.md' },
        { kind: 'file' as const, path: 'docs/b.md', line: 10 },
        { kind: 'memory' as const, entryId: 'x-001' },
        { kind: 'handbook' as const, entryId: 'modes/chat' },
        { kind: 'mcp' as const, provider: 'slack', ref: 'msg/123' },
        { kind: 'plan' as const, planId: 'plan-x' },
      ]

      for (const c of citations) {
        const md = citationToMarkdown(c)
        const parsed = parseCitation(md)
        expect(parsed).toEqual(c)
      }
    })
  })

  describe('type guards', () => {
    it('should narrow file citation', () => {
      const c = parseCitation('[file:test.md]')!
      expect(isFileCitation(c)).toBe(true)
      expect(isMemoryCitation(c)).toBe(false)
    })

    it('should narrow memory citation', () => {
      const c = parseCitation('[memory:x]')!
      expect(isMemoryCitation(c)).toBe(true)
      expect(isMcpCitation(c)).toBe(false)
    })
  })
})
