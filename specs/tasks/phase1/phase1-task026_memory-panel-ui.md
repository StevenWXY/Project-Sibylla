# 记忆面板 UI 与 IPC 集成

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK026 |
| **任务标题** | 记忆面板 UI 与 IPC 集成 |
| **所属阶段** | Phase 1 - 记忆系统 v2 (Sprint 3.2) |
| **优先级** | P1 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建记忆系统的用户可见层——记忆面板 UI 和完整的 v2 IPC 通道集成。用户可通过面板查看、搜索、编辑、锁定、删除记忆条目，查看演化历史，手动触发检查点和压缩，并实时感知系统状态。同时完成所有 v2 IPC handler 的注册与 Preload API 扩展。

### 背景

TASK022-025 已完成所有后端能力。本任务将这些能力暴露给渲染进程，构建完整的用户交互闭环。这是 Sprint 3.2 的"最后一公里"——没有 UI，用户无法干预 AI 的记忆行为；没有 IPC 集成，所有后端能力对用户不可见。

### 范围

**包含：**
- `memoryStore` — Zustand store（renderer 侧状态管理）
- `MemoryPanel` — 主面板容器
- `MemorySection` — 分节展示组件
- `MemoryEntryCard` — 单条记忆卡片（内容、置信度进度条、命中次数、操作按钮）
- `MemoryEntryEditor` — 条目编辑器
- `MemoryEntryHistory` — 演化历史查看
- `MemorySearchBar` — 混合检索搜索框
- `MemoryHeader` — 头部状态条（token 用量、检查点状态）
- `CheckpointStatusIndicator` — 检查点运行状态指示器
- v2 IPC handler 完整注册（memory.handler.ts）
- Preload API 扩展
- 单元测试

**不包含：**
- 知识图谱可视化（Sprint 7）
- 记忆统计 Dashboard（Sprint 7）
- 查询 DSL 界面（Sprint 7）

## 验收标准

### 记忆面板 UI

- [ ] 打开面板时按 section 分组展示所有条目，section 内按 confidence × log(hits+1) 排序
- [ ] 每条展示：内容、置信度进度条（颜色编码高/中/低）、命中次数、最后更新时间、来源日志链接
- [ ] 点击条目展开详情抽屉（所有元数据 + sourceLogIds + 演化历史）
- [ ] 编辑条目内容后保存，触发 EvolutionLog type='manual-edit'
- [ ] 点击锁定按钮设置 locked=true，显示锁定图标
- [ ] 点击删除按钮弹出确认对话框，确认后移除条目和索引
- [ ] 搜索框调用混合检索，高亮匹配结果
- [ ] "立即检查"按钮触发手动检查点，显示运行进度
- [ ] 检查点运行中（timer 触发）面板显示实时状态
- [ ] totalTokens 接近 12K 时显示警告 + "压缩"按钮
- [ ] 压缩后 24 小时内显示"撤销压缩"按钮

### IPC 集成

- [ ] 所有 v2 IPC 通道类型安全注册（IPCChannelMap）
- [ ] Preload API 暴露 memory v2 方法
- [ ] v1 IPC 通道继续正常工作
- [ ] 主进程 → 渲染进程事件正确推送（checkpointStarted/Completed/Failed 等）

### 可用性

- [ ] 面板加载 < 500ms（1000 条以下）
- [ ] 搜索响应 < 300ms（含 IPC 往返）
- [ ] 所有按钮有 loading 状态和错误兜底
- [ ] 使用自然语言（"精选记忆""置信度""检查点"），避免技术术语

## 依赖关系

### 前置依赖

- [x] TASK022（数据层）— MemoryFileManager、MemoryManager 门面、v2 IPC 类型
- [x] TASK023（提取器与演化日志）— EvolutionLog 查询接口
- [x] TASK024（检查点与压缩）— CheckpointScheduler、MemoryCompressor
- [x] TASK025（向量检索）— MemoryIndexer.search()、混合检索

### 被依赖任务

- 无直接被依赖（本任务是 Sprint 3.2 的最终交付任务）

## 参考文档

- [`specs/requirements/phase1/sprint3.2-memory.md`](../../requirements/phase1/sprint3.2-memory.md) — 需求 3.2.7、4.2.5、4.2.8、六 IPC 接口清单
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — UI 设计规范
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计
- `.kilocode/skills/phase1/electron-ipc-patterns/SKILL.md` — IPC 通信模式
- [`CLAUDE.md`](../../../CLAUDE.md) — UI/UX 红线（等待超 2 秒需进度反馈、所有按钮有 loading）

