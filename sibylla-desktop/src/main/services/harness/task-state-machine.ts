/**
 * TaskStateMachine — Multi-step AI task state persistence and crash recovery
 *
 * Provides persistent state tracking for long-running AI tasks.
 * State is stored as JSON files under `.sibylla/agents/{task-id}/state.json`,
 * following the CLAUDE.md "file as truth" principle.
 *
 * Key design decisions:
 * - Atomic write: temp + rename to prevent corrupt state on crash
 * - Write failures are logged but never thrown (must not block AI execution)
 * - Corrupted state files are quarantined to `corrupted/` directory
 * - Path traversal prevention on all task IDs
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import type { logger as loggerType } from '../../utils/logger'

// ─── Domain Types ───

export type TaskStatus = 'planning' | 'executing' | 'awaiting_confirmation' | 'completed' | 'cancelled' | 'failed'
export type StepStatus = 'pending' | 'in_progress' | 'done' | 'skipped'

export interface TaskStep {
  readonly id: string
  readonly description: string
  status: StepStatus
  startedAt?: number
  completedAt?: number
  artifacts?: readonly string[]
  summary?: string
}

export interface TaskArtifacts {
  referencedFiles: string[]
  modifiedFiles: string[]
  evaluations: ReadonlyArray<{
    stepId: string
    verdict: string
    criticalIssues: readonly string[]
  }>
}

export interface TaskState {
  readonly taskId: string
  readonly goal: string
  readonly createdAt: number
  updatedAt: number
  status: TaskStatus
  steps: TaskStep[]
  currentStepIndex: number
  artifacts: TaskArtifacts
  lastSessionId?: string
}

export interface TaskResumeResult {
  readonly state: TaskState
  readonly resumePrompt: string
}

// ─── Constants ───

export const ARCHIVE_DIRS = ['completed', 'cancelled', 'failed', 'corrupted'] as const
export const AGENTS_DIR = '.sibylla/agents'
export const TASK_STATE_FILE = 'state.json'

// ─── Type Guards ───

/** Type guard: is task in a resumeable status? */
export function isResumeableStatus(status: TaskStatus): boolean {
  return status === 'executing' || status === 'awaiting_confirmation'
}

/** Type guard: is task in a terminal status? */
export function isTerminalStatus(status: TaskStatus): boolean {
  return status === 'completed' || status === 'cancelled' || status === 'failed'
}

// ─── TaskStateMachine Class ───

export class TaskStateMachine {
  constructor(
    private readonly workspaceRoot: string,
    private readonly logger: typeof loggerType,
  ) {}

  // === Public API ===

  /**
   * Create a new multi-step task with planned steps.
   * Persists initial state to `.sibylla/agents/{taskId}/state.json`.
   */
  async create(goal: string, plannedSteps: string[]): Promise<TaskState> {
    const state: TaskState = {
      taskId: this.generateId(),
      goal,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      status: 'planning',
      steps: plannedSteps.map((desc) => ({
        id: this.generateId(),
        description: desc,
        status: 'pending' as const,
      })),
      currentStepIndex: 0,
      artifacts: { referencedFiles: [], modifiedFiles: [], evaluations: [] },
    }

    const persisted = await this.persist(state)
    this.logger.info('task-state-machine.created', {
      taskId: state.taskId,
      goal,
      stepCount: plannedSteps.length,
      persisted,
    })
    return state
  }

  /**
   * Advance to the next step after completing the current one.
   * If all steps are done, automatically archives to `completed/`.
   */
  async advance(taskId: string, stepSummary: string, artifacts: string[]): Promise<void> {
    const state = await this.load(taskId)
    const step = state.steps[state.currentStepIndex]
    if (!step) {
      this.logger.warn('task-state-machine.advance.no-step', { taskId })
      return
    }

    step.status = 'done'
    step.completedAt = Date.now()
    step.summary = stepSummary
    step.artifacts = artifacts
    state.currentStepIndex++
    state.updatedAt = Date.now()
    state.artifacts.modifiedFiles = [
      ...new Set([...state.artifacts.modifiedFiles, ...artifacts]),
    ]

    if (state.currentStepIndex >= state.steps.length) {
      state.status = 'completed'
      await this.archive(state)
    } else {
      const nextStep = state.steps[state.currentStepIndex]
      if (nextStep) {
        nextStep.status = 'in_progress'
        nextStep.startedAt = Date.now()
      }
      state.status = 'executing'
      await this.persist(state)
    }
  }

  /**
   * Update task status without advancing steps.
   */
  async updateStatus(taskId: string, status: TaskStatus): Promise<void> {
    const state = await this.load(taskId)
    state.status = status
    state.updatedAt = Date.now()

    if (isTerminalStatus(status)) {
      await this.archive(state)
    } else {
      await this.persist(state)
    }
  }

  /**
   * Scan `.sibylla/agents/` for tasks that can be resumed.
   * Returns tasks with status `executing` or `awaiting_confirmation`.
   * Corrupted state files are quarantined.
   */
  async findResumeable(): Promise<TaskState[]> {
    const agentsDir = path.join(this.workspaceRoot, AGENTS_DIR)
    const resumeable: TaskState[] = []

    try {
      const entries = await fs.readdir(agentsDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        if ((ARCHIVE_DIRS as readonly string[]).includes(entry.name)) continue

        try {
          const raw = await fs.readFile(
            path.join(agentsDir, entry.name, TASK_STATE_FILE),
            'utf-8',
          )
          const state = JSON.parse(raw) as TaskState
          if (isResumeableStatus(state.status)) {
            resumeable.push(state)
          }
        } catch {
          this.logger.warn('task-state-machine.corrupted', { taskId: entry.name })
          await this.moveToCorrupted(entry.name)
        }
      }
    } catch {
      this.logger.info('task-state-machine.no-agents-dir')
    }

    return resumeable
  }

