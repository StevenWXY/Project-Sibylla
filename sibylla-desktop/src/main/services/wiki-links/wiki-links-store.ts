import type Database from 'better-sqlite3'
import type { WikiLink, Backlink, GraphData, LinkCount } from './types'
import { logger } from '../../utils/logger'

const BROKEN_PREFIX = '__broken__:'

export class WikiLinksStore {
  private readonly db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  getBacklinks(targetPath: string): Backlink[] {
    const rows = this.db.prepare(
      'SELECT source_path, link_text, position FROM wiki_links WHERE target_path = ? ORDER BY source_path',
    ).all(targetPath) as Array<{ source_path: string; link_text: string; position: number }>

    return rows.map((row) => ({
      sourcePath: row.source_path,
      linkText: row.link_text,
      position: row.position,
    }))
  }

  getOutlinks(sourcePath: string): WikiLink[] {
    const rows = this.db.prepare(
      'SELECT source_path, target_path, link_text, position, created_at FROM wiki_links WHERE source_path = ? ORDER BY position',
    ).all(sourcePath) as Array<{
      source_path: string
      target_path: string
      link_text: string
      position: number
      created_at: string
    }>

    return rows.map((row) => ({
      sourcePath: row.source_path,
      targetPath: row.target_path,
      linkText: row.link_text,
      position: row.position,
      createdAt: row.created_at,
    }))
  }

  getGraphData(centerPath?: string): GraphData {
    if (centerPath) {
      return this.getFocusedGraphData(centerPath)
    }
    return this.getFullGraphData()
  }

  getLinkCount(filePath: string): LinkCount {
    const incoming = (
      this.db
        .prepare('SELECT COUNT(*) as count FROM wiki_links WHERE target_path = ?')
        .get(filePath) as { count: number }
    ).count

    const outgoing = (
      this.db
        .prepare('SELECT COUNT(*) as count FROM wiki_links WHERE source_path = ?')
        .get(filePath) as { count: number }
    ).count

    return { incoming, outgoing }
  }

  getBrokenLinks(): WikiLink[] {
    const likeBroken = BROKEN_PREFIX + '%'
    const rows = this.db.prepare(
      'SELECT source_path, target_path, link_text, position, created_at FROM wiki_links WHERE target_path LIKE ?',
    ).all(likeBroken) as Array<{
      source_path: string
      target_path: string
      link_text: string
      position: number
      created_at: string
    }>

    return rows.map((row) => ({
      sourcePath: row.source_path,
      targetPath: row.target_path,
      linkText: row.link_text,
      position: row.position,
      createdAt: row.created_at,
    }))
  }

  private getFullGraphData(): GraphData {
    const rows = this.db.prepare(
      `SELECT DISTINCT source_path, target_path FROM wiki_links WHERE target_path NOT LIKE '${BROKEN_PREFIX}%'`,
    ).all() as Array<{ source_path: string; target_path: string }>

    const nodeMap = new Map<string, { label: string; linkCount: number }>()
    const edges: Array<{ source: string; target: string }> = []

    for (const row of rows) {
      this.ensureNode(nodeMap, row.source_path)
      this.ensureNode(nodeMap, row.target_path)

      nodeMap.get(row.source_path)!.linkCount++
      nodeMap.get(row.target_path)!.linkCount++

      edges.push({ source: row.source_path, target: row.target_path })
    }

    return {
      nodes: Array.from(nodeMap.entries()).map(([id, data]) => ({
        id,
        label: data.label,
        linkCount: data.linkCount,
      })),
      edges,
    }
  }

  private getFocusedGraphData(centerPath: string): GraphData {
    const degree1 = new Set<string>()
    degree1.add(centerPath)

    const outlinks = this.db.prepare(
      'SELECT DISTINCT target_path FROM wiki_links WHERE source_path = ? AND target_path NOT LIKE ?',
    ).all(centerPath, BROKEN_PREFIX + '%') as Array<{ target_path: string }>

    const inlinks = this.db.prepare(
      'SELECT DISTINCT source_path FROM wiki_links WHERE target_path = ?',
    ).all(centerPath) as Array<{ source_path: string }>

    for (const r of outlinks) degree1.add(r.target_path)
    for (const r of inlinks) degree1.add(r.source_path)

    const degree2 = new Set<string>(degree1)

    for (const node of degree1) {
      if (node === centerPath) continue

      const out2 = this.db.prepare(
        'SELECT DISTINCT target_path FROM wiki_links WHERE source_path = ? AND target_path NOT LIKE ?',
      ).all(node, BROKEN_PREFIX + '%') as Array<{ target_path: string }>

      const in2 = this.db.prepare(
        'SELECT DISTINCT source_path FROM wiki_links WHERE target_path = ?',
      ).all(node) as Array<{ source_path: string }>

      for (const r of out2) degree2.add(r.target_path)
      for (const r of in2) degree2.add(r.source_path)
    }

    const nodeMap = new Map<string, { label: string; linkCount: number }>()
    for (const node of degree2) {
      this.ensureNode(nodeMap, node)
    }

    const likeBroken = BROKEN_PREFIX + '%'
    const allEdges = this.db.prepare(
      `SELECT source_path, target_path FROM wiki_links WHERE target_path NOT LIKE ?`,
    ).all(likeBroken) as Array<{ source_path: string; target_path: string }>

    const edges: Array<{ source: string; target: string }> = []
    for (const row of allEdges) {
      if (degree2.has(row.source_path) && degree2.has(row.target_path)) {
        nodeMap.get(row.source_path)!.linkCount++
        nodeMap.get(row.target_path)!.linkCount++
        edges.push({ source: row.source_path, target: row.target_path })
      }
    }

    return {
      nodes: Array.from(nodeMap.entries()).map(([id, data]) => ({
        id,
        label: data.label,
        linkCount: data.linkCount,
      })),
      edges,
    }
  }

  private ensureNode(
    nodeMap: Map<string, { label: string; linkCount: number }>,
    filePath: string,
  ): void {
    if (!nodeMap.has(filePath)) {
      const parts = filePath.split('/')
      nodeMap.set(filePath, {
        label: parts[parts.length - 1] || filePath,
        linkCount: 0,
      })
    }
  }
}
