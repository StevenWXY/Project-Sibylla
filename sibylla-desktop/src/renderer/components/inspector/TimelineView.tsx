import React from 'react'
import { useTraceStore, selectCurrentSpans } from '../../store/traceStore'

interface TimelineViewProps {
  traceId: string
  onSpanClick: (spanId: string) => void
}

const KIND_ICONS: Record<string, string> = {
  'internal': '⚙️',
  'ai-call': '🧠',
  'tool-call': '🔧',
  'user-action': '👤',
  'system': '🖥️',
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export const TimelineView: React.FC<TimelineViewProps> = ({ traceId: _traceId, onSpanClick }) => {
  const spans = useTraceStore(selectCurrentSpans)
  const selectedSpanId = useTraceStore(s => s.selectedSpanId)

  const sorted = [...spans].sort((a, b) => a.startTimeMs - b.startTimeMs)

  if (spans.length === 0) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF' }}>无 Span 数据</div>
  }

  return (
    <div style={{ overflow: 'auto', padding: '4px 0' }}>
      {sorted.map(span => {
        const isError = span.status === 'error'
        const isSelected = selectedSpanId === span.spanId
        return (
          <div
            key={span.spanId}
            onClick={() => onSpanClick(span.spanId)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              cursor: 'pointer',
              background: isSelected ? '#EEF2FF' : isError ? '#FEF2F2' : 'transparent',
              borderLeft: isError ? '3px solid #EF4444' : isSelected ? '3px solid #6366F1' : '3px solid transparent',
              fontSize: '12px',
              transition: 'background 0.1s ease',
            }}
          >
            <span style={{ color: '#9CA3AF', fontVariantNumeric: 'tabular-nums', width: '80px', fontSize: '11px' }}>
              {formatTime(span.startTimeMs)}
            </span>
            <span>{KIND_ICONS[span.kind] ?? '•'}</span>
            <span style={{ flex: 1, color: isError ? '#EF4444' : '#1F2937', fontWeight: isError ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {span.name}
            </span>
            <span style={{ color: '#9CA3AF', fontVariantNumeric: 'tabular-nums', width: '64px', textAlign: 'right' }}>
              {formatDuration(span.durationMs)}
            </span>
            <span style={{ width: '16px', textAlign: 'center', color: isError ? '#EF4444' : '#10B981', fontSize: '11px' }}>
              {isError ? '✗' : span.status === 'ok' ? '✓' : '·'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export default TimelineView
