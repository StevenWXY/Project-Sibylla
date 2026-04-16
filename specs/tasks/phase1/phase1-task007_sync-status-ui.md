# 同步状态 UI

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK007 |
| **任务标题** | 同步状态 UI |
| **所属阶段** | Phase 1 - MVP 核心功能（Sprint 2） |
| **优先级** | P0 |
| **复杂度** | 简单 |
| **预估工时** | 1-2 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

在底部状态栏中实现同步状态指示器，让用户随时了解文件同步状况。包括状态图标切换、点击展开详情面板、以及各状态的视觉反馈。这是 TASK006（自动同步）在前端的直接呈现。

### 背景

需求 2.3 要求："作为用户，我想要看到当前的同步状态，以便知道我的文件是否安全。"

TASK006 的 SyncManager 已通过 IPC 推送 `sync:stateChanged` 事件，包含完整的 `SyncState` 信息。本任务需要消费这些事件，在 UI 层构建同步状态指示器。

根据 `specs/design/ui-ux-design.md` 的布局规范，同步状态位于底栏（32px）右侧区域。根据文件状态标识规范：
- 已同步 → ✓ Emerald
- 同步中 → ↻ Blue（旋转动画）
- 离线 → 灰色
- 有冲突 → ⚠ Red
- 错误 → ⚠ Amber

### 范围

**包含：**
- 底栏同步状态指示器组件
- 状态图标与颜色切换动画
- 点击展开同步详情面板
- Zustand syncStatusStore
- 文件树中文件的同步状态标识

**不包含：**
- 冲突解决界面（TASK008）
- 版本历史展示（TASK009）
- 成员管理（TASK010）

## 技术要求

### 技术栈

- **React 18** + **TypeScript strict mode**
- **TailwindCSS** — 样式
- **Zustand** — 状态管理
- **Lucide React** — 图标
- **Framer Motion**（可选）— 动画

### 架构设计

```
渲染进程 (Renderer Process)
├── src/renderer/stores/
│   └── sync-status-store.ts         # 新增：同步状态 Zustand store
├── src/renderer/components/
│   ├── statusbar/
│   │   ├── StatusBar.tsx             # 扩展：底栏同步状态区域
│   │   ├── SyncStatusIndicator.tsx   # 新增：同步状态指示器
│   │   └── SyncDetailPanel.tsx       # 新增：同步详情弹出面板
│   └── file-tree/
│       └── FileTreeItem.tsx          # 扩展：文件同步状态标识
└── src/renderer/hooks/
    └── useSyncStatus.ts              # 新增：IPC 事件监听 Hook
```

#### 核心类型定义

```typescript
// src/renderer/stores/types/sync-status.types.ts

/** Sync status enum (mirrors main process SyncStatus) */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'conflict' | 'error'

/** Sync state from main process */
export interface SyncState {
  readonly status: SyncStatus
  readonly lastSyncedAt?: number
  readonly error?: string
  readonly pendingCommits?: number
  readonly conflictFiles?: readonly string[]
}
```

### 实现细节

#### 子任务 7.1：useSyncStatus Hook

监听主进程推送的同步状态变更事件，转化为 Zustand store 更新：

```typescript
// src/renderer/hooks/useSyncStatus.ts

export function useSyncStatus(): void {
  const setState = useSyncStatusStore((s) => s.setState)

  useEffect(() => {
    const unsubscribe = window.electronAPI.sync.onStateChanged(
      (state: SyncState) => {
        setState(state)
      }
    )

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe()
    }
  }, [setState])
}
```

- 在 App 根组件中调用一次，全局生效
- 主进程每次 sync 状态变化都推送到渲染进程

#### 子任务 7.2：syncStatusStore

```typescript
// src/renderer/stores/sync-status-store.ts

interface SyncStatusState {
  status: SyncStatus
  lastSyncedAt: number | null
  error: string | null
  pendingCommits: number
  conflictFiles: readonly string[]
}

interface SyncStatusActions {
  setState: (state: SyncState) => void
  reset: () => void
}

export const useSyncStatusStore = create<SyncStatusState & SyncStatusActions>()(
  (set) => ({
    status: 'idle',
    lastSyncedAt: null,
    error: null,
    pendingCommits: 0,
    conflictFiles: [],

    setState: (incoming) =>
      set({
        status: incoming.status,
        lastSyncedAt: incoming.lastSyncedAt ?? null,
        error: incoming.error ?? null,
        pendingCommits: incoming.pendingCommits ?? 0,
        conflictFiles: incoming.conflictFiles ?? [],
      }),

    reset: () =>
      set({
        status: 'idle',
        lastSyncedAt: null,
        error: null,
        pendingCommits: 0,
        conflictFiles: [],
      }),
  })
)
```

#### 子任务 7.3：SyncStatusIndicator 组件

底栏右侧的状态指示器，根据 SyncStatus 显示不同图标和颜色：

