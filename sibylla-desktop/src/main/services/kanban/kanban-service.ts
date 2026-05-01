import { randomBytes } from 'node:crypto'

import type { FileManager } from '../file-manager'
import type { ProgressLedger } from '../progress/progress-ledger'
import type { TaskStateMachine } from '../harness/task-state-machine'
import type { AppEventBus } from '../event-bus'
import type { TaskRecord } from '../progress/types'

import type { KanbanColumn, KanbanModel, KanbanTask, CreateTaskInput } from './types'

const TASKS_MD_FILENAME = 'tasks.md'

const SECTION_HEADER_RE = /^##\s*(待开始|进行中|已完成)/
const CHECKBOX_RE = /^(\s*)-\s*\[([xX ])\]\s*(.+)/
const TASK_ID_RE = /<!--\s*task-id:\s*(\S+)(?:\s+(ai-linked))?\s*-->/
const AI_SUGGESTED_RE = /<!--\s*ai-suggested\s*-->/
const METADATA_RE = /^\s+-\s+(负责人|优先级|截止日期|关联文件|完成时间)\s*:\s*(.+)/

const COLUMNS: KanbanColumn[] = ['待开始', '进行中', '已完成']

export class KanbanService {
  private modelCache: KanbanModel | null = null
  private unsubscribeFns: Array<() => void> = []

  constructor(
    private readonly fileManager: FileManager,
    private readonly progressLedger: ProgressLedger,
    private readonly taskStateMachine: TaskStateMachine,
    private readonly eventBus: AppEventBus,
  ) {
    this.setupSubscriptions()
  }

  private setupSubscriptions(): void {
    const unsub1 = this.eventBus.subscribe<TaskRecord>('progress.task-completed', (event) => {
      const task = event.payload
      if (task.kanbanTaskId) {
        const kanbanTask = this.modelCache?.tasks.find((t) => t.id === task.kanbanTaskId)
        if (kanbanTask?.isAiLinked) {
          this.updateTaskStatus(task.kanbanTaskId, '已完成', 'ai-auto').catch(() => {})
          this.eventBus.emitEvent({
            type: 'kanban.task-completed',
            source: 'kanban-service',
            payload: { taskId: task.kanbanTaskId, completedBy: 'ai-auto' },
          })
        }
      }
    })

    const unsub2 = this.eventBus.subscribe<TaskRecord>('progress.task-failed', (event) => {
      const task = event.payload
      if (task.kanbanTaskId) {
        this.invalidateCache()
      }
    })

    const unsub3 = this.eventBus.subscribe<{ path: string; changes: string }>('file.updated', (event) => {
      const filePath = event.payload.path
      if (filePath.endsWith(`/${TASKS_MD_FILENAME}`) || filePath === TASKS_MD_FILENAME) {
        this.invalidateCache()
      }
    })

    this.unsubscribeFns.push(unsub1, unsub2, unsub3)
  }

  destroy(): void {
    for (const fn of this.unsubscribeFns) {
      fn()
    }
    this.unsubscribeFns = []
  }

  private invalidateCache(): void {
    this.modelCache = null
  }

  async parseTasksMd(workspacePath: string): Promise<KanbanModel> {
    if (this.modelCache) return this.modelCache

    let rawContent: string
    try {
      const result = await this.fileManager.readFile(`${workspacePath}/${TASKS_MD_FILENAME}`)
      rawContent = result.content
    } catch {
      const emptyModel = this.buildEmptyModel('')
      this.modelCache = emptyModel
      return emptyModel
    }

    try {
      const model = this.parseContent(rawContent)
      this.modelCache = model
      return model
    } catch {
      const model = this.buildEmptyModel(rawContent)
      model.parseError = true
      this.modelCache = model
      return model
    }
  }

  private buildEmptyModel(rawContent: string): KanbanModel {
    return {
      tasks: [],
      columns: { '待开始': [], '进行中': [], '已完成': [] },
      rawContent,
      parsedAt: Date.now(),
      parseError: false,
    }
  }

