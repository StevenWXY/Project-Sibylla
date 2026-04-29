/**
 * CitationLink — renders a single citation as a clickable link with icon and color
 *
 * Each citation kind has a distinct icon, color, and click handler.
 * Broken citations render with a yellow warning style and a search suggestion.
 *
 * @see plans/phase2/phase2-task005-sync-enhancement-citation-tracing-plan.md §Phase F
 */

import React, { useCallback } from 'react'
import { FileText, Brain, BookOpen, Plug, ClipboardList, AlertTriangle } from 'lucide-react'
import { cn } from '../../utils/cn'
import type { Citation, CitationKind } from '../../../shared/citation-parser'

interface CitationStyle {
  readonly icon: React.ElementType
  readonly color: string
  readonly label: string
}

const CITATION_STYLES: Record<CitationKind, CitationStyle> = {
  file: { icon: FileText, color: 'text-blue-600', label: '文件' },
  memory: { icon: Brain, color: 'text-purple-600', label: '记忆' },
  handbook: { icon: BookOpen, color: 'text-green-600', label: '手册' },
  mcp: { icon: Plug, color: 'text-indigo-600', label: '外部' },
  plan: { icon: ClipboardList, color: 'text-orange-600', label: '计划' },
}

interface CitationLinkProps {
  readonly citation: Citation
  readonly raw: string
  readonly broken?: boolean
  readonly onNavigate?: (citation: Citation) => void
  readonly onSearch?: (query: string) => void
}

function getDisplayText(citation: Citation): string {
  switch (citation.kind) {
    case 'file':
      return citation.path.split('/').pop() ?? citation.path
    case 'memory':
      return citation.entryId
    case 'handbook':
      return citation.entryId
    case 'mcp':
      return `${citation.provider}/${citation.ref}`
    case 'plan':
      return citation.planId
  }
}

function getTooltipContent(citation: Citation): string {
  switch (citation.kind) {
    case 'file': {
      const suffix = citation.line ? `:${citation.line}` : ''
      return `${citation.path}${suffix}`
    }
    case 'memory':
      return `记忆条目: ${citation.entryId}`
    case 'handbook':
      return `Handbook: ${citation.entryId}`
    case 'mcp':
      return `${citation.provider}: ${citation.ref}`
    case 'plan':
      return `计划: ${citation.planId}`
  }
}

const MCP_SOURCE_ICONS: Record<string, React.ElementType> = {
  github: FileText,
  slack: BookOpen,
  notion: BookOpen,
}

function getIconForCitation(citation: Citation, broken: boolean): React.ElementType {
  if (broken) return AlertTriangle
  if (citation.kind === 'mcp') {
    const provider = citation.provider?.toLowerCase() ?? ''
    return MCP_SOURCE_ICONS[provider] ?? Plug
  }
  return CITATION_STYLES[citation.kind].icon
}

export function CitationLink({
  citation,
  raw,
  broken = false,
  onNavigate,
  onSearch,
}: CitationLinkProps) {
  const style = CITATION_STYLES[citation.kind]
  const Icon = getIconForCitation(citation, broken)
  const displayText = getDisplayText(citation)

  let tooltip = getTooltipContent(citation)
  if (citation.kind === 'memory' && 'confidence' in citation && typeof (citation as Record<string, unknown>).confidence === 'number') {
    tooltip += ` | confidence: ${((citation as Record<string, unknown>).confidence as number).toFixed(2)}`
  }

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!broken && onNavigate) {
        onNavigate(citation)
      }
    },
    [broken, citation, onNavigate],
  )

  const handleSearch = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (onSearch) {
        onSearch(displayText)
      }
    },
    [displayText, onSearch],
  )

  if (broken) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs',
          'bg-yellow-50 text-yellow-700 border border-yellow-200',
          'cursor-default',
        )}
        title="目标不存在"
      >
        <Icon className="w-3 h-3 shrink-0" />
        <span className="line-through opacity-70">{displayText}</span>
        {onSearch && (
          <button
            type="button"
            onClick={handleSearch}
            className="ml-1 text-yellow-600 underline hover:text-yellow-800 text-xs"
          >
            搜索相似
          </button>
        )}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 cursor-pointer',
        'rounded px-1 py-0.5 text-xs font-medium',
        'hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors',
        style.color,
      )}
      title={tooltip}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleClick(e as unknown as React.MouseEvent)
        }
      }}
    >
      <Icon className="w-3 h-3 shrink-0" />
      <span>{displayText}</span>
    </span>
  )
}
