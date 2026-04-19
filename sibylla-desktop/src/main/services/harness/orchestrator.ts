/**
 * HarnessOrchestrator — Harness 系统核心中枢
 *
 * 职责：
 * 1. 解析执行模式（Single / Dual / Panel）
 * 2. 协调 Generator、Evaluator、GuardrailEngine 的执行顺序
 * 3. 管理改进循环（Evaluator 拒绝 → Generator 重试）
 * 4. 异常兜底与降级机制
 * 5. 记录完整 harness trace 到 MemoryManager
 */

import type {
 AIChatRequest,
 HarnessConfig,
 HarnessMode,
 HarnessResult,
 EvaluationReport,
 AssembledContext,
} from '../../../shared/types'
import type { Generator } from './generator'
import type { Evaluator } from './evaluator'
import type { GuardrailEngine } from './guardrails/engine'
import type { GuideRegistry } from './guides/registry'
import type { SensorFeedbackLoop, SensorFeedbackResult } from './sensors/feedback-loop'
import type { ContextEngine } from '../context-engine'
import type { MemoryManager, HarnessTraceEvent } from '../memory-manager'
import type { logger as loggerType } from '../../utils/logger'
import type { ToolScopeManager, ToolSelection } from './tool-scope'
import type { TaskStateMachine } from './task-state-machine'

/** Spec file pattern for Panel mode auto-resolution */
const SPEC_FILE_PATTERN = /(_spec\.md|CLAUDE\.md|design\.md|requirements\.md|tasks\.md)$/

export class HarnessOrchestrator {
  private readonly config: Required<Pick<HarnessConfig, 'defaultMode' | 'maxRetries'>> & HarnessConfig
  private readonly guards: GuardrailEngine
  private toolScopeManager: ToolScopeManager | null = null
  private taskStateMachine: TaskStateMachine | null = null

  constructor(
    private readonly generator: Generator,
    private readonly evaluator: Evaluator,
    guards: GuardrailEngine,
    private readonly contextEngine: ContextEngine,
    private readonly memoryManager: MemoryManager,
    private readonly logger: typeof loggerType,
    config?: Partial<HarnessConfig>,
    private readonly guideRegistry?: GuideRegistry,
    private readonly sensorFeedbackLoop?: SensorFeedbackLoop,
  ) {
    this.guards = guards
    this.config = {
      defaultMode: config?.defaultMode ?? 'dual',
      maxRetries: config?.maxRetries ?? 2,
      evaluatorModel: config?.evaluatorModel,
      panelEvaluators: config?.panelEvaluators ?? [
        { id: 'architecture', role: 'Architecture Reviewer' },
        { id: 'consistency', role: 'Consistency Reviewer' },
      ],
    }
  }

  /** Inject ToolScopeManager for intent-based tool selection (TASK020) */
  setToolScopeManager(manager: ToolScopeManager): void {
    this.toolScopeManager = manager
  }

  /** Inject TaskStateMachine for multi-step task persistence (TASK021) */
  setTaskStateMachine(machine: TaskStateMachine): void {
    this.taskStateMachine = machine
  }

