import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, BellOff, Clock } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useNotificationStore } from '../../store/notificationStore'

export function NotificationPreferencesPanel({ onClose }: { onClose: () => void }) {
  const { preferences, fetchPreferences, updatePreferences } = useNotificationStore()

  const [focusEnabled, setFocusEnabled] = useState(false)
  const [startHour, setStartHour] = useState(22)
  const [endHour, setEndHour] = useState(8)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchPreferences()
  }, [fetchPreferences])

  useEffect(() => {
    if (preferences) {
      setFocusEnabled(preferences.scheduledFocus?.enabled ?? false)
      setStartHour(preferences.scheduledFocus?.startHour ?? 22)
      setEndHour(preferences.scheduledFocus?.endHour ?? 8)
    }
  }, [preferences])

  const mutedRules = useMemo(
    () => preferences?.mutedRules ?? [],
    [preferences],
  )

  const handleUnmute = useCallback(
    async (index: number) => {
      if (!preferences) return
      const updated = [...preferences.mutedRules]
      updated.splice(index, 1)
      setSaving(true)
      try {
        await updatePreferences({ mutedRules: updated })
      } finally {
        setSaving(false)
      }
    },
    [preferences, updatePreferences],
  )

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await updatePreferences({
        scheduledFocus: {
          enabled: focusEnabled,
          startHour,
          endHour,
        },
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }, [updatePreferences, focusEnabled, startHour, endHour, onClose])

  return (
    <div className="flex flex-col gap-6 rounded-lg border border-border bg-background p-5 shadow-lg">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Notification Preferences</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close preferences"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {mutedRules.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <BellOff className="h-3.5 w-3.5" />
            <span>Muted Rules</span>
          </div>
          <div className="space-y-1">
            {mutedRules.map((rule, index) => (
              <div
                key={`${rule.type}-${rule.sourceProvider ?? index}`}
                className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
              >
                <div className="flex items-center gap-2 text-xs text-foreground">
                  <span className="font-medium">{rule.type}</span>
                  {rule.sourceProvider && (
                    <span className="text-muted-foreground">from {rule.sourceProvider}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleUnmute(index)}
                  disabled={saving}
                  className="rounded-md px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  Unmute
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Scheduled Focus</span>
        </div>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={focusEnabled}
            onChange={(e) => setFocusEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary accent-primary"
          />
          <span className="text-xs text-foreground">Enable scheduled focus mode</span>
        </label>
        {focusEnabled && (
          <div className="flex items-center gap-3 pl-7">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">Start hour</label>
              <input
                type="number"
                min={0}
                max={23}
                value={startHour}
                onChange={(e) => setStartHour(Number(e.target.value))}
                className="w-16 rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
              />
            </div>
            <span className="mt-4 text-xs text-muted-foreground">to</span>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground">End hour</label>
              <input
                type="number"
                min={0}
                max={23}
                value={endHour}
                onChange={(e) => setEndHour(Number(e.target.value))}
                className="w-16 rounded-md border border-border bg-transparent px-2 py-1 text-xs text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={cn(
            'rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90',
            saving && 'opacity-60 cursor-not-allowed',
          )}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
