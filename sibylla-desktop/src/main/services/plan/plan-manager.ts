import * as path from 'path'
import * as fs from 'fs'
import type { FileManager } from '../file-manager'
import type { Tracer } from '../trace/tracer'
import type { AppEventBus } from '../event-bus'
import type { ProgressLedger } from '../progress/progress-ledger'
import type { TaskStateMachine } from '../harness/task-state-machine'
import type { logger as loggerType } from '../../utils/logger'
import type {
  PlanMetadata,
  PlanCreateInput,
  PlanFollowUpResult,
  ParsedPlan,
  PlanStep,
} from './types'
import { PlanParser } from './plan-parser'
import { PlanRenderer } from './plan-renderer'
import { FileOperationContext } from '../types/file-manager.types'

const PLANS_DIR = '.sibylla/plans'
const STALE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000

export class PlanManager {
  private plans: Map<string, PlanMetadata> = new Map()
  private fileWatcher: fs.FSWatcher | null = null
  private readonly parser: PlanParser
  private readonly renderer: PlanRenderer
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly workspaceRoot: string,
    private readonly fileManager: FileManager,
    private readonly tracer: Tracer,
    private readonly eventBus: AppEventBus,
    private readonly progressLedger: ProgressLedger,
    private readonly taskStateMachine: TaskStateMachine,
    private readonly logger: typeof loggerType,
  ) {
    this.parser = new PlanParser()
    this.renderer = new PlanRenderer()
  }

  async initialize(): Promise<void> {
    await this.loadExistingPlans()
    this.startFileWatcher()
    this.cleanupInterval = setInterval(() => {
      this.cleanupStalePlans().catch((err) => {
        this.logger.error('plan.cleanup.failed', { error: String(err) })
      })
    }, CLEANUP_INTERVAL_MS)
    this.logger.info('plan.manager.initialized', { count: this.plans.size })
  }

  private async loadExistingPlans(): Promise<void> {
    const plansPath = path.join(this.workspaceRoot, PLANS_DIR)
    try {
      await fs.promises.mkdir(plansPath, { recursive: true })
    } catch {
      // already exists
    }

    let entries: string[]
    try {
      entries = await fs.promises.readdir(plansPath)
    } catch {
      return
    }

    const planFiles = entries.filter(f => f.startsWith('plan-') && f.endsWith('.md'))
    for (const file of planFiles) {
      const filePath = path.join(plansPath, file)
      try {
        const raw = await fs.promises.readFile(filePath, 'utf-8')
        const fm = this.parser.parseFrontmatter(raw)
        if (!fm) {
          this.logger.warn('plan.load.no-frontmatter', { filePath })
          continue
        }
        const metadata = this.frontmatterToMetadata(fm, filePath)
        if (metadata) {
          this.plans.set(metadata.id, metadata)
        }
      } catch (err) {
        this.logger.warn('plan.load.failed', { filePath, error: String(err) })
      }
    }
  }

  private frontmatterToMetadata(fm: Record<string, unknown>, filePath: string): PlanMetadata | null {
    const id = fm.id as string | undefined
    if (!id || typeof id !== 'string') return null
    return {
      id,
      title: (fm.title as string) ?? 'Untitled Plan',
      mode: 'plan',
      status: (fm.status as PlanMetadata['status']) ?? 'draft',
      createdAt: (fm.created_at as string) ?? new Date().toISOString(),
      updatedAt: (fm.updated_at as string) ?? new Date().toISOString(),
      conversationId: fm.conversation_id as string | undefined,
      traceId: fm.trace_id as string | undefined,
      estimatedDuration: fm.estimated_duration as string | undefined,
      tags: Array.isArray(fm.tags) ? (fm.tags as string[]) : [],
      filePath,
      archivedTo: fm.archived_to as string | undefined,
    }
  }

  async createFromAIOutput(input: PlanCreateInput): Promise<PlanMetadata> {
    return this.tracer.withSpan('plan.create', async (span) => {
      const id = this.timestamp()
      const parsed = this.parser.parsePlanMarkdown(input.aiContent, id)

      const metadata: PlanMetadata = {
        id,
        title: parsed.title ?? 'Untitled Plan',
        mode: 'plan',
        status: parsed.parseSuccess ? 'draft' : 'draft-unparsed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        conversationId: input.conversationId,
        traceId: input.traceId,
        tags: parsed.tags ?? [],
        filePath: this.planFilePath(id),
      }

      const markdown = this.renderer.renderPlan(metadata, parsed)
      await fs.promises.mkdir(path.dirname(metadata.filePath), { recursive: true })
      await this.fileManager.writeFile(
        this.fileManager.getRelativePath(metadata.filePath),
        markdown,
        { context: FileOperationContext.SYSTEM },
      )

      this.plans.set(id, metadata)
      this.eventBus.emit('plan:created' as never, metadata as never)

      span.setAttributes({
        'plan.id': id,
        'plan.parse_success': parsed.parseSuccess,
        'plan.step_count': parsed.steps.length,
      })

      return metadata
    }, { kind: 'system' })
  }

  async startExecution(planId: string): Promise<void> {
    const plan = this.plans.get(planId)
    if (!plan) throw new Error(`Plan not found: ${planId}`)

    plan.status = 'in_progress'
    plan.updatedAt = new Date().toISOString()
    await this.persistMetadata(plan)

    const parsed = await this.getPlan(planId)
    const steps = parsed?.steps.map(s => s.text) ?? ['Execute plan']

    await this.taskStateMachine.create(plan.title, steps)

    await this.progressLedger.declare({
      title: `执行计划: ${plan.title}`,
      mode: 'plan',
      traceId: plan.traceId,
      conversationId: plan.conversationId,
      plannedChecklist: steps,
    })

    this.eventBus.emit('plan:execution-started' as never, plan as never)
  }

  async archiveAsFormalDocument(planId: string, targetPath: string): Promise<PlanMetadata> {
    const plan = this.plans.get(planId)
    if (!plan) throw new Error(`Plan not found: ${planId}`)

    const absoluteTarget = path.isAbsolute(targetPath)
      ? targetPath
      : path.join(this.workspaceRoot, targetPath)

    const raw = await fs.promises.readFile(plan.filePath, 'utf-8')
    const updated = this.renderer.updateFrontmatter(raw, {
      status: 'archived',
      archived_at: new Date().toISOString(),
      archived_to: absoluteTarget,
    })

    await fs.promises.mkdir(path.dirname(absoluteTarget), { recursive: true })
    await this.fileManager.writeFile(
      this.fileManager.getRelativePath(absoluteTarget),
      updated,
      { context: FileOperationContext.SYSTEM },
    )

    const stub = this.renderer.renderArchivedStub(plan, absoluteTarget)
    await this.fileManager.writeFile(
      this.fileManager.getRelativePath(plan.filePath),
      stub,
      { context: FileOperationContext.SYSTEM },
    )

    plan.status = 'archived'
    plan.archivedTo = absoluteTarget
    plan.updatedAt = new Date().toISOString()

    this.eventBus.emit('plan:archived' as never, plan as never)
    return plan
  }

  async abandon(planId: string): Promise<void> {
    const plan = this.plans.get(planId)
    if (!plan) throw new Error(`Plan not found: ${planId}`)

    plan.status = 'abandoned'
    plan.updatedAt = new Date().toISOString()
    await this.persistMetadata(plan)

    this.eventBus.emit('plan:abandoned' as never, plan as never)
  }

  async getActivePlans(): Promise<PlanMetadata[]> {
    return Array.from(this.plans.values())
      .filter(p => p.status === 'draft' || p.status === 'draft-unparsed' || p.status === 'in_progress')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }

  async getPlan(id: string): Promise<ParsedPlan | null> {
    const metadata = this.plans.get(id)
    if (!metadata) return null

    try {
      const raw = await fs.promises.readFile(metadata.filePath, 'utf-8')
      return this.parser.parsePlanFile(raw, metadata)
    } catch {
      return null
    }
  }

  async followUp(planId: string): Promise<PlanFollowUpResult> {
    const parsed = await this.getPlan(planId)
    if (!parsed) throw new Error(`Plan not found: ${planId}`)

    const totalSteps = parsed.steps.length
    const completedSteps = parsed.steps.filter(s => s.done).length
    const progress = totalSteps > 0 ? completedSteps / totalSteps : 0

    const notes: string[] = []
    if (progress < 1) {
      const pending = parsed.steps.filter(s => !s.done)
      notes.push(`剩余 ${pending.length} 步未完成`)
      if (pending[0]) {
        notes.push(`下一步: ${pending[0].text}`)
      }
    } else {
      notes.push('所有步骤已完成')
    }

    return { planId, progress, completedSteps, totalSteps, notes }
  }

  private async persistMetadata(plan: PlanMetadata): Promise<void> {
    try {
      const raw = await fs.promises.readFile(plan.filePath, 'utf-8')
      const updated = this.renderer.updateFrontmatter(raw, {
        status: plan.status,
        updated_at: plan.updatedAt,
      })
      await this.fileManager.writeFile(
        this.fileManager.getRelativePath(plan.filePath),
        updated,
        { context: FileOperationContext.SYSTEM },
      )
    } catch (err) {
      this.logger.error('plan.persist.failed', { planId: plan.id, error: String(err) })
    }
  }

  private planFilePath(id: string): string {
    return path.join(this.workspaceRoot, PLANS_DIR, `${id}.md`)
  }

  private timestamp(): string {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const h = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    return `plan-${y}${m}${d}-${h}${min}${s}`
  }

  private startFileWatcher(): void {
    const watchPath = path.join(this.workspaceRoot, PLANS_DIR)
    try {
      fs.promises.mkdir(watchPath, { recursive: true }).catch(() => {})
      this.fileWatcher = fs.watch(watchPath, (_eventType, filename) => {
        if (filename && filename.endsWith('.md')) {
          const filePath = path.join(watchPath, filename)
          void this.reloadPlan(filePath)
        }
      })
    } catch (err) {
      this.logger.warn('plan.watcher.failed', { error: String(err) })
    }
  }

  private async reloadPlan(filePath: string): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8')
      const parsed = this.parser.parsePlanFile(content, null)
      if (!parsed) {
        this.logger.warn('plan.reload.parse-failed', { filePath })
        return
      }

      const parsedId = parsed.metadata.id
      const existing = this.plans.get(parsedId)

      if (existing) {
        const beforeSteps = (await this.getPlan(parsedId))?.steps ?? []
        const afterSteps = parsed.steps

        const newlyCompleted: PlanStep[] = []
        for (let i = 0; i < afterSteps.length; i++) {
          const afterStep = afterSteps[i]
          const beforeStep = beforeSteps[i]
          if (afterStep && afterStep.done && beforeStep && !beforeStep.done) {
            newlyCompleted.push(afterStep)
          }
        }

        if (newlyCompleted.length > 0) {
          await this.tracer.withSpan('plan.steps-completed', async (span) => {
            span.setAttribute('plan.id', parsedId)
            span.setAttribute('plan.newly_completed', newlyCompleted.length)
          }, { kind: 'system' })

          this.eventBus.emit('plan:steps-completed' as never, { planId: parsedId, completed: newlyCompleted } as never)
        }
      }

      parsed.metadata.updatedAt = new Date().toISOString()
      this.plans.set(parsedId, parsed.metadata)
    } catch (err) {
      this.logger.warn('plan.reload.failed', { filePath, error: String(err) })
    }
  }

  async cleanupStalePlans(): Promise<number> {
    let count = 0
    const now = Date.now()

    for (const [id, plan] of this.plans) {
      if (plan.status !== 'draft' && plan.status !== 'abandoned') continue
      const elapsed = now - new Date(plan.updatedAt).getTime()
      if (elapsed >= STALE_THRESHOLD_MS) {
        await this.tracer.withSpan('plan.auto-archive', async (span) => {
          span.setAttribute('plan.id', id)
          span.setAttribute('plan.stale_days', Math.floor(elapsed / (24 * 60 * 60 * 1000)))
          plan.status = 'archived'
          plan.updatedAt = new Date().toISOString()
          await this.persistMetadata(plan)
          this.logger.info('plan.auto-archived', { planId: id })
          count++
        }, { kind: 'system' })
      }
    }

    return count
  }

  dispose(): void {
    if (this.fileWatcher) {
      this.fileWatcher.close()
      this.fileWatcher = null
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.plans.clear()
  }
}
