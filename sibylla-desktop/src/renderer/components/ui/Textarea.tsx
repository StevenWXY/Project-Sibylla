import React from 'react'
import { cn } from '../../utils/cn'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helperText?: string
}

/**
 * Textarea component with Notion-style design
 * 
 * @example
 * ```tsx
 * <Textarea 
 *   label="描述" 
 *   placeholder="请输入描述..."
 *   rows={4}
 * />
 * ```
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const textareaId = id || `textarea-${Math.random().toString(36).substr(2, 9)}`
    
    return (
      <div className="w-full">
        {label && (
          <label 
            htmlFor={textareaId}
            className="mb-1.5 block text-sm font-medium text-white"
          >
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          className={cn(
            'w-full rounded-xl border border-sys-darkBorder bg-sys-black px-3 py-2 text-sm text-white',
            'placeholder:text-sys-darkMuted',
            'focus:border-white/60 focus:outline-none focus:ring-1 focus:ring-white/30',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'transition-colors duration-200',
            'resize-y min-h-[80px]',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500/30',
            className
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${textareaId}-error` : helperText ? `${textareaId}-helper` : undefined}
          {...props}
        />
        {error && (
          <p id={`${textareaId}-error`} className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
        {!error && helperText && (
          <p id={`${textareaId}-helper`} className="mt-1.5 text-sm text-sys-darkMuted">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
