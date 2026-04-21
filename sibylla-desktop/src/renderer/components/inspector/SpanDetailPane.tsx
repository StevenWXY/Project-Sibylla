import React, { useMemo } from 'react'
import { useTraceStore, selectCurrentSpans } from '../../store/traceStore'

interface SpanDetailPaneProps {
  spanId: string
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN')
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

const KIND_LABELS: Record<string, string> = {
  'internal': '内部',
  'ai-call': 'AI 调用',
  'tool-call': '工具调用',
  'user-action': '用户操作',
  'system': '系统',
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  'ok': { label: '成功', color: '#10B981' },
  'error': { label: '错误', color: '#EF4444' },
  'unset': { label: '未设置', color: '#9CA3AF' },
}

export const SpanDetailPane: React.FC<SpanDetailPaneProps> = ({ spanId }) => {
  const spans = useTraceStore(selectCurrentSpans)
  const span = useMemo(() => spans.find(s => s.spanId === spanId), [spans, spanId])

  if (!span) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF' }}>未找到 Span</div>
  }

  const children = spans.filter(s => s.parentSpanId === span.spanId)
  const parent = span.parentSpanId ? spans.find(s => s.spanId === span.parentSpanId) : null
  const statusInfo = STATUS_LABELS[span.status] ?? STATUS_LABELS['unset']

  return (
    <div style={{ padding: '12px', fontSize: '12px' }}>
      {/* Overview */}
      <div style={{ marginBottom: '16px' }}>
        <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#1F2937', fontWeight: 600 }}>
          {span.name}
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: '11px' }}>
          <div><span style={{ color: '#9CA3AF' }}>Kind:</span> {KIND_LABELS[span.kind] ?? span.kind}</div>
          <div><span style={{ color: '#9CA3AF' }}>状态:</span> <span style={{ color: statusInfo.color }}>{statusInfo.label}</span></div>
          <div><span style={{ color: '#9CA3AF' }}>耗时:</span> {formatDuration(span.durationMs)}</div>
          <div><span style={{ color: '#9CA3AF' }}>开始:</span> {formatTime(span.startTimeMs)}</div>
        </div>
        {span.statusMessage && (
          <div style={{ marginTop: '6px', padding: '6px 8px', background: '#FEF2F2', borderRadius: '4px', color: '#EF4444', fontSize: '11px' }}>
            {span.statusMessage}
          </div>
        )}
      </div>

      {/* Parent-child chain */}
      <div style={{ marginBottom: '16px' }}>
        <h5 style={{ margin: '0 0 6px', fontSize: '12px', color: '#6B7280' }}>调用链</h5>
        {parent && (
          <div style={{ padding: '4px 8px', marginBottom: '4px', background: '#F3F4F6', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
            onClick={() => useTraceStore.getState().selectSpan(parent.spanId)}>
            ↑ 父: {parent.name}
          </div>
        )}
        {children.map(child => (
          <div key={child.spanId} style={{ padding: '4px 8px', marginBottom: '2px', background: '#F3F4F6', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
            onClick={() => useTraceStore.getState().selectSpan(child.spanId)}>
            ↓ 子: {child.name} ({formatDuration(child.durationMs)})
          </div>
        ))}
      </div>

      {/* Attributes */}
      <div style={{ marginBottom: '16px' }}>
        <h5 style={{ margin: '0 0 6px', fontSize: '12px', color: '#6B7280' }}>属性</h5>
        <div style={{ fontSize: '11px' }}>
          {Object.entries(span.attributes).map(([key, value]) => {
            const isRedacted = String(value) === '[REDACTED]'
            return (
              <div key={key} style={{ display: 'flex', gap: '8px', padding: '2px 0', borderBottom: '1px solid #F3F4F6' }}>
                <span style={{ color: '#1F2937', fontWeight: 500, minWidth: '100px' }}>{key}</span>
                <span style={{ color: isRedacted ? '#EF4444' : '#6B7280', wordBreak: 'break-all' }}>{String(value)}</span>
              </div>
            )
          })}
          {Object.keys(span.attributes).length === 0 && (
            <span style={{ color: '#9CA3AF' }}>无属性</span>
          )}
        </div>
      </div>

      {/* Events */}
      <div style={{ marginBottom: '16px' }}>
        <h5 style={{ margin: '0 0 6px', fontSize: '12px', color: '#6B7280' }}>事件</h5>
        {span.events.length === 0 ? (
          <span style={{ color: '#9CA3AF', fontSize: '11px' }}>无事件</span>
        ) : (
          span.events.map((event, idx) => (
            <div key={idx} style={{ padding: '4px 0', borderBottom: '1px solid #F3F4F6', fontSize: '11px' }}>
              <div style={{ fontWeight: 500, color: '#1F2937' }}>{event.name}</div>
              <div style={{ color: '#9CA3AF' }}>{formatTime(event.timestamp)}</div>
            </div>
          ))
        )}
      </div>

      {/* Context */}
      <div>
        <h5 style={{ margin: '0 0 6px', fontSize: '12px', color: '#6B7280' }}>上下文</h5>
        <div style={{ fontSize: '11px', color: '#6B7280' }}>
          {span.conversationId && <div>Conversation: {span.conversationId.slice(0, 8)}...</div>}
          {span.taskId && <div>Task: {span.taskId.slice(0, 8)}...</div>}
          {span.workspaceId && <div>Workspace: {span.workspaceId.slice(0, 8)}...</div>}
        </div>
      </div>
    </div>
  )
}

export default SpanDetailPane
