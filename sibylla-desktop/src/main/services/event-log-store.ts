import { promises as fs } from 'fs'
import path from 'path'
import type { SibyllaEvent } from './event-bus-types'

export class EventLogStore {
  private readonly baseDir: string
  private readonly buffer: SibyllaEvent[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private static readonly FLUSH_INTERVAL_MS = 1000
  private static readonly BUFFER_MAX = 50

  constructor(baseDir: string) {
    this.baseDir = baseDir
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true })
  }

  append(event: SibyllaEvent): void {
    this.buffer.push(event)
    if (this.buffer.length >= EventLogStore.BUFFER_MAX) {
      void this.flush()
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        void this.flush()
      }, EventLogStore.FLUSH_INTERVAL_MS)
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }

    if (this.buffer.length === 0) return

    const batch = this.buffer.splice(0, this.buffer.length)
    const byFile = new Map<string, string[]>()

    for (const event of batch) {
      const fileName = this.getMonthlyFileName(event.timestamp)
      const lines = byFile.get(fileName) ?? []
      lines.push(JSON.stringify(event))
      byFile.set(fileName, lines)
    }

    for (const [fileName, lines] of byFile) {
      const filePath = path.join(this.baseDir, fileName)
      const content = lines.join('\n') + '\n'
      await fs.appendFile(filePath, content, 'utf-8')
    }
  }

  async read(month: string): Promise<SibyllaEvent[]> {
    await this.flush()
    const filePath = path.join(this.baseDir, `${month}.jsonl`)
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return content
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          try {
            return JSON.parse(line) as SibyllaEvent
          } catch {
            return null
          }
        })
        .filter((e): e is SibyllaEvent => e !== null)
    } catch {
      return []
    }
  }

  async cleanup(olderThanMonths: number): Promise<number> {
    const files = await fs.readdir(this.baseDir)
    const cutoff = this.getMonthOffset(-olderThanMonths)
    let deleted = 0
    for (const file of files) {
      const month = file.replace('.jsonl', '')
      if (/^\d{4}-\d{2}$/.test(month) && month < cutoff) {
        await fs.unlink(path.join(this.baseDir, file))
        deleted++
      }
    }
    return deleted
  }

  private getMonthlyFileName(timestamp: number): string {
    const d = new Date(timestamp)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    return `${yyyy}-${mm}.jsonl`
  }

  private getMonthOffset(offset: number): string {
    const d = new Date()
    d.setMonth(d.getMonth() + offset)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
}