  async execute(request: AIChatRequest): Promise<HarnessResult> {
    const traceId = `harness-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    // === TASK020: Tool scope selection ===
    // Create a shallow copy to avoid mutating the caller's request object (S1 fix)
    let effectiveRequest: AIChatRequest = request
    let toolSelection: ToolSelection | undefined
    if (this.toolScopeManager) {
      toolSelection = await this.toolScopeManager.select(request)
      // Map edit_file → modify_file for backwards compatibility with resolveMode()
      effectiveRequest = {
        ...request,
        intent: toolSelection.intent === 'edit_file' ? 'modify_file' : toolSelection.intent,
      }

      await this.trace(traceId, {
        component: 'orchestrator',
        action: 'tool_scope_selected',
        result: toolSelection.intent,
        details: [`toolCount=${toolSelection.tools.length}`, `overrides=${toolSelection.explicitOverrides.join(',')}`],
      })
    }

    const mode = this.resolveMode(effectiveRequest)

    await this.trace(traceId, {
      component: 'orchestrator',
      action: 'mode_resolved',
      result: mode,
      details: [effectiveRequest.targetFile ?? '(none)', effectiveRequest.intent ?? '(none)'],
    })

    let guides: import('./guides/types').Guide[] = []
    if (this.guideRegistry) {
      guides = [...this.guideRegistry.resolve(effectiveRequest, {
        currentModel: effectiveRequest.model ?? 'claude-sonnet-4-20250514',
        // TODO(O1): Inject actual WorkspaceConfig via constructor instead of hardcoded defaults
        workspaceConfig: { workspaceId: 'default', name: '', description: '', icon: '', defaultModel: 'claude-sonnet-4-20250514', syncInterval: 30, createdAt: '', gitProvider: 'sibylla', gitRemote: null, lastSyncAt: null },
        userId: '',
      })]

      await this.trace(traceId, {
        component: 'guide',
        action: 'resolved',
        result: 'success',
        details: guides.map(g => g.id),
      })
    }

    const baseContext = await this.contextEngine.assembleForHarness({
      userMessage: effectiveRequest.message,
      currentFile: effectiveRequest.currentFile ?? effectiveRequest.targetFile,
      manualRefs: effectiveRequest.manualRefs ?? [],
      skillRefs: effectiveRequest.skillRefs,
      mode,
      guides,
    })

    // === TASK020: Inject tool subset into context (immutable — create new object) ===
    const assembledContext: AssembledContext = toolSelection
      ? {
          ...baseContext,
          toolDefinitions: toolSelection.tools.map(t => ({
            id: t.id,
            name: t.name,
            description: t.description,
            schema: t.schema,
          })),
        }
      : baseContext

    try {
      // === TASK021: Multi-step task detection and creation ===
      let taskId: string | undefined
      if (this.taskStateMachine && this.isMultiStepTask(effectiveRequest)) {
        // For long-running tasks without explicit steps, provide a default step
        const steps = effectiveRequest.plannedSteps && effectiveRequest.plannedSteps.length > 0
          ? effectiveRequest.plannedSteps
          : ['Execute task']
        const taskState = await this.taskStateMachine.create(
          effectiveRequest.message,
          steps,
        )
        taskId = taskState.taskId
      }

      let result: HarnessResult
      switch (mode) {
        case 'single':
          result = await this.executeSingle(effectiveRequest, assembledContext, traceId)
          break
        case 'dual':
          result = await this.executeDual(effectiveRequest, assembledContext, traceId)
          break
        case 'panel':
          result = await this.executePanel(effectiveRequest, assembledContext, traceId)
          break
      }

      // === TASK021: Advance task step on success ===
      if (taskId && this.taskStateMachine) {
        await this.taskStateMachine.advance(taskId, 'Step completed', [])
      }

      return result
    } catch (err) {
      this.logger.error('harness.execute.failed', {
        mode,
        traceId,
        error: err instanceof Error ? err.message : String(err),
      })

      // Attempt graceful degradation to single mode.
      // If single mode also fails, return a minimal error result instead of throwing,
      // so the caller always receives a structured HarnessResult. (S2 fix)
      try {
        const result = await this.executeSingle(effectiveRequest, assembledContext, traceId)
        return {
          ...result,
          degraded: true,
          degradeReason: err instanceof Error ? err.message : String(err),
        }
      } catch (fallbackErr) {
        this.logger.error('harness.execute.degradation_also_failed', {
          traceId,
          originalError: err instanceof Error ? err.message : String(err),
          fallbackError: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
        })
        // Re-throw original error — both dual/panel and single have failed
        throw err
      }
    }
  }

  resolveMode(request: AIChatRequest): HarnessMode {
    if (this.isSpecFile(request.targetFile)) {
      this.logger.info('harness.mode.resolved', { mode: 'panel', targetFile: request.targetFile, intent: request.intent })
      return 'panel'
    }

    if (request.intent === 'modify_file') {
      this.logger.info('harness.mode.resolved', { mode: 'dual', targetFile: request.targetFile, intent: request.intent })
      return 'dual'
    }

    this.logger.info('harness.mode.resolved', { mode: this.config.defaultMode, targetFile: request.targetFile, intent: request.intent })
    return this.config.defaultMode
  }

  private isSpecFile(targetFile?: string): boolean {
    if (!targetFile) return false
    return SPEC_FILE_PATTERN.test(targetFile)
  }

  /** Detect whether a request represents a multi-step task (TASK021) */
  private isMultiStepTask(request: AIChatRequest): boolean {
    return (request.plannedSteps?.length ?? 0) >= 3 || request.longRunning === true
  }

  private async executeSingle(
    request: AIChatRequest,
    context: AssembledContext,
    traceId: string
  ): Promise<HarnessResult> {
    const response = await this.generator.generate({ request, context })

    await this.trace(traceId, {
      component: 'orchestrator',
      action: 'single_completed',
      result: 'success',
    })

    return {
      finalResponse: response,
      mode: 'single',
      generatorAttempts: 1,
      evaluations: [],
      sensorSignals: [],
      guardrailVerdicts: [],
      degraded: false,
    }
  }

  private async executeDual(
    request: AIChatRequest,
    context: AssembledContext,
    traceId: string
  ): Promise<HarnessResult> {
    let suggestion = await this.generator.generate({ request, context })
    const evaluations: EvaluationReport[] = []
    let attempt = 0

    while (attempt < this.config.maxRetries) {
      const report = await this.evaluator.evaluate({
        request,
        suggestion,
        context,
        history: evaluations,
      })
      evaluations.push(report)

      await this.trace(traceId, {
        component: 'evaluator',
        action: 'evaluate',
        result: report.verdict,
        details: [`attempt=${attempt + 1}`, `criticalIssues=${report.criticalIssues.length}`],
      })

      if (report.verdict === 'pass') break

      suggestion = await this.generator.refine({
        originalRequest: request,
        previousResponse: suggestion,
        rejectionReport: report,
        context,
        attemptNumber: attempt + 1,
      })

      await this.trace(traceId, {
        component: 'orchestrator',
        action: 'generator_refined',
        result: 'retrying',
        details: [`attempt=${attempt + 1}`],
      })

      attempt++
    }

    const lastVerdict = evaluations[evaluations.length - 1]?.verdict ?? 'unknown'

    await this.trace(traceId, {
      component: 'orchestrator',
      action: 'dual_completed',
      result: lastVerdict,
      details: [`totalAttempts=${attempt + 1}`],
    })

    let sensorResult: SensorFeedbackResult | undefined
    if (this.sensorFeedbackLoop) {
      sensorResult = await this.sensorFeedbackLoop.process(suggestion, context, this.generator, request)
      suggestion = sensorResult.response

      await this.trace(traceId, {
        component: 'sensor',
        action: 'feedback_completed',
        result: 'done',
        details: [String(sensorResult.signals.length), String(sensorResult.corrections)],
      })
    }

    return {
      finalResponse: suggestion,
      mode: 'dual',
      generatorAttempts: attempt + 1,
      evaluations,
      sensorSignals: [...(sensorResult?.signals ?? [])],
      guardrailVerdicts: [],
      degraded: false,
    }
  }

  private async executePanel(
    request: AIChatRequest,
    context: AssembledContext,
    traceId: string
  ): Promise<HarnessResult> {
    let suggestion = await this.generator.generate({ request, context })
    const evaluations: EvaluationReport[] = []
    let degraded = false
    let degradeReason: string | undefined
    let attempt = 0

    // Execute panel evaluators in parallel
    const panelResults = await Promise.allSettled([
      this.evaluator.evaluate({
        request,
        suggestion,
        context,
        history: [],
        evaluatorId: 'architecture',
      }),
      this.evaluator.evaluate({
        request,
        suggestion,
        context,
        history: [],
        evaluatorId: 'consistency',
      }),
    ])

    for (const result of panelResults) {
      if (result.status === 'fulfilled') {
        evaluations.push(result.value)
      } else {
        degraded = true
        degradeReason = result.reason instanceof Error ? result.reason.message : String(result.reason)
        this.logger.warn('harness.panel.evaluator_failed', {
          traceId,
          error: degradeReason,
        })
      }
    }

    if (evaluations.length === 0) {
      throw new Error('All evaluators failed in panel mode')
    }

    let consensus = this.computeConsensus(evaluations)

    await this.trace(traceId, {
      component: 'orchestrator',
      action: 'panel_evaluated',
      result: consensus,
      details: evaluations.map(e => `${e.evaluatorId}:${e.verdict}`),
    })

    // Allow one retry round for panel mode (cost is high)
    if (consensus !== 'passed' && attempt < this.config.maxRetries) {
      // Use the first failing report as refine basis
      const failingReport = evaluations.find(e => e.verdict === 'fail')
      if (failingReport) {
        suggestion = await this.generator.refine({
          originalRequest: request,
          previousResponse: suggestion,
          rejectionReport: failingReport,
          context,
          attemptNumber: 1,
        })
        attempt++

        // Re-run evaluators
        const retryResults = await Promise.allSettled([
          this.evaluator.evaluate({
            request,
            suggestion,
            context,
            history: evaluations,
            evaluatorId: 'architecture',
          }),
          this.evaluator.evaluate({
            request,
            suggestion,
            context,
            history: evaluations,
            evaluatorId: 'consistency',
          }),
        ])

        for (const result of retryResults) {
          if (result.status === 'fulfilled') {
            evaluations.push(result.value)
          } else {
            degraded = true
            degradeReason = result.reason instanceof Error ? result.reason.message : String(result.reason)
          }
        }

        // Recalculate using only the latest round reports
        const latestReports = evaluations.slice(-2)
        consensus = this.computeConsensus(latestReports)

        await this.trace(traceId, {
          component: 'orchestrator',
          action: 'panel_retry_evaluated',
          result: consensus,
          details: latestReports.map(e => `${e.evaluatorId}:${e.verdict}`),
        })
      }
    }

    let sensorResult: SensorFeedbackResult | undefined
    if (this.sensorFeedbackLoop) {
      sensorResult = await this.sensorFeedbackLoop.process(suggestion, context, this.generator, request)
      suggestion = sensorResult.response

      await this.trace(traceId, {
        component: 'sensor',
        action: 'feedback_completed',
        result: 'done',
        details: [String(sensorResult.signals.length), String(sensorResult.corrections)],
      })
    }

    return {
      finalResponse: suggestion,
      mode: 'panel',
      generatorAttempts: attempt + 1,
      evaluations,
      sensorSignals: [...(sensorResult?.signals ?? [])],
      guardrailVerdicts: [],
      degraded,
      degradeReason,
    }
  }

  private computeConsensus(reports: EvaluationReport[]): 'passed' | 'contested' | 'rejected' {
    const verdicts = reports.map(r => r.verdict)
    const allPass = verdicts.every(v => v === 'pass')
    const allFail = verdicts.every(v => v === 'fail')

    if (allPass) return 'passed'
    if (allFail) return 'rejected'
    return 'contested'
  }

  private async trace(traceId: string, event: HarnessTraceEvent): Promise<void> {
    try {
      await this.memoryManager.appendHarnessTrace(traceId, event)
    } catch {
      // Trace failure should not block orchestration
    }
  }
}
