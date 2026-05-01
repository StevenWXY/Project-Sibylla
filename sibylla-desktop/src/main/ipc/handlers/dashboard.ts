import type { KanbanService } from '../../services/kanban/kanban-service'
import type { PresenceStore } from '../../services/presence/presence-store'
import type { ProductivityAnalyzer } from '../../services/productivity/productivity-analyzer'
import type { GitAbstraction } from '../../services/git-abstraction'
import type { NotificationStore } from '../../services/notifications/notification-store'
import type { MemberDirectory } from '../../services/productivity/productivity-analyzer'
import type { AppEventBus } from '../../services/event-bus'
import type { DashboardOverviewData } from '../../../shared/types'
import { IPC_CHANNELS } from '../../../shared/types'
import { logger } from '../../utils/logger'

interface DashboardHandlerDeps {
  kanbanService: KanbanService
  presenceStore: PresenceStore
  productivityAnalyzer: ProductivityAnalyzer
  gitAbstraction: GitAbstraction
  notificationStore: NotificationStore
  memberDirectory: MemberDirectory
  workspaceRoot: string
  eventBus: AppEventBus
}

export function registerDashboardHandlers(
  ipcMainInstance: Electron.IpcMain,
  deps: DashboardHandlerDeps,
): () => void {
  let lastFetchResult: DashboardOverviewData | null = null
  let lastFetchAt = 0
  const CACHE_TTL_MS = 30000

  ipcMainInstance.handle(
    IPC_CHANNELS.DASHBOARD_OVERVIEW,
    async (_event, viewerId: string, viewerRole: string) => {
      try {
        const now = Date.now()
        if (lastFetchResult && now - lastFetchAt < CACHE_TTL_MS) {
          const cached = { ...lastFetchResult, fetchedAt: now }
          lastFetchResult = cached
          return cached
        }

        const [
          kanbanResult,
          peers,
          productivityResult,
          commitsResult,
          unreadResult,
        ] = await Promise.allSettled([
          deps.kanbanService.parseTasksMd(deps.workspaceRoot),
          Promise.resolve(deps.presenceStore.getPeers()),
          deps.productivityAnalyzer.analyze({
            period: 'week',
            viewerId,
          }),
          deps.gitAbstraction.getHistory({ depth: 200 }),
          Promise.resolve(deps.notificationStore.getUnread()),
        ])

        const kanbanModel = kanbanResult.status === 'fulfilled' ? kanbanResult.value : null
        const peerList = peers.status === 'fulfilled' ? peers.value : []
        const productivity = productivityResult.status === 'fulfilled' ? productivityResult.value : null
        const commits = commitsResult.status === 'fulfilled' ? commitsResult.value : []
        const unread = unreadResult.status === 'fulfilled' ? unreadResult.value : []

        const taskStats = kanbanModel
          ? {
              pending: kanbanModel.columns['待开始']?.length ?? 0,
              inProgress: kanbanModel.columns['进行中']?.length ?? 0,
              completed: kanbanModel.columns['已完成']?.length ?? 0,
            }
          : { pending: 0, inProgress: 0, completed: 0 }

        const overdueTasks: DashboardOverviewData['overdueTasks'] = kanbanModel
          ? kanbanModel.tasks
              .filter(
                (t) =>
                  t.deadline &&
                  new Date(t.deadline).getTime() < Date.now() &&
                  t.status !== '已完成',
              )
              .map((t) => ({
                id: t.id,
                title: t.title,
                assignee: t.assignee,
                daysOverdue: Math.ceil(
                  (Date.now() - new Date(t.deadline!).getTime()) / 86400000,
                ),
              }))
              .sort((a, b) => b.daysOverdue - a.daysOverdue)
              .slice(0, 5)
          : []

        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
        const recentCommits = (commits as readonly { authorName: string; timestamp: number }[]).filter(
          (c) => c.timestamp >= sevenDaysAgo,
        )

        const commitByAuthorDate = new Map<string, number>()
        for (const c of recentCommits) {
          const date = new Date(c.timestamp).toISOString().slice(0, 10)
          const key = `${c.authorName}|${date}`
          commitByAuthorDate.set(key, (commitByAuthorDate.get(key) ?? 0) + 1)
        }

        const commits7d: DashboardOverviewData['commits7d'] = []
        for (const [key, count] of commitByAuthorDate) {
          const [author, date] = key.split('|')
          commits7d.push({ author: author!, date: date!, count })
        }

        const commitByAuthor24h = new Map<string, number>()
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
        for (const c of recentCommits) {
          if (c.timestamp >= oneDayAgo) {
            commitByAuthor24h.set(
              c.authorName,
              (commitByAuthor24h.get(c.authorName) ?? 0) + 1,
            )
          }
        }

        const members = (deps.memberDirectory.getAllMembers() ?? []).map((m) => {
          const peer = peerList.find((p) => p.userId === m.userId)
          return {
            userId: m.userId,
            displayName: m.displayName,
            status: peer?.status ?? 'offline',
            commits24h: commitByAuthor24h.get(m.displayName) ?? 0,
          }
        })

        const productivityScore = productivity
          ? (productivity as { overall?: { score?: number } }).overall?.score ?? null
          : null

        const unreadSuggestionCount = (unread as Array<{ type: string }>).filter(
          (n) => n.type === 'system.suggestion',
        ).length

        const memberCount = members.length

        if (viewerRole === 'admin') {
          deps.eventBus.emitEvent({
            type: 'admin.access-personal-space',
            source: 'dashboard-handler',
            payload: {
              adminId: viewerId,
              targetUser: '__dashboard_overview__',
              timestamp: Date.now(),
            },
          })
        }

        const result: DashboardOverviewData = {
          taskStats,
          members,
          productivityScore,
          commits7d,
          unreadSuggestionCount,
          overdueTasks,
          memberCount,
          fetchedAt: Date.now(),
        }

        lastFetchResult = result
        lastFetchAt = now

        return result
      } catch (error) {
        logger.error('dashboard.overview.error', {
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  return () => {
    ipcMainInstance.removeHandler(IPC_CHANNELS.DASHBOARD_OVERVIEW)
  }
}
