import React, { useRef, useEffect, useMemo, useCallback } from 'react'
import { useTraceStore, selectCurrentSpans } from '../../store/traceStore'
import type { SerializedSpanShared } from '../../../shared/types'

interface FlameGraphProps {
  traceId: string
  onSpanClick: (spanId: string) => void
}

interface SpanNode {
  span: SerializedSpanShared
  children: SpanNode[]
  depth: number
}

function buildSpanTree(spans: SerializedSpanShared[]): SpanNode[] {
  const map = new Map<string, SpanNode>()
  for (const span of spans) {
    map.set(span.spanId, { span, children: [], depth: 0 })
  }
  const roots: SpanNode[] = []
  for (const span of spans) {
    const node = map.get(span.spanId)!
    if (span.parentSpanId && map.has(span.parentSpanId)) {
      map.get(span.parentSpanId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  function assignDepth(nodes: SpanNode[], depth: number) {
    for (const node of nodes) {
      node.depth = depth
      assignDepth(node.children, depth + 1)
    }
  }
  assignDepth(roots, 0)
  return roots
}

function getSpanColor(span: SerializedSpanShared): string {
  if (span.status === 'error') return '#EF4444'
  if (span.kind === 'ai-call') return '#6366F1'
  if (span.kind === 'tool-call') return '#10B981'
  return '#9CA3AF'
}

const ROW_HEIGHT = 24
const MIN_BLOCK_WIDTH = 2

export const FlameGraph: React.FC<FlameGraphProps> = ({ traceId: _traceId, onSpanClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const spans = useTraceStore(selectCurrentSpans)
  const [hoveredSpan, setHoveredSpan] = React.useState<SerializedSpanShared | null>(null)

  const tree = useMemo(() => buildSpanTree(spans), [spans])
  const allNodes = useMemo(() => {
    const nodes: SpanNode[] = []
    function walk(ns: SpanNode[]) {
      for (const n of ns) { nodes.push(n); walk(n.children) }
    }
    walk(tree)
    return nodes
  }, [tree])

  const maxDepth = useMemo(() => Math.max(0, ...allNodes.map(n => n.depth)), [allNodes])

  const rootSpan = useMemo(() => {
    if (spans.length === 0) return null
    const sorted = [...spans].sort((a, b) => a.startTimeMs - b.startTimeMs)
    return sorted[0]
  }, [spans])

  const timeRange = useMemo(() => {
    if (!rootSpan) return { start: 0, end: 1 }
    const endMs = Math.max(...spans.map(s => s.endTimeMs))
    return { start: rootSpan.startTimeMs, end: endMs }
  }, [rootSpan, spans])

  const drawFlame = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || allNodes.length === 0) return

    const width = container.clientWidth
    const height = (maxDepth + 1) * ROW_HEIGHT + 8
    canvas.width = width * window.devicePixelRatio
    canvas.height = height * window.devicePixelRatio
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    ctx.clearRect(0, 0, width, height)

    const range = timeRange.end - timeRange.start || 1

    for (const node of allNodes) {
      const x = ((node.span.startTimeMs - timeRange.start) / range) * width
      const w = (node.span.durationMs / range) * width
      const y = node.depth * ROW_HEIGHT + 4

      if (w < MIN_BLOCK_WIDTH) continue

      ctx.fillStyle = getSpanColor(node.span)
      ctx.fillRect(x, y, Math.max(w - 1, MIN_BLOCK_WIDTH), ROW_HEIGHT - 2)

      if (w > 40) {
        ctx.fillStyle = '#FFFFFF'
        ctx.font = '11px -apple-system, sans-serif'
        const text = node.span.name
        const measured = ctx.measureText(text).width
        if (measured < w - 8) {
          ctx.fillText(text, x + 4, y + 15)
        } else {
          const truncated = text.slice(0, Math.floor((w - 8) / 7))
          ctx.fillText(truncated, x + 4, y + 15)
        }
      }
    }
  }, [allNodes, maxDepth, timeRange])

  useEffect(() => {
    drawFlame()
    const resizeObs = new ResizeObserver(() => drawFlame())
    if (containerRef.current) resizeObs.observe(containerRef.current)
    return () => resizeObs.disconnect()
  }, [drawFlame])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const range = timeRange.end - timeRange.start || 1
    const width = rect.width

    const depth = Math.floor((y - 4) / ROW_HEIGHT)
    const timeOffset = (x / width) * range + timeRange.start

    for (const node of allNodes) {
      if (
        node.depth === depth &&
        node.span.startTimeMs <= timeOffset &&
        node.span.endTimeMs >= timeOffset
      ) {
        setHoveredSpan(node.span)
        if (tooltipRef.current) {
          tooltipRef.current.style.left = `${e.clientX - rect.left + 12}px`
          tooltipRef.current.style.top = `${e.clientY - rect.top - 30}px`
          tooltipRef.current.style.display = 'block'
          tooltipRef.current.textContent = `${node.span.name} — ${node.span.durationMs}ms`
        }
        return
      }
    }
    setHoveredSpan(null)
    if (tooltipRef.current) tooltipRef.current.style.display = 'none'
  }

  const handleClick = (_e: React.MouseEvent<HTMLCanvasElement>) => {
    if (hoveredSpan) {
      onSpanClick(hoveredSpan.spanId)
    }
  }

  if (spans.length === 0) {
    return <div style={{ padding: '20px', textAlign: 'center', color: '#9CA3AF' }}>无 Span 数据</div>
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        style={{ cursor: hoveredSpan ? 'pointer' : 'default' }}
      />
      <div
        ref={tooltipRef}
        style={{
          position: 'absolute',
          display: 'none',
          background: '#1F2937',
          color: '#FFFFFF',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          zIndex: 10,
        }}
      />
    </div>
  )
}

export default FlameGraph
