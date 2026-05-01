import type { NotificationRule } from './types'
import type { SibyllaEvent } from '../event-bus-types'

interface RuleDeps {
  currentUserId: string
  getRecentFiles: () => string[]
}

export function createBuiltinRules(deps: RuleDeps): NotificationRule[] {
  return [
    {
      id: 'mcp-mention',
      eventType: 'mcp.sync-completed',
      description: 'MCP sync records containing current user mention',
      enabled: true,
      condition: (event: SibyllaEvent) => {
        const payload = event.payload as Record<string, unknown>
        const records = payload.records as Array<Record<string, unknown>> | undefined
        if (!records) return false
        return records.some(r => {
          const mentions = r.mentions as string[] | undefined
          return mentions?.some(m => m === deps.currentUserId)
        })
      },
      build: (event: SibyllaEvent) => {
        const payload = event.payload as Record<string, unknown>
        const records = payload.records as Array<Record<string, unknown>> | undefined
        const provider = (payload.provider as string) ?? 'unknown'
        if (!records) return null
        const mentionRecord = records.find(r => {
          const mentions = r.mentions as string[] | undefined
          return mentions?.some(m => m === deps.currentUserId)
        })
        if (!mentionRecord) return null
        const channelId = (mentionRecord.channelId as string) ?? ''
        const recordId = (mentionRecord.id as string) ?? ''
        const title = mentionRecord.title ? String(mentionRecord.title) : 'New mention'
        return {
          type: 'mcp.mention' as const,
          priority: 'high' as const,
          source: { provider, ref: recordId },
          title: `You were mentioned: ${title}`,
          body: String(mentionRecord.body ?? ''),
          groupKey: `mcp-mention:${provider}:${channelId}`,
          navigation: { kind: 'mcp' as const, provider, recordId },
          metadata: {},
        }
      },
    },
    {
      id: 'mcp-assigned',
      eventType: 'mcp.sync-completed',
      description: 'MCP sync records assigned to current user',
      enabled: true,
      condition: (event: SibyllaEvent) => {
        const payload = event.payload as Record<string, unknown>
        const records = payload.records as Array<Record<string, unknown>> | undefined
        if (!records) return false
        return records.some(r => r.assignee === deps.currentUserId)
      },
      build: (event: SibyllaEvent) => {
        const payload = event.payload as Record<string, unknown>
        const records = payload.records as Array<Record<string, unknown>> | undefined
        const provider = (payload.provider as string) ?? 'unknown'
        if (!records) return null
        const assigned = records.find(r => r.assignee === deps.currentUserId)
        if (!assigned) return null
        const issueId = (assigned.id as string) ?? ''
        return {
          type: 'mcp.assigned' as const,
          priority: 'high' as const,
          source: { provider, ref: issueId },
          title: `Assigned to you: ${String(assigned.title ?? issueId)}`,
          body: String(assigned.body ?? ''),
          groupKey: `mcp-assigned:${provider}:${issueId}`,
          navigation: { kind: 'mcp' as const, provider, recordId: issueId },
          metadata: {},
        }
      },
    },
    {
      id: 'mcp-urgent',
      eventType: 'mcp.sync-completed',
      description: 'MCP sync records with urgent/blocker/p0 labels',
      enabled: true,
      condition: (event: SibyllaEvent) => {
        const payload = event.payload as Record<string, unknown>
        const records = payload.records as Array<Record<string, unknown>> | undefined
        if (!records) return false
        const urgentLabels = ['urgent', 'blocker', 'p0']
        return records.some(r => {
          const labels = r.labels as string[] | undefined
          return labels?.some(l => urgentLabels.includes(l.toLowerCase()))
        })
      },
      build: (event: SibyllaEvent) => {
        const payload = event.payload as Record<string, unknown>
        const records = payload.records as Array<Record<string, unknown>> | undefined
        const provider = (payload.provider as string) ?? 'unknown'
        if (!records) return null
        const urgentLabels = ['urgent', 'blocker', 'p0']
        const urgent = records.find(r => {
          const labels = r.labels as string[] | undefined
          return labels?.some(l => urgentLabels.includes(l.toLowerCase()))
        })
        if (!urgent) return null
        const issueId = (urgent.id as string) ?? ''
        return {
          type: 'mcp.urgent' as const,
          priority: 'urgent' as const,
          source: { provider, ref: issueId },
          title: `Urgent: ${String(urgent.title ?? issueId)}`,
          body: String(urgent.body ?? ''),
          groupKey: `mcp-urgent:${provider}:${issueId}`,
          navigation: { kind: 'mcp' as const, provider, recordId: issueId },
          metadata: {},
        }
      },
    },
    {
      id: 'collab-conflict',
      eventType: 'git.conflict-detected',
      description: 'Git conflict detected during sync',
      enabled: true,
      condition: () => true,
      build: (event: SibyllaEvent) => {
        const payload = event.payload as { path: string }
        const filePath = payload.path
        return {
          type: 'collab.conflict' as const,
          priority: 'urgent' as const,
          source: { provider: 'git' },
          title: `Conflict: ${filePath}`,
          body: `A conflict was detected in ${filePath}`,
          groupKey: `collab-conflict:${filePath}`,
          navigation: { kind: 'file' as const, path: filePath },
          metadata: {},
        }
      },
    },
    {
      id: 'collab-peer-active',
      eventType: 'presence.user-editing',
      description: 'Peer editing a file you recently modified',
      enabled: true,
      condition: (event: SibyllaEvent) => {
        const payload = event.payload as { userId: string; filePath: string }
        const recentFiles = deps.getRecentFiles()
        return recentFiles.includes(payload.filePath)
      },
      build: (event: SibyllaEvent) => {
        const payload = event.payload as { userId: string; userName?: string; filePath: string }
        const userName = payload.userName ?? payload.userId
        const fileName = payload.filePath.split('/').pop() ?? payload.filePath
        return {
          type: 'collab.peer-active' as const,
          priority: 'normal' as const,
          source: { provider: 'presence', ref: payload.userId },
          title: `${userName} is editing ${fileName}`,
          body: `${userName} is currently editing ${payload.filePath}`,
          groupKey: `collab-peer-active:${payload.filePath}:${payload.userId}`,
          navigation: { kind: 'file' as const, path: payload.filePath },
          metadata: {},
        }
      },
    },
    {
      id: 'memory-insight',
      eventType: 'memory.checkpoint-completed',
      description: 'High-value memory insights from checkpoint',
      enabled: true,
      condition: (event: SibyllaEvent) => {
        const payload = event.payload as Record<string, unknown>
        const report = payload.report as Record<string, unknown> | undefined
        if (!report) return false
        const added = report.added as Array<Record<string, unknown>> | undefined
        if (!added || added.length < 3) return false
        const totalConf = added.reduce((sum, a) => sum + ((a.confidence as number) ?? 0), 0)
        return (totalConf / added.length) > 0.85
      },
      build: (event: SibyllaEvent) => {
        const payload = event.payload as Record<string, unknown>
        const report = payload.report as Record<string, unknown> | undefined
        const added = (report?.added as Array<Record<string, unknown>>) ?? []
        return {
          type: 'memory.insight' as const,
          priority: 'low' as const,
          source: { provider: 'memory' },
          title: `${added.length} high-value memories discovered`,
          body: `Checkpoint found ${added.length} entries with high confidence`,
          groupKey: 'memory-insight',
          metadata: {},
        }
      },
    },
    {
      id: 'performance-alert-relay',
      eventType: 'performance.alert',
      description: 'Critical performance alerts',
      enabled: true,
      condition: (event: SibyllaEvent) => {
        const payload = event.payload as Record<string, unknown>
        return payload.severity === 'critical'
      },
      build: (event: SibyllaEvent) => {
        const payload = event.payload as Record<string, unknown>
        return {
          type: 'performance.alert' as const,
          priority: 'high' as const,
          source: { provider: 'performance', ref: String(payload.type ?? '') },
          title: `Performance alert: ${String(payload.message ?? payload.type ?? 'Unknown')}`,
          body: String(payload.message ?? ''),
          groupKey: `perf-alert:${String(payload.source ?? 'unknown')}`,
          metadata: {},
        }
      },
    },
    {
      id: 'system-indexed',
      eventType: 'index.completed',
      description: 'Indexing completed with significant file count',
      enabled: true,
      condition: (event: SibyllaEvent) => {
        const payload = event.payload as { documentCount: number }
        return payload.documentCount > 100
      },
      build: (event: SibyllaEvent) => {
        const payload = event.payload as { documentCount: number }
        return {
          type: 'system.indexed' as const,
          priority: 'normal' as const,
          source: { provider: 'indexer' },
          title: `Indexing complete: ${payload.documentCount} files`,
          body: `Workspace index now covers ${payload.documentCount} files`,
          groupKey: 'system-indexed',
          metadata: {},
        }
      },
    },
    {
      id: 'kanban-status-suggestion',
      eventType: 'kanban.task-status-changed',
      description: 'AI suggested task status update',
      enabled: true,
      condition: (event: SibyllaEvent) => {
        const payload = event.payload as { trigger: string }
        return payload.trigger === 'ai-auto'
      },
      build: (event: SibyllaEvent) => {
        const payload = event.payload as { taskId: string; from: string; to: string }
        return {
          type: 'kanban.status-suggestion' as const,
          priority: 'normal' as const,
          source: { provider: 'kanban' },
          title: 'AI 建议更新任务状态',
          body: `任务 ${payload.taskId}: ${payload.from} → ${payload.to}`,
          groupKey: `kanban-status:${payload.taskId}`,
          metadata: {},
        }
      },
    },
    {
      id: 'kanban-task-risk',
      eventType: 'kanban.task-risk-detected',
      description: 'Task risk detected by status tracker',
      enabled: true,
      condition: () => true,
      build: (event: SibyllaEvent) => {
        const payload = event.payload as { taskId: string; riskType: string; signals: string[] }
        return {
          type: 'kanban.task-risk' as const,
          priority: 'high' as const,
          source: { provider: 'kanban' },
          title: '任务风险预警',
          body: `${payload.riskType}: ${payload.signals.join(', ')}`,
          groupKey: `kanban-risk:${payload.taskId}`,
          metadata: {},
        }
      },
    },
  ]
}
