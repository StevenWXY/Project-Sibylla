import { cn } from '../../utils/cn'
import type { AiModeDefinitionShared } from '../../../shared/types'

interface AiModeInfoProps {
  mode: AiModeDefinitionShared
}

export function AiModeInfo({ mode }: AiModeInfoProps) {
  return (
    <div
      className={cn(
        'rounded-lg overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700',
        'bg-white dark:bg-gray-800',
      )}
    >
      <div
        className="h-1.5"
        style={{ backgroundColor: mode.color }}
      />

      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">{mode.icon}</span>
          <span
            className={cn(
              'px-2 py-0.5 rounded-full text-xs font-semibold',
            )}
            style={{
              backgroundColor: mode.color,
              color: '#ffffff',
            }}
          >
            {mode.label}
          </span>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
          {mode.description}
        </p>

        {mode.produces && mode.produces.length > 0 && (
          <div className="mb-2">
            <span className="text-xs text-gray-400 dark:text-gray-500">产物类型</span>
            <div className="flex gap-1 mt-0.5">
              {mode.produces.map(p => (
                <span
                  key={p}
                  className="px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {mode.requiresContext && mode.requiresContext.length > 0 && (
          <div>
            <span className="text-xs text-gray-400 dark:text-gray-500">需要上下文</span>
            <div className="flex gap-1 mt-0.5">
              {mode.requiresContext.map(c => (
                <span
                  key={c}
                  className="px-1.5 py-0.5 rounded text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
