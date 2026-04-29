/**
 * Citation Parser — parse [source:identifier] references in AI responses
 *
 * Supports 5 citation kinds:
 *   [file:path] or [file:path#Lline]  → FileCitation
 *   [memory:entryId]                   → MemoryCitation
 *   [handbook:entryId]                 → HandbookCitation
 *   [mcp:provider:ref]                 → McpCitation
 *   [plan:planId]                      → PlanCitation
 *
 * @see plans/phase2/phase2-task005-sync-enhancement-citation-tracing-plan.md §Phase E
 */

export interface FileCitation {
  readonly kind: 'file'
  readonly path: string
  readonly line?: number
}

export interface MemoryCitation {
  readonly kind: 'memory'
  readonly entryId: string
}

export interface HandbookCitation {
  readonly kind: 'handbook'
  readonly entryId: string
}

export interface McpCitation {
  readonly kind: 'mcp'
  readonly provider: string
  readonly ref: string
}

export interface PlanCitation {
  readonly kind: 'plan'
  readonly planId: string
}

export type Citation =
  | FileCitation
  | MemoryCitation
  | HandbookCitation
  | McpCitation
  | PlanCitation

export type CitationKind = Citation['kind']

export interface ExtractedCitation {
  readonly citation: Citation
  readonly raw: string
  readonly index: number
}

const CITATION_REGEX = /\[(file|memory|handbook|mcp|plan):([^\]]+)\]/g

const LINE_SUFFIX_REGEX = /#L(\d+)$/

export function parseCitation(raw: string): Citation | null {
  const match = /^\[(file|memory|handbook|mcp|plan):([^\]]+)\]$/.exec(raw)
  if (!match) return null

  const kind = match[1] as CitationKind
  const value = match[2]

  if (!value || value.length === 0) return null

  switch (kind) {
    case 'file':
      return parseFileCitation(value)
    case 'memory':
      return { kind: 'memory', entryId: value }
    case 'handbook':
      return { kind: 'handbook', entryId: value }
    case 'mcp':
      return parseMcpCitation(value)
    case 'plan':
      return { kind: 'plan', planId: value }
    default:
      return null
  }
}

function parseFileCitation(value: string): FileCitation {
  const lineMatch = LINE_SUFFIX_REGEX.exec(value)
  if (lineMatch) {
    const line = parseInt(lineMatch[1]!, 10)
    const pathPart = value.slice(0, value.length - lineMatch[0].length)
    return { kind: 'file', path: pathPart, line }
  }
  return { kind: 'file', path: value }
}

function parseMcpCitation(value: string): McpCitation | null {
  const colonIdx = value.indexOf(':')
  if (colonIdx === -1 || colonIdx === 0 || colonIdx === value.length - 1) {
    return null
  }

  const provider = value.slice(0, colonIdx)
  const ref = value.slice(colonIdx + 1)

  return { kind: 'mcp', provider, ref }
}

export function extractCitations(text: string): readonly ExtractedCitation[] {
  const results: ExtractedCitation[] = []

  let match: RegExpExecArray | null
  const regex = new RegExp(CITATION_REGEX.source, CITATION_REGEX.flags)

  while ((match = regex.exec(text)) !== null) {
    const raw = match[0]
    const index = match.index

    const citation = parseCitation(raw)
    if (citation) {
      results.push({ citation, raw, index })
    }
  }

  return results
}

export function citationToMarkdown(citation: Citation): string {
  switch (citation.kind) {
    case 'file':
      if (citation.line !== undefined) {
        return `[file:${citation.path}#L${citation.line}]`
      }
      return `[file:${citation.path}]`
    case 'memory':
      return `[memory:${citation.entryId}]`
    case 'handbook':
      return `[handbook:${citation.entryId}]`
    case 'mcp':
      return `[mcp:${citation.provider}:${citation.ref}]`
    case 'plan':
      return `[plan:${citation.planId}]`
  }
}

export function isFileCitation(c: Citation): c is FileCitation {
  return c.kind === 'file'
}

export function isMemoryCitation(c: Citation): c is MemoryCitation {
  return c.kind === 'memory'
}

export function isHandbookCitation(c: Citation): c is HandbookCitation {
  return c.kind === 'handbook'
}

export function isMcpCitation(c: Citation): c is McpCitation {
  return c.kind === 'mcp'
}

export function isPlanCitation(c: Citation): c is PlanCitation {
  return c.kind === 'plan'
}
