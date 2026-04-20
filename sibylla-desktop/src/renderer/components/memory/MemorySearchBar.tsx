import React, { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '../../utils/cn'

interface MemorySearchBarProps {
  onSearch: (query: string) => void
  onClear: () => void
  isLoading?: boolean
}

/**
 * MemorySearchBar — search input with 300ms debounce and clear button.
 */
export const MemorySearchBar = React.memo(function MemorySearchBar({
  onSearch,
  onClear,
  isLoading = false,
}: MemorySearchBarProps) {
  const [value, setValue] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value
      setValue(newValue)

      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }

      timerRef.current = setTimeout(() => {
        if (newValue.trim()) {
          onSearch(newValue.trim())
        } else {
          onClear()
        }
      }, 300)
    },
    [onSearch, onClear],
  )

  const handleClear = useCallback(() => {
    setValue('')
    onClear()
    if (timerRef.current) {
      clearTimeout(timerRef.current)
    }
  }, [onClear])

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return (
    <div className="relative px-4 py-2">
      <div className="relative">
        {/* Search icon */}
        <svg
          className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>

        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder="搜索记忆..."
          className={cn(
            'w-full rounded-md border border-white/10 bg-white/5',
            'py-1.5 pl-8 pr-8 text-sm text-white placeholder-gray-500',
            'focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500',
            'transition-colors',
          )}
        />

        {/* Loading / Clear */}
        {isLoading ? (
          <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border border-gray-400 border-t-transparent" />
          </span>
        ) : value ? (
          <button
            onClick={handleClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
            aria-label="清除搜索"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  )
})
