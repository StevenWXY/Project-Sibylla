import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TaskDeclarationParser, stripDeclarationBlocks } from '../../src/main/services/ai/task-declaration-parser'
import type { ParsedBlock } from '../../src/main/services/ai/task-declaration-parser'

describe('TaskDeclarationParser', () => {
  let parser: TaskDeclarationParser

  beforeEach(() => {
    parser = new TaskDeclarationParser()
  })

  describe('parse declare block', () => {
    it('parses a valid declare block', () => {
      const content = [
        'Some text before',
        '<!-- sibylla:task-declare',
        '{"title": "Build feature", "planned_steps": ["Step 1", "Step 2"], "estimated_duration_min": 30}',
        '-->',
        'Some text after',
      ].join('\n')

      const blocks = parser.parseNewBlocks(content)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('declare')
      if (blocks[0].type === 'declare') {
        expect(blocks[0].data.title).toBe('Build feature')
        expect(blocks[0].data.planned_steps).toEqual(['Step 1', 'Step 2'])
        expect(blocks[0].data.estimated_duration_min).toBe(30)
      }
    })

    it('parses declare block without optional fields', () => {
      const content = [
        '<!-- sibylla:task-declare',
        '{"title": "Simple task", "planned_steps": ["Do thing"]}',
        '-->',
      ].join('\n')

      const blocks = parser.parseNewBlocks(content)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('declare')
      if (blocks[0].type === 'declare') {
        expect(blocks[0].data.estimated_duration_min).toBeUndefined()
      }
    })
  })

  describe('parse update block', () => {
    it('parses a valid update block', () => {
      const content = [
        '<!-- sibylla:task-update',
        '{"checklistUpdates": [{"index": 0, "status": "done"}], "newChecklistItems": ["New step"]}',
        '-->',
      ].join('\n')

      const blocks = parser.parseNewBlocks(content)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('update')
      if (blocks[0].type === 'update') {
        expect(blocks[0].data.checklistUpdates).toEqual([{ index: 0, status: 'done' }])
        expect(blocks[0].data.newChecklistItems).toEqual(['New step'])
      }
    })

    it('parses update block with output', () => {
      const content = [
        '<!-- sibylla:task-update',
        '{"output": {"type": "file", "ref": "src/foo.ts"}}',
        '-->',
      ].join('\n')

      const blocks = parser.parseNewBlocks(content)
      expect(blocks).toHaveLength(1)
      if (blocks[0].type === 'update') {
        expect(blocks[0].data.output).toEqual({ type: 'file', ref: 'src/foo.ts' })
      }
    })

    it('rejects invalid checklist status values', () => {
      const content = [
        '<!-- sibylla:task-update',
        '{"checklistUpdates": [{"index": 0, "status": "invalid_status"}]}',
        '-->',
      ].join('\n')

      const blocks = parser.parseNewBlocks(content)
      expect(blocks).toHaveLength(0)
    })
  })

  describe('parse complete block', () => {
    it('parses a valid complete block', () => {
      const content = [
        '<!-- sibylla:task-complete',
        '{"summary": "Feature completed successfully"}',
        '-->',
      ].join('\n')

      const blocks = parser.parseNewBlocks(content)
      expect(blocks).toHaveLength(1)
      expect(blocks[0].type).toBe('complete')
      if (blocks[0].type === 'complete') {
        expect(blocks[0].data.summary).toBe('Feature completed successfully')
      }
    })
  })

  describe('malformed JSON', () => {
    it('skips blocks with invalid JSON without throwing', () => {
      const content = [
        '<!-- sibylla:task-declare',
        '{invalid json}',
        '-->',
      ].join('\n')

      const blocks = parser.parseNewBlocks(content)
      expect(blocks).toHaveLength(0)
    })

    it('skips declare blocks with missing title', () => {
      const content = [
        '<!-- sibylla:task-declare',
        '{"planned_steps": ["Step 1"]}',
        '-->',
      ].join('\n')

      const blocks = parser.parseNewBlocks(content)
      expect(blocks).toHaveLength(0)
    })

    it('skips complete blocks with missing summary', () => {
      const content = [
        '<!-- sibylla:task-complete',
        '{}',
        '-->',
      ].join('\n')

      const blocks = parser.parseNewBlocks(content)
      expect(blocks).toHaveLength(0)
    })
  })

  describe('multiple blocks', () => {
    it('parses multiple different block types', () => {
      const content = [
        '<!-- sibylla:task-declare',
        '{"title": "Task", "planned_steps": ["S1"]}',
        '-->',
        'some output',
        '<!-- sibylla:task-update',
        '{"checklistUpdates": [{"index": 0, "status": "done"}]}',
        '-->',
        'more output',
        '<!-- sibylla:task-complete',
        '{"summary": "Done"}',
        '-->',
      ].join('\n')

      const blocks = parser.parseNewBlocks(content)
      expect(blocks).toHaveLength(3)
      expect(blocks[0].type).toBe('declare')
      expect(blocks[1].type).toBe('update')
      expect(blocks[2].type).toBe('complete')
    })
  })

  describe('duplicate block', () => {
    it('does not return already consumed blocks on re-parse', () => {
      const content = [
        '<!-- sibylla:task-declare',
        '{"title": "Task", "planned_steps": ["S1"]}',
        '-->',
      ].join('\n')

      const blocks1 = parser.parseNewBlocks(content)
      expect(blocks1).toHaveLength(1)

      const blocks2 = parser.parseNewBlocks(content)
      expect(blocks2).toHaveLength(0)
    })
  })

  describe('no blocks', () => {
    it('returns empty array when no blocks match', () => {
      const content = 'Just regular text without any declaration blocks'
      const blocks = parser.parseNewBlocks(content)
      expect(blocks).toHaveLength(0)
    })
  })

  describe('reset', () => {
    it('allows re-parsing after reset', () => {
      const content = [
        '<!-- sibylla:task-declare',
        '{"title": "Task", "planned_steps": ["S1"]}',
        '-->',
      ].join('\n')

      const blocks1 = parser.parseNewBlocks(content)
      expect(blocks1).toHaveLength(1)

      parser.reset()

      const blocks2 = parser.parseNewBlocks(content)
      expect(blocks2).toHaveLength(1)
    })
  })
})

describe('stripDeclarationBlocks', () => {
  it('removes all declaration blocks from content', () => {
    const content = [
      'Before',
      '<!-- sibylla:task-declare {"title": "T", "planned_steps": []} -->',
      'Middle',
      '<!-- sibylla:task-complete {"summary": "Done"} -->',
      'After',
    ].join('\n')

    const stripped = stripDeclarationBlocks(content)
    expect(stripped).not.toContain('sibylla:task-')
    expect(stripped).toContain('Before')
    expect(stripped).toContain('Middle')
    expect(stripped).toContain('After')
  })

  it('returns original content when no blocks present', () => {
    const content = 'No blocks here'
    expect(stripDeclarationBlocks(content)).toBe(content)
  })
})
