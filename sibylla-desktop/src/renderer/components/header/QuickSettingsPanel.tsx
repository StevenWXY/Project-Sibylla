import React from 'react'
import type { QuickSettingsStateShared } from '../../../shared/types'

interface QuickSettingsPanelProps {
  open: boolean
  onClose: () => void
  onOpenSettings?: () => void
}

export const QuickSettingsPanel: React.FC<QuickSettingsPanelProps> = ({ open, onClose, onOpenSettings }) => {
  const [settings, setSettings] = React.useState<QuickSettingsStateShared | null>(null)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (open) {
      window.electronAPI.quickSettings.get().then((resp) => {
        if (resp.success && resp.data) {
          setSettings(resp.data)
        }
      })
    }
  }, [open])

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, onClose])

  if (!open) return null

  const handleToggle = async (key: keyof QuickSettingsStateShared, value: unknown) => {
    const patch = { [key]: value } as Partial<QuickSettingsStateShared>
    await window.electronAPI.quickSettings.update(patch)
    if (settings) {
      setSettings({ ...settings, ...patch })
    }
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-2 w-72 rounded-xl border border-white/10 bg-[#1a1a2e] p-4 shadow-2xl"
    >
      <div className="mb-3 text-sm font-medium text-white">Quick Settings</div>

      {settings ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-sys-darkMuted">Theme</span>
            <select
              value={settings.theme}
              onChange={(e) => handleToggle('theme', e.target.value)}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-sys-darkMuted">Language</span>
            <select
              value={settings.language}
              onChange={(e) => handleToggle('language', e.target.value)}
              className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-sys-darkMuted">Workspace</span>
            <span className="max-w-[140px] truncate font-mono text-xs text-white/50" title={settings.workspacePath}>
              {settings.workspacePath || '—'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-sys-darkMuted">Trace</span>
            <button
              onClick={() => handleToggle('traceEnabled', !settings.traceEnabled)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                settings.traceEnabled ? 'bg-indigo-500' : 'bg-white/20'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  settings.traceEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-sys-darkMuted">Memory</span>
            <button
              onClick={() => handleToggle('memoryEnabled', !settings.memoryEnabled)}
              className={`relative h-5 w-9 rounded-full transition-colors ${
                settings.memoryEnabled ? 'bg-indigo-500' : 'bg-white/20'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  settings.memoryEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="border-t border-white/10 pt-2">
            <button
              onClick={() => { onClose(); onOpenSettings?.() }}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Detailed settings...
            </button>
          </div>
        </div>
      ) : (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      )}
    </div>
  )
}
