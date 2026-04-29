export interface WikiLink {
  sourcePath: string
  targetPath: string
  linkText: string
  position: number
  createdAt: string
}

export interface Backlink {
  sourcePath: string
  linkText: string
  position: number
  snippet?: string
}

export interface GraphData {
  nodes: Array<{ id: string; label: string; linkCount: number }>
  edges: Array<{ source: string; target: string }>
}

export interface ExtractedLink {
  target: string
  text: string
  position: number
}

export interface LinkCount {
  incoming: number
  outgoing: number
}
