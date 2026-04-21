import React, { useMemo, useState } from 'react'
import { useTraceStore, selectCurrentSpans } from '../../store/traceStore'
import type { SerializedSpanShared } from '../../../shared/types'

interface SpanTreeViewProps {
  traceId: string
  onSpanClick: (spanId: string) => void
}

interface TreeNode {
  span: SerializedSpanShared
  children: TreeNode[]
  expanded: boolean
}

function buildTree(spans: SerializedSpanShared[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  for (const span of spans) {
    map.set(span.spanId, { span, children: [], expanded: true })
  }
  const roots: TreeNode[] = []
  for (const span of spans) {
    const node = map.get(span.spanId)!
    if (span.parentSpanId && map.has(span.parentSpanId)) {
      map.get(span.parentSpanId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

const KIND_ICONS: Record<string, string> = {
  'internal': '⚙️',
  'ai-call': '🧠',
  'tool-call': '🔧',
  'user-action': '👤',
  'system': '🖥️',
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const TreeNodeRow: React.FC<{
  node: TreeNode
  depth: number
  selectedSpanId: string | null
  onSpanClick: (spanId: string) => void
  expandedMap: Map<string, boolean>
  toggleExpand: (spanId: string) => void
}> = ({ node, depth, selectedSpanId, onSpanClick, expandedMap, toggleExpand }) => {
  const isExpanded = expandedMap.get(node.span.spanId) ?? true
  const isSelected = selectedSpanId === node.span.spanId
  const isError = node.span.status === 'error'
  const hasChildren = node.children.length > 0

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          paddingLeft: `${depth * 20 + 8}px`,
          paddingRight: '8px',
          height: '28px',
          cursor: 'pointer',
          background: isSelected ? '#EEF2FF' : 'transparent',
          borderLeft: isSelected ? '2px solid #6366F1' : '2px solid transparent',
          color: isError ? '#EF4444' : '#1F2937',
          fontWeight: isError ? 600 : 400,
          fontSize: '12px',
        }}
        onClick={() => onSpanClick(node.span.spanId)}
      >
        {hasChildren ? (
          <span
            onClick={e => { e.stopPropagation(); toggleExpand(node.span.spanId) }}
            style={{ width: '16px', textAlign: 'center', color: '#9CA3AF', fontSize: '10px', userSelect: 'none' }}
          >
            {isExpanded ? '▼' : '▶'}
          </span>
        ) : (
          <span style={{ width: '16px' }} />
        )}
        <span>{KIND_ICONS[node.span.kind] ?? '•'}</span>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.span.name}
        </span>
        <span style={{ color: isError ? '#EF4444' : '#9CA3AF', fontVariantNumeric: 'tabular-nums', fontSize: '11px' }}>
          {formatDuration(node.span.durationMs)}
        </span>
      </div>
      {isExpanded && node.children.map(child => (
        <TreeNodeRow
          key={child.span.spanId}
          node={child}
          depth={depth + 1}
          selectedSpanId={selectedSpanId}
          onSpanClick={onSpanClick}
          expandedMap={expandedMap}
          toggleExpand={toggleExpand}
        />
      ))}
    </>
  )
}

export const SpanTreeView: React.FC<SpanTreeViewProps> = ({ traceId: _traceId, onSpanClick }) => {
  const spans = useTraceStore(selectCurrentSpans)
  const selectedSpanId = useTraceStore(s => s.selectedSpanId)
  const tree = useMemo(() => buildTree(spans), [spans])
  const [expandedMap, setExpandedMap] = useState<Map<string, boolean>>(new Map())

  const toggleExpand = (spanId: string) => {
    setExpandedMap(prev => {
      const next = new Map(prev)
      next.set(spanId, !(next.get(spanId) ?? true))
      return next
    })
  }

  if (spans.length === 0) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF' }}>无 Span 数据</div>
  }

  return (
    <div style={{ overflow: 'auto', padding: '4px 0' }}>
      {tree.map(node => (
        <TreeNodeRow
          key={node.span.spanId}
          node={node}
          depth={0}
          selectedSpanId={selectedSpanId}
          onSpanClick={onSpanClick}
          expandedMap={expandedMap}
          toggleExpand={toggleExpand}
        />
      ))}
    </div>
  )
}

export default SpanTreeView