## 技术执行路径

### 架构设计

```
记忆面板 UI 架构：

Studio 主界面
└── 侧边栏 / 独立标签页
    └── MemoryPanel
        ├── MemoryHeader
        │   ├── Token 用量进度条 (9.2K / 12K)
        │   ├── 检查点状态 (上次: 2h前 | 下次: ~30min)
        │   ├── "立即检查" 按钮
        │   └── "压缩" 按钮 (仅 totalTokens > 10K 时显示)
        ├── MemorySearchBar
        │   └── 搜索框 → hybrid search → 高亮结果
        └── MemorySection × 6
            ├── 标题: 用户偏好 / 技术决策 / 常见问题 / 项目约定 / 风险提示 / 关键术语
            └── MemoryEntryCard × N
                ├── 内容摘要
                ├── 置信度进度条 (绿色 ≥0.8 / 黄色 0.5-0.8 / 红色 <0.5)
                ├── 命中次数 badge
                ├── 最后更新时间
                ├── 操作按钮: 编辑 | 锁定 | 删除 | 查看历史
                └── 展开详情 (sourceLogIds, tags, 演化时间线)

IPC 通信链路：

Renderer (memoryStore)
    │── memory:listEntries ──→ Main → MemoryFileManager.load() → entries[]
    │── memory:search ──────→ Main → MemoryIndexer.search() → results[]
    │── memory:updateEntry ─→ Main → MemoryFileManager.save() + EvolutionLog
    │── memory:deleteEntry ─→ Main → MemoryFileManager.save() + Indexer.remove()
    │── memory:lockEntry ───→ Main → MemoryFileManager.save() + EvolutionLog
    │── memory:triggerCheckpoint → Main → CheckpointScheduler.maybeRun('manual')
    │── memory:triggerCompression → Main → MemoryCompressor.compress()
    │── memory:getEvolutionHistory → Main → EvolutionLog.query()
    │
    ←── memory:checkpointStarted ──── Main → Renderer (实时状态更新)
    ←── memory:checkpointCompleted ── Main → Renderer
    ←── memory:entryAdded ────────── Main → Renderer (增量更新)
    ←── memory:entryUpdated ──────── Main → Renderer
    ←── memory:entryDeleted ──────── Main → Renderer
```

### 步骤 1：实现 memoryStore

**文件：** `src/renderer/store/memoryStore.ts`

1. 使用 Zustand 创建 store：
   ```typescript
   interface MemoryStore {
     entries: MemoryEntry[]
     archivedEntries: MemoryEntry[]
     totalTokens: number
     lastCheckpoint: string | null
     isCheckpointRunning: boolean
     isCompressionAvailable: boolean
     canUndoCompression: boolean
     searchResults: HybridSearchResult[] | null
     searchQuery: string
     selectedEntryId: string | null
     isLoading: boolean
     error: string | null

     loadEntries: () => Promise<void>
     searchEntries: (query: string) => Promise<void>
     editEntry: (id: string, newContent: string) => Promise<void>
     deleteEntry: (id: string) => Promise<void>
     lockEntry: (id: string, locked: boolean) => Promise<void>
     triggerCheckpoint: () => Promise<void>
     triggerCompression: () => Promise<void>
     undoLastCompression: () => Promise<void>
     getEvolutionHistory: (entryId: string) => Promise<EvolutionEvent[]>
     selectEntry: (id: string | null) => void
     clearSearch: () => void
   }
   ```
2. 实现 `loadEntries()`：
   - 调用 IPC `memory:listEntries()` → 设置 entries
   - 调用 IPC `memory:listArchived()` → 设置 archivedEntries
   - 调用 IPC `memory:getStats()` → 设置 totalTokens、lastCheckpoint
   - 设置 isLoading / error 状态
3. 实现 `searchEntries(query)`：
   - 调用 IPC `memory:search(query, { limit: 20 })` → 设置 searchResults
   - 更新 searchQuery
4. 实现 `editEntry(id, newContent)`：
   - 调用 IPC `memory:updateEntry(id, newContent)`
   - 成功后更新本地 entries 中的对应条目
5. 实现 `deleteEntry(id)`：
   - 调用 IPC `memory:deleteEntry(id)`
   - 成功后从本地 entries 中移除
6. 实现 `lockEntry(id, locked)`：
   - 调用 IPC `memory:lockEntry(id, locked)`
   - 成功后更新本地 entries 中的 locked 字段
