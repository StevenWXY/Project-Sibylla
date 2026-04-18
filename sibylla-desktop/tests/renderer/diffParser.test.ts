import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  extractDiffCodeBlocks,
  computeDiffHunks,
  parseDiffBlocksWithFileRead,
  parseFallbackCodeBlock,
} from '../../src/renderer/utils/diffParser'

describe('extractDiffCodeBlocks', () => {
  it('extracts single diff code block', () => {
    const content = 'Some text\n```diff:path/to/file.md\n- old line\n+ new line\n```\nMore text'
    const blocks = extractDiffCodeBlocks(content)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.filePath).toBe('path/to/file.md')
    expect(blocks[0]?.diffBody).toBe('- old line\n+ new line\n')
  })

  it('extracts multiple diff code blocks', () => {
    const content =
      '```diff:file1.md\n+ line1\n```\nText between\n```diff:file2.md\n- line2\n```'
    const blocks = extractDiffCodeBlocks(content)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.filePath).toBe('file1.md')
    expect(blocks[1]?.filePath).toBe('file2.md')
  })

  it('returns empty array when no diff blocks found', () => {
    const content = 'No diff blocks here\n```\ncode\n```'
    const blocks = extractDiffCodeBlocks(content)
    expect(blocks).toHaveLength(0)
  })

  it('handles empty diff body', () => {
    const content = '```diff:empty.md\n```'
    const blocks = extractDiffCodeBlocks(content)
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.diffBody).toBe('')
  })

  it('handles file path with spaces trimmed', () => {
    const content = '```diff:  docs/prd.md  \n+ content\n```'
    const blocks = extractDiffCodeBlocks(content)
    expect(blocks[0]?.filePath).toBe('docs/prd.md')
  })
})

describe('computeDiffHunks', () => {
  it('returns empty hunks for identical content', () => {
    const result = computeDiffHunks('same\ncontent\n', 'same\ncontent\n')
    expect(result.hunks).toHaveLength(0)
    expect(result.stats.additions).toBe(0)
    expect(result.stats.deletions).toBe(0)
  })

  it('computes hunks for simple addition', () => {
    const old = 'line1\nline2\n'
    const newContent = 'line1\nnew line\nline2\n'
    const result = computeDiffHunks(old, newContent)
    expect(result.hunks.length).toBeGreaterThan(0)
    expect(result.stats.additions).toBe(1)

    const addLines = result.hunks.flatMap((h) => h.lines).filter((l) => l.type === 'add')
    expect(addLines).toHaveLength(1)
    expect(addLines[0]?.content).toBe('new line')
  })

  it('computes hunks for simple deletion', () => {
    const old = 'line1\nremoved\nline2\n'
    const newContent = 'line1\nline2\n'
    const result = computeDiffHunks(old, newContent)
    expect(result.stats.deletions).toBe(1)

    const delLines = result.hunks.flatMap((h) => h.lines).filter((l) => l.type === 'delete')
    expect(delLines).toHaveLength(1)
    expect(delLines[0]?.content).toBe('removed')
  })

  it('computes hunks for modification', () => {
    const old = 'line1\nold value\nline3\n'
    const newContent = 'line1\nnew value\nline3\n'
    const result = computeDiffHunks(old, newContent)
    expect(result.stats.additions).toBe(1)
    expect(result.stats.deletions).toBe(1)

    const lines = result.hunks.flatMap((h) => h.lines)
    const delLine = lines.find((l) => l.type === 'delete')
    const addLine = lines.find((l) => l.type === 'add')
    expect(delLine?.content).toBe('old value')
    expect(addLine?.content).toBe('new value')
  })

  it('handles multiline changes', () => {
    const old = 'a\nb\nc\nd\ne\n'
    const newContent = 'a\nB\nC\nd\ne\n'
    const result = computeDiffHunks(old, newContent)
    expect(result.stats.additions).toBe(2)
    expect(result.stats.deletions).toBe(2)
  })

  it('produces hunks with correct structure', () => {
    const old = 'line1\n'
    const newContent = 'line1\nline2\n'
    const result = computeDiffHunks(old, newContent)
    const hunk = result.hunks[0]
    expect(hunk).toBeDefined()
    expect(typeof hunk?.oldStart).toBe('number')
    expect(typeof hunk?.oldLines).toBe('number')
    expect(typeof hunk?.newStart).toBe('number')
    expect(typeof hunk?.newLines).toBe('number')
    expect(Array.isArray(hunk?.lines)).toBe(true)
  })

  it('produces DiffLine with correct type values', () => {
    const old = 'a\nb\nc\n'
    const newContent = 'a\nx\nc\n'
    const result = computeDiffHunks(old, newContent)
    const lines = result.hunks.flatMap((h) => h.lines)
    for (const line of lines) {
      expect(['add', 'delete', 'context']).toContain(line.type)
      expect(typeof line.content).toBe('string')
    }
  })

  it('handles empty old content', () => {
    const result = computeDiffHunks('', 'new content\n')
    expect(result.stats.additions).toBe(1)
    expect(result.stats.deletions).toBe(0)
  })

  it('handles empty new content', () => {
    const result = computeDiffHunks('old content\n', '')
    expect(result.stats.additions).toBe(0)
    expect(result.stats.deletions).toBe(1)
  })
})

