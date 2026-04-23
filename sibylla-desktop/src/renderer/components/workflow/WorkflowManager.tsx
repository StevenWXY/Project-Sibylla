import React, { useState, useEffect, useCallback } from 'react'
import { Play, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react'
import { WorkflowCard } from './WorkflowCard'
import { WorkflowRunHistory } from './WorkflowRunHistory'
import { Button } from '../ui'
import { cn } from '../../utils/cn'
import type { WorkflowDefinition, WorkflowRunSummary } from '../../../shared/types'

interface WorkflowManagerProps {
  className?: string
}

export const WorkflowManager: React.FC<WorkflowManagerProps> = ({ className }) => {
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [runs, setRuns] = useState<WorkflowRunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [disabledTriggers, setDisabledTriggers] = useState<Set<string>>(new Set())

  const fetchWorkflows = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.safeInvoke('workflow:list')
      if (result.success && result.data) {
        setWorkflows(result.data as WorkflowDefinition[])
        if (result.data.length > 0 && !selectedId) {
          setSelectedId((result.data as WorkflowDefinition[])[0].metadata.id)
        }
      } else {
        setError(result.error?.message ?? '获取 Workflow 列表失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取 Workflow 列表失败')
    } finally {
      setLoading(false)
    }
  }, [selectedId])

  const fetchRuns = useCallback(async () => {
    try {
      const result = await window.electronAPI.safeInvoke('workflow:list-runs', {})
      if (result.success && result.data) {
        setRuns(result.data as WorkflowRunSummary[])
      }
    } catch {
      // silently handle
    }
  }, [])

  useEffect(() => {
    fetchWorkflows()
    fetchRuns()
  }, [fetchWorkflows, fetchRuns])

  const selectedWorkflow = workflows.find((w) => w.metadata.id === selectedId)

  const toggleAutoTrigger = useCallback(async (workflowId: string) => {
    const isDisabled = disabledTriggers.has(workflowId)
    const next = new Set(disabledTriggers)
    if (isDisabled) {
      next.delete(workflowId)
    } else {
      next.add(workflowId)
    }
    setDisabledTriggers(next)
    try {
      await window.electronAPI.safeInvoke('workflow:set-trigger-enabled', workflowId, isDisabled)
    } catch {
      // silently handle
    }
  }, [disabledTriggers])

  return (
    <div className={cn('flex h-full', className)}>
      <div className="w-[280px] border-r border-sys-darkBorder flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-sys-darkBorder">
          <span className="text-xs font-medium text-sys-muted uppercase tracking-wider">Workflows</span>
          <button
            onClick={() => { fetchWorkflows(); fetchRuns() }}
            className="p-1 rounded hover:bg-white/10 text-sys-muted"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 m-2 rounded bg-white/5 animate-pulse" />
          ))}

          {!loading && workflows.length === 0 && (
            <div className="p-4 text-center text-sys-muted text-sm">
              暂无 Workflow
            </div>
          )}

          {!loading && workflows.map((wf) => (
            <WorkflowCard
              key={wf.metadata.id}
              workflow={wf}
              selected={wf.metadata.id === selectedId}
              onSelect={() => setSelectedId(wf.metadata.id)}
            />
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedWorkflow ? (
          <>
            <div className="px-4 py-3 border-b border-sys-darkBorder">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-medium text-white">{selectedWorkflow.metadata.name}</h2>
                  <p className="text-xs text-sys-muted mt-0.5">{selectedWorkflow.metadata.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className={cn(
                      'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
                      disabledTriggers.has(selectedWorkflow.metadata.id)
                        ? 'text-sys-muted hover:bg-white/5'
                        : 'text-green-400 hover:bg-white/5'
                    )}
                    onClick={() => toggleAutoTrigger(selectedWorkflow.metadata.id)}
                    title={disabledTriggers.has(selectedWorkflow.metadata.id) ? '启用自动触发' : '禁用自动触发（保留手动）'}
                  >
                    {disabledTriggers.has(selectedWorkflow.metadata.id)
                      ? <ToggleLeft className="w-4 h-4" />
                      : <ToggleRight className="w-4 h-4" />
                    }
                    {disabledTriggers.has(selectedWorkflow.metadata.id) ? '自动触发已关闭' : '自动触发'}
                  </button>
                  <TriggerButton workflowId={selectedWorkflow.metadata.id} />
                </div>

              <div className="flex items-center gap-4 mt-2 text-xs text-sys-muted">
                <span>版本 {selectedWorkflow.metadata.version}</span>
                <span>{selectedWorkflow.steps.length} 个步骤</span>
                <span>
                  {selectedWorkflow.triggers.map((t) => t.type).join(' / ')} 触发
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              <WorkflowRunHistory
                runs={runs.filter((r) => r.workflowId === selectedId)}
                onRefresh={fetchRuns}
              />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-sys-muted text-sm">
            选择一个 Workflow 查看详情
          </div>
        )}
      </div>
    </div>
  )
}

const TriggerButton: React.FC<{ workflowId: string }> = ({ workflowId }) => {
  const [triggering, setTriggering] = useState(false)

  const handleTrigger = useCallback(async () => {
    setTriggering(true)
    try {
      await window.electronAPI.safeInvoke('workflow:trigger-manual', workflowId, {})
    } catch {
      // silently handle
    } finally {
      setTriggering(false)
    }
  }, [workflowId])

  return (
    <Button
      variant="primary"
      size="sm"
      icon={<Play className="w-3.5 h-3.5" />}
      loading={triggering}
      onClick={handleTrigger}
    >
      手动触发
    </Button>
  )
}
