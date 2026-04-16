# 冲突检测与合并界面

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK008 |
| **任务标题** | 冲突检测与合并界面 |
| **所属阶段** | Phase 1 - MVP 核心功能（Sprint 2） |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现 Git 冲突的检测、展示和解决全流程。当自动同步 pull 到远端变更导致文件冲突时，系统需检测冲突文件、弹出冲突通知、展示三栏对比视图（我的版本/对方的版本/合并结果），并支持用户选择解决方案后自动提交。

### 背景

需求 2.4 要求："作为用户，当我的文件与他人修改冲突时，我想要清楚地看到差异并选择解决方案。"

这是 CLAUDE.md UI/UX 红线的直接体现："冲突解决界面必须让用户能清楚看到'我的版本'和'对方的版本'的差异。"同时遵循"AI 建议，人类决策"原则——解决冲突的最终决策权在用户。

**已有代码基础：**
- Phase 0 TASK011 的 GitAbstraction.pull() 已能检测冲突并返回冲突文件列表
- `src/renderer/components/studio/ConflictResolutionPanel.tsx` 已有前端 UI 骨架
- Phase 0 isomorphic-git Skill 提供了冲突检测与解决的完整模式

### 范围

**包含：**
- 冲突检测与解析（解析 Git conflict markers）
- 冲突通知弹窗
- 三栏对比视图 UI（我的版本 / 对方的版本 / AI 建议合并）
- 三种解决策略：采用我的、采用对方的、手动编辑
- 解决后自动 commit + push
- IPC 通道：`git:getConflicts`、`git:resolve`

**不包含：**
- AI 自动合并建议（Phase 2，本任务预留接口位置）
- 三方合并算法（使用 isomorphic-git 内置 merge）
- 实时协作冲突预防（CRDT/OT 不在范围内）

## 技术要求

### 技术栈

- **GitAbstraction** — Phase 0 已有冲突检测（`src/main/services/git-abstraction.ts`）
- **ConflictResolutionPanel** — 已有骨架（`src/renderer/components/studio/ConflictResolutionPanel.tsx`）
- **diff-match-patch** 或 **jsdiff** — Diff 计算和高亮
- **React 18** + **TypeScript strict mode**
- **TailwindCSS** — 样式
- **Lucide React** — 图标

### 架构设计

```
主进程 (Main Process)
├── src/main/services/
│   ├── git-abstraction.ts           # 扩展：冲突解析与解决
│   └── conflict-resolver.ts         # 新增：冲突文件内容解析服务
└── src/main/ipc/handlers/
    └── git.handler.ts               # 扩展：冲突相关 IPC

渲染进程 (Renderer Process)
├── src/renderer/components/
│   ├── conflict/
│   │   ├── ConflictNotification.tsx  # 新增：冲突通知 Toast
│   │   ├── ConflictCompareView.tsx   # 新增：左右对比视图
│   │   ├── ConflictEditor.tsx        # 新增：手动合并编辑器
│   │   └── ConflictResolutionPanel.tsx # 升级：整合以上组件
└── src/renderer/stores/
    └── conflict-store.ts             # 新增：冲突状态管理
```

#### 核心类型定义

```typescript
// src/main/services/types/conflict.types.ts

/** Single file conflict information */
export interface ConflictInfo {
  /** Workspace-relative file path */
  readonly filePath: string
  /** Local (ours) version content */
  readonly localContent: string
  /** Remote (theirs) version content */
  readonly remoteContent: string
  /** Common ancestor (base) version content */
  readonly baseContent: string
  /** Name of the remote author */
  readonly remoteAuthor?: string
}

/** Conflict resolution strategy */
export type ResolutionType = 'mine' | 'theirs' | 'manual'

/** Resolution request */
export interface ConflictResolution {
  readonly filePath: string
  readonly type: ResolutionType
  /** Required when type is 'manual' */
  readonly content?: string
}
```

