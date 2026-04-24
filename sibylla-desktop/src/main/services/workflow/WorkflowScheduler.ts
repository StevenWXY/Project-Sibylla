import chokidar from 'chokidar'
import type { BrowserWindow } from 'electron'
import type { WorkflowDefinition } from '../../../shared/types'
import type { UserConfirmationDecision } from './types'
import { WorkflowRegistry } from './WorkflowRegistry'
import { WorkflowExecutor } from './WorkflowExecutor'
import { WorkflowRunStore } from './WorkflowRunStore'
import { logger } from '../../utils/logger'

const MAX_CONCURRENT_PER_WORKFLOW = 2
const FILE_DEBOUNCE_MS = 1000

interface PendingConfirmation {
  resolve: (decision: UserConfirmationDecision) => void
  request: import('../../../shared/types').WorkflowConfirmationRequest
}

export class WorkflowScheduler {
  private watchers: chokidar.FSWatcher[] = []
  private cronTimers: ReturnType<typeof setInterval>[] = []
  private activeRunCounts = new Map<string, number>()
  private pendingConfirmations = new Map<string, PendingConfirmation>()
  private fileDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private mainWindow: BrowserWindow | null = null

  constructor(
    private readonly registry: WorkflowRegistry,
    private readonly executor: WorkflowExecutor,
    private readonly runStore: WorkflowRunStore,
    private readonly currentUser?: string,
  ) {}

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  async initialize(): Promise<void> {
    this.setupFileWatchers()
    this.scheduleCronTriggers()
    await this.recoverIncompleteRuns()

    logger.info('[WorkflowScheduler] 初始化完成')
  }

  async triggerManual(
    workflowId: string,
    params: Record<string, unknown>,
  ): Promise<string> {
    const workflow = this.registry.get(workflowId)
    if (!workflow) {
      throw new Error(`Workflow 不存在: ${workflowId}`)
    }

    const runId = this.generateRunId()

    const userConfirmationHandler = this.createUserConfirmationHandler(workflow, runId)

    const ctx = {
      workflow,
      params,
      runId,
      userConfirmationHandler,
    }

    this.executor.run(ctx).then((result) => {
      logger.info('[WorkflowScheduler] 手动触发 Workflow 完成', {
        runId: result.runId,
        status: result.status,
      })
    }).catch((err) => {
      logger.error('[WorkflowScheduler] 手动触发 Workflow 失败', {
        runId,
        error: err instanceof Error ? err.message : String(err),
      })
    })

    return runId
  }

  resolveConfirmation(runId: string, decision: UserConfirmationDecision): void {
    const pending = this.pendingConfirmations.get(runId)
    if (pending) {
      pending.resolve(decision)
      this.pendingConfirmations.delete(runId)
    }
  }

  private setupFileWatchers(): void {
    const workflows = this.registry.getAll()

    for (const workflow of workflows) {
      if (workflow.metadata.scope === 'personal') {
        if (!this.currentUser) continue
        const isOwner = workflow.metadata.author === this.currentUser
        if (!isOwner) {
          logger.info('[WorkflowScheduler] Skipping personal workflow trigger (not owner)', {
            workflowId: workflow.metadata.id,
            currentUser: this.currentUser,
            author: workflow.metadata.author,
          })
          continue
        }
      }

      for (const trigger of workflow.triggers) {
        if (trigger.type === 'file_created' || trigger.type === 'file_changed') {
          if (!trigger.pattern) continue

          let watchPattern = trigger.pattern
          if (workflow.metadata.scope === 'personal' && this.currentUser) {
            watchPattern = `personal/${this.currentUser}/${trigger.pattern}`
          }

          const watcher = chokidar.watch(watchPattern, {
            ignoreInitial: true,
            ignored: /(^|[/\\])\../,
          })

          const eventType = trigger.type

          watcher.on('add', (filePath: string) => {
            if (eventType === 'file_created') {
              this.debouncedTrigger(workflow, { file_path: filePath })
            }
          })

          watcher.on('change', (filePath: string) => {
            if (eventType === 'file_changed') {
              this.debouncedTrigger(workflow, { file_path: filePath })
            }
          })

          this.watchers.push(watcher)
          logger.info('[WorkflowScheduler] 文件触发器已注册', {
            workflowId: workflow.metadata.id,
            type: trigger.type,
            pattern: watchPattern,
          })
        }
      }
    }
  }

  private scheduleCronTriggers(): void {
    const workflows = this.registry.getAll()

    for (const workflow of workflows) {
      for (const trigger of workflow.triggers) {
        if (trigger.type === 'schedule' && trigger.cron) {
          logger.info('[WorkflowScheduler] 定时触发器已注册（使用简化定时器）', {
            workflowId: workflow.metadata.id,
            cron: trigger.cron,
          })

          const timer = setInterval(() => {
            this.triggerWorkflow(workflow, {})
          }, 60 * 1000)

          this.cronTimers.push(timer)
        }
      }
    }
  }

