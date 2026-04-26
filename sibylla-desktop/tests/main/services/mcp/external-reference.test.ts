import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ContextEngine } from '../../../../src/main/services/context-engine/context-engine'
import type { ExternalReference } from '../../../../src/main/services/context-engine/context-engine'

describe('ContextEngine External Reference Syntax', () => {
  let engine: ContextEngine

  const mockFileManager = {
    readFile: vi.fn(),
    getWorkspaceRoot: vi.fn().mockReturnValue('/workspace'),
    listFiles: vi.fn().mockResolvedValue([]),
  }

  const mockMemoryManager = {
    search: vi.fn().mockResolvedValue([]),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    engine = new ContextEngine(
      mockFileManager as any,
      mockMemoryManager as any,
    )
  })

  describe('extractExternalReferences', () => {
    it('parses @github:issue-123 correctly', () => {
      const refs = engine.extractExternalReferences('Please check @github:issue-123')
      expect(refs).toHaveLength(1)
      expect(refs[0]).toEqual({
        source: 'github',
        resource: 'issue',
        identifier: '123',
      } satisfies ExternalReference)
    })

    it('parses @slack:general with no identifier', () => {
      const refs = engine.extractExternalReferences('See @slack:general for updates')
      expect(refs).toHaveLength(1)
      expect(refs[0]).toEqual({
        source: 'slack',
        resource: 'general',
        identifier: '',
      } satisfies ExternalReference)
    })

    it('parses @gitlab:mr-45 correctly', () => {
      const refs = engine.extractExternalReferences('Review @gitlab:mr-45 before merging')
      expect(refs).toHaveLength(1)
      expect(refs[0]).toEqual({
        source: 'gitlab',
        resource: 'mr',
        identifier: '45',
      } satisfies ExternalReference)
    })

    it('returns empty array for text with no matching patterns', () => {
      const refs = engine.extractExternalReferences('No references here, just plain text.')
      expect(refs).toEqual([])
    })

    it('coexists with file references — each method parses its own patterns', () => {
      const text = 'Check @[[README.md]] and also @github:issue-1'

      const fileRefs = engine.extractFileReferences(text)
      const externalRefs = engine.extractExternalReferences(text)

      expect(fileRefs).toEqual(['README.md'])
      expect(externalRefs).toHaveLength(1)
      expect(externalRefs[0]).toEqual({
        source: 'github',
        resource: 'issue',
        identifier: '1',
      } satisfies ExternalReference)
    })
  })

  describe('resolveExternalReference', () => {
    it('returns null for non-existent reference without crashing', async () => {
      mockFileManager.readFile.mockRejectedValue(new Error('File not found'))

      const ref: ExternalReference = {
        source: 'github',
        resource: 'issue',
        identifier: '999',
      }

      const result = await engine.resolveExternalReference(ref)
      expect(result).toBeNull()
    })
  })
})
