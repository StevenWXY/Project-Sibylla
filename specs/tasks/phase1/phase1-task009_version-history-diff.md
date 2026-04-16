# 版本历史浏览与 Diff

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK009 |
| **任务标题** | 版本历史浏览与 Diff |
| **所属阶段** | Phase 1 - MVP 核心功能（Sprint 2） |
| **优先级** | P1 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现文件的版本历史浏览和 Diff 对比功能，让用户无需理解 Git 即可查看文件的变更过程、对比不同版本的差异、以及回滚到历史版本。

### 背景

需求 2.5 要求："作为用户，我想要查看文件的历史版本，以便了解变更过程或回滚。"

Phase 0 TASK010 的 GitAbstraction 已提供 `getHistory()` 和 `getFileDiff()` 接口。本任务需要：
1. 在文件树右键菜单中添加"查看历史"入口
2. 构建版本历史列表 UI（时间、作者、变更摘要）
3. 实现双版本 Diff 对比视图
4. 实现"恢复到此版本"功能

遵循 CLAUDE.md"Git 不可见"原则：
- 不使用"commit"术语，用"版本"替代
- 不使用"branch"术语，用"变更线"替代
- 不使用"revert"术语，用"恢复"替代

### 范围

**包含：**
- 文件树右键菜单"查看历史"入口
- 版本历史列表组件（时间、作者、摘要、分页）
- 双版本 Diff 对比视图
- "恢复到此版本"功能（创建新 commit 恢复旧内容）
- IPC 通道：`git:history`、`git:diff`、`git:restore`

**不包含：**
- 全局变更时间线（跨文件历史）— Phase 2
- 版本标签/里程碑 — Phase 2
- 变更审批流程 — Phase 2

## 技术要求

### 技术栈

- **GitAbstraction** — Phase 0 已有 getHistory/getFileDiff（`src/main/services/git-abstraction.ts`）
- **diff** 或 **diff-match-patch** — Diff 高亮渲染
- **React 18** + **TypeScript strict mode**
- **TailwindCSS** — 样式
- **Lucide React** — 图标
- **@tanstack/react-virtual**（可选）— 长列表虚拟滚动

### 架构设计

```
主进程 (Main Process)
├── src/main/services/
│   └── git-abstraction.ts           # 扩展：getHistory 分页、restoreVersion
└── src/main/ipc/handlers/
    └── git.handler.ts               # 扩展：版本历史相关 IPC

渲染进程 (Renderer Process)
├── src/renderer/components/
│   ├── version-history/
│   │   ├── VersionHistoryPanel.tsx   # 新增：版本历史侧面板
│   │   ├── VersionList.tsx           # 新增：版本列表
│   │   ├── VersionDiffView.tsx       # 新增：Diff 对比视图
│   │   └── RestoreConfirmDialog.tsx  # 新增：恢复确认对话框
└── src/renderer/stores/
    └── version-history-store.ts      # 新增：版本历史状态管理
```

#### 核心类型定义

```typescript
// src/main/services/types/version-history.types.ts

/** A single version entry (commit) */
export interface VersionEntry {
  /** Commit SHA */
  readonly oid: string
  /** Commit message (formatted for user display) */
  readonly message: string
  /** Author name */
  readonly author: string
  /** Timestamp in milliseconds */
  readonly timestamp: number
  /** Extracted short summary */
  readonly summary: string
}

/** Diff between two versions of a file */
export interface VersionDiff {
  readonly filePath: string
  readonly oldContent: string
  readonly newContent: string
  readonly hunks: readonly DiffHunk[]
}

/** History query with pagination */
export interface HistoryQuery {
  readonly filePath: string
  readonly limit?: number
  readonly offset?: number
}
```

### 实现细节

#### 子任务 9.1：GitAbstraction 扩展

在 Phase 0 已有接口上扩展分页和恢复功能：

