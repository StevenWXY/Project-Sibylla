/**
 * MemorySyncSettings — UI for enabling/disabling encrypted memory sync
 *
 * Features:
 *   - Toggle switch for memory sync (default off)
 *   - Password setup with confirmation when enabling
 *   - Confirmation dialog when disabling
 *   - "Locked" state indicator when MEMORY.encrypted exists but no password
 *   - "Unlock" button to enter password
 *
 * @see plans/phase2/phase2-task005-sync-enhancement-citation-tracing-plan.md §Phase G4
 */

import React, { useState, useEffect, useCallback } from 'react'
import { Lock, Unlock, AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'

interface MemorySyncSettingsProps {
  readonly className?: string
}

export function MemorySyncSettings({ className }: MemorySyncSettingsProps) {
  const [enabled, setEnabled] = useState(false)
  const [locked, setLocked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showPasswordSetup, setShowPasswordSetup] = useState(false)
  const [showUnlock, setShowUnlock] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')

  const checkLockStatus = useCallback(async () => {
    try {
      const result = await window.electronAPI.sync.memoryGetConfig()
      if (result.success && result.data) {
        setEnabled(result.data.syncMemory)
        setLocked(result.data.locked)
      }
    } catch {
      // Silently ignore — non-critical check
    }
  }, [])

  useEffect(() => {
    checkLockStatus()
  }, [checkLockStatus])

  const handleEnable = useCallback(async () => {
    setShowPasswordSetup(true)
  }, [])

  const handleConfirmEnable = useCallback(async () => {
    if (!password || password.length < 6) {
      setError('密码至少需要 6 个字符')
      return
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }

    setError('')
    setLoading(true)

    try {
      await window.electronAPI.sync.memoryEnable()
      await window.electronAPI.sync.memorySetPassword(password)
      setEnabled(true)
      setShowPasswordSetup(false)
      setPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '启用记忆同步失败'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [password, confirmPassword])

  const handleDisable = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      await window.electronAPI.sync.memoryDisable()
      setEnabled(false)
      setPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '禁用记忆同步失败'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleUnlock = useCallback(async () => {
    if (!password || password.length === 0) {
      setError('请输入密码')
      return
    }

    setError('')
    setLoading(true)

    try {
      await window.electronAPI.sync.memorySetPassword(password)
      setLocked(false)
      setShowUnlock(false)
      setPassword('')
    } catch (err: unknown) {
      setError('解密失败，请检查密码是否正确')
    } finally {
      setLoading(false)
    }
  }, [password])

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
            记忆同步
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            加密同步精选记忆到其他设备
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={enabled ? handleDisable : handleEnable}
          disabled={loading}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full',
            'border-2 border-transparent transition-colors duration-200',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
            enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700',
            loading && 'opacity-50 cursor-not-allowed',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow',
              'transform ring-0 transition duration-200',
              enabled ? 'translate-x-4' : 'translate-x-0',
            )}
          />
        </button>
      </div>

      {locked && !enabled && (
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-md text-xs',
            'bg-yellow-50 text-yellow-700 border border-yellow-200',
            'dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800',
          )}
        >
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>检测到加密记忆数据，请输入密码解锁</span>
          <button
            type="button"
            onClick={() => setShowUnlock(true)}
            className="ml-auto underline hover:text-yellow-900 dark:hover:text-yellow-300"
          >
            解锁
          </button>
        </div>
      )}

      {showPasswordSetup && (
        <div className="space-y-3 p-3 rounded-md bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            设置加密密码（至少 6 个字符）。密码仅存储在本设备内存中，不会持久化。
          </p>

          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          />

          <input
            type="password"
            placeholder="确认密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmEnable}
              disabled={loading}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : '确认启用'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowPasswordSetup(false)
                setPassword('')
                setConfirmPassword('')
                setError('')
              }}
              className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {showUnlock && (
        <div className="space-y-3 p-3 rounded-md bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            输入密码以解锁同步的记忆数据
          </p>

          <input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleUnlock()
            }}
            className="w-full px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUnlock}
              disabled={loading}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : '解锁'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowUnlock(false)
                setPassword('')
                setError('')
              }}
              className="px-3 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md text-xs bg-red-50 text-red-700 border border-red-200">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {enabled && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          精选记忆将在同步时加密传输。本地始终保持明文。
        </p>
      )}
    </div>
  )
}
