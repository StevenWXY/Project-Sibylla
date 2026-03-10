import React from 'react'
import { cn } from '../../utils/cn'
import { Loader2 } from 'lucide-react'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  icon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, icon, children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer'
    
    const variants = {
      primary: 'bg-notion-accent text-white hover:bg-notion-accent/90 focus-visible:ring-notion-accent',
      secondary: 'bg-notion-bg-tertiary text-notion-text-primary hover:bg-notion-border-light dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600',
      outline: 'border border-notion-border-default bg-transparent hover:bg-notion-bg-secondary dark:border-gray-600 dark:hover:bg-gray-800',
      ghost: 'hover:bg-notion-bg-secondary dark:hover:bg-gray-800',
      danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600',
    }
    
    const sizes = {
      sm: 'h-8 px-3 text-sm gap-1.5',
      md: 'h-10 px-4 text-sm gap-2',
      lg: 'h-12 px-6 text-base gap-2',
    }
    
    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {!loading && icon && <span aria-hidden="true">{icon}</span>}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
