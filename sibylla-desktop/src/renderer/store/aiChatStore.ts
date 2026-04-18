import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { AIRagHit, AIMemoryState } from '../../shared/types'
import type { ChatMessage } from '../components/studio/types'

interface AIChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  activeStreamId: string | null
  sessionTokenUsage: number
}

interface FinalizeData {
  content: string
  ragHits: AIRagHit[]
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCostUsd: number
  }
  memory: AIMemoryState
  provider: string
  model: string
  intercepted: boolean
  warnings: string[]
  contextSources?: string[]
}

interface AIChatActions {
  addUserMessage: (content: string) => string
  addAssistantPlaceholder: (id: string, contextSources?: string[]) => void
  appendToAssistant: (streamId: string, delta: string) => void
  finalizeAssistant: (streamId: string, data: FinalizeData) => void
  markAssistantError: (streamId: string, errorMessage: string) => void
  stopStreaming: (streamId: string) => void
  setStreaming: (streamId: string | null) => void
  addSessionTokens: (tokens: number) => void
  reset: () => void
}

type AIChatStore = AIChatState & AIChatActions

const initialState: AIChatState = {
  messages: [],
  isStreaming: false,
  activeStreamId: null,
  sessionTokenUsage: 0,
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useAIChatStore = create<AIChatStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      addUserMessage: (content: string) => {
        const id = createId('user')
        const message: ChatMessage = {
          id,
          role: 'user',
          content,
          createdAt: Date.now(),
        }
        set(
          (state) => ({ messages: [...state.messages, message] }),
          false,
          'aiChat/addUserMessage'
        )
        return id
      },

      addAssistantPlaceholder: (id: string, contextSources?: string[]) => {
        const placeholder: ChatMessage = {
          id,
          role: 'assistant',
          content: '',
          createdAt: Date.now(),
          contextSources,
          streaming: true,
          diffProposal: null,
        }
        set(
          (state) => ({
            messages: [...state.messages, placeholder],
            isStreaming: true,
            activeStreamId: id,
          }),
          false,
          'aiChat/addAssistantPlaceholder'
        )
      },

      appendToAssistant: (streamId: string, delta: string) => {
        set(
          (state) => ({
            messages: state.messages.map((msg) =>
              msg.id === streamId
                ? { ...msg, content: msg.content + delta }
                : msg
            ),
          }),
          false,
          'aiChat/appendToAssistant'
        )
      },

      finalizeAssistant: (streamId: string, data: FinalizeData) => {
        const state = get()
        const existingMessage = state.messages.find((msg) => msg.id === streamId)
        const existingContent = existingMessage?.content ?? ''
        const finalContent = data.content || existingContent

        const contextSources: string[] = [
          ...(data.contextSources ?? []),
          ...data.ragHits.map((h) => h.path),
        ]

        set(
          (state) => ({
            messages: state.messages.map((msg) =>
              msg.id === streamId
                ? {
                    ...msg,
                    content: finalContent,
                    streaming: false,
                    contextSources: contextSources.length > 0
                      ? contextSources
                      : msg.contextSources,
                    memoryState: data.memory
                      ? {
                          tokenCount: data.memory.tokenCount,
                          tokenDebt: data.memory.tokenDebt,
                          flushTriggered: data.memory.flushTriggered,
                        }
                      : null,
                    ragHits: data.ragHits.length > 0
                      ? data.ragHits.map((h) => ({
                          path: h.path,
                          score: h.score,
                          snippet: h.snippet,
                        }))
                      : undefined,
                  }
                : msg
            ),
            isStreaming: false,
            activeStreamId: null,
            sessionTokenUsage: state.sessionTokenUsage + data.usage.totalTokens,
          }),
          false,
          'aiChat/finalizeAssistant'
        )
      },

      markAssistantError: (streamId: string, errorMessage: string) => {
        set(
          (state) => ({
            messages: state.messages.map((msg) =>
              msg.id === streamId
                ? {
                    ...msg,
                    content: msg.content
                      ? `${msg.content}\n\n---\n**错误：** ${errorMessage}`
                      : `请求失败：${errorMessage}`,
                    streaming: false,
                  }
                : msg
            ),
            isStreaming: false,
            activeStreamId: null,
          }),
          false,
          'aiChat/markAssistantError'
        )
      },

      stopStreaming: (streamId: string) => {
        set(
          (state) => ({
            messages: state.messages.map((msg) =>
              msg.id === streamId
                ? {
                    ...msg,
                    content: msg.content || '[请求已停止]',
                    streaming: false,
                  }
                : msg
            ),
            isStreaming: false,
            activeStreamId: null,
          }),
          false,
          'aiChat/stopStreaming'
        )
      },

      setStreaming: (streamId: string | null) => {
        set(
          { isStreaming: streamId !== null, activeStreamId: streamId },
          false,
          'aiChat/setStreaming'
        )
      },

      addSessionTokens: (tokens: number) => {
        set(
          (state) => ({ sessionTokenUsage: state.sessionTokenUsage + tokens }),
          false,
          'aiChat/addSessionTokens'
        )
      },

      reset: () => {
        set(initialState, false, 'aiChat/reset')
      },
    }),
    { name: 'AIChatStore' }
  )
)

export const selectMessages = (state: AIChatStore) => state.messages
export const selectIsStreaming = (state: AIChatStore) => state.isStreaming
export const selectActiveStreamId = (state: AIChatStore) => state.activeStreamId
export const selectSessionTokenUsage = (state: AIChatStore) => state.sessionTokenUsage

export type { AIChatStore, AIChatState, AIChatActions, FinalizeData }
