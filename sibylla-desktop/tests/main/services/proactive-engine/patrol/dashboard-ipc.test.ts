import { describe, it, expect, vi } from 'vitest'
import { registerDashboardHandlers } from '@main/ipc/handlers/dashboard'
import type { KanbanService } from '@main/services/kanban/kanban-service'
import type { PresenceStore } from '@main/services/presence/presence-store'
import type { ProductivityAnalyzer } from '@main/services/productivity/productivity-analyzer'
import type { GitAbstraction } from '@main/services/git-abstraction'
import type { NotificationStore } from '@main/services/notifications/notification-store'
import type { AppEventBus } from '@main/services/event-bus'
import type { DashboardOverviewData } from '@shared/types'
import { IPC_CHANNELS } from '@shared/types'

function makeMockDeps() {
  return {
    kanbanService: {
      parseTasksMd: vi.fn().mockResolvedValue({
        tasks: [
          { id: '1', title: 'Task 1', status: '待开始', deadline: '2020-01-01', assignee: 'alice' },
          { id: '2', title: 'Task 2', status: '进行中' },
          { id: '3', title: 'Task 3', status: '已完成' },
        ],
        columns: {
          '待开始': [{ id: '1', title: 'Task 1', status: '待开始', deadline: '2020-01-01', assignee: 'alice' }],
          '进行中': [{ id: '2', title: 'Task 2', status: '进行中' }],
          '已完成': [{ id: '3', title: 'Task 3', status: '已完成' }],
        },
        rawContent: '',
        parsedAt: Date.now(),
      }),
    } as unknown as KanbanService,
    presenceStore: {
      getPeers: vi.fn().mockReturnValue([
        { userId: 'u1', displayName: 'alice', status: 'online', avatar: '' },
      ]),
    } as unknown as PresenceStore,
    productivityAnalyzer: {
      analyze: vi.fn().mockResolvedValue({ overall: { score: 75 } }),
    } as unknown as ProductivityAnalyzer,
    gitAbstraction: {
      getHistory: vi.fn().mockResolvedValue([
        { authorName: 'alice', timestamp: Date.now(), oid: 'c1', message: 'test', authorEmail: 'a@t.com', parents: [] },
      ]),
    } as unknown as GitAbstraction,
    notificationStore: {
      getUnread: vi.fn().mockReturnValue([
        { type: 'system.suggestion', id: 'n1' },
        { type: 'mcp.mention', id: 'n2' },
      ]),
    } as unknown as NotificationStore,
    memberDirectory: {
      getAllMembers: vi.fn().mockReturnValue([
        { userId: 'u1', displayName: 'alice', role: 'admin' },
      ]),
      getMember: vi.fn(),
    },
    workspaceRoot: '/test',
    eventBus: {
      emitEvent: vi.fn(),
    } as unknown as AppEventBus,
  }
}

describe('Dashboard IPC', () => {
  it('returns aggregated data', async () => {
    const deps = makeMockDeps()
    const ipcMainInstance = {
      handle: vi.fn(),
      removeHandler: vi.fn(),
    }
    const dispose = registerDashboardHandlers(ipcMainInstance as never, deps)

    expect(ipcMainInstance.handle).toHaveBeenCalledWith(
      IPC_CHANNELS.DASHBOARD_OVERVIEW,
      expect.any(Function),
    )

    const handler = ipcMainInstance.handle.mock.calls[0][1] as (
      _event: unknown,
      viewerId: string,
      viewerRole: string,
    ) => Promise<DashboardOverviewData>

    const result = await handler({}, 'admin-1', 'admin')
    expect(result.taskStats).toEqual({ pending: 1, inProgress: 1, completed: 1 })
    expect(result.overdueTasks.length).toBeGreaterThan(0)
    expect(result.unreadSuggestionCount).toBe(1)
    expect(result.memberCount).toBe(1)

    dispose()
  })

  it('handles single data source failure gracefully', async () => {
    const deps = makeMockDeps()
    deps.kanbanService.parseTasksMd = vi.fn().mockRejectedValue(new Error('fail'))
    const ipcMainInstance = {
      handle: vi.fn(),
      removeHandler: vi.fn(),
    }
    registerDashboardHandlers(ipcMainInstance as never, deps)

    const handler = ipcMainInstance.handle.mock.calls[0][1] as (
      _event: unknown,
      viewerId: string,
      viewerRole: string,
    ) => Promise<DashboardOverviewData>

    const result = await handler({}, 'admin-1', 'admin')
    expect(result.taskStats).toEqual({ pending: 0, inProgress: 0, completed: 0 })
  })

  it('returns cached result within 30 seconds', async () => {
    const deps = makeMockDeps()
    const ipcMainInstance = {
      handle: vi.fn(),
      removeHandler: vi.fn(),
    }
    registerDashboardHandlers(ipcMainInstance as never, deps)

    const handler = ipcMainInstance.handle.mock.calls[0][1] as (
      _event: unknown,
      viewerId: string,
      viewerRole: string,
    ) => Promise<DashboardOverviewData>

    const r1 = await handler({}, 'admin-1', 'admin')
    const r2 = await handler({}, 'admin-1', 'admin')
    expect(r2.fetchedAt).toBeGreaterThan(0)
    expect(deps.kanbanService.parseTasksMd).toHaveBeenCalledTimes(1)
  })
})
