import React, { useMemo, useState } from 'react'
import { useTraceStore, selectCurrentSpans } from '../../store/traceStore'
import type { SerializedSpanShared } from '../../../shared/types'

interface PerformanceStatsProps {
  traceId: string
}

interface SpanAggregation {
  name: string
  callCount: number
  avgDurationMs: number
  p95DurationMs: number
  maxDurationMs: number
  errorCount: number
}

function aggregateSpans(spans: SerializedSpanShared[]): SpanAggregation[] {
  const map = new Map<string, { durations: number[]; errorCount: number }>()
  for (const span of spans) {
    const entry = map.get(span.name) ?? { durations: [], errorCount: 0 }
    entry.durations.push(span.durationMs)
    if (span.status === 'error') entry.errorCount++
    map.set(span.name, entry)
  }

  const result: SpanAggregation[] = []
  for (const [name, data] of map) {
    const sorted = [...data.durations].sort((a, b) => a - b)
    const p95Idx = Math.floor(sorted.length * 0.95)
    result.push({
      name,
      callCount: sorted.length,
      avgDurationMs: sorted.reduce((a, b) => a + b, 0) / sorted.length,
      p95DurationMs: sorted[Math.min(p95Idx, sorted.length - 1)] ?? 0,
      maxDurationMs: sorted[sorted.length - 1] ?? 0,
      errorCount: data.errorCount,
    })
  }
  return result
}

type SortKey = 'name' | 'callCount' | 'avgDurationMs' | 'p95DurationMs' | 'maxDurationMs' | 'errorCount'

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function getColorForDuration(ms: number, avg: number): string {
  if (ms > avg * 3) return '#EF4444'
  if (ms > avg * 1.5) return '#F59E0B'
  return '#10B981'
}

export const PerformanceStats: React.FC<PerformanceStatsProps> = ({ traceId: _traceId }) => {
  const spans = useTraceStore(selectCurrentSpans)
  const [sortKey, setSortKey] = useState<SortKey>('callCount')
  const [sortAsc, setSortAsc] = useState(false)

  const aggregations = useMemo(() => aggregateSpans(spans), [spans])

  const sorted = useMemo(() => {
    const arr = [...aggregations]
    arr.sort((a, b) => {
      const va = a[sortKey]
      const vb = b[sortKey]
      if (typeof va === 'string' && typeof vb === 'string') {
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      return sortAsc ? (va as number) - (vb as number) : (vb as number) - (va as number)
    })
    return arr
  }, [aggregations, sortKey, sortAsc])

  const overallAvg = aggregations.length > 0
    ? aggregations.reduce((s, a) => s + a.avgDurationMs, 0) / aggregations.length
    : 0

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  if (spans.length === 0) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF' }}>无 Span 数据</div>
  }

  const columns: Array<{ key: SortKey; label: string; width: string }> = [
    { key: 'name', label: 'Span 名称', width: '1fr' },
    { key: 'callCount', label: '调用次数', width: '72px' },
    { key: 'avgDurationMs', label: '平均耗时', width: '80px' },
    { key: 'p95DurationMs', label: 'P95', width: '80px' },
    { key: 'maxDurationMs', label: '最大耗时', width: '80px' },
    { key: 'errorCount', label: '错误次数', width: '72px' },
  ]

  return (
    <div style={{ padding: '12px', overflow: 'auto' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: columns.map(c => c.width).join(' '),
        gap: '0',
        borderBottom: '2px solid #E5E7EB',
        paddingBottom: '6px',
        marginBottom: '4px',
        fontSize: '11px',
        fontWeight: 600,
        color: '#6B7280',
      }}>
        {columns.map(col => (
          <span
            key={col.key}
            onClick={() => handleSort(col.key)}
            style={{ cursor: 'pointer', userSelect: 'none' }}
          >
            {col.label} {sortKey === col.key ? (sortAsc ? '↑' : '↓') : ''}
          </span>
        ))}
      </div>
      {sorted.map(row => (
        <div
          key={row.name}
          style={{
            display: 'grid',
            gridTemplateColumns: columns.map(c => c.width).join(' '),
            padding: '6px 0',
            borderBottom: '1px solid #F3F4F6',
            fontSize: '12px',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
          <span style={{ textAlign: 'right' }}>{row.callCount}</span>
          <span style={{ textAlign: 'right', color: getColorForDuration(row.avgDurationMs, overallAvg) }}>
            {formatDuration(row.avgDurationMs)}
          </span>
          <span style={{ textAlign: 'right', color: getColorForDuration(row.p95DurationMs, overallAvg) }}>
            {formatDuration(row.p95DurationMs)}
          </span>
          <span style={{ textAlign: 'right', color: getColorForDuration(row.maxDurationMs, overallAvg) }}>
            {formatDuration(row.maxDurationMs)}
          </span>
          <span style={{ textAlign: 'right', color: row.errorCount > 0 ? '#EF4444' : '#10B981' }}>
            {row.errorCount}
          </span>
        </div>
      ))}
    </div>
  )
}

export default PerformanceStats