### 实现细节

#### 子任务 8.1：ConflictResolver 服务（主进程）

解析 Git conflict markers，提取三方内容：

```typescript
// src/main/services/conflict-resolver.ts

export class ConflictResolver {
  constructor(
    private readonly gitAbstraction: GitAbstraction,
    private readonly logger: Logger
  ) {}

  /**
   * Detect and parse all conflicting files.
   * Returns ConflictInfo array with ours/theirs/base content.
   */
  async getConflicts(): Promise<ConflictInfo[]> {
    const status = await this.gitAbstraction.getStatus()
    const conflictFiles: string[] = []

    // isomorphic-git merge 后，冲突文件在工作区保留 conflict markers
    // 通过读取文件内容检测 <<<<<<< HEAD 标记
    for (const filepath of status.modified) {
      const content = await this.readFileContent(filepath)
      if (content.includes('<<<<<<< HEAD')) {
        conflictFiles.push(filepath)
      }
    }

    const results: ConflictInfo[] = []
    for (const filePath of conflictFiles) {
      const info = await this.parseConflictFile(filePath)
      results.push(info)
    }

    return results
  }

  /**
   * Parse conflict markers in a file to extract ours/theirs/base content.
   * Conflict format:
   *   <<<<<<< HEAD
   *   (ours content)
   *   =======
   *   (theirs content)
   *   >>>>>>> origin/main
   */
  private async parseConflictFile(filePath: string): Promise<ConflictInfo> {
    const content = await this.readFileContent(filePath)

    const localContent = this.extractSection(content, 'ours')
    const remoteContent = this.extractSection(content, 'theirs')
    const baseContent = await this.getBaseContent(filePath)

    return { filePath, localContent, remoteContent, baseContent }
  }

  /**
   * Resolve a conflict by writing resolved content and committing.
   */
  async resolve(resolution: ConflictResolution): Promise<string> {
    let resolvedContent: string

    const conflictInfo = await this.parseConflictFile(resolution.filePath)

    switch (resolution.type) {
      case 'mine':
        resolvedContent = conflictInfo.localContent
        break
      case 'theirs':
        resolvedContent = conflictInfo.remoteContent
        break
      case 'manual':
        if (!resolution.content) {
          throw new Error('Manual content is required for manual resolution')
        }
        resolvedContent = resolution.content
        break
    }

    await this.writeFileContent(resolution.filePath, resolvedContent)
    await this.gitAbstraction.stageFile(resolution.filePath)

    const message = `[冲突解决] ${path.basename(resolution.filePath)}`
    const oid = await this.gitAbstraction.commit(message)

    this.logger.info('Conflict resolved', {
      filePath: resolution.filePath,
      type: resolution.type,
      commitOid: oid
    })

    return oid
  }
}
```

**设计决策**：
- 复用 isomorphic-git merge 后留在工作区的 conflict markers
- 不依赖 `git.checkout()` 三方内容读取（isomorphic-git 限制），改为从 conflict markers 解析
- 解决后自动 commit，commit message 使用"冲突解决"而非 Git 术语

#### 子任务 8.2：冲突 IPC 通道

```typescript
// src/main/ipc/handlers/git.handler.ts (扩展)

ipcMain.handle('git:getConflicts', async (): Promise<IPCResponse<ConflictInfo[]>> => {
  try {
    const conflicts = await conflictResolver.getConflicts()
    return { success: true, data: conflicts }
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to get conflicts',
        type: 'CONFLICT_ERROR'
      }
    }
  }
})

ipcMain.handle('git:resolve', async (_, resolution: ConflictResolution): Promise<IPCResponse<string>> => {
  try {
    const oid = await conflictResolver.resolve(resolution)
    return { success: true, data: oid }
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Failed to resolve conflict',
        type: 'CONFLICT_ERROR'
      }
    }
  }
})
```

**IPC 通道一览：**

