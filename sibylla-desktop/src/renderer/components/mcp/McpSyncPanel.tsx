import { useState, useEffect, useCallback } from 'react'
import {
  RefreshCw,
  Pause,
  Play,
  Plus,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import type { SyncTaskWithStateShared, SyncTaskConfigShared, SyncProgressShared } from '../../../shared/types'

export function McpSyncPanel() {
  const [tasks, setTasks] = useState<SyncTaskWithStateShared[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [syncingTaskId, setSyncingTaskId] = useState<string | null>(null)
  const [lastProgress, setLastProgress] = useState<SyncProgressShared | null>(null)

  const [error, setError] = useState<string | null>(null)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await window.electronAPI.mcp.listSyncTasks()
      if (response.success && response.data) {
        setTasks(response.data)
      } else {
        setError(response.error?.message ?? '加载同步任务失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载同步任务失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  useEffect(() => {
    const unsub = window.electronAPI.mcp.onSyncProgress((progress) => {
      setLastProgress(progress)
      loadTasks()
    })
    return unsub
  }, [loadTasks])

  const handleTriggerSync = useCallback(
    async (taskId: string) => {
      setSyncingTaskId(taskId)
      try {
        await window.electronAPI.mcp.triggerSync(taskId)
        await loadTasks()
      } catch {
        // error handled by state
      } finally {
        setSyncingTaskId(null)
      }
    },
    [loadTasks]
  )

  const handlePause = useCallback(async (taskId: string) => {
    try {
      await window.electronAPI.mcp.pauseSync(taskId)
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : '暂停失败')
    }
  }, [loadTasks])

  const handleResume = useCallback(async (taskId: string) => {
    try {
      await window.electronAPI.mcp.resumeSync(taskId)
      await loadTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : '恢复失败')
    }
  }, [loadTasks])

  const handleAddSync = useCallback(
    async (config: SyncTaskConfigShared) => {
      try {
        await window.electronAPI.mcp.configureSync(config)
        setShowAddDialog(false)
        await loadTasks()
      } catch (err) {
        setError(err instanceof Error ? err.message : '创建同步任务失败')
      }
    },
    [loadTasks]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-300 hover:text-white">×</button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {tasks.length} 个同步任务
        </p>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setShowAddDialog(true)}
        >
          新建同步
        </Button>
      </div>

      {lastProgress && (
        <div
          className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
            lastProgress.status === 'success'
              ? 'bg-emerald-500/10 text-emerald-400'
              : lastProgress.status === 'error'
                ? 'bg-red-500/10 text-red-400'
                : 'bg-blue-500/10 text-blue-400'
          }`}
        >
          {lastProgress.status === 'success' ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : lastProgress.status === 'error' ? (
            <XCircle className="h-4 w-4 shrink-0" />
          ) : (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          )}
          <span>
            {lastProgress.taskName}: {lastProgress.itemsSynced} 条数据
            {lastProgress.error && ` — ${lastProgress.error}`}
          </span>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-white/5 py-8 text-center">
          <Clock className="mx-auto mb-3 h-8 w-8 text-gray-600" />
          <p className="text-sm text-gray-400">暂无同步任务</p>
          <p className="mt-1 text-xs text-gray-500">创建同步任务以定期拉取外部数据</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(({ task, state }) => (
            <SyncTaskCard
              key={task.id}
              task={task}
              state={state}
              syncing={syncingTaskId === task.id}
              onTriggerSync={() => handleTriggerSync(task.id)}
              onPause={() => handlePause(task.id)}
              onResume={() => handleResume(task.id)}
            />
          ))}
        </div>
      )}

      {showAddDialog && (
        <AddSyncDialog
          onSubmit={handleAddSync}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </div>
  )
}

function SyncTaskCard({
  task,
  state,
  syncing,
  onTriggerSync,
  onPause,
  onResume,
}: {
  task: SyncTaskConfigShared
  state: SyncTaskWithStateShared['state']
  syncing: boolean
  onTriggerSync: () => void
  onPause: () => void
  onResume: () => void
}) {
  const statusColors: Record<string, string> = {
    active: 'text-emerald-400',
    paused: 'text-amber-400',
    error: 'text-red-400',
  }

  const statusLabels: Record<string, string> = {
    active: '运行中',
    paused: '已暂停',
    error: '错误',
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{task.name}</span>
            <span className={`text-xs ${statusColors[state.status]}`}>
              {statusLabels[state.status]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
            <span>{task.serverName}/{task.toolName}</span>
            <span>每 {task.intervalMinutes} 分钟</span>
            {state.lastSyncAt && (
              <span>上次同步: {new Date(state.lastSyncAt).toLocaleString()}</span>
            )}
            {state.totalSyncedItems !== undefined && state.totalSyncedItems > 0 && (
              <span>共 {state.totalSyncedItems} 条</span>
            )}
          </div>
          {state.lastError && (
            <p className="mt-1 text-xs text-red-400">{state.lastError}</p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onTriggerSync}
            disabled={syncing}
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
          {state.status === 'active' ? (
            <Button variant="ghost" size="sm" onClick={onPause}>
              <Pause className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onResume}>
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function AddSyncDialog({
  onSubmit,
  onClose,
}: {
  onSubmit: (config: SyncTaskConfigShared) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [serverName, setServerName] = useState('')
  const [toolName, setToolName] = useState('')
  const [intervalMinutes, setIntervalMinutes] = useState(30)
  const [targetPath, setTargetPath] = useState('syncs/')

  const handleSubmit = () => {
    if (!name.trim() || !serverName.trim() || !toolName.trim()) return

    onSubmit({
      id: `sync-${Date.now()}`,
      name: name.trim(),
      serverName: serverName.trim(),
      toolName: toolName.trim(),
      args: {},
      intervalMinutes,
      targetPath: targetPath.trim() || 'syncs/',
      writeMode: 'replace',
      conflictStrategy: 'last-write-wins',
      enabled: true,
    })
  }

  return (
    <Modal isOpen onClose={onClose} title="新建同步任务" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-gray-400">任务名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="GitHub Issues 同步"
            className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-gray-400">服务器</label>
            <input
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="github"
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">工具</label>
            <input
              type="text"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              placeholder="list_issues"
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-gray-400">间隔 (分钟)</label>
            <input
              type="number"
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              min={1}
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">目标路径</label>
            <input
              type="text"
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder="syncs/"
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!name.trim() || !serverName.trim() || !toolName.trim()}
          >
            创建
          </Button>
        </div>
      </div>
    </Modal>
  )
}
