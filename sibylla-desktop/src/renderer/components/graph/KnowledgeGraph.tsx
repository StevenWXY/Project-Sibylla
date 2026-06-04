import { useCallback, useEffect, useRef, useState } from 'react'

interface GraphNode {
  id: string
  label: string
  linkCount: number
  x: number
  y: number
  vx: number
  vy: number
}

interface GraphEdge {
  source: string
  target: string
}

interface GraphData {
  nodes: Array<{ id: string; label: string; linkCount: number }>
  edges: Array<{ source: string; target: string }>
}

export interface KnowledgeGraphProps {
  centerPath?: string
}

export function KnowledgeGraph({ centerPath }: KnowledgeGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const animFrameRef = useRef<number>(0)
  const nodesRef = useRef<GraphNode[]>([])

  useEffect(() => {
    async function loadGraph() {
      setLoading(true)
      try {
        const response = await window.electronAPI.wikiLinks.getGraphData(centerPath)
        if (!response.success || !response.data) {
          setNodes([])
          setEdges([])
          setLoading(false)
          return
        }
        const data: GraphData = response.data
        const graphNodes: GraphNode[] = data.nodes.map((n) => ({
          id: n.id,
          label: n.label,
          linkCount: n.linkCount,
          x: 400 + (Math.random() - 0.5) * 200,
          y: 300 + (Math.random() - 0.5) * 200,
          vx: 0,
          vy: 0,
        }))
        setNodes(graphNodes)
        setEdges(data.edges)
      } catch {
        setNodes([])
        setEdges([])
      }
      setLoading(false)
    }
    void loadGraph()
  }, [centerPath])

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || nodes.length === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height

    function simulate() {
      const currentNodes = nodesRef.current

      for (const node of currentNodes) {
        node.vx *= 0.95
        node.vy *= 0.95
        node.x += node.vx
        node.y += node.vy

        if (node.x < 20) { node.x = 20; node.vx *= -0.5 }
        if (node.x > width - 20) { node.x = width - 20; node.vx *= -0.5 }
        if (node.y < 20) { node.y = 20; node.vy *= -0.5 }
        if (node.y > height - 20) { node.y = height - 20; node.vy *= -0.5 }
      }

      for (const edge of edges) {
        const source = currentNodes.find((n) => n.id === edge.source)
        const target = currentNodes.find((n) => n.id === edge.target)
        if (!source || !target) continue

        const dx = target.x - source.x
        const dy = target.y - source.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const idealDist = 120

        if (dist > 0) {
          const force = (dist - idealDist) * 0.002
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          source.vx += fx
          source.vy += fy
          target.vx -= fx
          target.vy -= fy
        }
      }

      for (let i = 0; i < currentNodes.length; i++) {
        for (let j = i + 1; j < currentNodes.length; j++) {
          const a = currentNodes[i]
          const b = currentNodes[j]
          if (!a || !b) continue
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 80 && dist > 0) {
            const force = (80 - dist) * 0.01
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            a.vx -= fx
            a.vy -= fy
            b.vx += fx
            b.vy += fy
          }
        }
      }

      if (!ctx) return
      ctx.clearRect(0, 0, width, height)

      ctx.strokeStyle = 'rgba(100, 150, 255, 0.3)'
      ctx.lineWidth = 1
      for (const edge of edges) {
        const source = currentNodes.find((n) => n.id === edge.source)
        const target = currentNodes.find((n) => n.id === edge.target)
        if (!source || !target) continue

        ctx.beginPath()
        ctx.moveTo(source.x, source.y)
        ctx.lineTo(target.x, target.y)
        ctx.stroke()
      }

      for (const node of currentNodes) {
        const radius = Math.max(4, Math.min(12, 4 + node.linkCount * 2))
        const isHovered = hoveredNode === node.id

        ctx.beginPath()
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
        ctx.fillStyle = isHovered ? '#60a5fa' : '#3b82f6'
        ctx.fill()

        if (isHovered) {
          ctx.strokeStyle = '#93c5fd'
          ctx.lineWidth = 2
          ctx.stroke()
        }

        ctx.fillStyle = isHovered ? '#e2e8f0' : '#94a3b8'
        ctx.font = '10px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(node.label, node.x, node.y + radius + 12)
      }

      animFrameRef.current = requestAnimationFrame(simulate)
    }

    animFrameRef.current = requestAnimationFrame(simulate)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [nodes, edges, hoveredNode])

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = event.clientX - rect.left
      const y = event.clientY - rect.top

      const found = nodes.find((node) => {
        const dx = node.x - x
        const dy = node.y - y
        return Math.sqrt(dx * dx + dy * dy) < 15
      })

      setHoveredNode(found?.id ?? null)
    },
    [nodes],
  )

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!hoveredNode) return
      const fileName = hoveredNode.split('/').pop() ?? hoveredNode
      import('../../store/tabStore').then(({ useTabStore }) => {
        useTabStore.getState().openTab(hoveredNode, fileName)
      })
    },
    [hoveredNode],
  )

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-sys-darkMuted">Loading graph...</div>
      </div>
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-sys-darkMuted">No wiki links found</div>
      </div>
    )
  }

  return (
    <div className="knowledge-graph h-full w-full relative">
      <canvas
        ref={canvasRef}
        width={800}
        height={600}
        className="w-full h-full"
        onMouseMove={handleMouseMove}
        onClick={handleNodeClick}
      />
    </div>
  )
}