| IPC 通道 | 方向 | 参数 | 返回值 | 说明 |
|---------|------|------|--------|------|
| `git:getConflicts` | Renderer → Main | — | `IPCResponse<ConflictInfo[]>` | 获取冲突列表 |
| `git:resolve` | Renderer → Main | `ConflictResolution` | `IPCResponse<string>` | 解决冲突 |
| `git:conflictDetected` | Main → Renderer | — | `ConflictInfo[]` | 冲突检测推送（sync 时自动触发） |

#### 子任务 8.3：冲突通知

当 SyncManager 检测到冲突时，通过 IPC 推送到渲染进程：

```typescript
// 在 sync.handler.ts 中扩展
syncManager.on('state-changed', (state: SyncState) => {
  if (state.status === 'conflict' && state.conflictFiles) {
    // 触发冲突检测，获取详细冲突信息
    const conflicts = await conflictResolver.getConflicts()
    mainWindow?.webContents.send('git:conflictDetected', conflicts)
  }
})
```

```typescript
// src/renderer/components/conflict/ConflictNotification.tsx

export function ConflictNotification() {
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])

  useEffect(() => {
    window.electronAPI.git.onConflictDetected((info) => {
      setConflicts(info)
    })
  }, [])

  if (conflicts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 w-96 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-red-200 dark:border-red-800">
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-5 w-5" />
          <h3 className="font-medium">发现文件冲突</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          以下文件被其他成员同时修改，需要你选择如何合并：
        </p>
        <ul className="space-y-1">
          {conflicts.map((c) => (
            <li key={c.filePath} className="text-sm font-mono bg-gray-50 dark:bg-gray-700 px-2 py-1 rounded">
              {c.filePath}
            </li>
          ))}
        </ul>
        <button
          className="w-full bg-red-500 text-white rounded px-4 py-2 text-sm hover:bg-red-600"
          onClick={() => openConflictResolution(conflicts)}
        >
          查看并解决冲突
        </button>
      </div>
    </div>
  )
}
```

#### 子任务 8.4：三栏对比视图

```typescript
// src/renderer/components/conflict/ConflictCompareView.tsx

export function ConflictCompareView({
  conflict,
  onResolve
}: {
  conflict: ConflictInfo
  onResolve: (resolution: ConflictResolution) => void
}) {
  const [manualContent, setManualContent] = useState('')
  const [activeTab, setActiveTab] = useState<'compare' | 'manual'>('compare')

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-medium">冲突: {conflict.filePath}</h2>
        <div className="flex gap-2">
          <button
            className={`px-3 py-1 text-sm rounded ${activeTab === 'compare' ? 'bg-indigo-100 text-indigo-700' : ''}`}
            onClick={() => setActiveTab('compare')}
          >
            对比视图
          </button>
          <button
            className={`px-3 py-1 text-sm rounded ${activeTab === 'manual' ? 'bg-indigo-100 text-indigo-700' : ''}`}
            onClick={() => setActiveTab('manual')}
          >
            手动合并
          </button>
        </div>
      </div>

      {/* Compare View */}
      {activeTab === 'compare' && (
        <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden">
          <div className="border-r border-gray-200 dark:border-gray-700">
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-sm font-medium border-b">
              你的版本
            </div>
            <DiffHighlight content={conflict.localContent} />
          </div>
          <div>
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 text-sm font-medium border-b">
              对方的版本{conflict.remoteAuthor ? `（${conflict.remoteAuthor}）` : ''}
            </div>
            <DiffHighlight content={conflict.remoteContent} />
          </div>
        </div>
      )}

      {/* Manual Merge Editor */}
      {activeTab === 'manual' && (
        <div className="flex-1">
          <ConflictEditor
            initialContent={conflict.localContent}
            onChange={setManualContent}
          />
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <button
          className="px-4 py-2 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600"
          onClick={() => onResolve({ filePath: conflict.filePath, type: 'mine' })}
        >
          采用我的版本
        </button>
        <button
          className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300"
          onClick={() => onResolve({ filePath: conflict.filePath, type: 'theirs' })}
        >
          采用对方的版本
        </button>
        {activeTab === 'manual' && (
          <button
            className="px-4 py-2 text-sm bg-emerald-500 text-white rounded hover:bg-emerald-600"
            onClick={() => onResolve({
              filePath: conflict.filePath,
              type: 'manual',
              content: manualContent
            })}
            disabled={!manualContent.trim()}
          >
            确认手动合并
          </button>
        )}
      </div>
    </div>
  )
}
```

