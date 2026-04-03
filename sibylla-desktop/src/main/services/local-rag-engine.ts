import { promises as fs } from 'fs'
import * as path from 'path'
import { logger } from '../utils/logger'

export interface LocalRagSearchHit {
  path: string
  score: number
  snippet: string
}

export interface LocalRagSearchOptions {
  limit?: number
}

interface IndexedDocument {
  path: string
  mtimeMs: number
  length: number
  termFreq: Record<string, number>
}

interface RagIndexFile {
  version: 1
  generatedAt: string
  docCount: number
  avgDocLength: number
  sourceFingerprint: string
  docFreq: Record<string, number>
  documents: IndexedDocument[]
}

const MEMORY_ARCHIVES_DIR = '.sibylla/memory/archives'
const MEMORY_INDEX_DIR = '.sibylla/memory/index'
const RAG_INDEX_FILE = '.sibylla/memory/index/rag-index.json'

function normalizeText(input: string): string {
  return input.toLowerCase().replace(/\s+/g, ' ').trim()
}

function tokenize(input: string): string[] {
  const normalized = normalizeText(input)
  const tokens = normalized.match(/[\p{L}\p{N}_-]{2,}/gu) ?? []
  return tokens
}

function buildTermFrequency(tokens: string[]): Record<string, number> {
  const termFreq: Record<string, number> = {}
  for (const token of tokens) {
    termFreq[token] = (termFreq[token] ?? 0) + 1
  }
  return termFreq
}

function computeFingerprint(paths: string[], mtimeMs: number): string {
  return `${paths.sort().join('|')}::${Math.floor(mtimeMs)}`
}

function extractSnippet(content: string, queryTokens: string[]): string {
  if (content.length <= 220) {
    return content.replace(/\s+/g, ' ').trim()
  }

  const lowered = content.toLowerCase()
  for (const token of queryTokens) {
    const idx = lowered.indexOf(token.toLowerCase())
    if (idx !== -1) {
      const start = Math.max(0, idx - 80)
      const end = Math.min(content.length, idx + 140)
      return content.slice(start, end).replace(/\s+/g, ' ').trim()
    }
  }

  return content.slice(0, 220).replace(/\s+/g, ' ').trim()
}

export class LocalRagEngine {
  private workspacePath: string | null = null

  setWorkspacePath(workspacePath: string | null): void {
    this.workspacePath = workspacePath
  }

  async rebuildIndex(): Promise<void> {
    const workspacePath = this.ensureWorkspacePath()
    const archivesPath = path.join(workspacePath, MEMORY_ARCHIVES_DIR)
    const indexPath = path.join(workspacePath, RAG_INDEX_FILE)
    const indexDirPath = path.join(workspacePath, MEMORY_INDEX_DIR)
    await fs.mkdir(archivesPath, { recursive: true })
    await fs.mkdir(indexDirPath, { recursive: true })

    const archiveFiles = await this.listMarkdownFiles(archivesPath)
    let maxMtimeMs = 0
    const docFreq: Record<string, number> = {}
    const documents: IndexedDocument[] = []

    for (const filePath of archiveFiles) {
      const stat = await fs.stat(filePath)
      maxMtimeMs = Math.max(maxMtimeMs, stat.mtimeMs)
      const content = await fs.readFile(filePath, 'utf-8')
      const tokens = tokenize(content)
      const termFreq = buildTermFrequency(tokens)
      const uniqueTerms = Object.keys(termFreq)
      for (const term of uniqueTerms) {
        docFreq[term] = (docFreq[term] ?? 0) + 1
      }

      documents.push({
        path: filePath,
        mtimeMs: stat.mtimeMs,
        length: Math.max(tokens.length, 1),
        termFreq,
      })
    }

    const avgDocLength =
      documents.length === 0
        ? 0
        : documents.reduce((sum, doc) => sum + doc.length, 0) / documents.length
    const sourceFingerprint = computeFingerprint(archiveFiles, maxMtimeMs)
    const index: RagIndexFile = {
      version: 1,
      generatedAt: new Date().toISOString(),
      docCount: documents.length,
      avgDocLength,
      sourceFingerprint,
      docFreq,
      documents,
    }

    const tempPath = `${indexPath}.tmp`
    await fs.writeFile(tempPath, JSON.stringify(index), 'utf-8')
    await fs.rename(tempPath, indexPath)
    logger.info('[LocalRagEngine] Index rebuilt', {
      docCount: documents.length,
      indexPath,
    })
  }

