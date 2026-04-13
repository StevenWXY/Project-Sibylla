import React from 'react'
import { Listbox, Transition } from '@headlessui/react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps {
  label?: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  error?: string
  disabled?: boolean
  className?: string
}

/**
 * Select component with Notion-style design using Headless UI
 * 
 * @example
 * ```tsx
 * <Select
 *   label="选择类型"
 *   value={selectedValue}
 *   onChange={setSelectedValue}
 *   options={[
 *     { value: 'option1', label: '选项 1' },
 *     { value: 'option2', label: '选项 2' }
 *   ]}
 * />
 * ```
 */
export function Select({
  label,
  value,
  onChange,
  options,
  placeholder = '请选择...',
  error,
  disabled,
  className,
}: SelectProps) {
  const selectedOption = options.find((opt) => opt.value === value)

  return (
    <div className={cn('w-full', className)}>
      {label && (
        <label className="mb-1.5 block text-sm font-medium text-white">
          {label}
        </label>
      )}
      <Listbox value={value} onChange={onChange} disabled={disabled}>
        <div className="relative">
          <Listbox.Button
            className={cn(
              'relative w-full cursor-pointer rounded-xl border border-sys-darkBorder bg-sys-black px-3 py-2 text-left text-sm text-white',
              'focus:border-white/60 focus:outline-none focus:ring-1 focus:ring-white/30',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'transition-colors duration-200',
              error && 'border-red-500 focus:border-red-500 focus:ring-red-500/30'
            )}
          >
            <span className={cn(
              'block truncate',
              !selectedOption && 'text-sys-darkMuted'
            )}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronDown className="h-4 w-4 text-sys-darkMuted" aria-hidden="true" />
            </span>
          </Listbox.Button>
          <Transition
            as={React.Fragment}
            leave="transition ease-in duration-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <Listbox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-white/10 bg-sys-darkSurface/95 py-1 shadow-glass-dark backdrop-blur-xl focus:outline-none">
              {options.map((option) => (
                <Listbox.Option
                  key={option.value}
                  value={option.value}
                  disabled={option.disabled}
                  className={({ active }) =>
                    cn(
                      'relative cursor-pointer select-none py-2 pl-10 pr-4 text-sm',
                      active
                        ? 'bg-white text-black'
                        : 'text-white',
                      option.disabled && 'cursor-not-allowed opacity-50'
                    )
                  }
                >
                  {({ selected }) => (
                    <>
                      <span className={cn('block truncate', selected && 'font-medium')}>
                        {option.label}
                      </span>
                      {selected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-black">
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </span>
                      )}
                    </>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
      {error && (
        <p className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