**UI 规范参考（ui-ux-design.md 5.3）：**
- 左侧"你的版本"，右侧"对方的版本（作者名）"
- 底部三个操作按钮：采用我的、采用对方的、确认手动合并
- 标题使用 ⚠ 图标标识冲突文件

#### 子任务 8.5：Diff 高亮组件

```typescript
// src/renderer/components/conflict/DiffHighlight.tsx

import { diffLines } from 'diff'

export function DiffHighlight({ content, compareAgainst }: {
  content: string
  compareAgainst?: string
}) {
  if (!compareAgainst) {
    return (
      <pre className="p-3 text-sm font-mono whitespace-pre-wrap overflow-auto h-full">
        {content}
      </pre>
    )
  }

  const changes = diffLines(compareAgainst, content)

  return (
    <pre className="p-3 text-sm font-mono whitespace-pre-wrap overflow-auto h-full">
      {changes.map((change, i) => (
        <span
          key={i}
          className={
            change.added ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800' :
            change.removed ? 'bg-red-100 dark:bg-red-900/30 text-red-800' :
            ''
          }
        >
          {change.value}
        </span>
      ))}
    </pre>
  )
}
```

- 使用 `diff` 库计算行级差异
- 新增行绿色高亮，删除行红色高亮
- 与 ui-ux-design.md 中"绿色增加、红色删除"的规范一致

#### 子任务 8.6：conflictStore（Zustand）

```typescript
// src/renderer/stores/conflict-store.ts

interface ConflictState {
  readonly conflicts: ConflictInfo[]
  readonly activeConflictIndex: number
  readonly isResolving: boolean
}

interface ConflictActions {
  setConflicts: (conflicts: ConflictInfo[]) => void
  setActiveConflict: (index: number) => void
  resolveConflict: (resolution: ConflictResolution) => Promise<void>
  clearConflicts: () => void
}

export const useConflictStore = create<ConflictState & ConflictActions>()(
  (set, get) => ({
    conflicts: [],
    activeConflictIndex: 0,
    isResolving: false,

    setConflicts: (conflicts) => set({ conflicts, activeConflictIndex: 0 }),

    setActiveConflict: (index) => set({ activeConflictIndex: index }),

    resolveConflict: async (resolution) => {
      set({ isResolving: true })
      try {
        await window.electronAPI.git.resolve(resolution)
        const { conflicts, activeConflictIndex } = get()
        const remaining = conflicts.filter((c) => c.filePath !== resolution.filePath)
        set({
          conflicts: remaining,
          activeConflictIndex: Math.min(activeConflictIndex, Math.max(0, remaining.length - 1)),
          isResolving: false,
        })
      } catch (error) {
        set({ isResolving: false })
        throw error
      }
    },

    clearConflicts: () => set({ conflicts: [], activeConflictIndex: 0 }),
  })
)
```

### 数据模型

无新增数据库模型。冲突信息通过 IPC 实时获取，前端使用 Zustand 管理。

### API 规范

见上方 IPC 通道一览表。

## 验收标准

### 功能完整性

> 以下标准直接追溯自需求 2.4。