  async search(query: string, options?: LocalRagSearchOptions): Promise<LocalRagSearchHit[]> {
    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) {
      return []
    }

    await this.ensureFreshIndex()
    const index = await this.loadIndex()
    const limit = options?.limit ?? 5
    if (index.documents.length === 0) {
      return []
    }

    const hits: Array<LocalRagSearchHit & { rawScore: number }> = []
    for (const doc of index.documents) {
      const bm25 = this.scoreBm25(doc, queryTokens, index.docFreq, index.documents.length, index.avgDocLength)
      const overlap = this.scoreOverlap(doc, queryTokens)
      const score = bm25 * 0.7 + overlap * 0.3
      if (score <= 0) {
        continue
      }

      const content = await fs.readFile(doc.path, 'utf-8')
      hits.push({
        path: doc.path,
        score: Number(score.toFixed(6)),
        snippet: extractSnippet(content, queryTokens),
        rawScore: score,
      })
    }

    return hits
      .sort((a, b) => b.rawScore - a.rawScore)
      .slice(0, limit)
      .map(({ rawScore: _rawScore, ...hit }) => hit)
  }

  createEmbedding(text: string, dimensions: number = 128): number[] {
    const vector = new Array<number>(dimensions).fill(0)
    const tokens = tokenize(text)
    if (tokens.length === 0) {
      return vector
    }

    for (const token of tokens) {
      let hash = 0
      for (let i = 0; i < token.length; i += 1) {
        hash = (hash * 31 + token.charCodeAt(i)) >>> 0
      }
      const slot = hash % dimensions
      vector[slot] = (vector[slot] ?? 0) + 1
    }

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
    if (norm > 0) {
      for (let i = 0; i < vector.length; i += 1) {
        vector[i] = Number(((vector[i] ?? 0) / norm).toFixed(8))
      }
    }

    return vector
  }

  private ensureWorkspacePath(): string {
    if (!this.workspacePath) {
      throw new Error('Workspace is not opened')
    }
    return this.workspacePath
  }

  private async ensureFreshIndex(): Promise<void> {
    const workspacePath = this.ensureWorkspacePath()
    const archivesPath = path.join(workspacePath, MEMORY_ARCHIVES_DIR)
    await fs.mkdir(archivesPath, { recursive: true })

    const archiveFiles = await this.listMarkdownFiles(archivesPath)
    let latestMtime = 0
    for (const filePath of archiveFiles) {
      const stat = await fs.stat(filePath)
      latestMtime = Math.max(latestMtime, stat.mtimeMs)
    }
    const currentFingerprint = computeFingerprint(archiveFiles, latestMtime)

    const existing = await this.tryLoadIndex()
    if (!existing || existing.sourceFingerprint !== currentFingerprint) {
      await this.rebuildIndex()
    }
  }

  private async loadIndex(): Promise<RagIndexFile> {
    const workspacePath = this.ensureWorkspacePath()
    const indexPath = path.join(workspacePath, RAG_INDEX_FILE)
    const content = await fs.readFile(indexPath, 'utf-8')
    return JSON.parse(content) as RagIndexFile
  }

  private async tryLoadIndex(): Promise<RagIndexFile | null> {
    try {
      return await this.loadIndex()
    } catch {
      return null
    }
  }

  private async listMarkdownFiles(dirPath: string): Promise<string[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const result: string[] = []

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const nested = await this.listMarkdownFiles(fullPath)
        result.push(...nested)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        result.push(fullPath)
      }
    }

    return result
  }

  private scoreBm25(
    doc: IndexedDocument,
    queryTokens: string[],
    docFreq: Record<string, number>,
    docCount: number,
    avgDocLength: number
  ): number {
    if (docCount === 0 || avgDocLength === 0) {
      return 0
    }

    const k1 = 1.2
    const b = 0.75
    let score = 0

    for (const token of queryTokens) {
      const tf = doc.termFreq[token] ?? 0
      if (tf === 0) {
        continue
      }
      const df = docFreq[token] ?? 0
      const idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5))
      const denominator = tf + k1 * (1 - b + b * (doc.length / avgDocLength))
      score += idf * ((tf * (k1 + 1)) / denominator)
    }

    return score
  }

  private scoreOverlap(doc: IndexedDocument, queryTokens: string[]): number {
    const matched = queryTokens.filter((token) => (doc.termFreq[token] ?? 0) > 0).length
    return queryTokens.length === 0 ? 0 : matched / queryTokens.length
  }
}
