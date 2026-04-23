import React, { useState, useEffect, useCallback } from 'react'
import { ArrowLeftRight, AlertTriangle } from 'lucide-react'
import { cn } from '../../utils/cn'

interface AggregatedMetrics {
  promptId: string
  version: string
  totalCalls: number
  avgTokens: number
  maxTokens: number
  minTokens: number
  avgToolCallSuccessRate: number
  failureRate: number
  p50Tokens: number
  p95Tokens: number
  p99Tokens: number
}

interface VersionComparison {
  promptId: string
  versions: AggregatedMetrics[]
}

interface PromptVersionComparisonProps {
  promptId: string
  onClose?: () => void
  className?: string
}

const MetricRow: React.FC<{ label: string; values: (string | number)[]; highlight?: 'min' | 'max' }> = ({ label, values, highlight }) => (
  <tr className="border-b border-sys-darkBorder">
    <td className="px-3 py-2 text-xs text-sys-muted whitespace-nowrap">{label}</td>
    {values.map((val, i) => (
      <td key={i} className="px-3 py-2 text-xs text-white text-right">{val}</td>
    ))}
  </tr>
)

export const PromptVersionComparison: React.FC<PromptVersionComparisonProps> = ({ promptId, onClose, className }) => {
  const [comparison, setComparison] = useState<VersionComparison | null>(null)
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState<string[]>([])

  const fetchComparison = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.safeInvoke('prompt-performance:compare-versions', promptId)
      if (result.success && result.data) {
        const data = result.data as VersionComparison
        setComparison(data)

        const newAlerts: string[] = []
        for (const v of data.versions) {
          if (v.failureRate > 0.3) {
            newAlerts.push(`版本 ${v.version} 失败率 ${(v.failureRate * 100).toFixed(1)}% 超过 30% 阈值`)
          }
        }
        setAlerts(newAlerts)
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false)
    }
  }, [promptId])

  useEffect(() => {
    fetchComparison()
  }, [fetchComparison])

  if (loading) {
    return (
      <div className={cn('p-6', className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-white/5 rounded w-48" />
          <div className="h-32 bg-white/5 rounded" />
        </div>
      </div>
    )
  }

  if (!comparison || comparison.versions.length === 0) {
    return (
      <div className={cn('p-6 text-center text-sys-muted text-sm', className)}>
        暂无性能数据
      </div>
    )
  }

  const versions = comparison.versions

  return (
    <div className={cn('p-4', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-4 h-4 text-sys-muted" />
          <h3 className="text-sm font-medium text-white">版本对比: {promptId}</h3>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-xs text-sys-muted hover:text-white">关闭</button>
        )}
      </div>

      {alerts.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-status-warning/10 border border-status-warning/30">
          {alerts.map((alert, i) => (
            <div key={i} className="flex items-center gap-1 text-xs text-status-warning">
              <AlertTriangle className="w-3 h-3" />
              {alert}
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-sys-darkBorder">
              <th className="px-3 py-2 text-left text-xs font-medium text-sys-muted">指标</th>
              {versions.map((v) => (
                <th key={v.version} className="px-3 py-2 text-right text-xs font-medium text-white">
                  v{v.version}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <MetricRow label="调用次数" values={versions.map((v) => v.totalCalls)} highlight="max" />
            <MetricRow label="平均 Tokens" values={versions.map((v) => v.avgTokens.toFixed(0))} highlight="min" />
            <MetricRow label="P50 Tokens" values={versions.map((v) => v.p50Tokens.toFixed(0))} />
            <MetricRow label="P95 Tokens" values={versions.map((v) => v.p95Tokens.toFixed(0))} />
            <MetricRow label="P99 Tokens" values={versions.map((v) => v.p99Tokens.toFixed(0))} />
            <MetricRow label="工具成功率" values={versions.map((v) => (v.avgToolCallSuccessRate * 100).toFixed(1) + '%')} highlight="max" />
            <MetricRow label="失败率" values={versions.map((v) => (v.failureRate * 100).toFixed(1) + '%')} highlight="min" />
          </tbody>
        </table>
      </div>
    </div>
  )
}