  private parseContent(rawContent: string): KanbanModel {
    const lines = rawContent.split('\n')
    const tasks: KanbanTask[] = []
    const columns: Record<KanbanColumn, KanbanTask[]> = {
      '待开始': [],
      '进行中': [],
      '已完成': [],
    }

    let currentColumn: KanbanColumn | null = null
    let currentTask: KanbanTask | null = null

    for (const line of lines) {
      const headerMatch = SECTION_HEADER_RE.exec(line)
      if (headerMatch) {
        currentColumn = headerMatch[1] as KanbanColumn
        currentTask = null
        continue
      }

      const checkboxMatch = CHECKBOX_RE.exec(line)
      if (checkboxMatch && currentColumn) {
        if (currentTask) {
          this.finalizeTask(currentTask, tasks, columns)
        }

        const checked = checkboxMatch[2].toLowerCase() === 'x'
        const restOfLine = checkboxMatch[3]

        const idMatch = TASK_ID_RE.exec(restOfLine)
        const hasAiSuggested = AI_SUGGESTED_RE.test(restOfLine)

        let title = restOfLine
          .replace(TASK_ID_RE, '')
          .replace(AI_SUGGESTED_RE, '')
          .trim()

        const status: KanbanColumn = checked ? '已完成' : currentColumn

        currentTask = {
          id: idMatch?.[1] ?? '',
          title,
          status,
          isAiLinked: idMatch?.[2] === 'ai-linked',
          isAiSuggested: hasAiSuggested,
          rawLine: line,
          metadataLines: [],
        }
        continue
      }

      const metaMatch = METADATA_RE.exec(line)
      if (metaMatch && currentTask) {
        const key = metaMatch[1]
        const value = metaMatch[2].trim()
        currentTask.metadataLines.push(line)

        switch (key) {
          case '负责人':
            currentTask.assignee = value
            break
          case '优先级':
            if (value === 'P0' || value === 'P1' || value === 'P2') {
              currentTask.priority = value
            }
            break
          case '截止日期':
            currentTask.deadline = value
            break
          case '关联文件':
            currentTask.relatedFiles = value.split(',').map((f) => f.trim()).filter(Boolean)
            break
          case '完成时间':
            currentTask.completedAt = value
            break
        }
      }
    }

    if (currentTask) {
      this.finalizeTask(currentTask, tasks, columns)
    }

    return {
      tasks,
      columns,
      rawContent,
      parsedAt: Date.now(),
      parseError: false,
    }
  }

  private finalizeTask(
    task: KanbanTask,
    tasks: KanbanTask[],
    columns: Record<KanbanColumn, KanbanTask[]>,
  ): void {
    const actualStatus = task.status === '已完成' ? '已完成' : task.status
    task.status = actualStatus
    tasks.push(task)
    if (columns[actualStatus]) {
      columns[actualStatus].push(task)
    }
  }

  async updateTaskStatus(
    taskId: string,
    newStatus: KanbanColumn,
    trigger: 'drag' | 'ai-auto' | 'dispatch' = 'drag',
  ): Promise<void> {
    let rawContent: string
    try {
      const result = await this.fileManager.readFile(TASKS_MD_FILENAME)
      rawContent = result.content
    } catch {
      throw new Error(`Failed to read tasks.md for status update: ${taskId}`)
    }

    const lines = rawContent.split('\n')
    const oldStatus = this.findTaskColumn(lines, taskId)
    if (!oldStatus) {
      throw new Error(`Task ${taskId} not found in tasks.md`)
    }

    const { modifiedContent, from, to } = this.moveTaskInContent(
      lines,
      taskId,
      oldStatus,
      newStatus,
    )

    await this.fileManager.writeFile(TASKS_MD_FILENAME, modifiedContent)

    this.invalidateCache()

    this.eventBus.emitEvent({
      type: 'kanban.task-status-changed',
      source: 'kanban-service',
      payload: { taskId, from, to: newStatus, trigger },
    })
  }

  private findTaskColumn(lines: string[], taskId: string): KanbanColumn | null {
    let currentColumn: KanbanColumn | null = null
    for (const line of lines) {
      const headerMatch = SECTION_HEADER_RE.exec(line)
      if (headerMatch) {
        currentColumn = headerMatch[1] as KanbanColumn
        continue
      }
      if (currentColumn && TASK_ID_RE.test(line)) {
        const match = TASK_ID_RE.exec(line)
        if (match?.[1] === taskId) {
          const checkMatch = CHECKBOX_RE.exec(line)
          if (checkMatch && checkMatch[2].toLowerCase() === 'x') {
            return '已完成'
          }
          return currentColumn
        }
      }
    }
    return null
  }

