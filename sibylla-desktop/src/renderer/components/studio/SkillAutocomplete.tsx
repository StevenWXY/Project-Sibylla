import { useEffect, useRef, useState, useCallback } from 'react'
import { Sparkles } from 'lucide-react'
import type { SkillSummary } from '../../../shared/types'

interface SkillAutocompleteProps {
  query: string
  onSelect: (skillId: string, skillName: string) => void
  onClose: () => void
  visible: boolean
}

export function SkillAutocomplete({ query, onSelect, onClose, visible }: SkillAutocompleteProps) {
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!visible) {
      setSkills([])
      setSelectedIndex(0)
      return
    }

    setLoading(true)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(async () => {
      try {
        if (!window.electronAPI?.ai?.skillSearch) {
          if (window.electronAPI?.ai?.skillList) {
            const response = await window.electronAPI.ai.skillList()
            if (response.success && response.data) {
              const lowerQuery = query.toLowerCase()
              const filtered = lowerQuery
                ? response.data.filter(
                    (s) =>
                      s.id.toLowerCase().includes(lowerQuery) ||
                      s.name.toLowerCase().includes(lowerQuery) ||
                      s.description.toLowerCase().includes(lowerQuery)
                  )
                : response.data
              setSkills(filtered)
            } else {
              setSkills([])
            }
          } else {
            setSkills([])
          }
          setLoading(false)
          return
        }
        const response = await window.electronAPI.ai.skillSearch({ query })
        if (response.success && response.data) {
          setSkills(response.data)
        } else {
          setSkills([])
        }
      } catch {
        setSkills([])
      } finally {
        setLoading(false)
      }
    }, 200)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, visible])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!visible) return

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [visible, onClose])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!visible || skills.length === 0) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % skills.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + skills.length) % skills.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const selected = skills[selectedIndex]
        if (selected) {
          onSelect(selected.id, selected.name)
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    },
    [visible, skills, selectedIndex, onSelect, onClose]
  )

  useEffect(() => {
    if (!visible) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [visible, handleKeyDown])

  if (!visible) return null

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-1 max-h-60 overflow-y-auto rounded-lg border border-[#333333] bg-[#111111] shadow-xl"
    >
      {loading ? (
        <div className="px-3 py-2 text-xs text-gray-500">Searching skills...</div>
      ) : skills.length === 0 ? (
        <div className="px-3 py-2 text-xs text-gray-500">
          {query ? `No skills matching "${query}"` : 'Type to search skills...'}
        </div>
      ) : (
        <ul className="py-1">
          {skills.map((skill, index) => (
            <li key={skill.id}>
              <button
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                  index === selectedIndex
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
                onClick={() => onSelect(skill.id, skill.name)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
                <div className="flex flex-col">
                  <span className="truncate font-medium">{skill.name}</span>
                  <span className="truncate text-[10px] text-gray-500">{skill.description}</span>
                </div>
                <span className="ml-auto shrink-0 font-mono text-[10px] text-gray-600">
                  #{skill.id}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
