import React, { useState, useMemo } from 'react'
import { useTraceStore, selectCurrentSpans } from '../../store/traceStore'
import type { SerializedSpanShared } from '../../../shared/types'

interface SearchBarProps {
  traceId: string | null
}

interface SearchResult {
  spanId: string
  spanName: string
  fieldPath: string
  matchValue: string
}

function searchSpans(spans: SerializedSpanShared[], query: string): SearchResult[] {
  const results: SearchResult[] = []
  const q = query.toLowerCase()
  for (const span of spans) {
    for (const [key, value] of Object.entries(span.attributes)) {
      if (key.toLowerCase().includes(q) || String(value).toLowerCase().includes(q)) {
        results.push({
          spanId: span.spanId,
          spanName: span.name,
          fieldPath: `attributes.${key}`,
          matchValue: String(value),
        })
      }
    }
    for (const event of span.events) {
      for (const [key, value] of Object.entries(event.attributes)) {
        if (key.toLowerCase().includes(q) || String(value).toLowerCase().includes(q)) {
          results.push({
            spanId: span.spanId,
            spanName: span.name,
            fieldPath: `events.${event.name}.attributes.${key}`,
            matchValue: String(value),
          })
        }
      }
    }
  }
  return results
}

export const SearchBar: React.FC<SearchBarProps> = ({ traceId }) => {
  const spans = useTraceStore(selectCurrentSpans)
  const [query, setQuery] = useState('')
  const [showResults, setShowResults] = useState(false)

  const results = useMemo(() => {
    if (!query || query.length < 2) return []
    return searchSpans(spans, query)
  }, [spans, query])

  const handleJumpToSpan = (spanId: string) => {
    useTraceStore.getState().selectSpan(spanId)
    setShowResults(false)
  }

  if (!traceId) return null

  return (
    <div style={{ borderTop: '1px solid #E5E7EB', padding: '6px 12px', background: '#F9FAFB', position: 'relative' }}>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="搜索属性值..."
          value={query}
          onChange={e => { setQuery(e.target.value); setShowResults(true) }}
          onFocus={() => setShowResults(true)}
          style={{
            flex: 1,
            padding: '5px 8px',
            fontSize: '12px',
            border: '1px solid #E5E7EB',
            borderRadius: '4px',
            outline: 'none',
          }}
        />
        {query && results.length > 0 && (
          <span style={{ fontSize: '11px', color: '#9CA3AF', whiteSpace: 'nowrap' }}>
            {results.length} 匹配
          </span>
        )}
      </div>
      {showResults && results.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '12px',
            right: '12px',
            maxHeight: '200px',
            overflowY: 'auto',
            background: '#FFFFFF',
            border: '1px solid #E5E7EB',
            borderRadius: '6px',
            boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
            zIndex: 20,
          }}
        >
          {results.slice(0, 50).map((r, idx) => (
            <div
              key={`${r.spanId}-${idx}`}
              onClick={() => handleJumpToSpan(r.spanId)}
              style={{
                padding: '6px 10px',
                cursor: 'pointer',
                borderBottom: '1px solid #F3F4F6',
                fontSize: '11px',
                transition: 'background 0.1s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#EEF2FF'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{ fontWeight: 500, color: '#1F2937' }}>{r.spanName}</div>
              <div style={{ color: '#9CA3AF' }}>
                {r.fieldPath}: <span style={{ color: '#6366F1' }}>{r.matchValue.slice(0, 60)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default SearchBar
