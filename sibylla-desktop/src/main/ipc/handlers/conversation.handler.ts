import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IpcHandler } from '../handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type {
  ConversationSummary,
  ConversationMessageShared,
  PaginatedMessagesShared,
} from '../../../shared/types'
import { ConversationStore, type MessageRecord } from '../../services/conversation-store'
import { logger } from '../../utils/logger'

export class ConversationHandler extends IpcHandler {
  readonly namespace = 'conversation'
  private store: ConversationStore | null = null

  setStore(store: ConversationStore): void {
    this.store = store
  }

  register(): void {
    ipcMain.handle(IPC_CHANNELS.CONVERSATION_CREATE, this.safeHandle(this.createConversation.bind(this)))
    ipcMain.handle(IPC_CHANNELS.CONVERSATION_APPEND_MESSAGE, this.safeHandle(this.appendMessage.bind(this)))
    ipcMain.handle(IPC_CHANNELS.CONVERSATION_GET_MESSAGES, this.safeHandle(this.getMessages.bind(this)))
    ipcMain.handle(IPC_CHANNELS.CONVERSATION_LIST, this.safeHandle(this.listConversations.bind(this)))
    ipcMain.handle(IPC_CHANNELS.CONVERSATION_LOAD_LATEST, this.safeHandle(this.loadLatest.bind(this)))
    logger.info('[ConversationHandler] All handlers registered')
  }

  override cleanup(): void {
    ipcMain.removeHandler(IPC_CHANNELS.CONVERSATION_CREATE)
    ipcMain.removeHandler(IPC_CHANNELS.CONVERSATION_APPEND_MESSAGE)
    ipcMain.removeHandler(IPC_CHANNELS.CONVERSATION_GET_MESSAGES)
    ipcMain.removeHandler(IPC_CHANNELS.CONVERSATION_LIST)
    ipcMain.removeHandler(IPC_CHANNELS.CONVERSATION_LOAD_LATEST)
    super.cleanup()
  }

  private createConversation(
    _event: IpcMainInvokeEvent,
    id: string,
    title?: string
  ): ConversationSummary {
    this.ensureStore()
    return this.store!.createConversation(id, title)
  }

  private appendMessage(
    _event: IpcMainInvokeEvent,
    msg: ConversationMessageShared
  ): void {
    this.ensureStore()
    const record: MessageRecord = {
      id: msg.id,
      conversationId: msg.conversationId,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
      contextSources: msg.contextSources ? [...msg.contextSources] : [],
      traceId: msg.traceId ?? null,
      memoryState: msg.memoryState ?? null,
      ragHits: msg.ragHits ? msg.ragHits.map((h) => ({ ...h })) : null,
    }
    this.store!.appendMessage(record)
  }

  private getMessages(
    _event: IpcMainInvokeEvent,
    conversationId: string,
    limit: number,
    beforeTimestamp?: number
  ): PaginatedMessagesShared {
    this.ensureStore()
    const result = this.store!.getMessages(conversationId, limit, beforeTimestamp)
    return {
      messages: result.messages.map((m) => this.recordToShared(m)),
      hasMore: result.hasMore,
      total: result.total,
    }
  }

  private listConversations(
    _event: IpcMainInvokeEvent,
    limit: number,
    offset: number
  ): ConversationSummary[] {
    this.ensureStore()
    return this.store!.listConversations(limit, offset)
  }

  private loadLatest(
    _event: IpcMainInvokeEvent
  ): { conversationId: string; messages: ConversationMessageShared[]; hasMore: boolean } | null {
    this.ensureStore()
    const conversations = this.store!.listConversations(1, 0)
    if (conversations.length === 0) return null

    const conv = conversations[0]
    const result = this.store!.getMessages(conv.id, 50)
    return {
      conversationId: conv.id,
      messages: result.messages.map((m) => this.recordToShared(m)),
      hasMore: result.hasMore,
    }
  }

  private recordToShared(m: MessageRecord): ConversationMessageShared {
    return {
      id: m.id,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      contextSources: m.contextSources,
      traceId: m.traceId,
      memoryState: m.memoryState,
      ragHits: m.ragHits,
    }
  }

  private ensureStore(): asserts this is { store: ConversationStore } {
    if (!this.store) {
      throw new Error('ConversationStore not initialized')
    }
  }
}
