/**
 * TaskStateMachineSync — cross-device task state detection and conflict resolution
 *
 * After SyncManager.pull() completes, this module scans the .sibylla/agents/
 * directory for tasks that originated from a different device (different sessionId).
 * Cross-device resumeable tasks are reported via the event bus.
 *
 * Conflict resolution uses last-write-wins (compare updatedAt timestamp).
 *
 * @see plans/phase2/phase2-task005-sync-enhancement-citation-tracing-plan.md §Phase D
 */

import { promises as fs } from 'fs'
import * as path from 'path'
import { logger } from '../../utils/logger'
import type { AppEventBus } from '../event-bus'
import type { TaskState } from '../harness/task-state-machine'
import { AGENTS_DIR, TASK_STATE_FILE, ARCHIVE_DIRS } from '../harness/task-state-machine'

const LOG_PREFIX = '[TaskStateMachineSync]'

export interface CrossDeviceTask {
  readonly taskId: string
  readonly goal: string
  readonly status: string
  readonly lastSessionId?: string
  readonly updatedAt: number
}

export class TaskStateMachineSync {
  private readonly agentsPath: string
  private readonly archiveDirNames: readonly string[]
  private readonly reportedTaskIds = new Set<string>()

  constructor(
    private readonly workspaceRoot: string,
    private readonly eventBus: AppEventBus,
    private readonly currentSessionId: string,
  ) {
    this.agentsPath = path.join(workspaceRoot, AGENTS_DIR)
    this.archiveDirNames = ARCHIVE_DIRS
    logger.info(`${LOG_PREFIX} Initialized`, { currentSessionId })
  }

  async detectCrossDeviceTasks(): Promise<readonly CrossDeviceTask[]> {
    const crossDeviceTasks: CrossDeviceTask[] = []

    let entries: fs.Dirent[]
    try {
      entries = await fs.readdir(this.agentsPath, { withFileTypes: true })
    } catch {
      logger.debug(`${LOG_PREFIX} No agents directory found`)
      return []
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (this.archiveDirNames.includes(entry.name)) continue

      const statePath = path.join(this.agentsPath, entry.name, TASK_STATE_FILE)
      const isValid = await TaskStateMachineSync.validateStateJson(statePath)
      if (!isValid) continue

      try {
        const raw = await fs.readFile(statePath, 'utf-8')
        const state = JSON.parse(raw) as TaskState

        if (state.lastSessionId && state.lastSessionId !== this.currentSessionId) {
          const crossDeviceTask: CrossDeviceTask = {
            taskId: state.taskId,
            goal: state.goal,
            status: state.status,
            lastSessionId: state.lastSessionId,
            updatedAt: state.updatedAt,
          }
          crossDeviceTasks.push(crossDeviceTask)

          if (!this.reportedTaskIds.has(state.taskId)) {
            this.reportedTaskIds.add(state.taskId)
            this.eventBus.emitEvent({
              type: 'task.cross-device-resumeable',
              source: 'task-state-machine-sync',
              payload: {
                taskId: state.taskId,
                lastSessionId: state.lastSessionId,
              },
            })
          }

          logger.info(`${LOG_PREFIX} Cross-device task detected`, {
            taskId: state.taskId,
            lastSessionId: state.lastSessionId,
          })
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error)
        logger.warn(`${LOG_PREFIX} Failed to read task state`, {
          taskId: entry.name,
          error: msg,
        })
      }
    }

    if (crossDeviceTasks.length > 0) {
      logger.info(`${LOG_PREFIX} Found ${crossDeviceTasks.length} cross-device task(s)`)
    } else {
      logger.debug(`${LOG_PREFIX} No cross-device tasks found`)
    }

    return crossDeviceTasks
  }

  static async validateStateJson(filePath: string): Promise<boolean> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const parsed: unknown = JSON.parse(raw)

      if (typeof parsed !== 'object' || parsed === null) return false

      const obj = parsed as Record<string, unknown>
      if (typeof obj['taskId'] !== 'string') return false
      if (typeof obj['status'] !== 'string') return false
      if (typeof obj['updatedAt'] !== 'number') return false

      return true
    } catch {
      return false
    }
  }

  static resolveConflict(local: TaskState, remote: TaskState): TaskState {
    if (remote.updatedAt > local.updatedAt) {
      logger.info(`${LOG_PREFIX} Conflict resolved — remote wins`, {
        taskId: local.taskId,
        localUpdatedAt: local.updatedAt,
        remoteUpdatedAt: remote.updatedAt,
      })
      return remote
    }

    logger.info(`${LOG_PREFIX} Conflict resolved — local wins`, {
      taskId: local.taskId,
      localUpdatedAt: local.updatedAt,
      remoteUpdatedAt: remote.updatedAt,
    })
    return local
  }
}
