import * as path from 'path'
import crypto from 'crypto'
import type { TaskStateMachine } from '../harness/task-state-machine'
import type { FileManager } from '../file-manager'
import type { Tracer } from '../trace/tracer'
import type { AppEventBus } from '../event-bus'
import type { logger as loggerType } from '../../utils/logger'
import type {
  TaskRecord,
  TaskState,
  ChecklistItem,
  ChecklistItemStatus,
  ProgressSnapshot,
  DeclareInput,
  UpdatePatch,
  TaskOutput,
} from './types'
import { FileOperationContext } from '../types/file-manager.types'

const USER_NOTE_OPEN_REGEX = /<!--\s*user-note:([^\s]*?)\s*-->/
const USER_NOTE_BLOCK_REGEX = /<!--\s*user-note:([^\s]*?)\s*-->\n([\s\S]*?)\n<!--\s*\/user-note:\1\s*-->/g
const TASK_ENTRY_SPLIT = '### ['
const ARCHIVE_BASE_DIR = '.sibylla/trace/progress-archive'
const CONFLICT_BACKUP_FILE = '.progress.conflict.md'

export class ProgressLedger {
  private tasks: Map<string, TaskRecord> = new Map()
  private writeQueue: Promise<void> = Promise.resolve()
  private userNoteBlocks: Map<string, string> = new Map()
  private lastRenderHash: string | null = null
  private taskSequence = 0

  constructor(
    private readonly taskStateMachine: TaskStateMachine,
    private readonly workspaceRoot: string,
    private readonly fileManager: FileManager,
    private readonly tracer: Tracer,
    private readonly eventBus: AppEventBus,
    private readonly logger: typeof loggerType,
  ) {}

  async initialize(): Promise<void> {
    const progressPath = this.progressPath()
    const exists = await this.fileManager.exists(progressPath, FileOperationContext.SYSTEM)
    if (exists) {
      await this.load()
    } else {
      await this.persist()
    }
  }

  async declare(input: DeclareInput): Promise<TaskRecord> {
    const id = this.generateTaskId()
    const now = new Date().toISOString()

    const checklist: ChecklistItem[] = (input.plannedChecklist ?? []).map((desc) => ({
      description: desc,
      status: 'pending' as const,
    }))

    const tsmState = await this.taskStateMachine.create(
      input.title,
      input.plannedChecklist ?? [],
    )

    const task: TaskRecord = {
      id,
      title: input.title,
      state: 'running',
      mode: input.mode,
      traceId: input.traceId,
      conversationId: input.conversationId,
      createdAt: now,
      startedAt: now,
      checklist,
      outputs: [],
    }

    void tsmState

    this.tasks.set(id, task)
    await this.persist()
    this.eventBus.emitTaskDeclared(task)
    return task
  }