  private moveTaskInContent(
    lines: string[],
    taskId: string,
    fromColumn: KanbanColumn,
    toColumn: KanbanColumn,
  ): { modifiedContent: string; from: string; to: string } {
    const taskLineIndex = lines.findIndex((line) => {
      const match = TASK_ID_RE.exec(line)
      return match?.[1] === taskId
    })

    if (taskLineIndex === -1) {
      return { modifiedContent: lines.join('\n'), from: fromColumn, to: toColumn }
    }

    const taskBlockStart = taskLineIndex
    const taskBlockEnd = this.findTaskBlockEnd(lines, taskLineIndex)
    const taskBlock = lines.slice(taskBlockStart, taskBlockEnd + 1)

    if (toColumn === '已完成' && fromColumn !== '已完成') {
      taskBlock[0] = taskBlock[0].replace(/- \[ \]/, '- [x]')
      const hasCompletionMeta = taskBlock.some((l) => /完成时间:/.test(l))
      if (!hasCompletionMeta) {
        const indent = taskBlock[0].match(/^(\s*)/)?.[1] ?? ''
        taskBlock.push(`${indent}  - 完成时间: ${new Date().toISOString().split('T')[0]}`)
      }
    } else if (toColumn !== '已完成' && fromColumn === '已完成') {
      taskBlock[0] = taskBlock[0].replace(/- \[x\]/, '- [ ]').replace(/- \[X\]/, '- [ ]')
      const completionLineIdx = taskBlock.findIndex((l) => /完成时间:/.test(l))
      if (completionLineIdx !== -1) {
        taskBlock.splice(completionLineIdx, 1)
      }
    }

    const remainingLines = [
      ...lines.slice(0, taskBlockStart),
      ...lines.slice(taskBlockEnd + 1),
    ]

    const targetSectionIdx = remainingLines.findIndex((line) =>
      SECTION_HEADER_RE.test(line) && (SECTION_HEADER_RE.exec(line))?.[1] === toColumn,
    )

    if (targetSectionIdx === -1) {
      remainingLines.push(`## ${toColumn}`, '')
      remainingLines.push(...taskBlock)
    } else {
      let insertIdx = targetSectionIdx + 1
      while (insertIdx < remainingLines.length && remainingLines[insertIdx].trim() === '') {
        insertIdx++
      }

      while (
        insertIdx < remainingLines.length &&
        !SECTION_HEADER_RE.test(remainingLines[insertIdx])
      ) {
        insertIdx++
      }

      remainingLines.splice(insertIdx, 0, ...taskBlock)
    }

    return {
      modifiedContent: remainingLines.join('\n'),
      from: fromColumn,
      to: toColumn,
    }
  }

  private findTaskBlockEnd(lines: string[], startIndex: number): number {
    let end = startIndex
    for (let i = startIndex + 1; i < lines.length; i++) {
      if (CHECKBOX_RE.test(lines[i]) || SECTION_HEADER_RE.test(lines[i])) {
        break
      }
      if (METADATA_RE.test(lines[i]) || lines[i].trim() === '') {
        if (lines[i].trim() === '' && i + 1 < lines.length && !METADATA_RE.test(lines[i + 1])) {
          break
        }
        end = i
      } else {
        break
      }
    }
    return end
  }