7. 实现 `triggerCheckpoint()`：
   - 设置 isCheckpointRunning = true
   - 调用 IPC `memory:triggerCheckpoint()`
   - 完成后刷新 entries 和 stats
8. 实现 `triggerCompression()`：
   - 调用 IPC `memory:triggerCompression()`
   - 完成后刷新 entries 和 stats
9. 实现 `undoLastCompression()`：
   - 调用 IPC `memory:undoLastCompression()`
   - 完成后刷新 entries
10. 实现 `getEvolutionHistory(entryId)`：
    - 调用 IPC `memory:getEvolutionHistory(entryId)`
11. 注册 IPC 事件监听：
    - `memory:checkpointStarted` → isCheckpointRunning = true
    - `memory:checkpointCompleted` → isCheckpointRunning = false + 刷新
    - `memory:entryAdded` → 刷新 entries
    - `memory:entryUpdated` → 刷新 entries
    - `memory:entryDeleted` → 刷新 entries

### 步骤 2：实现 MemoryHeader

**文件：** `src/renderer/components/memory/MemoryHeader.tsx`

1. Props：`totalTokens`、`threshold`（12000）、`isCheckpointRunning`、`lastCheckpoint`、`canUndoCompression`、`onRunCheckpoint`、`onCompress`、`onUndoCompression`
2. 渲染内容：
   - Token 用量进度条：
     - 颜色：< 8K 灰色 / 8K-10K 绿色 / 10K-12K 黄色 / > 12K 红色
     - 文字："当前 9.2K / 12K tokens"
   - 检查点状态：
     - 上次检查点时间（相对时间："2 小时前"）
     - 运行中动画（旋转图标 + "检查点运行中..."）
   - "立即检查"按钮：
     - 检查点运行中 → disabled + 显示进度
     - 点击 → onRunCheckpoint()
   - "压缩"按钮：
     - 仅 totalTokens > 10000 时显示
     - totalTokens > 12000 → 红色警告样式
   - "撤销压缩"按钮：
     - 仅 canUndoCompression 时显示
     - 点击 → onUndoCompression()

### 步骤 3：实现 MemorySearchBar

**文件：** `src/renderer/components/memory/MemorySearchBar.tsx`

1. Props：`onSearch`、`onClear`、`isLoading`
2. 渲染内容：
   - 搜索输入框（带搜索图标）
   - 输入防抖 300ms
   - 空查询时显示全部条目
   - 搜索中显示 loading 指示器
   - 清除按钮（×）
3. 搜索结果高亮：
   - 在 MemoryEntryCard 中匹配关键词标红

### 步骤 4：实现 MemorySection

**文件：** `src/renderer/components/memory/MemorySection.tsx`

1. Props：`section`（MemorySection）、`entries`（MemoryEntry[]）
2. Section 标题映射：
   - `user_preference` → "用户偏好"
   - `technical_decision` → "技术决策"
   - `common_issue` → "常见问题"
   - `project_convention` → "项目约定"
   - `risk_note` → "风险提示"
   - `glossary` → "关键术语"
3. 条目排序：`confidence × Math.log(hits + 1)` 降序
4. 可折叠：点击标题折叠/展开
5. 条目数量 badge

### 步骤 5：实现 MemoryEntryCard

**文件：** `src/renderer/components/memory/MemoryEntryCard.tsx`

1. Props：`entry`（MemoryEntry）、`onEdit`、`onLock`、`onDelete`、`onViewHistory`、`searchQuery?`
2. 渲染内容：
   - 内容摘要（≤ 3 行，超长截断 + "展开"）
   - 搜索关键词高亮（if searchQuery）
   - 置信度进度条：
     - 宽度 = confidence × 100%
     - 颜色：≥ 0.8 绿色 / 0.5-0.8 黄色 / < 0.5 红色
     - Tooltip 显示精确数值
   - 命中次数 badge：`命中 {hits} 次`
   - 最后更新时间（相对时间）
   - 锁定图标（if locked）
   - 操作按钮组：
     - 编辑（铅笔图标）→ 弹出编辑器
     - 锁定/解锁（锁图标，切换状态）
     - 删除（垃圾桶图标）→ 弹出确认对话框
     - 查看历史（时钟图标）→ 弹出演化历史抽屉
3. 锁定条目样式：左侧边框加粗 + 浅灰背景，视觉区分

### 步骤 6：实现 MemoryEntryEditor

**文件：** `src/renderer/components/memory/MemoryEntryEditor.tsx`

