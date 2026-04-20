import { EventEmitter } from 'events'
import type { CheckpointRecord, CompressionResult, MemoryEntry } from './types'

export class MemoryEventBus extends EventEmitter {
  emitGuardrailRepeated(ruleId: string, count: number): void {
    this.emit('guardrail-repeated', { ruleId, count })
  }

  emitCheckpointStarted(record: CheckpointRecord): void {
    this.emit('memory:checkpoint-started', record)
  }

  emitCheckpointCompleted(record: CheckpointRecord): void {
    this.emit('memory:checkpoint-completed', record)
  }

  emitCheckpointFailed(record: CheckpointRecord): void {
    this.emit('memory:checkpoint-failed', record)
  }

  emitManualCheckpoint(): void {
    this.emit('memory:manual-checkpoint')
  }

  emitCompressionStarted(): void {
    this.emit('memory:compression-started')
  }

  emitCompressionCompleted(result: CompressionResult): void {
    this.emit('memory:compression-completed', result)
  }

  emitSpecFileMajorEdit(filePath: string): void {
    this.emit('spec-file-major-edit', { filePath })
  }

  emitUserInteraction(): void {
    this.emit('user-interaction')
  }

  // TASK026: Entry-level change events for UI push notifications
  emitEntryAdded(entry: MemoryEntry): void {
    this.emit('memory:entry-added', entry)
  }

  emitEntryUpdated(entry: MemoryEntry): void {
    this.emit('memory:entry-updated', entry)
  }

  emitEntryDeleted(entryId: string): void {
    this.emit('memory:entry-deleted', entryId)
  }
}
