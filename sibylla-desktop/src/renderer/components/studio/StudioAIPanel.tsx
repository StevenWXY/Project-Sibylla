import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Link2,
  MoreVertical,
  Send,
  Square,
} from 'lucide-react'
import { PixelOctoIcon } from '../brand/PixelOctoIcon'
import { cn } from '../../utils/cn'
import { DiffReviewPanel } from './DiffReviewPanel'
import { FileAutocomplete } from './FileAutocomplete'
import { SkillAutocomplete } from './SkillAutocomplete'
import type { ParsedFileDiff } from './types'

interface StudioAIPanelProps {
  messages: import('./types').ChatMessage[]
  isStreaming: boolean
  chatInput: string
  onChatInputChange: (value: string) => void
  onSendMessage: (manualRefs?: string[], skillRefs?: string[]) => void
  onStopStreaming: () => void
  onNewSession: () => void
  focusComposerSignal?: number
  diffReviewProps?: DiffReviewPanelProps | null
}

function detectSkillTrigger(textBeforeCursor: string): { triggered: true; query: string; startIndex: number } | null {
  const lastHashIndex = textBeforeCursor.lastIndexOf('#')
  if (lastHashIndex === -1) return null
  if (lastHashIndex > 0 && textBeforeCursor[lastHashIndex - 1] === '@') return null
  const lineStart = textBeforeCursor.lastIndexOf('\n', lastHashIndex - 1) + 1
  const isAtLineStart = lineStart === lastHashIndex
  if (isAtLineStart) {
    const textAfter = textBeforeCursor.substring(lastHashIndex + 1)
    if (textAfter.length > 0 && textAfter[0] === ' ') return null
  }
  const query = textBeforeCursor.substring(lastHashIndex + 1)
  if (query.length === 0 || /[^a-zA-Z0-9-]/.test(query)) return null
  return { triggered: true, query, startIndex: lastHashIndex }
}

interface DiffReviewPanelProps {
  proposals: readonly ParsedFileDiff[]
  activeIndex: number
  isApplying: boolean
  isEditing: boolean
  editingContent: string
  appliedPaths: readonly string[]
  failedPath: string | null
  errorMessage: string | null
  onApply: (filePath: string) => Promise<void>
  onApplyAll: () => Promise<void>
  onStartEditing: () => void
  onCancelEditing: () => void
  onEditingContentChange: (content: string) => void
  onApplyEdited: () => Promise<void>
  onRollback: () => Promise<void>
  onDismiss: () => void
  onClearError: () => void
  onSetActiveIndex: (index: number) => void
}