1. Props：`entry`（MemoryEntry）、`onSave`、`onCancel`
2. 渲染内容：
   - 内容文本域（textarea，自动聚焦）
   - 保存按钮 + 取消按钮
   - 保存时 loading 状态
   - 保存成功/失败反馈
3. 保存逻辑：
   - 调用 `onSave(entry.id, newContent)`
   - 成功 → 关闭编辑器
   - 失败 → 显示错误消息，保留编辑器

### 步骤 7：实现 MemoryEntryHistory

**文件：** `src/renderer/components/memory/MemoryEntryHistory.tsx`

1. Props：`entryId`（string）、`events`（EvolutionEvent[]）
2. 渲染内容：
   - 时间线视图（垂直排列）
   - 每个事件节点：
     - 时间戳
     - 事件类型标签（add/merge/update/lock/manual-edit 等）
     - 变更摘要
     - before/after 对比（折叠展示）
   - 无历史记录时显示"暂无变更记录"
3. 事件类型中文映射：
   - `add` → "新增"
   - `update` → "更新"
   - `merge` → "合并"
   - `archive` → "归档"
   - `delete` → "删除"
   - `manual-edit` → "手动编辑"
   - `lock` → "锁定"
   - `unlock` → "解锁"

### 步骤 8：实现 CheckpointStatusIndicator

**文件：** `src/renderer/components/memory/CheckpointStatusIndicator.tsx`

1. Props：`isRunning`、`lastCheckpoint`
2. 渲染内容：
   - 运行中：旋转动画 + "检查点运行中..."
   - 空闲：上次检查点时间 + 下次预估时间
   - 从未运行："尚未运行检查点"

### 步骤 9：实现 MemoryPanel 主面板

**文件：** `src/renderer/components/memory/MemoryPanel.tsx`

1. 组合所有子组件：
   ```tsx
   <div className="memory-panel">
     <MemoryHeader ... />
     <MemorySearchBar ... />
     {sections.map(section => (
       <MemorySection key={section} section={section} entries={...} />
     ))}
   </div>
   ```
2. useEffect 初始化：
   - `loadEntries()` 首次加载
3. 条目筛选逻辑：
   - 无搜索查询 → 展示全部条目
   - 有搜索查询 → 仅展示 searchResults 中的条目（跨 section）
4. 空状态：
   - 无条目 → "暂无精选记忆。检查点运行后将自动提取。"
5. 编辑/删除/锁定的交互流程：
   - 编辑 → MemoryEntryEditor 弹出
   - 删除 → 确认对话框 → 确认后调用 deleteEntry
   - 锁定 → 直接调用 lockEntry（无需确认）

### 步骤 10：实现 v2 IPC Handler 完整注册

**文件：** `src/main/ipc/handlers/memory.handler.ts`（扩展）

1. 新增 v2 handler 方法：
   - `handleListEntries()` → `memoryManager.getAllEntries()`
   - `handleListArchived()` → `memoryManager.getAllArchivedEntries()`
   - `handleSearch(query, options)` → `memoryManager.search(query, options)`
   - `handleGetEntry(id)` → `memoryFileManager.load().entries.find(e => e.id === id)`
   - `handleGetStats()` → 返回 `{ totalTokens, entryCount, lastCheckpoint, sections }`
   - `handleUpdateEntry(id, content)` → 更新条目 + EvolutionLog manual-edit
   - `handleDeleteEntry(id)` → 删除条目 + Indexer.remove() + EvolutionLog
   - `handleLockEntry(id, locked)` → 更新 locked 字段 + EvolutionLog
   - `handleTriggerCheckpoint()` → 调用 CheckpointScheduler（通过 EventBus emit `memory:manual-checkpoint`）
   - `handleTriggerCompression()` → `memoryManager.compress()`
   - `handleUndoLastCompression()` → `memoryCompressor.undoLastCompression()`
   - `handleGetEvolutionHistory(entryId?)` → `evolutionLog.query({ entryId })`
   - `handleRebuildIndex()` → `memoryIndexer.rebuild()`
   - `handleGetIndexHealth()` → `memoryIndexer.verifyHealth()`
   - `handleGetConfig()` → 返回 MemoryConfig
   - `handleUpdateConfig(patch)` → 更新配置
2. 注册所有 v2 IPC 通道到 `ipcMain.handle()`
3. 注册 v2 推送事件到 `BrowserWindow.webContents.send()`
4. 构造函数新增 v2 组件依赖注入

### 步骤 11：Preload API 扩展

**文件：** `src/preload/index.ts`（扩展）

