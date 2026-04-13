import { useEffect, useRef } from 'react'
import {
  Link2,
  Loader2,
  MoreVertical,
  Send,
} from 'lucide-react'
import { PixelOctoIcon } from '../brand/PixelOctoIcon'
import { cn } from '../../utils/cn'
import { AIDiffPreviewCard, type DiffLine } from './AIDiffPreviewCard'
import type { ChatMessage } from './types'

interface StudioAIPanelProps {
  messages: ChatMessage[]
  isStreaming: boolean
  chatInput: string
  onChatInputChange: (value: string) => void
  onSendMessage: () => void
  onStopStreaming: () => void
  onNewSession: () => void
  onApplyDiffProposal: (messageId: string) => void
  onEditAndApplyDiffProposal: (messageId: string) => void
  focusComposerSignal?: number
}

const MOCK_DIFF_LINES = [
  { type: 'remove' as const, text: 'bg-white text-black' },
  { type: 'add' as const, text: 'bg-[#1A1500] border-status-warning' },
]

function toDiffLines(before: string, after: string): DiffLine[] {
  const beforeLines = before
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((line) => ({ type: 'remove' as const, text: line }))

  const afterLines = after
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((line) => ({ type: 'add' as const, text: line }))

  const combined = [...beforeLines, ...afterLines]
  return combined.length > 0
    ? combined
    : [
        { type: 'remove', text: before.slice(0, 120) },
        { type: 'add', text: after.slice(0, 120) },
      ]
}

export function StudioAIPanel(props: StudioAIPanelProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

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
                    Sure, retrieved{' '}
                    <span className="rounded bg-white/10 px-1 py-0.5 font-mono text-xs text-white">
                      Sibylla_VI_Design_System.html
                    </span>
                    . It is recommended to use a dark gray panel with warning colors. I have generated a Diff preview:
                  </p>

                  <AIDiffPreviewCard filename="ui-ux-design.md" lines={MOCK_DIFF_LINES} />
                </div>

                <div className="mt-1 flex gap-2">
                  <button className="rounded bg-white px-3 py-1.5 text-xs font-medium text-black shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-colors hover:bg-gray-200">
                    Apply
                  </button>
                  <button className="rounded border border-sys-darkBorder bg-sys-darkSurface px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:text-white">
                    Edit & Apply
                  </button>
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
            const hasDiffProposal = Boolean(message.diffProposal)
            const diffLines: DiffLine[] = message.diffProposal
              ? toDiffLines(message.diffProposal.before, message.diffProposal.after)
              : []

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
                    <p className="whitespace-pre-wrap">{message.content || (message.streaming ? '...' : '')}</p>
                    {hasDiffProposal && (
                      <AIDiffPreviewCard
                        filename={message.diffProposal?.targetPath ?? 'current-file'}
                        lines={diffLines}
                      />
                    )}
                  </div>

                  {hasDiffProposal && (
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        className="rounded bg-white px-3 py-1.5 text-xs font-medium text-black shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-colors hover:bg-gray-200"
                        onClick={() => props.onApplyDiffProposal(message.id)}
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        className="rounded border border-sys-darkBorder bg-sys-darkSurface px-3 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:text-white"
                        onClick={() => props.onEditAndApplyDiffProposal(message.id)}
                      >
                        Edit & Apply
                      </button>
                    </div>
                  )}

                  {message.contextSources && message.contextSources.length > 0 && (
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
                </div>
              </div>
            )
          })
        )}

        {props.isStreaming && props.messages.length > 0 && (
          <div className="flex items-start gap-3">
            <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sys-darkBorder">
              <PixelOctoIcon className="h-3.5 w-3.5 animate-pulse text-sys-darkMuted" />
            </div>
            <div className="flex w-[70%] flex-col gap-2">
              <div className="h-4 w-full animate-pulse rounded bg-sys-darkBorder" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-sys-darkBorder" />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-sys-darkBorder bg-[#050505] p-3">
        <div className="relative flex items-end rounded-xl border border-[#333333] bg-[#111111] p-1 transition-all focus-within:border-white/50 focus-within:ring-1 focus-within:ring-white/30">
          <textarea
            ref={inputRef}
            value={props.chatInput}
            onChange={(event) => props.onChatInputChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                props.onSendMessage()
              }
            }}
            rows={1}
            placeholder="Ask Sibylla..."
            className="min-h-[36px] max-h-32 w-full resize-none border-none bg-transparent py-2 pl-3 text-[13px] text-white placeholder:text-gray-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={props.onSendMessage}
            disabled={!props.chatInput.trim() || props.isStreaming}
            className="m-1 rounded-lg bg-white p-1.5 text-black shadow-[0_0_10px_rgba(255,255,255,0.2)] transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {props.isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