- [ ] Pull 检测到冲突时弹出冲突通知（需求 2.4 AC1）
- [ ] 打开冲突文件展示三栏对比视图（需求 2.4 AC2）
- [ ] 左侧显示"你的版本"，右侧显示"对方的版本"（需求 2.4 AC3）
- [ ] 点击"采用我的版本"保留本地内容（需求 2.4 AC4）
- [ ] 点击"采用对方的版本"使用远端内容（需求 2.4 AC5）
- [ ] 支持手动编辑合并结果（需求 2.4 AC6）
- [ ] 冲突解决后自动 commit 并 push（需求 2.4 AC7）

### 性能指标

- [ ] 冲突检测 < 1 秒
- [ ] Diff 计算 < 500ms
- [ ] 冲突文件内容加载 < 1 秒
- [ ] 解决冲突（commit + push）< 3 秒

### 用户体验

- [ ] 冲突通知醒目且不遮挡编辑区域
- [ ] 左右对比视图差异高亮清晰
- [ ] 操作按钮语义明确，无 Git 术语
- [ ] 手动合并编辑器使用等宽字体
- [ ] 解决过程有 loading 状态

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过
- [ ] 所有公共函数有 JSDoc 注释
- [ ] 代码审查通过

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 80%

**关键测试用例：**

1. **ConflictResolver.getConflicts() 测试**
   - 输入：包含 conflict markers 的文件
   - 预期：正确解析 ours/theirs 内容
   - 边界条件：无冲突文件返回空数组

2. **Conflict Resolver.extractSection() 测试**
   - 输入：包含 `<<<<<<< HEAD` / `=======` / `>>>>>>> origin/main` 的文本
   - 预期：正确提取 ours 和 theirs 部分
   - 边界条件：多个冲突区域、空区域、嵌套标记

3. **ConflictResolver.resolve() 测试**
   - 输入：ResolutionType = 'mine'
   - 预期：写入 localContent，stage，commit
   - 边界条件：manual 类型但 content 为空应抛错

4. **ConflictCompareView 渲染测试**
   - 各 Tab 切换正确
   - Diff 高亮颜色正确
   - 按钮点击触发正确回调

5. **conflictStore 测试**
   - setConflicts → setActiveConflict → resolveConflict 链路
   - 解决后冲突列表正确减少
   - 最后一个冲突解决后列表清空

### 集成测试

1. 完整冲突流程：模拟 pull 冲突 → 冲突通知 → 打开对比 → 选择解决 → 验证 commit
2. 多文件冲突：依次解决每个冲突文件

## 依赖关系

### 前置依赖

- [x] PHASE0-TASK010（Git 抽象层基础）— commit/stageFile
- [x] PHASE0-TASK011（Git 远程同步）— pull 冲突检测
- [x] PHASE1-TASK006（自动同步）— SyncManager 冲突状态推送

### 被依赖任务

- PHASE1-TASK009（版本历史）— 可查看冲突解决的 commit 历史

### 阻塞风险

- isomorphic-git merge 后的 conflict markers 格式需要验证
- 大文件 diff 计算可能影响性能

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| conflict markers 解析不完整 | 高 | 中 | 编写全面的测试用例覆盖各种边界情况 |
| 大文件 diff 计算卡顿 | 中 | 低 | 对超过 1000 行的文件使用虚拟滚动 |
| 二进制文件冲突 | 中 | 低 | 检测到二进制文件冲突时仅提供"选择版本"选项，不展示 diff |
| 解决冲突后 push 失败 | 中 | 低 | 本地已 commit 不丢数据，下次同步自动重试 push |

### 时间风险

冲突 markers 解析的边缘 case 可能超出预期。建议先实现最基础的"选择版本"策略，手动合并编辑器作为增量。

### 资源风险