  /**
   * Resume an interrupted task.
   * Builds a context prompt summarizing completed and remaining steps.
   */
  async resume(taskId: string): Promise<TaskResumeResult> {
    const state = await this.load(taskId)
    state.status = 'executing'
    state.updatedAt = Date.now()
    if (state.currentStepIndex < state.steps.length) {
      const currentStep = state.steps[state.currentStepIndex]
      if (currentStep) {
        currentStep.status = 'in_progress'
        currentStep.startedAt = Date.now()
      }
    }
    await this.persist(state)
    return { state, resumePrompt: this.buildResumePrompt(state) }
  }

  /**
   * Abandon a task — set status to cancelled and archive it.
   */
  async abandon(taskId: string): Promise<void> {
    const state = await this.load(taskId)
    state.status = 'cancelled'
    state.updatedAt = Date.now()
    await this.archive(state)
  }

  // === Private Helpers ===

  /**
   * Persist state as JSON with atomic write (temp + rename).
   * CRITICAL: never throws — persistence must not block AI execution.
   * Returns true if write succeeded, false if it failed (logged).
   */
  private async persist(state: TaskState): Promise<boolean> {
    try {
      this.validatePathSafety(state.taskId)
      const taskDir = this.getTaskDir(state.taskId)
      const finalPath = this.getStatePath(state.taskId)
      const tempPath = `${finalPath}.tmp`

      await fs.mkdir(taskDir, { recursive: true })
      await fs.writeFile(tempPath, JSON.stringify(state, null, 2), 'utf-8')
      await fs.rename(tempPath, finalPath)
      return true
    } catch (err) {
      // CRITICAL: never throw — persistence must not block AI execution
      this.logger.error('task-state-machine.persist.failed', {
        taskId: state.taskId,
        error: String(err),
      })
      return false
    }
  }

  /**
   * Load a task state from disk.
   */
  private async load(taskId: string): Promise<TaskState> {
    this.validatePathSafety(taskId)
    const statePath = this.getStatePath(taskId)
    const raw = await fs.readFile(statePath, 'utf-8')
    return JSON.parse(raw) as TaskState
  }

  /**
   * Move a completed/cancelled/failed task to the appropriate archive directory.
   * Each terminal status gets its own subdirectory for clear audit trails.
   */
  private async archive(state: TaskState): Promise<void> {
    // Map terminal status → archive subdirectory (separate 'failed' from 'cancelled')
    const subDir = state.status === 'completed'
      ? 'completed'
      : state.status === 'failed'
        ? 'failed'
        : 'cancelled'
    const source = this.getTaskDir(state.taskId)
    const target = path.join(this.workspaceRoot, AGENTS_DIR, subDir, state.taskId)

    try {
      // Persist final state before moving
      await this.persist(state)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.rename(source, target)
    } catch (err) {
      this.logger.error('task-state-machine.archive.failed', {
        taskId: state.taskId,
        error: String(err),
      })
    }
  }

  /**
   * Quarantine a corrupted task directory.
   */
  private async moveToCorrupted(taskId: string): Promise<void> {
    const source = path.join(this.workspaceRoot, AGENTS_DIR, taskId)
    const target = path.join(this.workspaceRoot, AGENTS_DIR, 'corrupted', taskId)

    try {
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.rename(source, target)
    } catch (err) {
      this.logger.error('task-state-machine.move-corrupted.failed', {
        taskId,
        error: String(err),
      })
    }
  }

  /**
   * Prevent path traversal attacks in task IDs.
   */
  private validatePathSafety(taskId: string): void {
    if (taskId.includes('..') || taskId.includes('/') || taskId.includes('\\')) {
      throw new Error(`Invalid taskId: path traversal detected — ${taskId}`)
    }
  }

  private getTaskDir(taskId: string): string {
    this.validatePathSafety(taskId)
    return path.join(this.workspaceRoot, AGENTS_DIR, taskId)
  }

  private getStatePath(taskId: string): string {
    return path.join(this.getTaskDir(taskId), TASK_STATE_FILE)
  }

  private generateId(): string {
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 8)
    return `task-${timestamp}-${random}`
  }

  /**
   * Build a human-readable resume prompt summarizing task progress.
   */
  private buildResumePrompt(state: TaskState): string {
    const done = state.steps
      .filter((s) => s.status === 'done')
      .map((s, i) => `${i + 1}. ${s.description} — ${s.summary ?? '已完成'}`)
      .join('\n')
    const remaining = state.steps
      .filter((s) => s.status !== 'done' && s.status !== 'skipped')
      .map((s, i) => `${i + 1}. ${s.description}`)
      .join('\n')
    return (
      `你之前正在执行任务：${state.goal}\n\n` +
      `已完成步骤：\n${done || '（无）'}\n\n` +
      `剩余步骤：\n${remaining || '（无）'}\n\n` +
      `请从步骤 ${state.currentStepIndex + 1} 继续执行。`
    )
  }
}
