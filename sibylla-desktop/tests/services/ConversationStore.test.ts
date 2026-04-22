import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { ConversationStore } from '../../src/main/services/conversation-store'
import fs from 'fs'
import path from 'path'
import os from 'os'

describe('ConversationStore', () => {
  let store: ConversationStore
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sibylla-conv-test-'))
    store = new ConversationStore(tempDir)
  })

  afterEach(() => {
    store.close()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  describe('createConversation', () => {
    it('should create a conversation and return record', () => {
      const record = store.createConversation('conv-1', 'Test Chat')
      expect(record.id).toBe('conv-1')
      expect(record.title).toBe('Test Chat')
      expect(record.messageCount).toBe(0)
      expect(record.createdAt).toBeGreaterThan(0)
    })

    it('should create with empty title when not provided', () => {
      const record = store.createConversation('conv-2')
      expect(record.title).toBe('')
    })
  })

  describe('appendMessage', () => {
    it('should append a user message and increment message count', () => {
      store.createConversation('conv-1')
      store.appendMessage({
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Hello',
        createdAt: Date.now(),
        contextSources: [],
        traceId: null,
        memoryState: null,
        ragHits: null,
      })

      const result = store.getMessages('conv-1', 10)
      expect(result.messages).toHaveLength(1)
      expect(result.messages[0].content).toBe('Hello')
      expect(result.messages[0].role).toBe('user')
    })

    it('should set conversation title from first user message', () => {
      store.createConversation('conv-1')
      store.appendMessage({
        id: 'msg-1',
        conversationId: 'conv-1',
        role: 'user',
        content: 'Help me write a function',
        createdAt: Date.now(),
        contextSources: [],
        traceId: null,
        memoryState: null,
        ragHits: null,
      })

      const conv = store.getConversation('conv-1')
      expect(conv?.title).toBe('Help me write a function')
    })

    it('should append assistant message with metadata', () => {
      store.createConversation('conv-1')
      store.appendMessage({
        id: 'msg-2',
        conversationId: 'conv-1',
        role: 'assistant',
        content: 'Here is the code',
        createdAt: Date.now(),
        contextSources: ['file1.ts', 'file2.ts'],
        traceId: 'trace-123',
        memoryState: { tokenCount: 100, tokenDebt: 0, flushTriggered: false },
        ragHits: [{ path: 'search.ts', score: 0.95, snippet: 'function hello()' }],
      })

      const result = store.getMessages('conv-1', 10)
      expect(result.messages).toHaveLength(1)
      const msg = result.messages[0]
      expect(msg.role).toBe('assistant')
      expect(msg.contextSources).toEqual(['file1.ts', 'file2.ts'])
      expect(msg.traceId).toBe('trace-123')
      expect(msg.memoryState).toEqual({ tokenCount: 100, tokenDebt: 0, flushTriggered: false })
      expect(msg.ragHits).toEqual([{ path: 'search.ts', score: 0.95, snippet: 'function hello()' }])
    })
  })

  describe('getMessages', () => {
    it('should return messages ordered by createdAt ascending', () => {
      store.createConversation('conv-1')
      const baseTime = Date.now()

      store.appendMessage({
        id: 'msg-1', conversationId: 'conv-1', role: 'user',
        content: 'First', createdAt: baseTime, contextSources: [],
        traceId: null, memoryState: null, ragHits: null,
      })
      store.appendMessage({
        id: 'msg-2', conversationId: 'conv-1', role: 'assistant',
        content: 'Second', createdAt: baseTime + 100, contextSources: [],
        traceId: null, memoryState: null, ragHits: null,
      })
      store.appendMessage({
        id: 'msg-3', conversationId: 'conv-1', role: 'user',
        content: 'Third', createdAt: baseTime + 200, contextSources: [],
        traceId: null, memoryState: null, ragHits: null,
      })

      const result = store.getMessages('conv-1', 10)
      expect(result.messages.map((m) => m.content)).toEqual(['First', 'Second', 'Third'])
    })

    it('should paginate with beforeTimestamp', () => {
      store.createConversation('conv-1')
      const baseTime = Date.now()

      for (let i = 0; i < 5; i++) {
        store.appendMessage({
          id: `msg-${i}`, conversationId: 'conv-1', role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`, createdAt: baseTime + i * 100, contextSources: [],
          traceId: null, memoryState: null, ragHits: null,
        })
      }

      const page1 = store.getMessages('conv-1', 3)
      expect(page1.messages).toHaveLength(3)
      expect(page1.hasMore).toBe(true)
      expect(page1.total).toBe(5)

      const oldestTimestamp = page1.messages[0].createdAt
      const page2 = store.getMessages('conv-1', 3, oldestTimestamp)
      expect(page2.messages).toHaveLength(2)
      expect(page2.hasMore).toBe(false)
    })

    it('should return empty for non-existent conversation', () => {
      const result = store.getMessages('nonexistent', 10)
      expect(result.messages).toHaveLength(0)
      expect(result.total).toBe(0)
    })
  })

  describe('listConversations', () => {
    it('should list conversations ordered by updatedAt descending', async () => {
      store.createConversation('conv-1')
      await new Promise((r) => setTimeout(r, 10))
      store.createConversation('conv-2')

      store.appendMessage({
        id: 'msg-1', conversationId: 'conv-2', role: 'user',
        content: 'Hi', createdAt: Date.now(), contextSources: [],
        traceId: null, memoryState: null, ragHits: null,
      })

      const list = store.listConversations(10, 0)
      expect(list).toHaveLength(2)
      expect(list[0].id).toBe('conv-2')
      expect(list[0].messageCount).toBe(1)
      expect(list[1].id).toBe('conv-1')
      expect(list[1].messageCount).toBe(0)
    })

    it('should support pagination with offset', () => {
      for (let i = 0; i < 5; i++) {
        store.createConversation(`conv-${i}`)
      }

      const page1 = store.listConversations(3, 0)
      expect(page1).toHaveLength(3)

      const page2 = store.listConversations(3, 3)
      expect(page2).toHaveLength(2)
    })
  })

  describe('deleteConversation', () => {
    it('should delete conversation and its messages', () => {
      store.createConversation('conv-1')
      store.appendMessage({
        id: 'msg-1', conversationId: 'conv-1', role: 'user',
        content: 'Hi', createdAt: Date.now(), contextSources: [],
        traceId: null, memoryState: null, ragHits: null,
      })

      store.deleteConversation('conv-1')

      expect(store.getConversation('conv-1')).toBeNull()
      const msgs = store.getMessages('conv-1', 10)
      expect(msgs.messages).toHaveLength(0)
    })
  })

  describe('getConversation', () => {
    it('should return null for non-existent conversation', () => {
      expect(store.getConversation('nonexistent')).toBeNull()
    })

    it('should return conversation record', () => {
      store.createConversation('conv-1', 'My Chat')
      const record = store.getConversation('conv-1')
      expect(record).not.toBeNull()
      expect(record!.id).toBe('conv-1')
      expect(record!.title).toBe('My Chat')
    })
  })
})