```typescript
// src/main/services/git-abstraction.ts (扩展)

async getHistory(query: HistoryQuery): Promise<VersionEntry[]> {
  const commits = await git.log({
    fs,
    dir: this.workspaceRoot,
    ref: 'main',
    filepath: query.filePath,
    depth: query.limit ?? 50
  })

  const offset = query.offset ?? 0
  return commits.slice(offset, offset + (query.limit ?? 50)).map((commit) => ({
    oid: commit.oid,
    message: commit.commit.message,
    author: commit.commit.author.name,
    timestamp: commit.commit.author.timestamp * 1000,
    summary: this.extractSummary(commit.commit.message)
  }))
}

/**
 * Extract a short summary from commit message.
 * Returns the first line or first N characters.
 */
private extractSummary(message: string): string {
  const firstLine = message.split('\n')[0] ?? ''
  return firstLine.length > 60 ? firstLine.slice(0, 57) + '...' : firstLine
}

/**
 * Restore a file to a specific version.
 * Creates a new commit with the old content (not a revert).
 */
async restoreVersion(filePath: string, commitSha: string): Promise<string> {
  const content = await this.readFileAtCommit(commitSha, filePath)
  await fs.promises.writeFile(
    path.join(this.workspaceRoot, filePath),
    content,
    'utf-8'
  )
  await this.stageFile(filePath)
  const shortSha = commitSha.slice(0, 7)
  const message = `恢复 ${path.basename(filePath)} 到版本 ${shortSha}`
  return await this.commit(message)
}

/**
 * Read file content at a specific commit.
 */
private async readFileAtCommit(oid: string, filePath: string): Promise<string> {
  try {
    const { blob } = await git.readBlob({
      fs,
      dir: this.workspaceRoot,
      oid,
      filepath: filePath
    })
    return new TextDecoder().decode(blob)
  } catch {
    return ''
  }
}
```

**设计决策**：
- `restoreVersion` 使用"创建新 commit 恢复旧内容"策略，而非 `git revert`。这保证了历史可追溯，且不引入 revert commit 的复杂性
- commit message 使用"恢复"而非"revert"，遵循术语规范

#### 子任务 9.2：版本历史 IPC 通道

```typescript
// src/main/ipc/handlers/git.handler.ts (扩展)

ipcMain.handle('git:history', async (_, query: HistoryQuery): Promise<IPCResponse<VersionEntry[]>> => {
  try {
    const history = await gitAbstraction.getHistory(query)
    return { success: true, data: history }
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to get history',
        type: 'GIT_HISTORY_ERROR'
      }
    }
  }
})

ipcMain.handle('git:diff', async (_, commitA: string, commitB: string, filePath: string): Promise<IPCResponse<VersionDiff>> => {
  try {
    const diff = await gitAbstraction.getFileDiff(filePath, commitA, commitB)
    return { success: true, data: diff }
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to get diff',
        type: 'GIT_DIFF_ERROR'
      }
    }
  }
})

ipcMain.handle('git:restore', async (_, filePath: string, commitSha: string): Promise<IPCResponse<string>> => {
  try {
    const oid = await gitAbstraction.restoreVersion(filePath, commitSha)
    return { success: true, data: oid }
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to restore version',
        type: 'GIT_RESTORE_ERROR'
      }
    }
  }
})
```

**IPC 通道一览：**

| IPC 通道 | 方向 | 参数 | 返回值 | 说明 |
|---------|------|------|--------|------|
| `git:history` | Renderer → Main | `HistoryQuery` | `IPCResponse<VersionEntry[]>` | 获取文件版本历史 |
| `git:diff` | Renderer → Main | `(commitA, commitB, filePath)` | `IPCResponse<VersionDiff>` | 获取两个版本的 Diff |
| `git:restore` | Renderer → Main | `(filePath, commitSha)` | `IPCResponse<string>` | 恢复到指定版本 |

#### 子任务 9.3：文件树右键菜单入口

在 TASK001 的文件树组件中添加右键菜单：

```typescript
// 在 FileTreeItem.tsx 的右键菜单中添加
const contextMenuItems = [
  // ... existing items
  {
    label: '查看历史',
    icon: History,
    onClick: () => openVersionHistory(filePath)
  },
]
```

#### 子任务 9.4：VersionHistoryPanel