1. 在 `window.api` 中新增 memory v2 方法：
   ```typescript
   memory: {
     listEntries: () => ipcRenderer.invoke('memory:listEntries'),
     listArchived: () => ipcRenderer.invoke('memory:listArchived'),
     search: (query: string, options?: SearchOptions) => ipcRenderer.invoke('memory:search', query, options),
     getEntry: (id: string) => ipcRenderer.invoke('memory:getEntry', id),
     getStats: () => ipcRenderer.invoke('memory:getStats'),
     updateEntry: (id: string, content: string) => ipcRenderer.invoke('memory:updateEntry', id, content),
     deleteEntry: (id: string) => ipcRenderer.invoke('memory:deleteEntry', id),
     lockEntry: (id: string, locked: boolean) => ipcRenderer.invoke('memory:lockEntry', id, locked),
     triggerCheckpoint: () => ipcRenderer.invoke('memory:triggerCheckpoint'),
     triggerCompression: () => ipcRenderer.invoke('memory:triggerCompression'),
     undoLastCompression: () => ipcRenderer.invoke('memory:undoLastCompression'),
     getEvolutionHistory: (entryId?: string) => ipcRenderer.invoke('memory:getEvolutionHistory', entryId),
     rebuildIndex: () => ipcRenderer.invoke('memory:rebuildIndex'),
     getIndexHealth: () => ipcRenderer.invoke('memory:getIndexHealth'),
     getConfig: () => ipcRenderer.invoke('memory:getConfig'),
     updateConfig: (patch: Partial<MemoryConfig>) => ipcRenderer.invoke('memory:updateConfig', patch),
     // 事件监听
     onCheckpointStarted: (callback) => ipcRenderer.on('memory:checkpointStarted', callback),
     onCheckpointCompleted: (callback) => ipcRenderer.on('memory:checkpointCompleted', callback),
     onEntryAdded: (callback) => ipcRenderer.on('memory:entryAdded', callback),
     onEntryUpdated: (callback) => ipcRenderer.on('memory:entryUpdated', callback),
     onEntryDeleted: (callback) => ipcRenderer.on('memory:entryDeleted', callback),
   }
   ```
2. 保留现有 v1 memory 方法（标记 `@deprecated`）

### 步骤 12：集成到 Studio 主界面

**文件：** `src/renderer/components/studio/StudioLayout.tsx`（或相应布局组件）

1. 在侧边栏/标签页中添加"记忆"入口
2. 点击后渲染 MemoryPanel 组件
3. 图标建议：🧠 或自定义 brain icon
4. 标签文字："精选记忆"（而非"MEMORY.md"等技术术语）

### 步骤 13：编写单元测试

**文件：** `tests/renderer/memory/memoryStore.test.ts`

1. 测试 loadEntries 正确加载条目
2. 测试 searchEntries 调用 IPC 搜索
3. 测试 editEntry 更新条目内容
4. 测试 deleteEntry 移除条目
5. 测试 lockEntry 切换锁定状态
6. 测试 triggerCheckpoint 设置运行状态
7. 测试 IPC 事件监听更新 store

**文件：** `tests/renderer/memory/MemoryPanel.test.tsx`

1. 测试面板渲染 6 个 section
2. 测试条目按排序展示
3. 测试搜索框触发搜索
4. 测试编辑流程
5. 测试删除确认对话框
6. 测试锁定切换

**文件：** `tests/main/memory-handler.test.ts`

1. 测试 handleListEntries 返回条目列表
2. 测试 handleSearch 调用 MemoryIndexer
3. 测试 handleUpdateEntry 触发 EvolutionLog
4. 测试 handleTriggerCheckpoint emit 正确事件

### 步骤 14：集成验证

1. 运行 `npm run typecheck` 确保类型无误
2. 运行 `npm run lint` 确保代码规范
3. 运行 `npm run test` 确保所有测试通过
4. 端到端验证：
   - 打开记忆面板 → 查看条目列表
   - 搜索 → 验证混合检索结果
   - 编辑条目 → 保存 → 确认 EvolutionLog 记录
   - 锁定条目 → 确认锁定图标
   - 删除条目 → 确认移除
   - 触发手动检查点 → 观察运行状态
   - 触发压缩 → 观察压缩结果
   - 撤销压缩 → 确认恢复
5. 性能验证：
   - 1000 条条目加载 < 500ms
   - 搜索响应 < 300ms

---

**创建时间：** 2026-04-20
**最后更新：** 2026-04-20