export function StudioAIPanel(props: StudioAIPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const [autocompleteVisible, setAutocompleteVisible] = useState(false)
  const [autocompleteQuery, setAutocompleteQuery] = useState('')
  const [skillAutocompleteVisible, setSkillAutocompleteVisible] = useState(false)
  const [skillAutocompleteQuery, setSkillAutocompleteQuery] = useState('')

  const extractFileReferences = useCallback((text: string): string[] => {
    const regex = /@\[\[([^\]]+)\]\]/g
    const matches: string[] = []
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      matches.push(match[1].trim())
    }
    return [...new Set(matches)]
  }, [])

  const extractSkillRefs = useCallback((text: string): string[] => {
    const regex = /(?:^|[\s\u4e00-\u9fff])#([a-z0-9][a-z0-9-]*)/g
    const matches: string[] = []
    let match: RegExpExecArray | null
    while ((match = regex.exec(text)) !== null) {
      matches.push(match[1])
    }
    return [...new Set(matches)]
  }, [])

  const handleInputChange = useCallback((value: string) => {
    props.onChatInputChange(value)

    const cursorPos = inputRef.current?.selectionStart ?? value.length
    const textBeforeCursor = value.slice(0, cursorPos)

    // Detect # skill trigger
    const skillTrigger = detectSkillTrigger(textBeforeCursor)
    if (skillTrigger) {
      setSkillAutocompleteVisible(true)
      setSkillAutocompleteQuery(skillTrigger.query)
      setAutocompleteVisible(false)
      return
    }
    setSkillAutocompleteVisible(false)

    // Detect @ file trigger
    const atIndex = textBeforeCursor.lastIndexOf('@')
    if (atIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1)
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        if (!textAfterAt.startsWith('[[')) {
          setAutocompleteVisible(true)
          setAutocompleteQuery(textAfterAt)
          return
        }
      }
    }
    setAutocompleteVisible(false)
  }, [props])

  const handleFileSelect = useCallback((filePath: string) => {
    const textarea = inputRef.current
    if (!textarea) return

    const value = props.chatInput
    const cursorPos = textarea.selectionStart
    const textBeforeCursor = value.slice(0, cursorPos)
    const atIndex = textBeforeCursor.lastIndexOf('@')

    if (atIndex !== -1) {
      const before = value.slice(0, atIndex)
      const after = value.slice(cursorPos)
      const newValue = `${before}@[[${filePath}]] ${after}`
      props.onChatInputChange(newValue)
      setAutocompleteVisible(false)

      requestAnimationFrame(() => {
        const newCursorPos = atIndex + filePath.length + 6
        textarea.setSelectionRange(newCursorPos, newCursorPos)
        textarea.focus()
      })
    }
  }, [props])

  const handleSkillSelect = useCallback((skillId: string, _skillName: string) => {
    const textarea = inputRef.current
    if (!textarea) return

    const value = props.chatInput
    const cursorPos = textarea.selectionStart
    const textBeforeCursor = value.slice(0, cursorPos)
    const lastHashIndex = textBeforeCursor.lastIndexOf('#')

    if (lastHashIndex !== -1) {
      const before = value.slice(0, lastHashIndex)
      const after = value.slice(cursorPos)
      const newValue = `${before}#${skillId} ${after}`
      props.onChatInputChange(newValue)
      setSkillAutocompleteVisible(false)

      requestAnimationFrame(() => {
        const newCursorPos = lastHashIndex + skillId.length + 2
        textarea.setSelectionRange(newCursorPos, newCursorPos)
        textarea.focus()
      })
    }
  }, [props])

  const handleSend = useCallback(() => {
    const refs = extractFileReferences(props.chatInput)
    const skillRefs = extractSkillRefs(props.chatInput)
    props.onSendMessage(
      refs.length > 0 ? refs : undefined,
      skillRefs.length > 0 ? skillRefs : undefined
    )
  }, [props, extractFileReferences, extractSkillRefs])

  useEffect(() => {
    if (props.focusComposerSignal === undefined) {
      return
    }
    const textarea = inputRef.current
    if (!textarea) {
      return
    }
    textarea.focus()
    const cursorPos = textarea.value.length
    textarea.setSelectionRange(cursorPos, cursorPos)
  }, [props.focusComposerSignal])

  return (
    <aside className="relative flex w-[320px] min-h-0 flex-col border-l border-sys-darkBorder bg-[#0A0A0A]">
      <div className="flex items-center justify-between border-b border-sys-darkBorder bg-[#050505] px-4 py-3">
        <div className="flex items-center gap-2 text-white">
          <PixelOctoIcon className="h-4 w-4" />
          <span className="text-sm font-semibold">Sibylla AI</span>
        </div>
        <button className="text-sys-darkMuted transition-colors hover:text-white">
          <MoreVertical className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {props.messages.length === 0 ? (
          <>
            <div className="flex flex-col items-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-sys-darkBorder px-4 py-2.5 text-[13px] text-white">
                Help me optimize the style of the conflict resolution interface according to the latest VI guidelines.
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 shadow-[0_0_10px_rgba(255,255,255,0.1)]">
                <PixelOctoIcon className="h-3.5 w-3.5 text-white" />
              </div>
              <div className="flex max-w-[85%] flex-col gap-2">
                <div className="space-y-2 text-[13px] leading-relaxed text-gray-300">
                  <p>
                    Sure, I can help with that. Ask me to modify files, and I&apos;ll show you a diff preview for review before applying changes.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sys-darkBorder">
                <PixelOctoIcon className="h-3.5 w-3.5 animate-pulse text-sys-darkMuted" />
              </div>
              <div className="flex w-[70%] flex-col gap-2">
                <div className="mt-1.5 h-4 w-full animate-pulse rounded bg-sys-darkBorder" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-sys-darkBorder" />
              </div>
            </div>
          </>
        ) : (
          props.messages.map((message) => {
            const hasDiffProposals = Boolean(message.diffProposals && message.diffProposals.length > 0)

            if (message.role === 'user') {
              return (
                <div key={message.id} className="flex flex-col items-end">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-sys-darkBorder px-4 py-2.5 text-[13px] text-white">
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                </div>
              )
            }

            return (
              <div key={message.id} className="flex items-start gap-3">
                <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sys-darkBorder">
                  <PixelOctoIcon className={cn('h-3.5 w-3.5', message.streaming ? 'animate-pulse text-sys-darkMuted' : 'text-white')} />
                </div>
                <div className="flex max-w-[85%] flex-col gap-2">
                  <div className="space-y-2 text-[13px] leading-relaxed text-gray-300">
                    <p className="whitespace-pre-wrap">
                      {message.content || (message.streaming ? '' : '')}
                      {message.streaming && (
                        <span className="inline-block w-1.5 h-4 ml-0.5 bg-white/80 animate-pulse rounded-sm" />
                      )}
                    </p>
                    {!message.streaming && hasDiffProposals && props.diffReviewProps && (
                      <DiffReviewPanel {...props.diffReviewProps} />
                    )}
                  </div>

                  {!message.streaming && message.contextSources && message.contextSources.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {message.contextSources.map((source) => (
                        <span
                          key={`${message.id}-${source}`}
                          className="rounded border border-white/10 bg-sys-darkSurface px-1.5 py-0.5 font-mono text-[10px] text-sys-darkMuted"
                        >
                          {source}
                        </span>
                      ))}
                    </div>
                  )}

                  {!message.streaming && message.memoryState && (
                    <div className="flex items-center gap-1.5 text-[10px] text-sys-darkMuted">
                      <span className="font-mono">
                        MEMORY: {message.memoryState.tokenCount} tokens
                        {message.memoryState.tokenDebt > 0 && (
                          <span className="text-amber-400">
                            {' '}(debt: {message.memoryState.tokenDebt})
                          </span>
                        )}
                      </span>
                      {message.memoryState.flushTriggered && (
                        <span className="rounded bg-amber-500/20 px-1 py-0.5 text-amber-400">
                          flush triggered
                        </span>
                      )}
                    </div>
                  )}

                  {!message.streaming && message.ragHits && message.ragHits.length > 0 && (
                    <details className="group/details">
                      <summary className="cursor-pointer text-[10px] text-sys-darkMuted hover:text-gray-400">
                        RAG references ({message.ragHits.length})
                      </summary>
                      <div className="mt-1 space-y-1">
                        {message.ragHits.map((hit, index) => (
                          <div
                            key={`${message.id}-rag-${index}`}
                            className="rounded border border-white/5 bg-sys-darkSurface p-2 text-[11px]"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sys-darkMuted truncate max-w-[200px]">
                                {hit.path.split('/').pop()}
                              </span>
                              <span className="text-sys-darkMuted">
                                score: {hit.score.toFixed(3)}
                              </span>
                            </div>
                            <p className="mt-1 text-gray-400 line-clamp-2">
                              {hit.snippet}
                            </p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="border-t border-sys-darkBorder bg-[#050505] p-3">
        <div className="relative flex items-end rounded-xl border border-[#333333] bg-[#111111] p-1 transition-all focus-within:border-white/50 focus-within:ring-1 focus-within:ring-white/30">
          <div className="relative w-full">
            <FileAutocomplete
              query={autocompleteQuery}
              onSelect={handleFileSelect}
              onClose={() => setAutocompleteVisible(false)}
              visible={autocompleteVisible}
            />
            <SkillAutocomplete
              query={skillAutocompleteQuery}
              onSelect={handleSkillSelect}
              onClose={() => setSkillAutocompleteVisible(false)}
              visible={skillAutocompleteVisible}
            />
            <textarea
              ref={inputRef}
              value={props.chatInput}
              onChange={(event) => handleInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (autocompleteVisible || skillAutocompleteVisible) return
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  handleSend()
                }
              }}
              rows={1}
              placeholder="Ask Sibylla... (type @ to reference files)"
              className="min-h-[36px] max-h-32 w-full resize-none border-none bg-transparent py-2 pl-3 text-[13px] text-white placeholder:text-gray-500 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={props.isStreaming ? props.onStopStreaming : handleSend}
            disabled={!props.chatInput.trim() && !props.isStreaming}
            className="m-1 rounded-lg bg-white p-1.5 text-black shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {props.isStreaming
              ? <Square className="h-3.5 w-3.5 fill-current" />
              : <Send className="h-4 w-4" />}
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between px-1">
          <div className="flex gap-2">
            <button className="text-sys-darkMuted transition-colors hover:text-white">
              <Link2 className="h-4 w-4" />
            </button>
          </div>
          <span className="font-mono text-[10px] text-gray-500">⌘ ↵ Send</span>
        </div>
      </div>
    </aside>
  )
}
