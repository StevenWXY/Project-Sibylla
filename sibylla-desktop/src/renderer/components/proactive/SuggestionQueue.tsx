import { AnimatePresence } from 'framer-motion'
import { useProactiveStore } from '../../store/proactiveStore'
import { SuggestionToast } from './SuggestionToast'
import { useOverlayStore } from './OverlayManager'

export function SuggestionQueue() {
  const currentSuggestion = useProactiveStore((s) => s.currentSuggestion)
  const dismissCurrent = useProactiveStore((s) => s.dismissCurrent)
  const acceptCurrent = useProactiveStore((s) => s.acceptCurrent)
  const activeOverlay = useOverlayStore((s) => s.activeOverlay)

  if (!currentSuggestion) return null
  if (activeOverlay === 'onboarding') return null

  return (
    <AnimatePresence>
      <SuggestionToast
        key={currentSuggestion.id}
        suggestion={currentSuggestion}
        onDismiss={dismissCurrent}
        onAccept={acceptCurrent}
      />
    </AnimatePresence>
  )
}