版本历史面板，以侧边栏形式展示文件的版本列表：

```typescript
// src/renderer/components/version-history/VersionHistoryPanel.tsx

export function VersionHistoryPanel({ filePath, onClose }: {
  filePath: string
  onClose: () => void
}) {
  const [versions, setVersions] = useState<VersionEntry[]>([])
  const [selectedVersion, setSelectedVersion] = useState<VersionEntry | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  useEffect(() => {
    loadHistory()
  }, [filePath, page])

  const loadHistory = async () => {
    setIsLoading(true)
    const result = await window.electronAPI.git.history({
      filePath,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE
    })
    if (result.success) {
      setVersions(result.data)
    }
    setIsLoading(false)
  }

  return (
    <div className="flex flex-col h-full w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="text-sm font-medium truncate">{path.basename(filePath)}</h2>
        <button onClick={onClose}><X className="h-4 w-4" /></button>
      </div>

      {/* Version List */}
      <VersionList
        versions={versions}
        isLoading={isLoading}
        onSelect={setSelectedVersion}
        selected={selectedVersion}
      />

      {/* Pagination */}
      {versions.length >= PAGE_SIZE && (
        <div className="flex items-center justify-between px-4 py-2 border-t text-xs">
          <button
            disabled={page === 0}
            onClick={() => setPage(p => p - 1)}
          >
            上一页
          </button>
          <span>第 {page + 1} 页</span>
          <button onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}

      {/* Diff View */}
      {selectedVersion && (
        <VersionDiffView
          filePath={filePath}
          version={selectedVersion}
          onRestore={handleRestore}
        />
      )}
    </div>
  )
}
```

#### 子任务 9.5：VersionList 组件

```typescript
// src/renderer/components/version-history/VersionList.tsx

export function VersionList({
  versions,
  isLoading,
  onSelect,
  selected
}: {
  versions: VersionEntry[]
  isLoading: boolean
  onSelect: (v: VersionEntry) => void
  selected: VersionEntry | null
}) {
  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin" /></div>
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {versions.map((version) => (
        <button
          key={version.oid}
          className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${
            selected?.oid === version.oid ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
          }`}
          onClick={() => onSelect(version)}
        >
          <p className="text-sm font-medium truncate">{version.summary}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
            <span>{version.author}</span>
            <span>·</span>
            <span>{formatRelativeTime(version.timestamp)}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
```

- 每个版本项显示：摘要（第一行）、作者、相对时间
- 选中状态高亮
- 使用 `formatRelativeTime()` 显示"3 分钟前"、"昨天"等人性化时间

#### 子任务 9.6：VersionDiffView 对比视图

选中一个版本后，展示该版本与当前版本的 Diff：

```typescript
// src/renderer/components/version-history/VersionDiffView.tsx

export function VersionDiffView({
  filePath,
  version,
  onRestore
}: {
  filePath: string
  version: VersionEntry
  onRestore: (filePath: string, commitSha: string) => void
}) {
  const [diff, setDiff] = useState<VersionDiff | null>(null)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)

  useEffect(() => {
    loadDiff()
  }, [version])

  const loadDiff = async () => {
    const result = await window.electronAPI.git.diff(
      version.oid,
      'HEAD',
      filePath
    )
    if (result.success) {
      setDiff(result.data)
    }
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700">
      {/* Diff header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-700">
        <span className="text-xs text-gray-600 dark:text-gray-400">
          与当前版本的差异
        </span>
        <button
          className="text-xs text-indigo-500 hover:text-indigo-600"
          onClick={() => setShowRestoreConfirm(true)}
        >
          恢复到此版本
        </button>
      </div>

      {/* Diff content */}
      {diff && (
        <div className="max-h-64 overflow-auto p-3">
          <pre className="text-xs font-mono whitespace-pre-wrap">
            {diff.hunks.map((hunk, i) => (
              <DiffHunkView key={i} hunk={hunk} />
            ))}
          </pre>
        </div>
      )}

      {/* Restore confirmation */}
      {showRestoreConfirm && (
        <RestoreConfirmDialog
          version={version}
          onConfirm={() => onRestore(filePath, version.oid)}
          onCancel={() => setShowRestoreConfirm(false)}
        />
      )}
    </div>
  )
}
```

#### 子任务 9.7：RestoreConfirmDialog 恢复确认

```typescript
// src/renderer/components/version-history/RestoreConfirmDialog.tsx