- `diff` 库（MIT）用于计算文本差异
- `ConflictResolutionPanel.tsx` 已有骨架可复用

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) — 项目规范（UI/UX 红线：冲突解决界面、diff 预览）
- [`specs/design/architecture.md`](../../design/architecture.md) — GitAbstraction 冲突接口
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — 冲突解决界面规范（5.3 节）
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) — IPC 接口定义
- [`specs/requirements/phase1/sprint2-git-sync.md`](../../requirements/phase1/sprint2-git-sync.md) — 需求 2.4
- [isomorphic-git Skill](../../../../.kilocode/skills/phase0/isomorphic-git-integration/SKILL.md) — 冲突检测与解决模式
- `src/renderer/components/studio/ConflictResolutionPanel.tsx` — 已有冲突 UI 骨架

## 实施计划

### 第 1 步：类型定义

- 创建 `src/main/services/types/conflict.types.ts`
- 定义 ConflictInfo、ResolutionType、ConflictResolution
- 预计耗时：1 小时

### 第 2 步：ConflictResolver 服务

- 创建 `src/main/services/conflict-resolver.ts`
- 实现 conflict markers 解析
- 实现 getConflicts() 和 resolve()
- 预计耗时：4 小时

### 第 3 步：IPC 通道

- 扩展 `git.handler.ts`：注册 git:getConflicts 和 git:resolve
- 在 SyncManager 冲突时推送 git:conflictDetected 事件
- 扩展 Preload API
- 预计耗时：2 小时

### 第 4 步：冲突通知组件

- 创建 ConflictNotification Toast 组件
- 监听 git:conflictDetected 事件
- 显示冲突文件列表
- 预计耗时：2 小时

### 第 5 步：三栏对比视图

- 创建 ConflictCompareView 组件
- 左右对比 + Diff 高亮
- 三个操作按钮
- 预计耗时：3 小时

### 第 6 步：手动合并编辑器

- 创建 ConflictEditor 组件
- 基于 textarea 或 Monaco Editor
- 预填充 localContent 作为起始内容
- 预计耗时：2 小时

### 第 7 步：conflictStore 和整合

- 创建 Zustand conflictStore
- 整合 ConflictNotification → ConflictCompareView → 解决流程
- 解决后自动 commit + push
- 预计耗时：2 小时

### 第 8 步：测试编写

- ConflictResolver 单元测试
- 组件渲染测试
- Store 测试
- 确保 ≥ 80% 覆盖率
- 预计耗时：4 小时

## 完成标准

**本任务完成的标志：**

1. Pull 冲突时弹出通知，显示冲突文件列表
2. 三栏对比视图清晰展示"我的版本"和"对方的版本"差异
3. 支持三种解决策略：采用我的、采用对方的、手动编辑
4. 冲突解决后自动 commit 并 push
5. 所有 UI 不出现 Git 术语
6. 单元测试覆盖率 ≥ 80%

**交付物：**

- [ ] `src/main/services/conflict-resolver.ts`（新增）
- [ ] `src/main/services/types/conflict.types.ts`（新增）
- [ ] `src/main/ipc/handlers/git.handler.ts`（扩展）
- [ ] `src/renderer/stores/conflict-store.ts`（新增）
- [ ] `src/renderer/components/conflict/ConflictNotification.tsx`（新增）
- [ ] `src/renderer/components/conflict/ConflictCompareView.tsx`（新增）
- [ ] `src/renderer/components/conflict/ConflictEditor.tsx`（新增）
- [ ] `src/renderer/components/conflict/DiffHighlight.tsx`（新增）
- [ ] `src/renderer/components/studio/ConflictResolutionPanel.tsx`（升级）
- [ ] 对应的测试文件

## 备注

- AI 自动合并建议（"采用AI建议"按钮）在 Phase 2 实现，本任务在 UI 中预留按钮位置但灰化
- 二进制文件冲突（图片等）无法 diff 展示，仅提供"选择版本"选项
- 后续可扩展：冲突预防（编辑前检测他人正在编辑的文件）、三路合并可视化

---

**创建时间：** 2026-04-17
**最后更新：** 2026-04-17
**更新记录：**
- 2026-04-17 — 创建任务文档
