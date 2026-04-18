import { describe, it, expect, beforeEach } from 'vitest'
import {
  useAIChatStore,
  selectMessages,
  selectIsStreaming,
  selectActiveStreamId,
  selectSessionTokenUsage,
} from '../../src/renderer/store/aiChatStore'

describe('aiChatStore', () => {
  beforeEach(() => {
    useAIChatStore.getState().reset()
  })

  describe('initial state', () => {
    it('has empty messages and no active stream', () => {
      const state = useAIChatStore.getState()
      expect(state.messages).toEqual([])
      expect(state.isStreaming).toBe(false)
      expect(state.activeStreamId).toBeNull()
      expect(state.sessionTokenUsage).toBe(0)
    })
  })

  describe('addUserMessage', () => {
    it('adds a user message and returns its id', () => {
      const id = useAIChatStore.getState().addUserMessage('Hello AI')
      const state = useAIChatStore.getState()

      expect(state.messages).toHaveLength(1)
      expect(state.messages[0]).toMatchObject({
        id,
        role: 'user',
        content: 'Hello AI',
      })
    })
  })

  describe('addAssistantPlaceholder', () => {
    it('adds a streaming assistant placeholder and sets activeStreamId', () => {
      useAIChatStore.getState().addAssistantPlaceholder('assistant-1', ['file1.md'])

      const state = useAIChatStore.getState()
      expect(state.messages).toHaveLength(1)
      expect(state.messages[0]).toMatchObject({
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        streaming: true,
        contextSources: ['file1.md'],
      })
      expect(state.isStreaming).toBe(true)
      expect(state.activeStreamId).toBe('assistant-1')
    })
  })

  describe('appendToAssistant', () => {
    it('incrementally appends content to the assistant message', () => {
      useAIChatStore.getState().addAssistantPlaceholder('assistant-1')

      useAIChatStore.getState().appendToAssistant('assistant-1', 'Hel')
      useAIChatStore.getState().appendToAssistant('assistant-1', 'lo')

      const state = useAIChatStore.getState()
      expect(state.messages[0]?.content).toBe('Hello')
    })

    it('does not affect other messages', () => {
      useAIChatStore.getState().addUserMessage('test')
      useAIChatStore.getState().addAssistantPlaceholder('assistant-1')

      useAIChatStore.getState().appendToAssistant('assistant-1', 'data')

      const state = useAIChatStore.getState()
      expect(state.messages[0]?.content).toBe('test')
      expect(state.messages[1]?.content).toBe('data')
    })
  })

  describe('finalizeAssistant', () => {
    it('sets streaming to false and updates content', () => {
      useAIChatStore.getState().addAssistantPlaceholder('assistant-1')
      useAIChatStore.getState().appendToAssistant('assistant-1', 'partial')

      useAIChatStore.getState().finalizeAssistant('assistant-1', {
        content: 'full content',
        ragHits: [{ path: 'doc.md', score: 0.9, snippet: 'test' }],
        usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.001 },
        memory: { tokenCount: 150, tokenDebt: 0, flushTriggered: false },
        provider: 'mock',
        model: 'test-model',
        intercepted: false,
        warnings: [],
      })

      const state = useAIChatStore.getState()
      expect(state.messages[0]?.content).toBe('full content')
      expect(state.messages[0]?.streaming).toBe(false)
      expect(state.isStreaming).toBe(false)
      expect(state.activeStreamId).toBeNull()
      expect(state.sessionTokenUsage).toBe(150)
    })

    it('preserves existing content when finalize content is empty', () => {
      useAIChatStore.getState().addAssistantPlaceholder('assistant-1')
      useAIChatStore.getState().appendToAssistant('assistant-1', 'accumulated')

      useAIChatStore.getState().finalizeAssistant('assistant-1', {
        content: '',
        ragHits: [],
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
        memory: { tokenCount: 0, tokenDebt: 0, flushTriggered: false },
        provider: 'mock',
        model: 'test',
        intercepted: false,
        warnings: [],
      })

      expect(useAIChatStore.getState().messages[0]?.content).toBe('accumulated')
    })
  })

  describe('markAssistantError', () => {
    it('appends error to existing content', () => {
      useAIChatStore.getState().addAssistantPlaceholder('assistant-1')
      useAIChatStore.getState().appendToAssistant('assistant-1', 'partial content')

      useAIChatStore.getState().markAssistantError('assistant-1', 'network error')

      const state = useAIChatStore.getState()
      expect(state.messages[0]?.content).toContain('partial content')
      expect(state.messages[0]?.content).toContain('network error')
      expect(state.messages[0]?.streaming).toBe(false)
      expect(state.isStreaming).toBe(false)
    })

    it('shows error without prior content', () => {
      useAIChatStore.getState().addAssistantPlaceholder('assistant-1')

      useAIChatStore.getState().markAssistantError('assistant-1', 'timeout')

      expect(useAIChatStore.getState().messages[0]?.content).toContain('timeout')
    })
  })

  describe('stopStreaming', () => {
    it('stops streaming and sets content to fallback text', () => {
      useAIChatStore.getState().addAssistantPlaceholder('assistant-1')

      useAIChatStore.getState().stopStreaming('assistant-1')

      const state = useAIChatStore.getState()
      expect(state.messages[0]?.content).toBe('[请求已停止]')
      expect(state.messages[0]?.streaming).toBe(false)
      expect(state.isStreaming).toBe(false)
    })

    it('preserves existing content on stop', () => {
      useAIChatStore.getState().addAssistantPlaceholder('assistant-1')
      useAIChatStore.getState().appendToAssistant('assistant-1', 'some content')

      useAIChatStore.getState().stopStreaming('assistant-1')

      expect(useAIChatStore.getState().messages[0]?.content).toBe('some content')
    })
  })

  describe('selectors', () => {
    it('selectMessages returns messages array', () => {
      useAIChatStore.getState().addUserMessage('test')
      const state = useAIChatStore.getState()
      expect(selectMessages(state)).toHaveLength(1)
    })

    it('selectIsStreaming returns streaming state', () => {
      expect(selectIsStreaming(useAIChatStore.getState())).toBe(false)
      useAIChatStore.getState().addAssistantPlaceholder('a1')
      expect(selectIsStreaming(useAIChatStore.getState())).toBe(true)
    })

    it('selectActiveStreamId returns active stream id', () => {
      expect(selectActiveStreamId(useAIChatStore.getState())).toBeNull()
      useAIChatStore.getState().addAssistantPlaceholder('s1')
      expect(selectActiveStreamId(useAIChatStore.getState())).toBe('s1')
    })

    it('selectSessionTokenUsage accumulates tokens', () => {
      useAIChatStore.getState().addSessionTokens(100)
      expect(selectSessionTokenUsage(useAIChatStore.getState())).toBe(100)
      useAIChatStore.getState().addSessionTokens(50)
      expect(selectSessionTokenUsage(useAIChatStore.getState())).toBe(150)
    })
  })

  describe('reset', () => {
    it('restores initial state', () => {
      useAIChatStore.getState().addUserMessage('test')
      useAIChatStore.getState().addAssistantPlaceholder('a1')
      useAIChatStore.getState().addSessionTokens(100)

      useAIChatStore.getState().reset()

      const state = useAIChatStore.getState()
      expect(state.messages).toEqual([])
      expect(state.isStreaming).toBe(false)
      expect(state.activeStreamId).toBeNull()
      expect(state.sessionTokenUsage).toBe(0)
    })
  })
})