  async createTask(input: CreateTaskInput): Promise<KanbanTask> {
    const taskId = `tsk_${randomBytes(3).toString('hex')}`
    const targetColumn: KanbanColumn = input.status ?? '待开始'

    const metaLines: string[] = []
    if (input.assignee) metaLines.push(`  - 负责人: ${input.assignee}`)
    if (input.priority) metaLines.push(`  - 优先级: ${input.priority}`)
    if (input.deadline) metaLines.push(`  - 截止日期: ${input.deadline}`)
    if (input.relatedFiles?.length)
      metaLines.push(`  - 关联文件: ${input.relatedFiles.join(', ')}`)

    const aiSuggestedTag = input.isAiSuggested ? ' <!-- ai-suggested -->' : ''
    const taskLine = `- [ ] ${input.title} <!-- task-id: ${taskId} -->${aiSuggestedTag}`
    const fullBlock = metaLines.length > 0 ? `${taskLine}\n${metaLines.join('\n')}` : taskLine

    let rawContent: string
    try {
      const result = await this.fileManager.readFile(TASKS_MD_FILENAME)
      rawContent = result.content
    } catch {
      rawContent = `# 任务清单\n\n## 待开始\n\n## 进行中\n\n## 已完成\n`
    }

    const lines = rawContent.split('\n')
    const sectionIdx = lines.findIndex((line) =>
      SECTION_HEADER_RE.test(line) && (SECTION_HEADER_RE.exec(line))?.[1] === targetColumn,
    )

    if (sectionIdx === -1) {
      lines.push(`## ${targetColumn}`, '', fullBlock)
    } else {
      let insertIdx = sectionIdx + 1
      while (insertIdx < lines.length && lines[insertIdx].trim() === '') {
        insertIdx++
      }
      while (
        insertIdx < lines.length &&
        !SECTION_HEADER_RE.test(lines[insertIdx])
      ) {
        insertIdx++
      }
      lines.splice(insertIdx, 0, fullBlock)
    }

    await this.fileManager.writeFile(TASKS_MD_FILENAME, lines.join('\n'))

    this.invalidateCache()

    const task: KanbanTask = {
      id: taskId,
      title: input.title,
      status: targetColumn,
      assignee: input.assignee,
      priority: input.priority,
      deadline: input.deadline,
      relatedFiles: input.relatedFiles,
      isAiLinked: false,
      isAiSuggested: input.isAiSuggested ?? false,
      rawLine: taskLine,
      metadataLines: metaLines,
    }

    this.eventBus.emitEvent({
      type: 'kanban.task-created',
      source: 'kanban-service',
      payload: {
        taskId,
        title: input.title,
        assignee: input.assignee,
        source: input.isAiSuggested ? 'ai-suggest' : 'user',
      },
    })

    return task
  }

  async dispatchToAI(taskId: string): Promise<string> {
    const model = await this.parseTasksMd('')
    const task = model.tasks.find((t) => t.id === taskId)
    if (!task) throw new Error(`Task ${taskId} not found`)

    const ledgerTask = await this.progressLedger.declare({
      title: task.title,
      kanbanTaskId: taskId,
    })

    await this.taskStateMachine.create(ledgerTask.id, [])

    await this.addAiLinkedMarker(taskId)

    this.invalidateCache()

    this.eventBus.emitEvent({
      type: 'kanban.task-dispatched',
      source: 'kanban-service',
      payload: { taskId, ledgerTaskId: ledgerTask.id },
    })

    this.eventBus.emitEvent({
      type: 'kanban.task-status-changed',
      source: 'kanban-service',
      payload: { taskId, from: task.status, to: '进行中', trigger: 'dispatch' },
    })

    return ledgerTask.id
  }

  private async addAiLinkedMarker(taskId: string): Promise<void> {
    const result = await this.fileManager.readFile(TASKS_MD_FILENAME)
    const lines = result.content.split('\n')

    const taskLineIdx = lines.findIndex((line) => {
      const match = TASK_ID_RE.exec(line)
      return match?.[1] === taskId
    })

    if (taskLineIdx === -1) return

    const line = lines[taskLineIdx]
    lines[taskLineIdx] = line.replace(
      /<!--\s*task-id:\s*(\S+)\s*-->/,
      '<!-- task-id: $1 ai-linked -->',
    )

    await this.fileManager.writeFile(TASKS_MD_FILENAME, lines.join('\n'))
  }

  async promoteFromLedger(ledgerTaskId: string): Promise<string> {
    const task = this.progressLedger.getTask(ledgerTaskId)
    if (!task) throw new Error(`Ledger task ${ledgerTaskId} not found`)

    const kanbanTask = await this.createTask({
      title: task.title,
      status: '进行中',
    })

    await this.progressLedger.update(ledgerTaskId, {})

    this.invalidateCache()

    this.eventBus.emitEvent({
      type: 'kanban.task-created',
      source: 'kanban-service',
      payload: {
        taskId: kanbanTask.id,
        title: task.title,
        source: 'ai-suggest',
      },
    })

    return kanbanTask.id
  }

  getTaskById(taskId: string): KanbanTask | null {
    return this.modelCache?.tasks.find((t) => t.id === taskId) ?? null
  }
}
