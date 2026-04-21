import React, { useEffect } from 'react'
import { useTraceStore, selectSelectedTraceId, selectSelectedSpanId, selectViewMode, selectCompareTraceId } from '../../store/traceStore'
import { TraceList } from './TraceList'
import { FlameGraph } from './FlameGraph'
import { SpanTreeView } from './SpanTreeView'
import { TimelineView } from './TimelineView'
import { PerformanceStats } from './PerformanceStats'
import { SpanDetailPane } from './SpanDetailPane'
import { SearchBar } from './SearchBar'
import { ExportDialog } from './ExportDialog'

interface TraceInspectorProps {
  initialTraceId?: string
}

const VIEW_MODES: Array<{ value: 'flamegraph' | 'tree' | 'timeline' | 'perf'; label: string }> = [
  { value: 'flamegraph', label: '🔥 火焰图' },
  { value: 'tree', label: '🌳 树形' },
  { value: 'timeline', label: '⏱ 时间线' },
  { value: 'perf', label: '📊 性能' },
]

export const TraceInspector: React.FC<TraceInspectorProps> = ({ initialTraceId }) => {
  const selectedTraceId = useTraceStore(selectSelectedTraceId)
  const selectedSpanId = useTraceStore(selectSelectedSpanId)
  const viewMode = useTraceStore(selectViewMode)
  const compareTraceId = useTraceStore(selectCompareTraceId)
  const { selectTrace, setViewMode, setCompareTrace, fetchRecentTraces } = useTraceStore()

  const [showExport, setShowExport] = React.useState(false)

  useEffect(() => {
    fetchRecentTraces(100)
  }, [fetchRecentTraces])

  useEffect(() => {
    if (initialTraceId && initialTraceId !== selectedTraceId) {
      selectTrace(initialTraceId)
    }
  }, [initialTraceId, selectedTraceId, selectTrace])

  const handleSpanClick = (spanId: string) => {
    useTraceStore.getState().selectSpan(spanId)
  }

  const renderMainView = () => {
    if (!selectedTraceId) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9CA3AF', fontSize: '14px' }}>
          选择左侧 Trace 查看详情
        </div>
      )
    }

    switch (viewMode) {
      case 'flamegraph':
        return <FlameGraph traceId={selectedTraceId} onSpanClick={handleSpanClick} />
      case 'tree':
        return <SpanTreeView traceId={selectedTraceId} onSpanClick={handleSpanClick} />
      case 'timeline':
        return <TimelineView traceId={selectedTraceId} onSpanClick={handleSpanClick} />
      case 'perf':
        return <PerformanceStats traceId={selectedTraceId} />
    }
  }

  return (
    <div
      className="trace-inspector"
      style={{
        display: 'flex',
        height: '100%',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        color: '#1F2937',
        background: '#FFFFFF',
      }}
    >
      {/* Left sidebar - Trace list */}
      <div
        className="inspector-sidebar"
        style={{
          width: '220px',
          minWidth: '220px',
          borderRight: '1px solid #E5E7EB',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <TraceList
          selected={selectedTraceId}
          onSelect={(id) => selectTrace(id)}
        />
      </div>

      {/* Main area */}
      <div
        className="inspector-main"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Toolbar */}
        <div
          className="inspector-toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderBottom: '1px solid #E5E7EB',
            background: '#F9FAFB',
          }}
        >
          {/* View mode buttons */}
          <div style={{ display: 'flex', gap: '2px', background: '#E5E7EB', borderRadius: '6px', padding: '2px' }}>
            {VIEW_MODES.map(mode => (
              <button
                key={mode.value}
                onClick={() => setViewMode(mode.value)}
                style={{
                  padding: '4px 10px',
                  fontSize: '12px',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  background: viewMode === mode.value ? '#FFFFFF' : 'transparent',
                  color: viewMode === mode.value ? '#6366F1' : '#6B7280',
                  fontWeight: viewMode === mode.value ? 600 : 400,
                  boxShadow: viewMode === mode.value ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Compare button */}
          <button
            onClick={() => setCompareTrace(compareTraceId ? null : selectedTraceId)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              border: `1px solid ${compareTraceId ? '#6366F1' : '#E5E7EB'}`,
              borderRadius: '4px',
              cursor: 'pointer',
              background: compareTraceId ? '#EEF2FF' : 'transparent',
              color: compareTraceId ? '#6366F1' : '#6B7280',
            }}
          >
            {compareTraceId ? '取消对比' : '对比'}
          </button>

          {/* Export button */}
          <button
            onClick={() => setShowExport(true)}
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              border: '1px solid #E5E7EB',
              borderRadius: '4px',
              cursor: 'pointer',
              background: 'transparent',
              color: '#6B7280',
              marginLeft: 'auto',
            }}
          >
            导出
          </button>
        </div>

        {/* View content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {renderMainView()}
        </div>

        {/* Bottom search */}
        <SearchBar traceId={selectedTraceId} />
      </div>

      {/* Right detail pane */}
      {selectedSpanId && (
        <div
          className="inspector-detail"
          style={{
            width: '300px',
            minWidth: '300px',
            borderLeft: '1px solid #E5E7EB',
            overflow: 'auto',
            background: '#F9FAFB',
          }}
        >
          <SpanDetailPane spanId={selectedSpanId} />
        </div>
      )}

      {/* Export dialog */}
      {showExport && selectedTraceId && (
        <ExportDialog
          traceIds={[selectedTraceId]}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}

export default TraceInspector
