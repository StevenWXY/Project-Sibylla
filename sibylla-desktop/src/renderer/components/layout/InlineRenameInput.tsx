import { useEffect, useMemo, useRef, useState } from 'react'
import { Input } from '../ui/Input'

interface InlineRenameInputProps {
  initialValue: string
  onSubmit: (nextValue: string) => void
  onCancel: () => void
  className?: string
}

function getSelectionRange(name: string): [number, number] {
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex > 0) {
    return [0, dotIndex]
  }
  return [0, name.length]
}

export function InlineRenameInput({
  initialValue,
  onSubmit,
  onCancel,
  className,
}: InlineRenameInputProps) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectionRange = useMemo(() => getSelectionRange(initialValue), [initialValue])

  useEffect(() => {
    const input = inputRef.current
    if (!input) {
      return
    }

    input.focus()
    input.setSelectionRange(selectionRange[0], selectionRange[1])
  }, [selectionRange])

  return (
    <Input
      ref={inputRef}
      value={value}
      className={className ?? 'h-7 px-2 py-1 text-xs'}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onSubmit(value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onSubmit(value)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
    />
  )
}
