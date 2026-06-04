import type { AppEventBus } from '../event-bus'
import type { GitAbstraction } from '../git-abstraction'

import type { KanbanService } from './kanban-service'
import type { KanbanColumn, StatusSuggestion } from './types'

interface StatusSignal {
  type: string
  weight: number
  description: string
}

interface DismissalEntry {
  suggestedStatus: KanbanColumn
  dismissedAt: number
}

const DISMISSAL_COOLDOWN_MS = 24 * 60 * 60 * 1000
const COMMIT_KEYWORD_RE = /(完成|done|finish|closed)/i
const FROZEN_RE = /frozen|published/i
const GROWTH_THRESHOLD = 200

export class TaskStatusTracker {
  private readonly dismissals = new Map<string, DismissalEntry>()
  private unsubscribeFn: (() => void) | null = null
  private readonly fileExistenceCache = new Map<string, boolean>()

  constructor(
    private readonly kanbanService: KanbanService,
    private readonly eventBus: AppEventBus,
    _gitAbstraction: GitAbstraction,
  ) {}

  start(): void {
    this.unsubscribeFn = this.eventBus.subscribe<{
      path: string
      changes: string
    }>('file.updated', async (event) => {
      await this.handleFileUpdated(event.payload.path, event.payload.changes)
    })
  }

  stop(): void {
    if (this.unsubscribeFn) {
      this.unsubscribeFn()
      this.unsubscribeFn = null
    }
  }

  private async handleFileUpdated(filePath: string, changes: string): Promise<void> {
    const model = this.kanbanService['modelCache']
    if (!model) return

    for (const task of model.tasks) {
      if (!task.relatedFiles?.length) continue
      if (task.status === '已完成') continue

      const isRelated = task.relatedFiles.some(
        (rf) => filePath === rf || filePath.endsWith(rf) || rf.endsWith(filePath),
      )
      if (!isRelated) continue

      const suggestion = this.evaluate(task.id, filePath, changes, task.status)
      if (suggestion) {
        if (!this.isDismissed(task.id, suggestion.suggestedStatus)) {
          this.eventBus.emitEvent({
            type: 'kanban.task-status-changed',
            source: 'task-status-tracker',
            payload: {
              taskId: task.id,
              from: suggestion.currentStatus,
              to: suggestion.suggestedStatus,
              trigger: 'ai-auto',
            },
          })
        }
      }
    }
  }

  evaluate(
    taskId: string,
    filePath: string,
    changes: string,
    currentStatus: KanbanColumn,
  ): StatusSuggestion | null {
    const signals: StatusSignal[] = []

    const wasExisting = this.fileExistenceCache.get(filePath)
    this.fileExistenceCache.set(filePath, true)

    if (!wasExisting) {
      signals.push({
        type: 'file-created',
        weight: 0.3,
        description: `关联文件 ${filePath} 首次创建`,
      })
    }

    if (changes && changes.length > GROWTH_THRESHOLD) {
      signals.push({
        type: 'file-growth',
        weight: 0.2,
        description: `关联文件 ${filePath} 内容增量 > 200 字`,
      })
    }

    if (COMMIT_KEYWORD_RE.test(changes)) {
      signals.push({
        type: 'commit-keyword',
        weight: 0.5,
        description: 'commit 消息包含完成关键词',
      })
    }

    if (FROZEN_RE.test(changes)) {
      signals.push({
        type: 'file-frozen',
        weight: 0.4,
        description: `文件包含 frozen/published 标记`,
      })
    }

    const task = this.kanbanService.getTaskById(taskId)
    if (task?.deadline) {
      const staleSignal = this.detectStaleRisk(task.deadline, task.id)
      if (staleSignal) {
        signals.push(staleSignal)
        this.eventBus.emitEvent({
          type: 'kanban.task-risk-detected',
          source: 'task-status-tracker',
          payload: {
            taskId: task.id,
            riskType: 'stale-risk',
            confidence: staleSignal.weight,
            signals: [staleSignal.description],
          },
        })
      }
    }

    if (signals.length === 0) return null

    const nonRiskSignals = signals.filter((s) => s.type !== 'stale-risk')
    if (nonRiskSignals.length === 0) return null

    const confidence = Math.min(
      nonRiskSignals.reduce((sum, s) => sum + s.weight, 0),
      1.0,
    )

    if (confidence < 0.6) return null

    let suggestedStatus: KanbanColumn
    if (currentStatus === '待开始') {
      suggestedStatus = '进行中'
    } else if (currentStatus === '进行中') {
      suggestedStatus = '已完成'
    } else {
      return null
    }

    return {
      taskId,
      currentStatus,
      suggestedStatus,
      confidence,
      signals: nonRiskSignals.map((s) => ({
        type: s.type,
        weight: s.weight,
        description: s.description,
      })),
      reasoning: nonRiskSignals.map((s) => s.description).join('; '),
    }
  }

  private detectStaleRisk(deadline: string, _taskId: string): StatusSignal | null {
    const deadlineDate = new Date(deadline)
    const now = Date.now()
    const msUntilDeadline = deadlineDate.getTime() - now
    const hoursUntilDeadline = msUntilDeadline / (1000 * 60 * 60)

    if (hoursUntilDeadline > 0 && hoursUntilDeadline <= 24) {
      return {
        type: 'stale-risk',
        weight: 0.3,
        description: `截止日期临近（${hoursUntilDeadline.toFixed(1)}h）`,
      }
    }

    if (hoursUntilDeadline <= 0) {
      return {
        type: 'stale-risk',
        weight: 0.3,
        description: `任务已逾期`,
      }
    }

    return null
  }

  isDismissed(taskId: string, suggestedStatus: KanbanColumn): boolean {
    const key = `${taskId}:${suggestedStatus}`
    const entry = this.dismissals.get(key)
    if (!entry) return false
    return Date.now() - entry.dismissedAt < DISMISSAL_COOLDOWN_MS
  }

  recordDismissal(taskId: string, suggestedStatus: KanbanColumn): void {
    this.dismissals.set(`${taskId}:${suggestedStatus}`, {
      suggestedStatus,
      dismissedAt: Date.now(),
    })
  }
}
