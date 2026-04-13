import React from 'react'
import { cn } from '../../utils/cn'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'glass' | 'bordered'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hoverable?: boolean
}

/**
 * Card component with Notion-style design
 * 
 * @example
 * ```tsx
 * <Card variant="glass" hoverable>
 *   <h3>卡片标题</h3>
 *   <p>卡片内容</p>
 * </Card>
 * ```
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding = 'md', hoverable = false, children, ...props }, ref) => {
    const baseStyles = 'rounded-xl transition-all duration-200'
    
    const variants = {
      default: 'border border-sys-darkBorder bg-sys-darkSurface text-white',
      glass: 'glass',
      bordered: 'border-2 border-sys-darkBorder bg-transparent text-white',
    }
    
    const paddings = {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    }
    
    const hoverStyles = hoverable
      ? 'cursor-pointer hover:scale-[1.02] hover:border-white/30 hover:bg-black'
      : ''
    
    return (
      <div
        ref={ref}
        className={cn(baseStyles, variants[variant], paddings[padding], hoverStyles, className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

/**
 * CardHeader component for card titles and descriptions
 */
export interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  description?: string
}

export const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, title, description, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('mb-4', className)} {...props}>
        {title && (
          <h3 className="text-lg font-semibold text-white">
            {title}
          </h3>
        )}
        {description && (
          <p className="mt-1 text-sm text-sys-darkMuted">
            {description}
          </p>
        )}
        {children}
      </div>
    )
  }
)

CardHeader.displayName = 'CardHeader'

/**
 * CardContent component for card body content
 */
export interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardContent = React.forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('text-white', className)} {...props}>
        {children}
      </div>
    )
  }
)

CardContent.displayName = 'CardContent'

/**
 * CardFooter component for card actions
 */
export interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {}

export const CardFooter = React.forwardRef<HTMLDivElement, CardFooterProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('mt-4 flex items-center justify-end gap-2', className)}
        {...props}
      >
        {children}
      </div>
    )
  }
)

CardFooter.displayName = 'CardFooter'
