import React, { useState, useCallback } from 'react'
import { ShieldAlert } from 'lucide-react'

interface PersonalSpaceWarningBannerProps {
  targetUser: string
  onDismiss?: () => void
}

const DISMISS_KEY_PREFIX = 'personal-space-warning-dismissed:'

function isDismissed(targetUser: string): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY_PREFIX + targetUser) === 'true'
  } catch {
    return false
  }
}

function markDismissed(targetUser: string): void {
  try {
    sessionStorage.setItem(DISMISS_KEY_PREFIX + targetUser, 'true')
  } catch {
    // sessionStorage may be unavailable in some environments
  }
}

export const PersonalSpaceWarningBanner: React.FC<PersonalSpaceWarningBannerProps> = ({
  targetUser,
  onDismiss,
}) => {
  const [visible, setVisible] = useState(() => !isDismissed(targetUser))

  const handleDismiss = useCallback(() => {
    markDismissed(targetUser)
    setVisible(false)
    onDismiss?.()
  }, [targetUser, onDismiss])

  if (!visible) {
    return null
  }

  return (
    <div className="sticky top-0 z-30 bg-amber-50 dark:bg-amber-900/30 px-4 py-2 flex items-center gap-2 text-sm transition-all duration-200">
      <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <span className="text-amber-800 dark:text-amber-200">
        您正在访问 {targetUser} 的个人空间（管理员模式）
      </span>
      <button
        onClick={handleDismiss}
        className="ml-auto text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 flex-shrink-0"
        aria-label="关闭警告"
      >
        ✕
      </button>
    </div>
  )
}
