import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ProductivityAnalyzer } from '@main/services/productivity/productivity-analyzer'
import type { MemberInfo } from '@main/services/productivity/productivity-analyzer'
import type { AnalyzeOptions } from '@main/services/productivity/types'

function createMockAnalyzer(extra: Record<string, unknown> = {}) {
  const parseTasksMd = vi.fn().mockResolvedValue({
    tasks: [],
    columns: { '待开始': [], '进行中': [], '已完成': [] },
    rawContent: '',
    parsedAt: Date.now(),
    parseError: false,
  })

  const getHistory = vi.fn().mockResolvedValue([])
  const getCommitDiff = vi.fn().mockResolvedValue([])

  const read = vi.fn().mockResolvedValue([])

  const getLinkCount = vi.fn().mockReturnValue({ incoming: 0, outgoing: 0 })

  const members: MemberInfo[] = [
    { userId: 'user1', role: 'admin', displayName: 'Admin' },
    { userId: 'user2', role: 'member', displayName: 'Member' },
  ]

  const getMember = vi.fn().mockImplementation((id: string) => members.find((m) => m.userId === id))
  const getAllMembers = vi.fn().mockReturnValue(members)

  const filterPeerStateForViewer = vi.fn()
  const redactPath = vi.fn()

  const analyzer = new ProductivityAnalyzer(
    { parseTasksMd } as never,
    { getHistory, getCommitDiff } as never,
    { read } as never,
    { getLinkCount } as never,
    { getMember, getAllMembers } as never,
    { filterPeerStateForViewer, redactPath } as never,
    '/test-workspace',
  )

  return {
    analyzer,
    parseTasksMd,
    getHistory,
    getCommitDiff,
    read,
    getLinkCount,
    getMember,
    members,
    ...extra,
  }
}

