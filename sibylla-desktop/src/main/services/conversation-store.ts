import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { logger } from '../utils/logger'

export interface ConversationRecord {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface MessageRecord {
  id: string
  conversationId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
  contextSources: string[]
  traceId: string | null
  memoryState: { tokenCount: number; tokenDebt: number; flushTriggered: boolean } | null
  ragHits: Array<{ path: string; score: number; snippet: string }> | null
}

export interface PaginatedMessages {
  messages: MessageRecord[]
  hasMore: boolean
  total: number
}

export class ConversationStore {
  private db: Database.Database

  constructor(workspacePath: string) {
    const dataDir = path.join(workspacePath, '.sibylla', 'data')
    fs.mkdirSync(dataDir, { recursive: true })

    const dbPath = path.join(dataDir, 'conversations.db')
    this.db = new Database(dbPath, {
      verbose: process.env.NODE_ENV === 'development'
        ? (msg: string) => {
            if (typeof msg === 'string' && !msg.startsWith('PRAGMA')) {
              console.debug('[ConversationStore]', msg)
            }
          }
        : undefined,
    })

    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')

    this.initSchema()
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        message_count INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        context_sources TEXT NOT NULL DEFAULT '[]',
        trace_id TEXT,
        memory_state TEXT,
        rag_hits TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation
        ON messages(conversation_id, created_at ASC);

      CREATE INDEX IF NOT EXISTS idx_conversations_updated
        ON conversations(updated_at DESC);
    `)
  }

  createConversation(id: string, title?: string): ConversationRecord {
    const now = Date.now()
    const record: ConversationRecord = {
      id,
      title: title ?? '',
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    }

    this.db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at, message_count)
      VALUES (?, ?, ?, ?, 0)
    `).run(id, record.title, now, now)

    return record
  }

  appendMessage(msg: MessageRecord): void {
    const insertStmt = this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, created_at, context_sources, trace_id, memory_state, rag_hits)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const updateConvStmt = this.db.prepare(`
      UPDATE conversations
      SET updated_at = ?, message_count = message_count + 1
      WHERE id = ?
    `)

    const updateTitleStmt = this.db.prepare(`
      UPDATE conversations SET title = ? WHERE id = ? AND (title = '' OR title IS NULL)
    `)

    const transaction = this.db.transaction(() => {
      insertStmt.run(
        msg.id,
        msg.conversationId,
        msg.role,
        msg.content,
        msg.createdAt,
        JSON.stringify(msg.contextSources),
        msg.traceId,
        msg.memoryState ? JSON.stringify(msg.memoryState) : null,
        msg.ragHits ? JSON.stringify(msg.ragHits) : null
      )

      updateConvStmt.run(msg.createdAt, msg.conversationId)

      if (msg.role === 'user' && msg.content.length > 0) {
        const title = msg.content.slice(0, 80).replace(/\n/g, ' ')
        updateTitleStmt.run(title, msg.conversationId)
      }
    })

    transaction()
  }

  updateMessageContent(messageId: string, content: string): void {
    this.db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, messageId)
  }

  getMessages(conversationId: string, limit: number, beforeTimestamp?: number): PaginatedMessages {
    const countRow = this.db.prepare(
      'SELECT COUNT(*) as total FROM messages WHERE conversation_id = ?'
    ).get(conversationId) as { total: number }

    let rows: Array<{
      id: string
      conversation_id: string
      role: string
      content: string
      created_at: number
      context_sources: string
      trace_id: string | null
      memory_state: string | null
      rag_hits: string | null
    }>

    if (beforeTimestamp) {
      rows = this.db.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ? AND created_at < ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(conversationId, beforeTimestamp, limit) as typeof rows
    } else {
      rows = this.db.prepare(`
        SELECT * FROM messages
        WHERE conversation_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(conversationId, limit) as typeof rows
    }

    const messages = rows.reverse().map((row) => this.rowToMessage(row))
    const hasMore = rows.length >= limit

    return { messages, hasMore, total: countRow.total }
  }

  listConversations(limit: number, offset: number): ConversationRecord[] {
    const rows = this.db.prepare(`
      SELECT id, title, created_at, updated_at, message_count
      FROM conversations
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as Array<{
      id: string
      title: string
      created_at: number
      updated_at: number
      message_count: number
    }>

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
    }))
  }

  getConversation(id: string): ConversationRecord | null {
    const row = this.db.prepare(`
      SELECT id, title, created_at, updated_at, message_count
      FROM conversations WHERE id = ?
    `).get(id) as {
      id: string
      title: string
      created_at: number
      updated_at: number
      message_count: number
    } | undefined

    if (!row) return null

    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      messageCount: row.message_count,
    }
  }

  deleteConversation(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id)
  }

  private rowToMessage(row: {
    id: string
    conversation_id: string
    role: string
    content: string
    created_at: number
    context_sources: string
    trace_id: string | null
    memory_state: string | null
    rag_hits: string | null
  }): MessageRecord {
    let contextSources: string[] = []
    try {
      contextSources = JSON.parse(row.context_sources)
    } catch { /* ignore */ }

    let memoryState: MessageRecord['memoryState'] = null
    if (row.memory_state) {
      try {
        memoryState = JSON.parse(row.memory_state)
      } catch { /* ignore */ }
    }

    let ragHits: MessageRecord['ragHits'] = null
    if (row.rag_hits) {
      try {
        ragHits = JSON.parse(row.rag_hits)
      } catch { /* ignore */ }
    }

    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
      createdAt: row.created_at,
      contextSources,
      traceId: row.trace_id,
      memoryState,
      ragHits,
    }
  }

  close(): void {
    if (this.db.open) {
      this.db.pragma('optimize')
      this.db.close()
    }
  }
}