```typescript
// src/renderer/components/statusbar/SyncStatusIndicator.tsx

const STATUS_CONFIG: Record<SyncStatus, {
  icon: LucideIcon
  label: string
  colorClass: string
  animate?: boolean
}> = {
  idle:     { icon: Cloud,        label: '',                         colorClass: 'text-gray-400' },
  synced:   { icon: CloudCheck,   label: '已同步',                    colorClass: 'text-emerald-500' },
  syncing:  { icon: CloudUpload,  label: '同步中',                    colorClass: 'text-blue-500', animate: true },
  offline:  { icon: CloudOff,     label: '离线（本地已保存）',          colorClass: 'text-gray-400' },
  conflict: { icon: CloudAlert,   label: '有冲突',                    colorClass: 'text-red-500' },
  error:    { icon: CloudAlert,   label: '同步失败',                   colorClass: 'text-amber-500' },
}

export function SyncStatusIndicator() {
  const status = useSyncStatusStore((s) => s.status)
  const lastSyncedAt = useSyncStatusStore((s) => s.lastSyncedAt)
  const [showDetail, setShowDetail] = useState(false)

  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  const timeStr = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <>
      <button
        className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${config.colorClass} hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
        onClick={() => setShowDetail(true)}
        title={config.label}
      >
        <Icon className={`h-3.5 w-3.5 ${config.animate ? 'animate-spin' : ''}`} />
        <span>{config.label}</span>
        {timeStr && <span className="text-gray-400">{timeStr}</span>}
      </button>
      {showDetail && (
        <SyncDetailPanel onClose={() => setShowDetail(false)} />
      )}
    </>
  )
}
```

**视觉规范（来源 ui-ux-design.md）：**
- 已同步 ✓ → Emerald-500
- 同步中 ↻ → Blue-500（旋转动画）
- 离线 → Gray-400
- 有冲突 ⚠ → Red-500
- 同步失败 ⚠ → Amber-500

#### 子任务 7.4：SyncDetailPanel 详情面板

点击状态指示器后展开的浮动面板：

```typescript
// src/renderer/components/statusbar/SyncDetailPanel.tsx

export function SyncDetailPanel({ onClose }: { onClose: () => void }) {
  const state = useSyncStatusStore()

  return (
    <div className="absolute bottom-8 right-0 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">同步详情</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <SyncDetailRow label="状态" value={STATUS_LABELS[state.status]} />
        <SyncDetailRow
          label="上次同步"
          value={state.lastSyncedAt
            ? new Date(state.lastSyncedAt).toLocaleString('zh-CN')
            : '从未'}
        />

        {state.error && (
          <div className="rounded bg-red-50 dark:bg-red-900/10 p-2 text-xs text-red-600 dark:text-red-400">
            {state.error}
          </div>
        )}

        {state.conflictFiles.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-red-600">冲突文件：</p>
            {state.conflictFiles.map((f) => (
              <p key={f} className="text-xs text-gray-600 dark:text-gray-400">{f}</p>
            ))}
          </div>
        )}

        <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <button
            className="flex-1 text-xs bg-indigo-500 text-white rounded px-3 py-1.5 hover:bg-indigo-600"
            onClick={handleForceSync}
          >
            立即同步
          </button>
          {state.status === 'error' && (
            <button className="flex-1 text-xs border border-gray-300 rounded px-3 py-1.5 hover:bg-gray-50">
              重试
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

#### 子任务 7.5：文件树同步状态标识

在文件树中为每个文件显示同步状态（小圆点）：

```typescript
// 在 FileTreeItem.tsx 中扩展