describe('ProductivityAnalyzer', () => {
  let mocks: ReturnType<typeof createMockAnalyzer>

  beforeEach(() => {
    mocks = createMockAnalyzer()
  })

  describe('任务完成率', () => {
    it('加权计算正确 - 标准场景', async () => {
      mocks.parseTasksMd.mockResolvedValue({
        tasks: [
          { id: '1', title: 'T1', status: '已完成', priority: 'P0', assignee: 'user1' },
          { id: '2', title: 'T2', status: '进行中', priority: 'P1', assignee: 'user1' },
          { id: '3', title: 'T3', status: '待开始', priority: 'P2', assignee: 'user1' },
        ],
        columns: { '待开始': [], '进行中': [], '已完成': [] },
        rawContent: '',
        parsedAt: Date.now(),
      })

      const result = await mocks.analyzer.calculateTaskCompletion('user1', {
        since: new Date(),
        until: new Date(),
      })

      expect(result.isNA).toBeFalsy()
      expect(result.raw).toBe(3 / 6) // P0=3 completed / (P0=3 + P1=2 + P2=1) total = 3/6 = 0.5
      expect(result.normalized).toBe(0.5)
    })

    it('全完成时 normalized=1', async () => {
      mocks.parseTasksMd.mockResolvedValue({
        tasks: [
          { id: '1', title: 'T1', status: '已完成', priority: 'P0', assignee: 'user1' },
          { id: '2', title: 'T2', status: '已完成', priority: 'P1', assignee: 'user1' },
        ],
        columns: { '待开始': [], '进行中': [], '已完成': [] },
        rawContent: '',
        parsedAt: Date.now(),
      })

      const result = await mocks.analyzer.calculateTaskCompletion('user1', {
        since: new Date(),
        until: new Date(),
      })

      expect(result.normalized).toBe(1)
    })

    it('无任务时 isNA=true', async () => {
      mocks.parseTasksMd.mockResolvedValue({
        tasks: [],
        columns: { '待开始': [], '进行中': [], '已完成': [] },
        rawContent: '',
        parsedAt: Date.now(),
      })

      const result = await mocks.analyzer.calculateTaskCompletion('user1', {
        since: new Date(),
        until: new Date(),
      })

      expect(result.isNA).toBe(true)
    })
  })

  describe('缓存', () => {
    it('相同参数命中缓存', async () => {
      mocks.read.mockResolvedValue([
        { type: 'file.updated', timestamp: Date.now() - 86400000 * 10 },
      ])

      const opts: AnalyzeOptions = { period: 'week', viewerId: 'user1' }
      const report1 = await mocks.analyzer.analyze(opts)
      const report2 = await mocks.analyzer.analyze(opts)

      expect(report1).toBe(report2) // same reference
      expect(mocks.parseTasksMd).toHaveBeenCalledTimes(1)
    })

    it('TTL 过期后重新计算', async () => {
      mocks.read.mockResolvedValue([
        { type: 'file.updated', timestamp: Date.now() - 86400000 * 10 },
      ])

      const opts: AnalyzeOptions = { period: 'week', viewerId: 'user1' }
      await mocks.analyzer.analyze(opts)

      const originalNow = Date.now
      let fakeNow = Date.now() + 61000
      const globalDate = globalThis.Date
      globalThis.Date = class extends globalDate {
        static now() { return fakeNow }
        constructor(...args: unknown[]) {
          super(...(args.length > 0 ? args : [fakeNow]))
        }
      } as never

      await mocks.analyzer.analyze(opts)

      globalThis.Date = originalDate

      expect(mocks.parseTasksMd).toHaveBeenCalledTimes(2)
    })

    it('参数变化缓存 miss', async () => {
      mocks.read.mockResolvedValue([
        { type: 'file.updated', timestamp: Date.now() - 86400000 * 10 },
      ])

      await mocks.analyzer.analyze({ period: 'week', viewerId: 'user1' })
      await mocks.analyzer.analyze({ period: 'month', viewerId: 'user1' })

      expect(mocks.parseTasksMd).toHaveBeenCalledTimes(2)
    })
  })

  describe('隐私过滤', () => {
    it('self - 完整细节 isAnonymized=false', async () => {
      mocks.read.mockResolvedValue([
        { type: 'file.updated', timestamp: Date.now() - 86400000 * 10 },
      ])

      const report = await mocks.analyzer.analyze({
        period: 'week',
        memberId: 'user1',
        viewerId: 'user1',
      })

      expect(report.isAnonymized).toBe(false)
    })

    it('other - 匿名化 isAnonymized=true', async () => {
      mocks.read.mockResolvedValue([
        { type: 'file.updated', timestamp: Date.now() - 86400000 * 10 },
      ])

      const report = await mocks.analyzer.analyze({
        period: 'week',
        memberId: 'user2',
        viewerId: 'user1',
      })

      expect(report.isAnonymized).toBe(true)
      expect(report.memberId).toBeUndefined()
    })

    it('admin - 完整细节 + adminView=true', async () => {
      mocks.read.mockResolvedValue([
        { type: 'file.updated', timestamp: Date.now() - 86400000 * 10 },
      ])

      const report = await mocks.analyzer.analyze({
        period: 'week',
        memberId: 'user2',
        viewerId: 'user1', // user1 is admin
      })

      // user1 is admin, but viewing user2 — so admin view
      // Actually: viewerId 'user1' is admin, memberId 'user2' != viewerId
      // So applyPrivacyFilter should set adminView=true, isAnonymized=false
      expect(report.adminView).toBe(true)
      expect(report.isAnonymized).toBe(false)
    })
  })

  describe('数据不足', () => {
    it('事件不足7天显示 insufficientNotice', async () => {
      mocks.read.mockResolvedValue([
        { type: 'file.updated', timestamp: Date.now() - 86400000 * 3 },
      ])

      const report = await mocks.analyzer.analyze({
        period: 'week',
        viewerId: 'user1',
      })

      expect(report.dataSufficient).toBe(false)
      expect(report.insufficientNotice).toContain('7')
    })

    it('无事件时 dataSufficient=false', async () => {
      mocks.read.mockResolvedValue([])

      const report = await mocks.analyzer.analyze({
        period: 'week',
        viewerId: 'user1',
      })

      expect(report.dataSufficient).toBe(false)
    })
  })

  describe('综合分', () => {
    it('四维度等权计算', async () => {
      mocks.read.mockResolvedValue([
        { type: 'file.updated', timestamp: Date.now() - 86400000 * 10 },
      ])
      mocks.parseTasksMd.mockResolvedValue({
        tasks: [
          { id: '1', title: 'T1', status: '已完成', priority: 'P0', assignee: 'user1' },
          { id: '2', title: 'T2', status: '已完成', priority: 'P0', assignee: 'user1' },
        ],
        columns: { '待开始': [], '进行中': [], '已完成': [] },
        rawContent: '',
        parsedAt: Date.now(),
      })

      const report = await mocks.analyzer.analyze({
        period: 'week',
        memberId: 'user1',
        viewerId: 'user1',
      })

      const taskCompletion = report.dimensions.taskCompletion.normalized
      const validDims = Object.values(report.dimensions).filter((d) => !d.isNA)
      const expectedOverall =
        validDims.reduce((sum, d) => sum + d.normalized * 0.25, 0) /
        (validDims.length * 0.25)

      expect(report.overall).toBeCloseTo(expectedOverall, 5)
    })
  })

  describe('queryCached', () => {
    it('未缓存返回 null', () => {
      const result = mocks.analyzer.queryCached({ period: 'week', viewerId: 'user1' })
      expect(result).toBeNull()
    })
  })

  describe('invalidateCache', () => {
    it('清除所有缓存', async () => {
      mocks.read.mockResolvedValue([
        { type: 'file.updated', timestamp: Date.now() - 86400000 * 10 },
      ])

      await mocks.analyzer.analyze({ period: 'week', viewerId: 'user1' })
      mocks.analyzer.invalidateCache()

      const cached = mocks.analyzer.queryCached({ period: 'week', viewerId: 'user1' })
      expect(cached).toBeNull()
    })
  })
})
