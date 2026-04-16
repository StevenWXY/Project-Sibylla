import { memo, forwardRef } from 'react'
import { cn } from '../../utils/cn'

interface ToolbarButtonProps {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
  className?: string
}

export const ToolbarButton = memo(forwardRef<HTMLButtonElement, ToolbarButtonProps>(function ToolbarButton(
  { active, disabled, onClick, title, children, className },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'flex items-center justify-center rounded-md p-1.5 text-sm transition-colors',
        active
          ? 'bg-white/10 text-white'
          : 'text-gray-400 hover:text-gray-200 hover:bg-white/5',
        disabled && 'cursor-not-allowed opacity-30',
        className
      )}
    >
      {children}
    </button>
  )
}))
