import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useModeStore } from '../../store/modeStore'
import type { AiModeDefinitionShared } from '../../../shared/types'

interface AiModeSwitcherProps {
  conversationId: string
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function AiModeSwitcher({ conversationId }: AiModeSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const { modes, getActiveMode, switchMode, setCurrentConversation } = useModeStore()

  useEffect(() => {
    setCurrentConversation(conversationId)
  }, [conversationId, setCurrentConversation])

  const activeMode = getActiveMode()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') {
        setOpen(false)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex(prev => Math.min(prev + 1, modes.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex(prev => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter' && highlightIndex >= 0) {
        e.preventDefault()
        const mode = modes[highlightIndex]
        if (mode) {
          handleSelect(mode)
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, highlightIndex, modes])

  const handleSelect = (mode: AiModeDefinitionShared) => {
    switchMode(conversationId, mode.id)
    setOpen(false)
  }

  const displayMode = activeMode ?? modes.find(m => m.id === 'free')

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(prev => !prev)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all',
          'hover:brightness-110 focus:outline-none focus:ring-1 focus:ring-offset-0',
        )}
        style={{
          backgroundColor: hexToRgba(displayMode?.color ?? '#64748b', 0.12),
          color: displayMode?.color ?? '#64748b',
          focusRingColor: displayMode?.color ?? '#64748b',
        }}
        title={displayMode?.description}
      >
        <span className="text-sm">{displayMode?.icon}</span>
        <span>{displayMode?.label}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <div
          className={cn(
            'absolute top-full left-0 mt-1 z-50 min-w-[280px]',
            'bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700',
            'py-1 overflow-hidden',
          )}
        >
          {modes.map((mode, index) => {
            const isActive = mode.id === (displayMode?.id ?? 'free')
            const isHighlighted = index === highlightIndex

            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => handleSelect(mode)}
                onMouseEnter={() => setHighlightIndex(index)}
                className={cn(
                  'w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors',
                  isHighlighted && 'bg-gray-50 dark:bg-gray-700/50',
                )}
                style={{
                  borderLeft: `3px solid ${mode.color}`,
                }}
              >
                <span className="text-base mt-0.5 shrink-0">{mode.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                      {mode.label}
                    </span>
                    {isActive && (
                      <Check className="w-3.5 h-3.5 shrink-0" style={{ color: mode.color }} />
                    )}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 leading-tight block mt-0.5">
                    {mode.description}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