  private async recoverIncompleteRuns(): Promise<void> {
    const incompleteRuns = await this.runStore.getIncompleteRuns()

    for (const run of incompleteRuns) {
      const elapsed = Date.now() - run.startedAt
      const isStale = elapsed > 24 * 60 * 60 * 1000

      if (isStale) {
        logger.info('[WorkflowScheduler] 恢复未完成运行（已过期），标记为 cancelled', {
          runId: run.runId,
          workflowId: run.workflowId,
          status: run.status,
        })
        await this.runStore.updateStatus(run.runId, 'cancelled')
      } else {
        logger.info('[WorkflowScheduler] 恢复未完成运行，尝试继续执行', {
          runId: run.runId,
          workflowId: run.workflowId,
          status: run.status,
        })
        try {
          const workflow = this.registry.get(run.workflowId)
          if (workflow) {
            await this.runStore.updateStatus(run.runId, 'cancelled')
            const newRunId = this.generateRunId()
            this.triggerWorkflow(workflow, { ...(run.params ?? {}), _resumedFromRunId: run.runId })
            logger.info('[WorkflowScheduler] 重新启动中断的 Workflow', {
              originalRunId: run.runId,
              newRunId,
              resumedFrom: run.runId,
            })
          } else {
            await this.runStore.updateStatus(run.runId, 'cancelled')
          }
        } catch (err) {
          logger.warn('[WorkflowScheduler] 恢复运行失败，标记为 cancelled', {
            runId: run.runId,
            error: err instanceof Error ? err.message : String(err),
          })
          await this.runStore.updateStatus(run.runId, 'cancelled')
        }
      }
    }
  }

  private debouncedTrigger(workflow: WorkflowDefinition, params: Record<string, unknown>): void {
    const key = `${workflow.metadata.id}:${JSON.stringify(params)}`

    const existing = this.fileDebounceTimers.get(key)
    if (existing) {
      clearTimeout(existing)
    }

    const timer = setTimeout(() => {
      this.fileDebounceTimers.delete(key)
      this.triggerWorkflow(workflow, params)
    }, FILE_DEBOUNCE_MS)

    this.fileDebounceTimers.set(key, timer)
  }

  private triggerWorkflow(workflow: WorkflowDefinition, params: Record<string, unknown>): void {
    const currentCount = this.activeRunCounts.get(workflow.metadata.id) ?? 0
    if (currentCount >= MAX_CONCURRENT_PER_WORKFLOW) {
      logger.warn('[WorkflowScheduler] 并发上限达到，跳过触发', {
        workflowId: workflow.metadata.id,
        activeCount: currentCount,
      })
      return
    }

    const runId = this.generateRunId()
    this.activeRunCounts.set(workflow.metadata.id, currentCount + 1)

    const userConfirmationHandler = this.createUserConfirmationHandler(workflow, runId)

    this.executor
      .run({ workflow, params, runId, userConfirmationHandler })
      .then((result) => {
        logger.info('[WorkflowScheduler] Workflow 触发执行完成', {
          runId: result.runId,
          status: result.status,
        })
      })
      .catch((err) => {
        logger.error('[WorkflowScheduler] Workflow 触发执行失败', {
          runId,
          error: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => {
        const count = this.activeRunCounts.get(workflow.metadata.id) ?? 1
        this.activeRunCounts.set(workflow.metadata.id, Math.max(0, count - 1))
      })
  }

  private createUserConfirmationHandler(
    workflow: WorkflowDefinition,
    runId: string,
  ): (step: import('../../../shared/types').WorkflowStep, previousSteps: Record<string, import('../../../shared/types').StepResult>) => Promise<UserConfirmationDecision> {
    return (step, previousSteps) => {
      return new Promise<UserConfirmationDecision>((resolve) => {
        const request: import('../../../shared/types').WorkflowConfirmationRequest = {
          runId,
          workflowId: workflow.metadata.id,
          workflowName: workflow.metadata.name,
          step,
          previousSteps,
        }

        this.pendingConfirmations.set(runId, { resolve, request })

        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('workflow:confirmation-required', request)
        }

        logger.info('[WorkflowScheduler] 等待用户确认', {
          runId,
          stepId: step.id,
          stepName: step.name,
        })
      })
    }
  }

  private generateRunId(): string {
    return `wf-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  destroy(): void {
    for (const watcher of this.watchers) {
      watcher.close()
    }
    this.watchers = []

    for (const timer of this.cronTimers) {
      clearInterval(timer)
    }
    this.cronTimers = []

    for (const timer of this.fileDebounceTimers.values()) {
      clearTimeout(timer)
    }
    this.fileDebounceTimers.clear()

    for (const pending of this.pendingConfirmations.values()) {
      pending.resolve('cancel')
    }
    this.pendingConfirmations.clear()

    logger.info('[WorkflowScheduler] 已销毁')
  }
}
