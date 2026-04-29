import { useCallback, useState } from 'react'
import type { UnifiedSearchResultShared } from '../../shared/types'

interface UseKeyboardNavigationOptions {
  itemCount: number
  onSelect: (index: number) => void
  onClose: () => void
}

export function useKeyboardNavigation({
  itemCount,
  onSelect,
  onClose,
}: UseKeyboardNavigationOptions) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => Math.min(prev + 1, itemCount - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (itemCount > 0) onSelect(selectedIndex)
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [itemCount, selectedIndex, onSelect, onClose],
  )

  const resetIndex = useCallback(() => setSelectedIndex(0), [])

  return { selectedIndex, handleKeyDown, resetIndex, setSelectedIndex }
}

export function handleNavigate(
  result: UnifiedSearchResultShared,
): void {
  const nav = result.navigation
  switch (nav.kind) {
    case 'file':
      window.electronAPI.file.read(nav.path).catch(() => {})
      break
    case 'memory':
      // Will be connected to memory panel focus when available
      break
    case 'handbook':
      window.electronAPI.handbook.getEntry(nav.entryId).catch(() => {})
      break
    case 'external':
      window.open(nav.url, '_blank')
      break
  }
}
