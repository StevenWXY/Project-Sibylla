/**
 * ModeSelector — Harness execution mode switcher
 *
 * Renders a three-segment button group for Single / Dual / Panel mode selection.
 * Integrated in the Studio bottom bar, 32px height.
 *
 * - Single: Direct answer without quality review
 * - Dual: AI self-review before answering (recommended)
 * - Panel: Multi-reviewer before answering (for spec file modifications)
 */

import React from 'react'
import { useHarnessStore, selectCurrentMode } from '../../../store/harnessStore'
import type { HarnessMode } from '../../../../shared/types'

interface ModeOption {
  readonly mode: HarnessMode
  readonly label: string
  readonly tooltip: string
}

const MODE_OPTIONS: readonly ModeOption[] = [
  { mode: 'single', label: 'Single', tooltip: '直接回答，不进行质量审查' },
  { mode: 'dual', label: 'Dual', tooltip: 'AI 自检后再回答（推荐）' },
  { mode: 'panel', label: 'Panel', tooltip: '多重审查后回答（用于规范文件修改）' },
] as const

export const ModeSelector: React.FC = () => {
  const currentMode = useHarnessStore(selectCurrentMode)
  const setMode = useHarnessStore((s) => s.setMode)

  const handleModeChange = (mode: HarnessMode) => {
    setMode(mode)
    // Fire IPC to persist mode in main process
    window.electronAPI?.harness?.setMode(mode).catch(() => {
      // Ignore IPC errors — store state is source of truth for UI
    })
  }

  return (
    <div className="inline-flex items-center rounded-md border border-sys-darkBorder bg-[#0A0A0A]">
      {MODE_OPTIONS.map((option) => {
        const isActive = currentMode === option.mode
        return (
          <button
            key={option.mode}
            type="button"
            title={option.tooltip}
            onClick={() => handleModeChange(option.mode)}
            className={`
              px-2.5 py-1 text-xs font-medium transition-colors
              first:rounded-l-md last:rounded-r-md
              ${
                isActive
                  ? 'bg-indigo-500 text-white'
                  : 'bg-transparent text-gray-400 hover:text-gray-200'
              }
            `}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
