import { structuredPatch } from 'diff'
import type { DiffHunk, DiffLine } from '../../shared/types/git.types'
import type { ParsedFileDiff } from '../components/studio/types'

interface RawDiffBlock {
  filePath: string
  diffBody: string
}

export function extractDiffCodeBlocks(content: string): RawDiffBlock[] {
  const blocks: RawDiffBlock[] = []
  const regex = /```diff:([^\n]+)\n([\s\S]*?)```/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    blocks.push({ filePath: match[1].trim(), diffBody: match[2] })
  }
  return blocks
}

function isNewContentComplete(diffBody: string): boolean {
  const lines = diffBody.split('\n')
  const hasAdditions = lines.some((l) => l.startsWith('+'))
  const contextLines = lines.filter(
    (l) => l.startsWith(' ') || (!l.startsWith('+') && !l.startsWith('-') && l.trim().length > 0)
  )
  return contextLines.length === 0 && hasAdditions
}

function applyDiffBody(diffBody: string): string {
  const lines = diffBody.split('\n')
  const result: string[] = []
  for (const line of lines) {
    if (line.startsWith('+')) {
      result.push(line.slice(1))
    } else if (line.startsWith('-')) {
      // skip deleted lines
    } else if (line.startsWith(' ')) {
      result.push(line.slice(1))
    } else {
      result.push(line)
    }
  }
  return result.join('\n')
}

function applyPatchToContent(oldContent: string, diffBody: string): string {
  const oldLines = oldContent.split('\n')
  const diffLines = diffBody.split('\n')
  const result: string[] = []
  let oldIndex = 0

  for (const diffLine of diffLines) {
    if (diffLine.startsWith('+')) {
      result.push(diffLine.slice(1))
    } else if (diffLine.startsWith('-')) {
      oldIndex++
    } else if (diffLine.startsWith(' ')) {
      result.push(oldLines[oldIndex] ?? diffLine.slice(1))
      oldIndex++
    } else {
      if (oldIndex < oldLines.length) {
        result.push(oldLines[oldIndex])
        oldIndex++
      } else {
        result.push(diffLine)
      }
    }
  }

  while (oldIndex < oldLines.length) {
    result.push(oldLines[oldIndex])
    oldIndex++
  }

  return result.join('\n')
}

export function computeDiffHunks(
  oldContent: string,
  newContent: string
): { hunks: DiffHunk[]; stats: { additions: number; deletions: number } } {
  if (oldContent === newContent) {
    return { hunks: [], stats: { additions: 0, deletions: 0 } }
  }

  try {
    const patch = structuredPatch('old', 'new', oldContent, newContent, undefined, undefined, {
      context: 3,
    })

    let additions = 0
    let deletions = 0

    const hunks: DiffHunk[] = patch.hunks.map((hunk) => {
      const lines: DiffLine[] = hunk.lines.map((line) => {
        if (line.startsWith('+')) {
          additions++
          return { type: 'add', content: line.slice(1) }
        }
        if (line.startsWith('-')) {
          deletions++
          return { type: 'delete', content: line.slice(1) }
        }
        return { type: 'context', content: line.slice(1) }
      })

      return {
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        lines,
      }
    })

    return { hunks, stats: { additions, deletions } }
  } catch {
    return { hunks: [], stats: { additions: 0, deletions: 0 } }
  }
}

function buildParsedFileDiff(
  filePath: string,
  oldContent: string,
  newContent: string
): ParsedFileDiff {
  const { hunks, stats } = computeDiffHunks(oldContent, newContent)
  return {
    filePath,
    hunks,
    fullNewContent: newContent,
    fullOldContent: oldContent,
    stats,
  }
}

function resolveNewContent(diffBody: string, oldContent: string): string {
  if (isNewContentComplete(diffBody)) {
    return applyDiffBody(diffBody)
  }
  return applyPatchToContent(oldContent, diffBody)
}

async function readFileContent(filePath: string): Promise<string> {
  try {
    const response = await window.electronAPI.file.read(filePath)
    if (response.success && response.data) {
      return response.data.content
    }
    return ''
  } catch {
    return ''
  }
}

export async function parseDiffBlocksWithFileRead(
  aiContent: string,
  currentFilePath: string,
  currentFileContent: string
): Promise<ParsedFileDiff[]> {
  const blocks = extractDiffCodeBlocks(aiContent)

  if (blocks.length > 0) {
    const results: ParsedFileDiff[] = []
    for (const block of blocks) {
      const oldContent =
        block.filePath === currentFilePath
          ? currentFileContent
          : await readFileContent(block.filePath)

      const newContent = resolveNewContent(block.diffBody, oldContent)
      results.push(buildParsedFileDiff(block.filePath, oldContent, newContent))
    }
    return results
  }

  return parseFallbackCodeBlock(aiContent, currentFilePath, currentFileContent)
}

export function parseFallbackCodeBlock(
  aiContent: string,
  currentFilePath: string,
  currentFileContent: string
): ParsedFileDiff[] {
  const codeBlockRegex = /```(?:[\w+-]+)?\n([\s\S]*?)```/
  const match = aiContent.match(codeBlockRegex)
  const block = match?.[1]?.trim()
  if (!block || block.length === 0 || block === currentFileContent) {
    return []
  }

  return [buildParsedFileDiff(currentFilePath, currentFileContent, block)]
}
