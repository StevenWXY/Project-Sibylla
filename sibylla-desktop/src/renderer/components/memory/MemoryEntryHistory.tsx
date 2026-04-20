import React from 'react'
import { cn } from '../../utils/cn'
import type { EvolutionEvent } from '../../../shared/types'

interface MemoryEntryHistoryProps {
  entryId: string
  events: EvolutionEvent[]
  onClose: () => void
}

/** Chinese labels for evolution event types */
const EVENT_TYPE_LABELS: Record<string, string> = {
  add: '新增',
  update: '更新',
  merge: '合并',
  archive: '归档',
  delete: '删除',
  'manual-edit': '手动编辑',
  lock: '锁定',
  unlock: '解锁',
  compress: '压缩',
  checkpoint: '检查点',
  migrate: '迁移',
}

/** Color for event type badges */
const EVENT_TYPE_COLORS: Record<string, string> = {
  add: 'bg-green-500/20 text-green-400',
  update: 'bg-blue-500/20 text-blue-400',
  merge: 'bg-purple-500/20 text-purple-400',
  archive: 'bg-gray-500/20 text-gray-400',
  delete: 'bg-red-500/20 text-red-400',
  'manual-edit': 'bg-indigo-500/20 text-indigo-400',
  lock: 'bg-amber-500/20 text-amber-400',
  unlock: 'bg-amber-500/20 text-amber-400',
}

/**
 * MemoryEntryHistory — slide-over panel showing evolution timeline for an entry.
 */
export const MemoryEntryHistory = React.memo(function MemoryEntryHistory({
  entryId,
  events,
  onClose,
}: MemoryEntryHistoryProps) {
  // Filter to events for this entry (if entryIds array or entryId field present)
  const relevantEvents = events.filter((ev) => {
    const evObj = ev as Record<string, unknown>
    if (Array.isArray(evObj['entryIds'])) {
      return (evObj['entryIds'] as string[]).includes(entryId)
    }
    if (typeof evObj['entryId'] === 'string') {
      return evObj['entryId'] === entryId
    }
    return true
  })

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <div
        className={cn(
          'h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-gray-900',
          'animate-in slide-in-from-right duration-200',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-white/10 bg-gray-900 px-4 py-3">
          <h3 className="text-sm font-medium text-white">演化历史</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-500 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="关闭"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Timeline */}
        <div className="p-4">
          {relevantEvents.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">暂无变更记录</p>
          ) : (
            <div className="relative border-l border-white/10 pl-4 space-y-4">
              {relevantEvents.map((event, index) => (
                <TimelineItem key={index} event={event} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

/** Single timeline entry */
function TimelineItem({ event }: { event: EvolutionEvent }) {
  const [expanded, setExpanded] = React.useState(false)
  const evObj = event as Record<string, unknown>
  const eventType = String(evObj['type'] ?? event.type ?? 'unknown')
  const label = EVENT_TYPE_LABELS[eventType] ?? eventType
  const colorClass = EVENT_TYPE_COLORS[eventType] ?? 'bg-gray-500/20 text-gray-400'

  return (
    <div className="relative">
      {/* Timeline dot */}
      <div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-gray-700 bg-gray-500" />

      <div className="text-xs text-gray-500 mb-1">
        {formatTimestamp(event.timestamp)}
      </div>

      <div className="flex items-center gap-2 mb-1">
        <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', colorClass)}>
          {label}
        </span>
        {event.trigger?.source && (
          <span className="text-xs text-gray-500">
            来源: {event.trigger.source}
          </span>
        )}
      </div>

      {/* Before/After diff */}
      {(evObj['before'] || evObj['after']) && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {expanded ? '收起详情' : '查看详情'}
        </button>
      )}

      {expanded && (
        <div className="mt-2 space-y-1 text-xs">
          {evObj['before'] && (
            <div className="rounded bg-red-500/10 p-2 text-red-300">
              <span className="font-medium">变更前: </span>
              {String((evObj['before'] as Record<string, unknown>)['content'] ?? JSON.stringify(evObj['before']))}
            </div>
          )}
          {evObj['after'] && (
            <div className="rounded bg-green-500/10 p-2 text-green-300">
              <span className="font-medium">变更后: </span>
              {String((evObj['after'] as Record<string, unknown>)['content'] ?? JSON.stringify(evObj['after']))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function formatTimestamp(isoTimestamp: string): string {
  try {
    const date = new Date(isoTimestamp)
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoTimestamp
  }
}