  async update(taskId: string, patch: UpdatePatch): Promise<TaskRecord> {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`ProgressLedger.update: task not found — ${taskId}`)
    }
    if (task.state !== 'running') {
      throw new Error(`ProgressLedger.update: task not running — ${taskId} (state=${task.state})`)
    }

    if (patch.checklistUpdates) {
      for (const update of patch.checklistUpdates) {
        const item = task.checklist[update.index]
        if (item) {
          item.status = update.status
        }
      }
    }

    if (patch.newChecklistItems) {
      for (const desc of patch.newChecklistItems) {
        task.checklist.push({ description: desc, status: 'pending' })
      }
    }

    if (patch.output) {
      task.outputs.push(patch.output)
    }

    await this.persist()
    this.eventBus.emitTaskUpdated(task)
    return task
  }

  async complete(taskId: string, summary: string): Promise<TaskRecord> {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`ProgressLedger.complete: task not found — ${taskId}`)
    }

    const now = new Date()
    task.state = 'completed'
    task.completedAt = now.toISOString()
    task.durationMs = task.startedAt
      ? now.getTime() - new Date(task.startedAt).getTime()
      : undefined
    task.resultSummary = summary

    await this.taskStateMachine.updateStatus(taskId, 'completed')
    await this.persist()
    await this.maybeArchive()
    this.eventBus.emitTaskCompleted(task)
    return task
  }

  async fail(taskId: string, reason: string): Promise<TaskRecord> {
    const task = this.tasks.get(taskId)
    if (!task) {
      throw new Error(`ProgressLedger.fail: task not found — ${taskId}`)
    }

    const now = new Date()
    task.state = 'failed'
    task.completedAt = now.toISOString()
    task.durationMs = task.startedAt
      ? now.getTime() - new Date(task.startedAt).getTime()
      : undefined
    task.failureReason = reason

    await this.taskStateMachine.updateStatus(taskId, 'failed')
    await this.persist()
    await this.maybeArchive()
    this.eventBus.emitTaskFailed(task)
    return task
  }

  async editUserNote(taskId: string, note: string): Promise<void> {
    this.userNoteBlocks.set(taskId, note)
    const task = this.tasks.get(taskId)
    if (task) {
      task.userNotes = note
    }
    await this.persist()
  }

  getSnapshot(): ProgressSnapshot {
    const active: TaskRecord[] = []
    const completedRecent: TaskRecord[] = []
    const queued: TaskRecord[] = []

    for (const task of this.tasks.values()) {
      switch (task.state) {
        case 'running':
        case 'paused':
          active.push(task)
          break
        case 'completed':
        case 'failed':
          completedRecent.push(task)
          break
        case 'queued':
          queued.push(task)
          break
      }
    }

    completedRecent.sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0
      return bTime - aTime
    })

    return {
      active,
      completedRecent: completedRecent.slice(0, 10),
      queued,
      updatedAt: new Date().toISOString(),
    }
  }

  getTask(id: string): TaskRecord | null {
    return this.tasks.get(id) ?? null
  }

  async getArchive(month: string): Promise<string> {
    const archiveRelPath = path.join(ARCHIVE_BASE_DIR, `${month}.md`)
    try {
      const exists = await this.fileManager.exists(archiveRelPath, FileOperationContext.SYSTEM)
      if (!exists) return ''
      const result = await this.fileManager.readFile(archiveRelPath, { encoding: 'utf-8', context: FileOperationContext.SYSTEM })
      return result.content ?? ''
    } catch {
      return ''
    }
  }

  private persist(): Promise<void> {
    this.writeQueue = this.writeQueue.then(() => this.doPersist())
    return this.writeQueue
  }

  private async doPersist(): Promise<void> {
    const snapshot = this.buildSnapshot()
    const content = this.render(snapshot)
    const progressPath = this.progressPath()

    await this.withRetry(async () => {
      let existingContent = ''
      try {
        const exists = await this.fileManager.exists(progressPath, FileOperationContext.SYSTEM)
        if (exists) {
          const raw = await this.fileManager.readFile(progressPath, { encoding: 'utf-8', context: FileOperationContext.SYSTEM })
          existingContent = raw.content ?? ''
        }
      } catch {
        // File may not exist yet
      }

      if (existingContent) {
        this.detectUserEdits(existingContent)
      }

      await this.fileManager.writeFile(progressPath, content, { context: FileOperationContext.SYSTEM })
      this.lastRenderHash = this.hashContent(this.stripUserNotes(content))
    })
  }

  private async withRetry<T>(
    fn: () => Promise<T>,
    retries: number = 3,
    delayMs: number = 100,
  ): Promise<T> {
    let lastError: unknown
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastError = err
        if (attempt === retries) {
          this.logger.error('progress.write.failed.after-retries', {
            attempts: attempt + 1,
            err: String(err),
          })
          throw lastError
        }
        await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)))
      }
    }
    throw lastError
  }

  private buildSnapshot(): ProgressSnapshot {
    return this.getSnapshot()
  }

  private render(snapshot: ProgressSnapshot): string {
    const lines: string[] = []

    const completedToday = snapshot.completedRecent.filter((t) => {
      if (!t.completedAt) return false
      return new Date(t.completedAt).toDateString() === new Date().toDateString()
    }).length

    lines.push('---')
    lines.push(`version: 1`)
    lines.push(`updated: ${snapshot.updatedAt}`)
    lines.push(`active_count: ${snapshot.active.length}`)
    lines.push(`completed_today: ${completedToday}`)
    lines.push('---')
    lines.push('')

    lines.push('## 🔄 进行中')
    if (snapshot.active.length === 0) {
      lines.push('（暂无进行中的任务）')
    } else {
      for (const task of snapshot.active) {
        lines.push(this.renderTaskEntry(task, 'running'))
      }
    }
    lines.push('')

    lines.push('## ✅ 已完成（最近 10 条）')
    if (snapshot.completedRecent.length === 0) {
      lines.push('（暂无已完成的任务）')
    } else {
      for (const task of snapshot.completedRecent) {
        lines.push(this.renderTaskEntry(task, 'completed'))
      }
    }
    lines.push('')

    lines.push('## 📋 排队中')
    if (snapshot.queued.length === 0) {
      lines.push('（暂无排队中的任务）')
    } else {
      for (const task of snapshot.queued) {
        lines.push(this.renderTaskEntry(task, 'queued'))
      }
    }
    lines.push('')

    lines.push('> 归档文件位于 `.sibylla/trace/progress-archive/`')

    return lines.join('\n')
  }

  private renderTaskEntry(task: TaskRecord, mode: 'running' | 'completed' | 'queued'): string {
    const lines: string[] = []

    if (mode === 'running' || mode === 'queued') {
      lines.push(`### [${task.id}] ${task.title}`)
      if (task.startedAt) {
        lines.push(`- 开始时间：${this.formatTimestamp(task.startedAt)}`)
      }
      if (task.mode) {
        lines.push(`- 模式：${this.formatMode(task.mode)}`)
      }
      if (task.startedAt) {
        const elapsed = Date.now() - new Date(task.startedAt).getTime()
        lines.push(`- 已耗时：${this.formatDuration(elapsed)}`)
      }

      if (task.traceId) {
        lines.push(`- Trace：[查看执行轨迹](sibylla://trace/${task.traceId})`)
      } else {
        lines.push('- Trace：（无）')
      }

      if (task.checklist.length > 0) {
        lines.push('')
        lines.push('进度清单：')
        for (const item of task.checklist) {
          const icon = this.checklistIcon(item.status)
          lines.push(`  ${icon} ${item.description}`)
        }
      }

      const note = this.userNoteBlocks.get(task.id) ?? task.userNotes ?? ''
      lines.push(`<!-- user-note:${task.id} -->`)
      lines.push(note)
      lines.push(`<!-- /user-note:${task.id} -->`)
    } else if (mode === 'completed') {
      const statusIcon = task.state === 'failed' ? '❌' : '✓'
      lines.push(`### [${task.id}] ${task.title} ${statusIcon}`)

      if (task.durationMs !== undefined) {
        lines.push(`- 耗时：${this.formatDuration(task.durationMs)}`)
      }
      if (task.traceId) {
        lines.push(`- Trace：[查看执行轨迹](sibylla://trace/${task.traceId})`)
      } else {
        lines.push('- Trace：（无）')
      }

      if (task.outputs.length > 0) {
        lines.push('')
        lines.push('产出：')
        for (const output of task.outputs) {
          if (output.type === 'file') {
            lines.push(`  - 📄 \`${output.ref}\``)
          } else {
            lines.push(`  - 💬 ${output.ref}`)
          }
        }
      }

      if (task.resultSummary) {
        lines.push(`- 结果：${task.resultSummary}`)
      }
      if (task.failureReason) {
        lines.push(`- 失败原因：${task.failureReason}`)
      }
    }

    return lines.join('\n')
  }

  private detectUserEdits(existingContent: string): void {
    const extractedNotes = this.extractUserNotes(existingContent)
    for (const [taskId, note] of extractedNotes) {
      if (!this.userNoteBlocks.has(taskId)) {
        this.userNoteBlocks.set(taskId, note)
      }
      const task = this.tasks.get(taskId)
      if (task && !task.userNotes) {
        task.userNotes = note
      }
    }

    const strippedExisting = this.stripUserNotes(existingContent)

    if (this.lastRenderHash) {
      const previousRender = this.render(this.buildSnapshot())
      const strippedPrevious = this.stripUserNotes(previousRender)

      if (strippedExisting !== strippedPrevious && this.lastRenderHash !== this.hashContent(strippedExisting)) {
        void this.createConflictBackup(existingContent)
        this.eventBus.emit('progress:user-edit-conflict')
      }
    }
  }

  private extractUserNotes(content: string): Map<string, string> {
    const result = new Map<string, string>()
    USER_NOTE_BLOCK_REGEX.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = USER_NOTE_BLOCK_REGEX.exec(content)) !== null) {
      const taskId = match[1]
      const noteContent = match[2]
      result.set(taskId, noteContent)
    }
    return result
  }

  private stripUserNotes(content: string): string {
    return content.replace(USER_NOTE_BLOCK_REGEX, '').replace(USER_NOTE_OPEN_REGEX, '')
  }

  private async createConflictBackup(content: string): Promise<void> {
    try {
      await this.fileManager.writeFile(CONFLICT_BACKUP_FILE, content, { context: FileOperationContext.SYSTEM })
      this.logger.warn('progress.user-edit.detected', { path: CONFLICT_BACKUP_FILE })
    } catch (err) {
      this.logger.error('progress.conflict-backup.failed', { err: String(err) })
    }
  }

  private async maybeArchive(): Promise<void> {
    const completedAndFailed = Array.from(this.tasks.values()).filter(
      (t) => t.state === 'completed' || t.state === 'failed',
    )

    completedAndFailed.sort((a, b) => {
      const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0
      const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0
      return bTime - aTime
    })

    if (completedAndFailed.length <= 10) return

    const toArchive = completedAndFailed.slice(10)
    const month = new Date().toISOString().substring(0, 7)
    const archiveRelPath = path.join(ARCHIVE_BASE_DIR, `${month}.md`)

    const archiveLines: string[] = []
    for (const task of toArchive) {
      archiveLines.push(this.renderTaskEntry(task, 'completed'))
      archiveLines.push('')
    }

    try {
      await this.appendFileSafe(archiveRelPath, archiveLines.join('\n'))
      for (const task of toArchive) {
        this.tasks.delete(task.id)
      }
    } catch (err) {
      this.logger.error('progress.archive.failed', { err: String(err) })
    }
  }

  private async appendFileSafe(filePath: string, content: string): Promise<void> {
    let existing = ''
    try {
      const exists = await this.fileManager.exists(filePath, FileOperationContext.SYSTEM)
      if (exists) {
        const raw = await this.fileManager.readFile(filePath, { encoding: 'utf-8', context: FileOperationContext.SYSTEM })
        existing = raw.content ?? ''
      }
    } catch {
      // File may not exist yet
    }

    const combined = existing + (existing ? '\n\n' : '') + content
    await this.fileManager.writeFile(filePath, combined, { context: FileOperationContext.SYSTEM })
  }

  private async load(): Promise<void> {
    const progressPath = this.progressPath()
    try {
      const raw = await this.fileManager.readFile(progressPath, { encoding: 'utf-8', context: FileOperationContext.SYSTEM })
      const content = raw.content ?? ''

      const extractedNotes = this.extractUserNotes(content)
      for (const [taskId, note] of extractedNotes) {
        this.userNoteBlocks.set(taskId, note)
      }

      const activeTasks = this.parseSection(content, '🔄 进行中', 'running')
      const completedTasks = this.parseSection(content, '✅ 已完成', 'completed')
      const queuedTasks = this.parseSection(content, '📋 排队中', 'queued')

      this.tasks.clear()
      for (const task of [...activeTasks, ...completedTasks, ...queuedTasks]) {
        this.tasks.set(task.id, task)
      }

      this.lastRenderHash = this.hashContent(this.stripUserNotes(content))
    } catch (err) {
      this.logger.error('progress.load.failed', { err: String(err) })
      await this.persist()
    }
  }

  private parseSection(content: string, sectionHeader: string, mode: 'running' | 'completed' | 'queued'): TaskRecord[] {
    const headerIndex = content.indexOf(`## ${sectionHeader}`)
    if (headerIndex === -1) return []

    let nextHeaderIndex = content.length
    const nextHeaderMatch = content.slice(headerIndex + 1).match(/\n## /)
    if (nextHeaderMatch && nextHeaderMatch.index !== undefined) {
      nextHeaderIndex = headerIndex + 1 + nextHeaderMatch.index
    }

    const sectionContent = content.slice(headerIndex, nextHeaderIndex)
    return this.parseTaskEntries(sectionContent, mode)
  }

  private parseTaskEntries(sectionContent: string, mode: 'running' | 'completed' | 'queued'): TaskRecord[] {
    const entries = sectionContent.split(TASK_ENTRY_SPLIT).slice(1)
    const tasks: TaskRecord[] = []

    for (const entry of entries) {
      try {
        const task = this.parseSingleTaskEntry(entry, mode)
        if (task) tasks.push(task)
      } catch {
        // Skip malformed entries
      }
    }

    return tasks
  }

  private parseSingleTaskEntry(entry: string, mode: 'running' | 'completed' | 'queued'): TaskRecord | null {
    const idMatch = entry.match(/^([^\]]*)\]/)
    if (!idMatch) return null

    const id = idMatch[1]
    const titleMatch = entry.match(/^\S*\]\s*(.*?)(?:\s*[✓❌]|$)/m)
    const title = titleMatch ? titleMatch[1].trim() : entry.split('\n')[0]?.trim() ?? ''

    let state: TaskState
    if (mode === 'running') state = 'running'
    else if (mode === 'queued') state = 'queued'
    else {
      state = entry.includes('❌') ? 'failed' : 'completed'
    }

    const startedAtMatch = entry.match(/开始时间[：:]\s*(.+)/)
    const traceMatch = entry.match(/sibylla:\/\/trace\/([^)]+)/)
    const durationMatch = entry.match(/耗时[：:]\s*(.+)/)
    const resultMatch = entry.match(/结果[：:]\s*(.+)/)
    const failureMatch = entry.match(/失败原因[：:]\s*(.+)/)

    const modeMatch = entry.match(/模式[：:]\s*(.+)/)
    let taskMode: TaskRecord['mode']
    if (modeMatch) {
      const modeStr = modeMatch[1].trim()
      const modeMap: Record<string, TaskRecord['mode']> = {
        '计划': 'plan', '分析': 'analyze', '审查': 'review', '自由': 'free',
      }
      taskMode = modeMap[modeStr]
    }

    const checklist: ChecklistItem[] = []
    const checklistLines = entry.match(/ {2}[⏸🔄✅⏭]\s+.+/gu)
    if (checklistLines) {
      for (const line of checklistLines) {
        const statusChar = line.trim()[0]
        const desc = line.trim().slice(2)
        let status: ChecklistItemStatus = 'pending'
        if (statusChar === '🔄') status = 'in_progress'
        else if (statusChar === '✅') status = 'done'
        else if (statusChar === '⏭') status = 'skipped'
        else if (statusChar === '⏸') status = 'pending'
        checklist.push({ description: desc, status })
      }
    }

    const outputs: TaskOutput[] = []
    const fileOutputMatch = entry.match(/📄\s*`([^`]+)`/g)
    if (fileOutputMatch) {
      for (const m of fileOutputMatch) {
        const ref = m.match(/`([^`]+)`/)?.[1] ?? ''
        outputs.push({ type: 'file', ref })
      }
    }

    const createdAt = startedAtMatch?.[1]?.trim() ?? new Date().toISOString()

    const task: TaskRecord = {
      id,
      title,
      state,
      mode: taskMode,
      traceId: traceMatch?.[1],
      createdAt,
      startedAt: startedAtMatch?.[1]?.trim(),
      completedAt: (() => {
        if (state !== 'completed' && state !== 'failed') return undefined
        if (!startedAtMatch?.[1]?.trim()) return undefined
        const started = new Date(startedAtMatch[1].trim()).getTime()
        if (isNaN(started)) return undefined
        if (durationMatch) {
          return new Date(started + this.parseDuration(durationMatch[1].trim())).toISOString()
        }
        return undefined
      })(),
      checklist,
      outputs,
      resultSummary: resultMatch?.[1]?.trim(),
      failureReason: failureMatch?.[1]?.trim(),
      userNotes: this.userNoteBlocks.get(id),
    }

    if (durationMatch) {
      const durationStr = durationMatch[1].trim()
      task.durationMs = this.parseDuration(durationStr)
    }

    return task
  }

  private generateTaskId(): string {
    this.taskSequence++
    const now = new Date()
    const date = now.toISOString().slice(0, 10).replace(/-/g, '')
    const time = now.toISOString().slice(11, 19).replace(/:/g, '')
    const seq = String(this.taskSequence).padStart(2, '0')
    return `T-${date}-${time}-${seq}`
  }

  private formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }
    return `${seconds}s`
  }

  private parseDuration(str: string): number {
    const minuteMatch = str.match(/(\d+)\s*m/)
    const secondMatch = str.match(/(\d+)\s*s/)
    const minutes = minuteMatch ? parseInt(minuteMatch[1], 10) : 0
    const seconds = secondMatch ? parseInt(secondMatch[1], 10) : 0
    return (minutes * 60 + seconds) * 1000
  }

  private formatTimestamp(iso: string): string {
    try {
      const d = new Date(iso)
      const pad = (n: number) => n.toString().padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
    } catch {
      return iso
    }
  }

  private formatMode(mode: NonNullable<TaskRecord['mode']>): string {
    const map: Record<string, string> = {
      plan: '计划',
      analyze: '分析',
      review: '审查',
      free: '自由',
    }
    return map[mode] ?? mode
  }

  private checklistIcon(status: ChecklistItemStatus): string {
    switch (status) {
      case 'pending': return '⏸'
      case 'in_progress': return '🔄'
      case 'done': return '✅'
      case 'skipped': return '⏭'
    }
  }

  private progressPath(): string {
    return 'progress.md'
  }

  private hashContent(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16)
  }
}
