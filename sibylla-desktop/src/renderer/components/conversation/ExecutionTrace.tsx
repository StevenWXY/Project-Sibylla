import React, { useState, useEffect, useCallback, useMemo } from 'react'
import type { SerializedSpanShared } from '../../../shared/types'

const USER_VISIBLE_SPANS: Record<string, { label: string; icon: string; order: number }> = {
  'context.assemble': { label: '读取上下文', icon: '📥', order: 1 },
  'ai.llm-call': { label: 'AI 思考', icon: '🧠', order: 2 },
  'harness.guardrail': { label: 'Guardrail 检查', icon: '🛡️', order: 3 },
  'harness.sensor': { label: 'Sensor 评估', icon: '📊', order: 4 },
  'harness.evaluator': { label: 'Evaluator 审查', icon: '⚖️', order: 5 },
  'tool.file-write': { label: '写入文件', icon: '💾', order: 6 },
  'tool.file-read': { label: '读取文件', icon: '📄', order: 7 },
  'memory.search': { label: '检索记忆', icon: '🧩', order: 8 },
}

interface FilteredSpan {
  name: string
  label: string
  icon: string
  order: number
  durationMs: number
  status: 'ok' | 'error' | 'unset'
  statusMessage?: string
  attributes: Record<string, unknown>
  spanId: string
}

interface ExecutionTraceProps {
  messageId: string
  traceId?: string
}

function filterAndGroupSpans(spans: SerializedSpanShared[]): FilteredSpan[] {
  const filtered = spans
    .filter(span => span.name in USER_VISIBLE_SPANS)
    .map(span => {
      const config = USER_VISIBLE_SPANS[span.name]
      return {
        name: span.name,
        label: config.label,
        icon: config.icon,
        order: config.order,
        durationMs: span.durationMs,
        status: span.status,
        statusMessage: span.statusMessage,
        attributes: span.attributes,
        spanId: span.spanId,
      }
    })
    .sort((a, b) => a.order - b.order || a.durationMs - b.durationMs)

  const merged: FilteredSpan[] = []
  for (const span of filtered) {
    const last = merged[merged.length - 1]
    if (last && last.name === span.name && last.status === span.status) {
      last.durationMs += span.durationMs
    } else {
      merged.push({ ...span })
    }
  }
  return merged
}