export function RestoreConfirmDialog({
  version,
  onConfirm,
  onCancel
}: {
  version: VersionEntry
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open onClose={onCancel} title="恢复到历史版本">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          确定要将文件恢复到以下版本吗？这将创建一个新的版本来记录此操作。
        </p>
        <div className="rounded bg-gray-50 dark:bg-gray-700 p-3 text-xs">
          <p className="font-medium">{version.summary}</p>
          <p className="text-gray-500 mt-1">
            {version.author} · {new Date(version.timestamp).toLocaleString('zh-CN')}
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <button className="px-4 py-2 text-sm border rounded hover:bg-gray-50" onClick={onCancel}>
            取消
          </button>
          <button className="px-4 py-2 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600" onClick={onConfirm}>
            确认恢复
          </button>
        </div>
      </div>
    </Modal>
  )
}
```

- 恢复操作需二次确认（CLAUDE.md："AI 建议，人类决策"——不可逆操作需确认）
- 明确告知用户"这将创建一个新的版本"（而非覆盖历史）

### 数据模型

无新增数据库模型。版本历史通过 GitAbstraction 实时查询。

### API 规范

见上方 IPC 通道一览表。

## 验收标准

### 功能完整性

> 以下标准直接追溯自需求 2.5。

- [ ] 右键文件选择"查看历史"显示版本列表（需求 2.5 AC1）
- [ ] 版本列表显示时间、作者、变更摘要（需求 2.5 AC2）
- [ ] 选中版本显示与当前版本的 diff 对比（需求 2.5 AC3）
- [ ] 点击"恢复到此版本"创建新 commit 恢复旧内容（需求 2.5 AC4）
- [ ] 超过 100 个版本时分页显示（需求 2.5 AC5）

### 性能指标

- [ ] 版本历史加载 < 1 秒
- [ ] Diff 计算 < 500ms
- [ ] 版本恢复 < 2 秒
- [ ] 版本列表滚动流畅

### 用户体验

- [ ] 右键菜单入口直觉化
- [ ] 版本列表有时间、作者、摘要
- [ ] Diff 高亮清晰（绿增红删）
- [ ] 恢复操作有二次确认
- [ ] 所有文字不出现 Git 术语

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过
- [ ] 所有公共函数有 JSDoc 注释
- [ ] 代码审查通过

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 60%（P1 任务标准）

**关键测试用例：**

1. **GitAbstraction.getHistory() 测试**
   - 输入：文件路径 + limit=10
   - 预期：返回最多 10 条版本记录
   - 边界条件：offset 超出范围返回空数组

2. **GitAbstraction.restoreVersion() 测试**
   - 输入：文件路径 + commit SHA
   - 预期：文件内容恢复，产生新 commit
   - 边界条件：commit 不包含该文件时内容为空

3. **VersionHistoryPanel 渲染测试**
   - 版本列表正确渲染
   - 分页按钮在条目 >= PAGE_SIZE 时出现
   - 选中版本后 Diff 视图出现

4. **RestoreConfirmDialog 测试**
   - 确认按钮调用 onConfirm
   - 取消按钮关闭对话框

### 集成测试

1. 右键 → "查看历史" → 版本列表加载 → 选中版本 → Diff 展示 → 恢复确认 → 新 commit 验证
2. 分页：翻页后加载正确的版本条目

## 依赖关系

### 前置依赖

- [x] PHASE0-TASK010（Git 抽象层基础）— getHistory/getFileDiff
- [x] PHASE1-TASK001（文件树浏览器）— 右键菜单入口
- [x] PHASE1-TASK005（自动保存）— commit 产生版本历史

### 被依赖任务

- 无直接被依赖任务

### 阻塞风险

- GitAbstraction 的 getHistory 对单个文件的过滤效率可能不理想（需要遍历所有 commit）
- 超长历史（>500 条）加载可能超时

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| isomorphic-git log 性能瓶颈 | 中 | 中 | 使用 depth 限制 + 分页 |
| Diff hunks 计算不准 | 中 | 低 | 使用成熟的 diff 库（diff-match-patch） |
| 恢复版本后文件树不刷新 | 低 | 低 | 恢复后触发文件树刷新事件 |

### 时间风险

低风险任务，核心接口已由 Phase 0 实现，本任务主要是前端 UI 构建。

### 资源风险

- `diff` 库（MIT）已在 TASK008 中引入，可复用

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) — 项目规范（"Git 不可见"术语规范）
- [`specs/design/architecture.md`](../../design/architecture.md) — GitAbstraction 接口
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — 文件状态标识
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) — IPC 接口定义
- [`specs/requirements/phase1/sprint2-git-sync.md`](../../requirements/phase1/sprint2-git-sync.md) — 需求 2.5
- [isomorphic-git Skill](../../../../.kilocode/skills/phase0/isomorphic-git-integration/SKILL.md)
- `src/main/services/git-abstraction.ts` — Phase 0 GitAbstraction

## 实施计划

### 第 1 步：类型定义

- 创建 `src/main/services/types/version-history.types.ts`
- 定义 VersionEntry、VersionDiff、HistoryQuery
- 预计耗时：1 小时

### 第 2 步：GitAbstraction 扩展

- 实现 getHistory() 分页支持
- 实现 restoreVersion()
- 实现 readFileAtCommit()
- 预计耗时：3 小时

### 第 3 步：IPC 通道

- 注册 git:history、git:diff、git:restore
- 扩展 Preload API
- 预计耗时：1.5 小时

### 第 4 步：文件树右键菜单

- 在 FileTreeItem 右键菜单添加"查看历史"项
- 点击后打开 VersionHistoryPanel
- 预计耗时：1 小时

### 第 5 步：VersionHistoryPanel 和 VersionList

- 实现版本历史侧面板
- 实现版本列表渲染
- 实现分页
- 预计耗时：3 小时

### 第 6 步：VersionDiffView 和 RestoreConfirmDialog

- 实现 Diff 对比视图（复用 TASK008 的 DiffHunkView）
- 实现恢复确认对话框
- 预计耗时：2 小时

### 第 7 步：测试编写

- GitAbstraction 扩展测试
- 组件渲染测试
- 确保 ≥ 60% 覆盖率
- 预计耗时：3 小时

## 完成标准

**本任务完成的标志：**

1. 右键文件可打开版本历史面板
2. 版本列表显示时间、作者、摘要，支持分页
3. 选中版本展示 Diff 对比
4. 可恢复到历史版本（有二次确认）
5. 所有 UI 不出现 Git 术语
6. 单元测试覆盖率 ≥ 60%

**交付物：**

- [ ] `src/main/services/types/version-history.types.ts`（新增）
- [ ] `src/main/services/git-abstraction.ts`（扩展）
- [ ] `src/main/ipc/handlers/git.handler.ts`（扩展）
- [ ] `src/renderer/components/version-history/VersionHistoryPanel.tsx`（新增）
- [ ] `src/renderer/components/version-history/VersionList.tsx`（新增）
- [ ] `src/renderer/components/version-history/VersionDiffView.tsx`（新增）
- [ ] `src/renderer/components/version-history/RestoreConfirmDialog.tsx`（新增）
- [ ] `src/renderer/components/file-tree/FileTreeItem.tsx`（扩展：右键菜单）
- [ ] 对应的测试文件

## 备注

- 版本恢复使用"创建新 commit 恢复旧内容"策略，而非 git revert
- 后续可扩展：版本对比（选择任意两个版本）、变更线可视化、版本标签
- Diff 渲染可复用 TASK008 的 DiffHighlight 组件

---

**创建时间：** 2026-04-17
**最后更新：** 2026-04-17
**更新记录：**
- 2026-04-17 — 创建任务文档