describe('parseFallbackCodeBlock', () => {
  it('parses simple code block as full rewrite', () => {
    const aiContent = 'Here is the updated file:\n```\nnew file content\n```'
    const results = parseFallbackCodeBlock(aiContent, 'test.md', 'old content')
    expect(results).toHaveLength(1)
    expect(results[0]?.filePath).toBe('test.md')
    expect(results[0]?.fullOldContent).toBe('old content')
    expect(results[0]?.fullNewContent).toBe('new file content')
  })

  it('parses code block with language tag', () => {
    const aiContent = '```\nnew content\n```'
    const results = parseFallbackCodeBlock(aiContent, 'file.md', 'old')
    expect(results).toHaveLength(1)
  })

  it('returns empty when content matches current', () => {
    const current = 'same content'
    const aiContent = '```\nsame content\n```'
    const results = parseFallbackCodeBlock(aiContent, 'file.md', current)
    expect(results).toHaveLength(0)
  })

  it('returns empty when no code block found', () => {
    const results = parseFallbackCodeBlock('no code here', 'file.md', 'old')
    expect(results).toHaveLength(0)
  })

  it('returns empty when code block is empty', () => {
    const results = parseFallbackCodeBlock('```\n```', 'file.md', 'old')
    expect(results).toHaveLength(0)
  })
})

describe('parseDiffBlocksWithFileRead', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses diff code blocks for current file', async () => {
    const content = '```diff:current.md\n- old line\n+ new line\n```'
    const results = await parseDiffBlocksWithFileRead(content, 'current.md', 'old line\n')
    expect(results).toHaveLength(1)
    expect(results[0]?.filePath).toBe('current.md')
    expect(results[0]?.stats.additions).toBe(1)
    expect(results[0]?.stats.deletions).toBe(1)
    expect(results[0]?.fullOldContent).toBe('old line\n')
  })

  it('parses multi-file diff blocks reading other files via IPC', async () => {
    const mockRead = vi.fn().mockResolvedValue({
      success: true,
      data: { content: 'other file old\n' },
    })
    const savedAPI = window.electronAPI
    window.electronAPI = { file: { read: mockRead } } as typeof window.electronAPI

    const content =
      '```diff:current.md\n+ new\n```\n```diff:other.md\n+ added\n```'
    const results = await parseDiffBlocksWithFileRead(content, 'current.md', 'old\n')
    expect(results).toHaveLength(2)
    expect(results[0]?.filePath).toBe('current.md')
    expect(results[1]?.filePath).toBe('other.md')
    expect(mockRead).toHaveBeenCalledWith('other.md')

    window.electronAPI = savedAPI
  })

  it('falls back to code block parsing when no diff blocks', async () => {
    const content = '```\nnew content\n```'
    const results = await parseDiffBlocksWithFileRead(content, 'file.md', 'old')
    expect(results).toHaveLength(1)
    expect(results[0]?.filePath).toBe('file.md')
  })

  it('returns empty array for content with no changes', async () => {
    const content = 'Just some text, no code blocks at all'
    const results = await parseDiffBlocksWithFileRead(content, 'file.md', 'old')
    expect(results).toHaveLength(0)
  })

  it('handles file read failure gracefully', async () => {
    const mockRead = vi.fn().mockResolvedValue({
      success: false,
      error: { message: 'file not found' },
    })
    const savedAPI = window.electronAPI
    window.electronAPI = { file: { read: mockRead } } as typeof window.electronAPI

    const content = '```diff:missing.md\n+ content\n```'
    const results = await parseDiffBlocksWithFileRead(content, 'current.md', 'old')
    expect(results).toHaveLength(1)
    expect(results[0]?.fullOldContent).toBe('')

    window.electronAPI = savedAPI
  })

  it('handles context lines in diff body (patch mode)', async () => {
    const oldContent = 'line1\nline2\nline3\nline4\n'
    const diffBody = ' line1\n-old line\n+new line\n line3\n line4\n'
    const content = `\`\`\`diff:file.md\n${diffBody}\`\`\``
    const results = await parseDiffBlocksWithFileRead(content, 'file.md', oldContent)
    expect(results).toHaveLength(1)
    expect(results[0]?.fullNewContent).toContain('new line')
    expect(results[0]?.fullNewContent).not.toContain('old line')
    expect(results[0]?.fullNewContent).toContain('line1')
    expect(results[0]?.fullNewContent).toContain('line3')
  })

  it('handles complete new content diff (no context lines)', async () => {
    const oldContent = 'old line 1\nold line 2\n'
    const diffBody = '+new line 1\n+new line 2\n'
    const content = `\`\`\`diff:file.md\n${diffBody}\`\`\``
    const results = await parseDiffBlocksWithFileRead(content, 'file.md', oldContent)
    expect(results).toHaveLength(1)
    expect(results[0]?.fullNewContent).toBe('new line 1\nnew line 2\n')
  })

  it('handles nested code blocks in diff body', async () => {
    const content = '```diff:file.md\n+ ```nested```\n```'
    const results = await parseDiffBlocksWithFileRead(content, 'file.md', 'old')
    expect(results).toHaveLength(1)
  })

  it('handles Unicode content', async () => {
    const content = '```diff:文件.md\n+ 新内容\n```'
    const results = await parseDiffBlocksWithFileRead(content, '文件.md', '旧内容\n')
    expect(results).toHaveLength(1)
    expect(results[0]?.filePath).toBe('文件.md')
  })

  it('handles CRLF line endings', async () => {
    const content = '```diff:file.md\r\n+ new line\r\n```\r\n'
    const results = await parseDiffBlocksWithFileRead(content, 'file.md', 'old\r\n')
    expect(results).toHaveLength(1)
  })

  it('handles file path with special characters', async () => {
    const content = '```diff:docs/my-file_v2.md\n+ content\n```'
    const results = await parseDiffBlocksWithFileRead(content, 'docs/my-file_v2.md', 'old')
    expect(results).toHaveLength(1)
    expect(results[0]?.filePath).toBe('docs/my-file_v2.md')
  })

  it('returns empty for empty AI content', async () => {
    const results = await parseDiffBlocksWithFileRead('', 'file.md', 'old')
    expect(results).toHaveLength(0)
  })
})
