/**
 * HarnessHandler — IPC entry point for Harness operations
 *
 * Provides IPC handlers for:
 * - harness:execute — Execute a request through the orchestrator
 * - harness:setMode — Set default harness mode
 * - harness:getMode — Get current default mode
 * - harness:listGuardrails — List all guardrail rules
 * - harness:setGuardrailEnabled — Enable/disable a guardrail rule
 * - harness:listResumeable — List resumeable tasks (TASK021)
 * - harness:resumeTask — Resume an interrupted task (TASK021)
 * - harness:abandonTask — Abandon a task (TASK021)
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type {
  AIChatRequest,
  HarnessMode,
  HarnessResult,
  SetGuardrailEnabledRequest,
  GuardrailRuleSummaryShared,
  GuideSummary,
  SetGuideEnabledRequest,
  IntentProfileSummary,
  TaskStateSummary,
  TaskResumeResultShared,
} from '../../../shared/types'
import type { HarnessOrchestrator } from '../../services/harness/orchestrator'
import type { GuardrailEngine } from '../../services/harness/guardrails/engine'
import type { GuideRegistry } from '../../services/harness/guides/registry'
import type { ToolScopeManager } from '../../services/harness/tool-scope'
import type { ToolDefinition } from '../../services/harness/tool-scope'
import type { TaskStateMachine } from '../../services/harness/task-state-machine'
import { INTENT_PROFILES } from '../../services/harness/tool-scope'

export class HarnessHandler extends IpcHandler {
  readonly namespace = 'harness'
  private toolScopeManager: ToolScopeManager | null = null
  private taskStateMachine: TaskStateMachine | null = null
  // Track which optional IPC groups were registered to avoid blind removeHandler in cleanup
  private guidesRegistered = false
  private toolScopeRegistered = false

  constructor(
    private readonly orchestrator: HarnessOrchestrator,
    private readonly guardrailEngine: GuardrailEngine,
    private readonly harnessConfig: { defaultMode: HarnessMode },
    private readonly guideRegistry?: GuideRegistry,
  ) {
    super()
  }

  /** Inject ToolScopeManager for tool scope IPC handlers (TASK020) */
  setToolScopeManager(manager: ToolScopeManager): void {
    this.toolScopeManager = manager
  }

  /** Inject TaskStateMachine for task state IPC handlers (TASK021) */
  setTaskStateMachine(machine: TaskStateMachine): void {
    this.taskStateMachine = machine
  }

  register(): void {
    // harness:execute
    ipcMain.handle(
      IPC_CHANNELS.HARNESS_EXECUTE,
      this.safeHandle(async (_event: IpcMainInvokeEvent, request: AIChatRequest): Promise<HarnessResult> => {
        return this.orchestrator.execute(request)
      })
    )

    // harness:setMode
    ipcMain.handle(
      IPC_CHANNELS.HARNESS_SET_MODE,
      this.safeHandle(async (_event: IpcMainInvokeEvent, mode: HarnessMode): Promise<void> => {
        this.harnessConfig.defaultMode = mode
      })
    )

    // harness:getMode
    ipcMain.handle(
      IPC_CHANNELS.HARNESS_GET_MODE,
      this.safeHandle(async (): Promise<HarnessMode> => {
        return this.harnessConfig.defaultMode
      })
    )

    // harness:listGuardrails
    ipcMain.handle(
      IPC_CHANNELS.HARNESS_LIST_GUARDRAILS,
      this.safeHandle(async (): Promise<GuardrailRuleSummaryShared[]> => {
        return this.guardrailEngine.listRules()
      })
    )

    // harness:setGuardrailEnabled
    ipcMain.handle(
      IPC_CHANNELS.HARNESS_SET_GUARDRAIL_ENABLED,
      this.safeHandle(async (_event: IpcMainInvokeEvent, request: SetGuardrailEnabledRequest): Promise<void> => {
        this.guardrailEngine.setRuleEnabled(request.ruleId, request.enabled)
      })
    )

    // harness:listGuides (TASK019)
    if (this.guideRegistry) {
      this.guidesRegistered = true
      ipcMain.handle(
        IPC_CHANNELS.HARNESS_LIST_GUIDES,
        this.safeHandle(async (): Promise<readonly GuideSummary[]> => {
          return this.guideRegistry!.listGuides()
        })
      )

      ipcMain.handle(
        IPC_CHANNELS.HARNESS_SET_GUIDE_ENABLED,
        this.safeHandle(async (_event: IpcMainInvokeEvent, request: SetGuideEnabledRequest): Promise<void> => {
          this.guideRegistry!.setGuideEnabled(request.guideId, request.enabled)
        })
      )
    }

    // TASK020: Tool scope IPC handlers
    if (this.toolScopeManager) {
      this.toolScopeRegistered = true
      // harness:getToolScope
      ipcMain.handle(
        IPC_CHANNELS.HARNESS_GET_TOOL_SCOPE,
        this.safeHandle(async (_event: IpcMainInvokeEvent, request: AIChatRequest) => {
          return this.toolScopeManager!.select(request)
        })
      )

      // harness:getIntentProfiles
      ipcMain.handle(
        IPC_CHANNELS.HARNESS_GET_INTENT_PROFILES,
        this.safeHandle(async (): Promise<IntentProfileSummary[]> => {
          return INTENT_PROFILES.map(p => ({
            intent: p.intent,
            tools: [...p.tools],
            maxTools: p.maxTools,
          }))
        })
      )

      // harness:registerTool
      // NOTE: ToolDefinition.handler is a function and cannot be serialized over IPC.
      // This handler is intended for main-process-only use or future refactoring
      // where handler is resolved by ID rather than passed as a function.
      ipcMain.handle(
        IPC_CHANNELS.HARNESS_REGISTER_TOOL,
        this.safeHandle(async (_event: IpcMainInvokeEvent, tool: ToolDefinition): Promise<void> => {
          this.toolScopeManager!.registerTool(tool)
        })
      )

      // harness:unregisterTool
      ipcMain.handle(
        IPC_CHANNELS.HARNESS_UNREGISTER_TOOL,
        this.safeHandle(async (_event: IpcMainInvokeEvent, toolId: string): Promise<boolean> => {
          return this.toolScopeManager!.unregisterTool(toolId)
        })
      )
    }

    // === TASK021: Task state machine IPC handlers ===

    // harness:listResumeable
    ipcMain.handle(
      IPC_CHANNELS.HARNESS_LIST_RESUMEABLE,
      this.safeHandle(async (): Promise<TaskStateSummary[]> => {
        if (!this.taskStateMachine) return []
        const tasks = await this.taskStateMachine.findResumeable()
        return tasks.map((t) => ({
          taskId: t.taskId,
          goal: t.goal,
          status: t.status,
          completedSteps: t.steps.filter((s) => s.status === 'done').length,
          totalSteps: t.steps.length,
          updatedAt: t.updatedAt,
        } satisfies TaskStateSummary))
      })
    )

    // harness:resumeTask
    ipcMain.handle(
      IPC_CHANNELS.HARNESS_RESUME_TASK,
      this.safeHandle(async (_event: IpcMainInvokeEvent, taskId: string): Promise<TaskResumeResultShared> => {
        if (!this.taskStateMachine) {
          throw new Error('TaskStateMachine not initialized')
        }
        const result = await this.taskStateMachine.resume(taskId)
        return {
          state: {
            taskId: result.state.taskId,
            goal: result.state.goal,
            status: result.state.status,
            completedSteps: result.state.steps.filter((s) => s.status === 'done').length,
            totalSteps: result.state.steps.length,
            updatedAt: result.state.updatedAt,
          },
          resumePrompt: result.resumePrompt,
        }
      })
    )

    // harness:abandonTask
    ipcMain.handle(
      IPC_CHANNELS.HARNESS_ABANDON_TASK,
      this.safeHandle(async (_event: IpcMainInvokeEvent, taskId: string): Promise<void> => {
        if (!this.taskStateMachine) {
          throw new Error('TaskStateMachine not initialized')
        }
        await this.taskStateMachine.abandon(taskId)
      })
    )
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.HARNESS_EXECUTE)
    ipcMain.removeHandler(IPC_CHANNELS.HARNESS_SET_MODE)
    ipcMain.removeHandler(IPC_CHANNELS.HARNESS_GET_MODE)
    ipcMain.removeHandler(IPC_CHANNELS.HARNESS_LIST_GUARDRAILS)
    ipcMain.removeHandler(IPC_CHANNELS.HARNESS_SET_GUARDRAIL_ENABLED)

    // Only remove conditionally-registered handlers if they were actually registered
    if (this.guidesRegistered) {
      ipcMain.removeHandler(IPC_CHANNELS.HARNESS_LIST_GUIDES)
      ipcMain.removeHandler(IPC_CHANNELS.HARNESS_SET_GUIDE_ENABLED)
    }
    if (this.toolScopeRegistered) {
      ipcMain.removeHandler(IPC_CHANNELS.HARNESS_GET_TOOL_SCOPE)
      ipcMain.removeHandler(IPC_CHANNELS.HARNESS_GET_INTENT_PROFILES)
      ipcMain.removeHandler(IPC_CHANNELS.HARNESS_REGISTER_TOOL)
      ipcMain.removeHandler(IPC_CHANNELS.HARNESS_UNREGISTER_TOOL)
    }

    // Task state machine handlers are always registered
    ipcMain.removeHandler(IPC_CHANNELS.HARNESS_LIST_RESUMEABLE)
    ipcMain.removeHandler(IPC_CHANNELS.HARNESS_RESUME_TASK)
    ipcMain.removeHandler(IPC_CHANNELS.HARNESS_ABANDON_TASK)

    super.cleanup()
  }
}