function computeMedianDurationsByName(spans: FilteredSpan[]): Map<string, number> {
  const byName = new Map<string, number[]>()
  for (const span of spans) {
    const arr = byName.get(span.name) ?? []
    arr.push(span.durationMs)
    byName.set(span.name, arr)
  }
  const medians = new Map<string, number>()
  for (const [name, durations] of byName) {
    const sorted = [...durations].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    medians.set(name, sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2)
  }
  return medians
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export const ExecutionTrace: React.FC<ExecutionTraceProps> = ({ messageId: _messageId, traceId }) => {
  const [expanded, setExpanded] = useState(false)
  const [spans, setSpans] = useState<FilteredSpan[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSpanId, setSelectedSpanId] = useState<string | null>(null)

  const loadSpans = useCallback(async () => {
    if (!traceId) return
    setLoading(true)
    try {
      const response = await window.electronAPI.trace.getTraceTree(traceId)
      if (response.success && response.data) {
        setSpans(filterAndGroupSpans(response.data))
      }
    } catch {
      // ignore load errors
    } finally {
      setLoading(false)
    }
  }, [traceId])

  useEffect(() => {
    if (expanded && traceId) {
      loadSpans()
    }
  }, [expanded, traceId, loadSpans])

  useEffect(() => {
    if (!traceId || !expanded) return
    const unsubscribe = window.electronAPI.trace.onTraceUpdate((updatedTraceId: string) => {
      if (updatedTraceId === traceId) {
        loadSpans()
      }
    })
    return unsubscribe
  }, [traceId, expanded, loadSpans])

  const medians = useMemo(() => computeMedianDurationsByName(spans), [spans])

  const rootDuration = useMemo(() => {
    if (spans.length === 0) return 0
    const durations = spans.map(s => s.durationMs)
    return Math.max(...durations)
  }, [spans])

  if (!traceId) return null

  if (!expanded) {
    return (
      <button
        className="execution-trace-toggle"
        onClick={() => setExpanded(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          marginTop: '8px',
          fontSize: '12px',
          color: '#6B7280',
          background: 'transparent',
          border: '1px solid #E5E7EB',
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = '#6366F1'
          e.currentTarget.style.color = '#6366F1'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = '#E5E7EB'
          e.currentTarget.style.color = '#6B7280'
        }}
      >
        🔍 展开执行轨迹
      </button>
    )
  }

  if (loading && spans.length === 0) {
    return (
      <div style={{ padding: '8px 0', fontSize: '12px', color: '#9CA3AF' }}>
        加载中...
      </div>
    )
  }

  return (
    <div
      className="execution-trace"
      style={{
        marginTop: '8px',
        padding: '10px 12px',
        background: '#F9FAFB',
        borderRadius: '8px',
        border: '1px solid #E5E7EB',
        fontSize: '12px',
      }}
    >
      <div
        className="execution-trace-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '8px',
          paddingBottom: '6px',
          borderBottom: '1px solid #E5E7EB',
        }}
      >
        <span style={{ fontWeight: 600, color: '#1F2937' }}>
          🔍 执行轨迹{rootDuration > 0 ? `（用时 ${formatDuration(rootDuration)}）` : ''}
        </span>
        <button
          onClick={() => setExpanded(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#9CA3AF',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '0 4px',
          }}
        >
          ✕
        </button>
      </div>

      <div className="execution-trace-rows">
        {spans.map((span, idx) => {
          const median = medians.get(span.name) ?? span.durationMs
          const isAnomalous = median > 0 && span.durationMs > median * 3
          const isError = span.status === 'error'

          return (
            <div
              key={`${span.spanId}-${idx}`}
              className="execution-trace-row"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '3px 0',
                position: 'relative',
                cursor: 'pointer',
                background: selectedSpanId === span.spanId ? '#EEF2FF' : 'transparent',
                borderRadius: '4px',
                paddingLeft: '4px',
              }}
              onClick={() => setSelectedSpanId(selectedSpanId === span.spanId ? null : span.spanId)}
            >
              <span style={{ width: '16px', textAlign: 'center' }}>{span.icon}</span>
              <span
                style={{
                  flex: 1,
                  color: isError ? '#EF4444' : isAnomalous ? '#F59E0B' : '#1F2937',
                  fontWeight: isAnomalous || isError ? 600 : 400,
                }}
                title={span.statusMessage ?? ''}
              >
                {span.label}
              </span>
              <span
                style={{
                  color: isError ? '#EF4444' : isAnomalous ? '#F59E0B' : '#6B7280',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: '48px',
                  textAlign: 'right',
                }}
              >
                {formatDuration(span.durationMs)}
              </span>
              {isError && (
                <span style={{ color: '#EF4444', fontSize: '10px' }} title={span.statusMessage}>
                  ✗
                </span>
              )}
            </div>
          )
        })}
      </div>

      {selectedSpanId && (
        <div
          className="execution-trace-popover"
          style={{
            marginTop: '8px',
            padding: '8px',
            background: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '6px',
            fontSize: '11px',
            color: '#6B7280',
            maxHeight: '120px',
            overflowY: 'auto',
          }}
        >
          {(() => {
            const span = spans.find(s => s.spanId === selectedSpanId)
            if (!span) return null
            return Object.entries(span.attributes).map(([key, value]) => (
              <div key={key} style={{ display: 'flex', gap: '8px', padding: '1px 0' }}>
                <span style={{ color: '#1F2937', fontWeight: 500 }}>{key}:</span>
                <span style={{ wordBreak: 'break-all' }}>{String(value)}</span>
              </div>
            ))
          })()}
        </div>
      )}

      <div style={{ marginTop: '8px', borderTop: '1px solid #E5E7EB', paddingTop: '6px' }}>
        <button
          className="execution-trace-full-link"
          style={{
            background: 'none',
            border: 'none',
            color: '#6366F1',
            cursor: 'pointer',
            fontSize: '12px',
            padding: 0,
            fontWeight: 500,
          }}
          onClick={() => window.electronAPI.inspector.open(traceId)}
        >
          查看完整 Trace →
        </button>
      </div>
    </div>
  )
}

export default ExecutionTrace
