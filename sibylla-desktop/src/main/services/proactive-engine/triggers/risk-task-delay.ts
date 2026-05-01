import type { PatrolTrigger, PatrolResult } from '../types'
import type { KanbanService } from '../../kanban/kanban-service'

export function createRiskTaskDelayTrigger(
  kanbanService: KanbanService,
  workspaceRoot: string,
): PatrolTrigger {
  return {
    id: 'risk-task-delay',
    description: '检测逾期或即将到期且无进展的任务',
    enabled: true,
    cooldownMs: 4 * 60 * 60 * 1000,

    async evaluate(): Promise<PatrolResult | null> {
      const model = await kanbanService.parseTasksMd(workspaceRoot)
      const overdueTasks = model.tasks.filter(
        (t) =>
          t.deadline &&
          new Date(t.deadline).getTime() < Date.now() &&
          t.status !== '已完成',
      )

      if (overdueTasks.length === 0) return null

      const sorted = overdueTasks
        .map((t) => ({
          ...t,
          daysOverdue: Math.ceil(
            (Date.now() - new Date(t.deadline!).getTime()) / 86400000,
          ),
        }))
        .sort((a, b) => b.daysOverdue - a.daysOverdue)

      const top5 = sorted.slice(0, 5)

      return {
        title: `${overdueTasks.length} 个任务已逾期`,
        detail: top5
          .map(
            (t) =>
              `${t.title} (${t.assignee ?? '未分配'}, 逾期 ${t.daysOverdue} 天)`,
          )
          .join('\n'),
        actions: [
          { id: 'view', label: '查看' },
          { id: 'dismiss', label: '忽略' },
        ],
        audience: [
          'admin',
          ...new Set(
            overdueTasks
              .map((t) => t.assignee)
              .filter((a): a is string => Boolean(a)),
          ),
        ],
        priority: 'high',
        groupKey: `patrol:risk-task-delay:${overdueTasks
          .map((t) => t.id)
          .sort()
          .join(',')}`,
      }
    },
  }
}
