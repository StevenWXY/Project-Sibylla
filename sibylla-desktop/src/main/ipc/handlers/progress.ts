import { ipcMain } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type {
  ProgressSnapshotShared,
  TaskRecordShared,
  TaskStateShared,
  ChecklistItemStatusShared,
  ChecklistItemShared,
  TaskOutputShared,
} from '../../../shared/types'
import type { ProgressLedger } from '../../services/progress/progress-ledger'
import type {
  TaskRecord,
  ProgressSnapshot,
  ChecklistItem,
  TaskOutput,
} from '../../services/progress/types'

function toSharedTaskRecord(task: TaskRecord): TaskRecordShared {
  return {
    id: task.id,
    title: task.title,
    state: task.state as TaskStateShared,
    mode: task.mode,
    traceId: task.traceId,
    conversationId: task.conversationId,
    createdAt: task.createdAt,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    durationMs: task.durationMs,
    checklist: task.checklist.map(toSharedChecklistItem),
    outputs: task.outputs.map(toSharedTaskOutput),
    resultSummary: task.resultSummary,
    failureReason: task.failureReason,
    userNotes: task.userNotes,
  }
}

function toSharedChecklistItem(item: ChecklistItem): ChecklistItemShared {
  return {
    description: item.description,
    status: item.status as ChecklistItemStatusShared,
  }
}

function toSharedTaskOutput(output: TaskOutput): TaskOutputShared {
  return { type: output.type, ref: output.ref }
}

function toSharedSnapshot(snapshot: ProgressSnapshot): ProgressSnapshotShared {
  return {
    active: snapshot.active.map(toSharedTaskRecord),
    completedRecent: snapshot.completedRecent.map(toSharedTaskRecord),
    queued: snapshot.queued.map(toSharedTaskRecord),
    updatedAt: snapshot.updatedAt,
  }
}

export class ProgressHandler extends IpcHandler {
  readonly namespace = 'progress'

  constructor(
    private readonly progressLedger: ProgressLedger,
  ) {
    super()
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.PROGRESS_GET_SNAPSHOT,
      this.safeHandle(this.handleGetSnapshot.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.PROGRESS_GET_TASK,
      this.safeHandle(this.handleGetTask.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.PROGRESS_EDIT_NOTE,
      this.safeHandle(this.handleEditUserNote.bind(this)),
    )
    ipcMain.handle(
      IPC_CHANNELS.PROGRESS_GET_ARCHIVE,
      this.safeHandle(this.handleGetArchive.bind(this)),
    )
  }

  private handleGetSnapshot(): ProgressSnapshotShared {
    return toSharedSnapshot(this.progressLedger.getSnapshot())
  }

  private handleGetTask(_event: Electron.IpcMainInvokeEvent, id: string): TaskRecordShared | null {
    const task = this.progressLedger.getTask(id)
    return task ? toSharedTaskRecord(task) : null
  }

  private async handleEditUserNote(
    _event: Electron.IpcMainInvokeEvent,
    taskId: string,
    note: string,
  ): Promise<void> {
    await this.progressLedger.editUserNote(taskId, note)
  }

  private async handleGetArchive(
    _event: Electron.IpcMainInvokeEvent,
    month: string,
  ): Promise<string> {
    return await this.progressLedger.getArchive(month)
  }
}
