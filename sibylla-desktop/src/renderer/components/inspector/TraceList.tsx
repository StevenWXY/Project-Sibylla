import React, { useState, useMemo } from 'react'
import { useTraceStore, selectRecentTraces } from '../../store/traceStore'

interface TraceListProps {
  selected: string | null
  onSelect: (traceId: string) => void
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export const TraceList: React.FC<TraceListProps> = ({ selected, onSelect }) => {
  const recentTraces = useTraceStore(selectRecentTraces)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search) return recentTraces
    const q = search.toLowerCase()
    return recentTraces.filter(t =>
      t.traceId.toLowerCase().includes(q) ||
      t.spanCount.toString().includes(q)
    )
  }, [recentTraces, search])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px', borderBottom: '1px solid #E5E7EB' }}>
        <input
          type="text"
          placeholder="搜索 Trace..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%',
            padding: '6px 8px',
            fontSize: '12px',
            border: '1px solid #E5E7EB',
            borderRadius: '4px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.map(trace => (
          <div
            key={trace.traceId}
            onClick={() => onSelect(trace.traceId)}
            style={{
              padding: '8px 12px',
              cursor: 'pointer',
              background: selected === trace.traceId ? '#EEF2FF' : 'transparent',
              borderLeft: selected === trace.traceId ? '3px solid #6366F1' : '3px solid transparent',
              transition: 'background 0.1s ease',
              borderBottom: '1px solid #F3F4F6',
            }}
            onMouseEnter={e => {
              if (selected !== trace.traceId) e.currentTarget.style.background = '#F9FAFB'
            }}
            onMouseLeave={e => {
              if (selected !== trace.traceId) e.currentTarget.style.background = 'transparent'
            }}
          >
            <div style={{ fontSize: '11px', color: '#6B7280', fontFamily: 'monospace' }}>
              {trace.traceId.slice(0, 8)}...{trace.traceId.slice(-4)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', fontSize: '11px', color: '#9CA3AF' }}>
              <span>{formatTime(trace.startTime)}</span>
              <span>{trace.spanCount} spans</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF', fontSize: '12px' }}>
            无 Trace 记录
          </div>
        )}
      </div>
    </div>
  )
}

export default TraceList
