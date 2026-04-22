import React from 'react'
import { useModelStore } from '../../store/modelStore'
import { cn } from '../../utils/cn'

interface ModelSwitcherProps {
  conversationId: string
  onOpenSettings?: () => void
}

const COST_COLORS: Record<string, string> = {
  low: 'bg-green-400',
  medium: 'bg-yellow-400',
  high: 'bg-red-400',
}

function formatCountdown(ms: number): string {
  const seconds = Math.ceil(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}m ${secs}s`
}

export const ModelSwitcher: React.FC<ModelSwitcherProps> = ({ conversationId, onOpenSettings }) => {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)
  const models = useModelStore((s) => s.models)
  const currentModelId = useModelStore((s) => s.currentModelId)
  const fetchModels = useModelStore((s) => s.fetchModels)
  const fetchCurrent = useModelStore((s) => s.fetchCurrent)
  const switchModel = useModelStore((s) => s.switchModel)
  const [now, setNow] = React.useState(Date.now())

  React.useEffect(() => {
    const hasRateLimited = models.some((m) => m.isRateLimited)
    if (!hasRateLimited) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [models])

  React.useEffect(() => {
    fetchModels()
    fetchCurrent(conversationId)
  }, [conversationId, fetchModels, fetchCurrent])

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const currentModel = models.find((m) => m.id === currentModelId)
  const displayName = currentModel?.displayName ?? currentModelId ?? 'Model'

  const handleSelect = async (modelId: string) => {
    await switchModel(conversationId, modelId)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-1.5',
          'border border-white/10 bg-white/5',
          'text-sm text-white transition-colors',
          'hover:bg-white/10',
        )}
      >
        <span className="text-xs opacity-60">{currentModel?.provider ?? ''}</span>
        <span>{displayName}</span>
        {currentModel && (
          <span className={cn('inline-block h-2 w-2 rounded-full', COST_COLORS[currentModel.costTier] ?? 'bg-gray-400')} />
        )}
        <span className="text-xs opacity-40">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-white/10 bg-[#1a1a2e] py-1 shadow-xl">
          {models.map((model) => (
            <button
              key={model.id}
              onClick={() => model.available && handleSelect(model.id)}
              disabled={!model.available}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                model.available ? 'text-white hover:bg-white/5' : 'cursor-not-allowed text-white/30',
                model.id === currentModelId && 'bg-white/5',
              )}
              title={model.unavailableReason}
            >
              <span className="text-xs opacity-60">{model.provider}</span>
              <span className="flex-1">{model.displayName}</span>
              {model.isRateLimited && model.rateLimitResetAt && (
                <span className="text-xs text-red-400">
                  {formatCountdown(model.rateLimitResetAt - now)}
                </span>
              )}
              <span className={cn('inline-block h-2 w-2 rounded-full', COST_COLORS[model.costTier] ?? 'bg-gray-400')} />
              {model.id === currentModelId && <span className="text-indigo-400">✓</span>}
            </button>
          ))}
          <div className="border-t border-white/10 px-3 py-2">
            <button
              onClick={() => { setOpen(false); onOpenSettings?.() }}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Configure more models...
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
