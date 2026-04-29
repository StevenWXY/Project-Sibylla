/**
 * CitationRenderer — transforms AI response text with [source:identifier] citations
 *
 * Scans text for citation patterns, splits into segments, and renders
 * each citation as a <CitationLink /> component. Falls back to plain text
 * when no citations are found (zero overhead).
 *
 * @see plans/phase2/phase2-task005-sync-enhancement-citation-tracing-plan.md §Phase F
 */

import React, { useMemo, useCallback } from 'react'
import { extractCitations } from '../../../shared/citation-parser'
import type { Citation } from '../../../shared/citation-parser'
import { CitationLink } from './CitationLink'

interface CitationRendererProps {
  readonly content: string
  readonly onCitationNavigate?: (citation: Citation) => void
  readonly onSearchFallback?: (query: string) => void
  readonly children?: (text: string) => React.ReactNode
}

interface TextSegment {
  readonly type: 'text'
  readonly content: string
  readonly key: string
}

interface CitationSegment {
  readonly type: 'citation'
  readonly citation: Citation
  readonly raw: string
  readonly key: string
}

type Segment = TextSegment | CitationSegment

export function CitationRenderer({
  content,
  onCitationNavigate,
  onSearchFallback,
  children,
}: CitationRendererProps) {
  const segments = useMemo((): readonly Segment[] => {
    const citations = extractCitations(content)

    if (citations.length === 0) {
      return [{ type: 'text', content, key: 'text-0' }]
    }

    const result: Segment[] = []
    let lastIndex = 0

    for (let i = 0; i < citations.length; i++) {
      const extracted = citations[i]!

      if (extracted.index > lastIndex) {
        result.push({
          type: 'text',
          content: content.slice(lastIndex, extracted.index),
          key: `text-${i}`,
        })
      }

      result.push({
        type: 'citation',
        citation: extracted.citation,
        raw: extracted.raw,
        key: `cite-${i}`,
      })

      lastIndex = extracted.index + extracted.raw.length
    }

    if (lastIndex < content.length) {
      result.push({
        type: 'text',
        content: content.slice(lastIndex),
        key: `text-${citations.length}`,
      })
    }

    return result
  }, [content])

  const handleNavigate = useCallback(
    (citation: Citation) => {
      if (onCitationNavigate) {
        onCitationNavigate(citation)
      }
    },
    [onCitationNavigate],
  )

  const handleSearch = useCallback(
    (query: string) => {
      if (onSearchFallback) {
        onSearchFallback(query)
      }
    },
    [onSearchFallback],
  )

  if (children) {
    const textParts = segments.filter(s => s.type === 'text').map(s => s.content).join('')
    const citationParts = segments.filter(s => s.type === 'citation')
    if (citationParts.length === 0) {
      return <>{children(textParts)}</>
    }
    return (
      <span>
        {children(textParts)}
        <span className="inline-flex gap-1 ml-1">
          {citationParts.map(seg => (
            <CitationLink
              key={seg.key}
              citation={seg.citation}
              raw={seg.raw}
              onNavigate={handleNavigate}
              onSearch={handleSearch}
            />
          ))}
        </span>
      </span>
    )
  }

  return (
    <span>
      {segments.map((seg) => {
        if (seg.type === 'text') {
          return <React.Fragment key={seg.key}>{seg.content}</React.Fragment>
        }

        return (
          <CitationLink
            key={seg.key}
            citation={seg.citation}
            raw={seg.raw}
            onNavigate={handleNavigate}
            onSearch={handleSearch}
          />
        )
      })}
    </span>
  )
}
