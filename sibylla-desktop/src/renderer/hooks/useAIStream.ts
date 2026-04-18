import { useEffect, useCallback, useRef } from 'react'
import type { AIChatRequest, AIStreamEnd, AIStreamError } from '../../shared/types'
import { useAIChatStore } from '../store/aiChatStore'

interface UseAIStreamOptions {
  onStreamEnd?: (data: AIStreamEnd) => void
  onStreamError?: (error: AIStreamError) => void
}

export function useAIStream(options?: UseAIStreamOptions) {
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI?.ai) return

    const unlistenChunk = window.electronAPI.ai.onStreamChunk((chunk) => {
      useAIChatStore.getState().appendToAssistant(chunk.id, chunk.delta)
    })

    const unlistenEnd = window.electronAPI.ai.onStreamEnd((end) => {
      const contextSources: string[] = []
      if (end.ragHits && end.ragHits.length > 0) {
        contextSources.push(...end.ragHits.map((h) => h.path))
      }
      useAIChatStore.getState().finalizeAssistant(end.id, {
        content: end.content,
        ragHits: end.ragHits,
        usage: end.usage,
        memory: end.memory,
        provider: end.provider,
        model: end.model,
        intercepted: end.intercepted,
        warnings: end.warnings,
        contextSources,
      })
      optionsRef.current?.onStreamEnd?.(end)
    })

    const unlistenError = window.electronAPI.ai.onStreamError((error) => {
      useAIChatStore.getState().markAssistantError(error.id, error.message)
      optionsRef.current?.onStreamError?.(error)
    })

    return () => {
      unlistenChunk()
      unlistenEnd()
      unlistenError()
    }
  }, [])

  const startStream = useCallback(
    (request: AIChatRequest | string): string => {
      if (!window.electronAPI?.ai) {
        throw new Error('electronAPI.ai is not available')
      }
      return window.electronAPI.ai.stream(request)
    },
    []
  )

  const abortStream = useCallback(
    (streamId: string) => {
      if (!window.electronAPI?.ai) return
      window.electronAPI.ai.abortStream(streamId)
      useAIChatStore.getState().stopStreaming(streamId)
    },
    []
  )

  return { startStream, abortStream }
}