function FileSyncIndicator({ filePath }: { filePath: string }) {
  // 从 syncStatusStore 获取该文件的状态
  // 可通过对比 pendingCommits 和 Git status 来判断
  const status = useFileSyncStatus(filePath)

  if (status === 'synced') return null

  return (
    <span className={`w-2 h-2 rounded-full ${
      status === 'modified' ? 'bg-amber-500' :
      status === 'conflict' ? 'bg-red-500' :
      'bg-gray-300'
    }`} />
  )
}
```

**状态标识规范（来源 ui-ux-design.md 5.1）：**
- 已同步 ✓ — 无标识
- 同步中 ↻ — Blue（全局状态指示器处理）
- 本地修改 ● — Amber
- 有冲突 ⚠ — Red

### 数据模型

使用 Zustand store 管理同步状态，无需数据库。

### API 规范

复用 TASK006 定义的 IPC 通道：

| IPC 通道 | 用途 |
|---------|------|
| `sync:stateChanged` | 监听同步状态变更 |
| `sync:force` | 手动触发同步 |
| `sync:getState` | 获取当前状态 |

## 验收标准

### 功能完整性

> 以下标准直接追溯自需求 2.3。

- [ ] 应用启动时底栏显示同步状态（需求 2.3 AC1）
- [ ] 已同步显示绿色 ✓ "已同步"（需求 2.3 AC2）
- [ ] 同步中显示旋转图标 "同步中 ↻"（需求 2.3 AC3）
- [ ] 离线显示灰色 "离线（本地已保存）"（需求 2.3 AC4）
- [ ] 有冲突显示红色警告 "有冲突 ⚠"（需求 2.3 AC5）
- [ ] 点击状态指示器弹出同步详情面板（需求 2.3 AC6）

### 性能指标

- [ ] 状态切换响应 < 100ms
- [ ] 详情面板弹出动画流畅
- [ ] 不因 IPC 监听导致渲染卡顿

### 用户体验

- [ ] 状态图标清晰可辨
- [ ] 颜色符合设计规范（Emerald/Blue/Gray/Red/Amber）
- [ ] 暗色模式下正确显示
- [ ] 同步中图标有旋转动画
- [ ] 详情面板信息完整

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过
- [ ] 所有组件有 JSDoc 注释
- [ ] 代码审查通过

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 60%（P0 任务但为 UI 组件）

**关键测试用例：**

1. **syncStatusStore 测试**
   - setState 正确更新各字段
   - reset 清空所有状态
   - 多次 setState 只保留最新值

2. **SyncStatusIndicator 渲染测试**
   - 各 SyncStatus 状态下正确渲染对应图标和文字
   - syncing 状态有 animate-spin class
   - 时间格式化正确

3. **SyncDetailPanel 测试**
   - error 状态显示错误信息
   - conflict 状态显示冲突文件列表
   - "立即同步"按钮调用 sync:force IPC

4. **useSyncStatus Hook 测试**
   - IPC 事件触发 store 更新
   - 组件卸载时清理监听器

### 集成测试

1. SyncManager 状态变更 → IPC 事件 → Store 更新 → UI 重渲染
2. 点击"立即同步" → sync:force IPC → SyncManager 执行 → 状态更新

## 依赖关系

### 前置依赖

- [x] PHASE1-TASK006（自动同步）— 提供 IPC 状态事件
- [x] PHASE1-TASK001（文件树）— 文件同步状态标识嵌入点

### 被依赖任务

- 无直接被依赖（其他任务可独立进行）

### 阻塞风险

- TASK006 的 IPC 事件格式需与本任务消费的格式一致

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| IPC 事件监听内存泄漏 | 低 | 中 | useEffect 清理函数确保移除监听器 |
| 高频状态更新导致重渲染 | 中 | 低 | Zustand selector 精确订阅，避免全局重渲染 |
| 暗色模式颜色偏差 | 低 | 低 | 使用 TailwindCSS dark: 变体 |

### 时间风险

本任务复杂度低，预计 1-2 天内完成。主要时间在于与 TASK006 的 IPC 格式对齐。

### 资源风险

无额外依赖。Lucide React 已在项目中使用。

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) — 项目规范（"Git 不可见"术语规范）
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — 底栏布局、色彩体系、文件状态标识
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) — IPC 接口定义
- [`specs/requirements/phase1/sprint2-git-sync.md`](../../requirements/phase1/sprint2-git-sync.md) — 需求 2.3
- [Electron IPC Skill](../../../../.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md)

## 实施计划

### 第 1 步：定义类型和 Store

- 创建 `sync-status.types.ts` 类型文件
- 实现 `syncStatusStore` Zustand store
- 预计耗时：1 小时

### 第 2 步：实现 useSyncStatus Hook

- 监听 `sync:stateChanged` IPC 事件
- 桥接到 Zustand store
- 在 App 根组件中挂载
- 预计耗时：1 小时

### 第 3 步：实现 SyncStatusIndicator

- 创建状态指示器组件
- 实现 6 种状态的图标/颜色/文字映射
- 同步中旋转动画
- 集成到 StatusBar 底栏
- 预计耗时：2 小时

### 第 4 步：实现 SyncDetailPanel

- 创建详情弹出面板
- 显示状态、时间、错误、冲突文件
- "立即同步"和"重试"按钮
- 预计耗时：2 小时

### 第 5 步：文件树状态标识

- 在 FileTreeItem 中添加同步状态小圆点
- 预计耗时：1 小时

### 第 6 步：测试编写

- Store 测试
- 组件渲染测试
- Hook 测试
- 预计耗时：2 小时

## 完成标准

**本任务完成的标志：**

1. 底栏显示同步状态指示器，6 种状态正确切换
2. 点击指示器弹出详情面板
3. 文件树显示文件同步状态标识
4. 暗色模式下正确显示
5. 单元测试覆盖率 ≥ 60%

**交付物：**

- [ ] `src/renderer/stores/sync-status-store.ts`（新增）
- [ ] `src/renderer/hooks/useSyncStatus.ts`（新增）
- [ ] `src/renderer/components/statusbar/SyncStatusIndicator.tsx`（新增）
- [ ] `src/renderer/components/statusbar/SyncDetailPanel.tsx`（新增）
- [ ] `src/renderer/components/statusbar/StatusBar.tsx`（扩展）
- [ ] `src/renderer/components/file-tree/FileTreeItem.tsx`（扩展）
- [ ] 对应的测试文件

## 备注

- 本任务与 TASK006 并行开发时，可先用 Mock 数据构建 UI，TASK006 完成后对接真实 IPC
- 后续可扩展：同步历史时间线、同步日志查看

---

**创建时间：** 2026-04-17
**最后更新：** 2026-04-17
**更新记录：**
- 2026-04-17 — 创建任务文档
