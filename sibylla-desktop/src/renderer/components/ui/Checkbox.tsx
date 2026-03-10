import React from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  description?: string
  error?: string
}

/**
 * Checkbox component with Notion-style design
 * 
 * @example
 * ```tsx
 * <Checkbox
 *   label="同意条款"
 *   description="我已阅读并同意服务条款"
 *   checked={agreed}
 *   onChange={(e) => setAgreed(e.target.checked)}
 * />
 * ```
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, error, id, checked, ...props }, ref) => {
    const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`
    
    return (
      <div className="w-full">
        <div className="flex items-start gap-3">
          <div className="relative flex items-center">
            <input
              id={checkboxId}
              ref={ref}
              type="checkbox"
              checked={checked}
              className={cn(
                'peer h-5 w-5 cursor-pointer appearance-none rounded border-2 border-notion-border-default',
                'bg-white transition-all duration-200',
                'checked:border-notion-accent checked:bg-notion-accent',
                'focus:outline-none focus:ring-2 focus:ring-notion-accent/20 focus:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'dark:border-gray-600 dark:bg-gray-800',
                'dark:checked:border-notion-accent dark:checked:bg-notion-accent',
                error && 'border-red-500 checked:border-red-500 checked:bg-red-500',
                className
              )}
              aria-invalid={!!error}
              aria-describedby={error ? `${checkboxId}-error` : description ? `${checkboxId}-description` : undefined}
              {...props}
            />
            <Check
              className={cn(
                'pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 text-white',
                'opacity-0 transition-opacity duration-200',
                'peer-checked:opacity-100'
              )}
              strokeWidth={3}
              aria-hidden="true"
            />
          </div>
          
          {(label || description) && (
            <div className="flex-1">
              {label && (
                <label
                  htmlFor={checkboxId}
                  className="block cursor-pointer text-sm font-medium text-notion-text-primary dark:text-white"
                >
                  {label}
                </label>
              )}
              {description && (
                <p
                  id={`${checkboxId}-description`}
                  className="mt-0.5 text-sm text-notion-text-secondary dark:text-gray-400"
                >
                  {description}
                </p>
              )}
            </div>
          )}
        </div>
        
        {error && (
          <p id={`${checkboxId}-error`} className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }
)

Checkbox.displayName = 'Checkbox'
