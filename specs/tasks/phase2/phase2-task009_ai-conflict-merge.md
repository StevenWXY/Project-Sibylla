# 协作冲突 AI 智能合并

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK009 |
| **任务标题** | 协作冲突 AI 智能合并 |
| **所属阶段** | Phase 2 - 智能通知与协作增强 (Sprint 5) |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

在 Sprint 2 已有的 `ConflictResolver` UI 基础上，新增"AI 建议合并"作为第四个选项。当 Git 同步检测到冲突时，后台并行调用 AI Sub-agent 生成合并建议，用户可选择采用/编辑后采用/放弃。AI 合并失败时优雅降级到原三选项，敏感文件永不送入 AI。

### 背景

Sprint 2 的 `ConflictResolver` 提供三个选项：采用我的、采用对方的、手动合并。团队成员在处理冲突时经常面临"两边都有道理"的困境：

| 问题 | 现状 | 本任务解决 |
|------|------|-----------|
| 冲突合并依赖人肉逐行决策 | 用户在三个选项之间纠结 | AI 生成第四选项作为参考 |
| 不知道对方为什么改 | 只看到内容差异，不知道意图 | AI 可结合上下文和团队约定推理 |
| 敏感文件不敢让 AI 看 | 无保护机制 | 敏感文件白名单自动降级 |
| 合并决策无审计记录 | 无记录 | merge-history.jsonl 记录每次 AI 合并 |

**核心设计约束：**

1. **不替换 ConflictResolver UI**：原三选项完全保留，AI 选项为新增第四按钮
2. **AI 合并通过 Sub-agent**：不引入新 AI 调用路径，复用 Sprint 3.5 的 `SubAgentExecutor`
3. **敏感文件白名单**：`secrets/`、`personal/`、`.env*` 永不送入 AI，直接禁用 AI 选项
4. **AI 建议非自动**：用户必须主动选择采用，遵循 CLAUDE.md "AI 建议人类决策"
5. **冲突文件不离开本地**：本地 LLM 调用或加密传输到云端 AI 网关
6. **失败优雅降级**：AI 合并失败/超时时，AI 选项禁用但不影响原三选项
7. **SyncManager 改造为追加式**：可选注入 `AppEventBus`，追加事件发布，保留原 `this.emit()`

### 范围

**包含：**

- `MergeAssistant` — AI 合并建议生成器（Sub-agent 调用 + 敏感文件检查 + 结果校验）
- `merge-curator` Sub-agent prompt
- `SyncManager` 事件桥接改造（可选注入 `AppEventBus` + `git.conflict-detected` 事件发布）
- `ConflictInfo` 接口扩展（`conflictId` + `traceId`）
- `<AIMergePanel />` — AI 合并面板 UI 组件
- `<ConflictResolver />` 改造（新增第四按钮）
- merge-history.jsonl 审计日志
- IPC handlers（sync:proposeAIMerge / sync:adoptAIMerge）
- 单元测试

**不包含：**

- 通知中心（TASK006）
- Presence 信号层（TASK007）
- AI 主动建议引擎（TASK008）
- SyncManager 核心同步逻辑修改
- GitAbstraction 修改

## 依赖关系

### 前置依赖

- [x] PHASE2-TASK001 — 事件总线（`AppEventBus` + `git.conflict-detected` 事件注册）
- [x] PHASE2-TASK006 — 通知中心（`collab-conflict` 规则消费 `git.conflict-detected` 事件）
- [x] Sprint 2 — SyncManager / ConflictResolver / ConflictInfo 接口
- [x] Sprint 3.3 — Trace 系统（Sub-agent Trace 子树关联）
- [x] Sprint 3.5 — Sub-agent 系统（`SubAgentExecutor`）
- [x] Sprint 4 — `UnifiedSearchEngine`（merge-curator 查找相关历史决策）

### 被依赖任务

- 无

## 参考文档

- [`specs/requirements/phase2/sprint5-collaboration.md`](../../requirements/phase2/sprint5-collaboration.md) — 需求 5.4（协作冲突 AI 智能合并）
- [`specs/design/architecture.md`](../../design/architecture.md) — Git 抽象层接口
- [`specs/design/sub-agent-system.md`](../../design/sub-agent-system.md) — Sub-agent 系统设计
- [`CLAUDE.md`](../../../CLAUDE.md) — AI 建议人类决策、文件即真相、Git 不可见

## 验收标准

### SyncManager 事件桥接

- [ ] `SyncManager` 构造函数可选注入 `AppEventBus`
- [ ] 冲突检测路径中追加 `git.conflict-detected` 事件发布
- [ ] 事件 payload 包含 filePath、localPreview（500 字符）、remotePreview（500 字符）、basePreview（500 字符）
- [ ] 原有 `this.emit('conflicts', ...)` 完全保留不变
- [ ] 无 `AppEventBus` 注入时（降级模式）原有逻辑不受影响

### ConflictInfo 接口扩展

- [ ] `ConflictInfo` 新增 `conflictId: string`（ULID，由 SyncManager 生成）
- [ ] `ConflictInfo` 新增 `traceId?: string`
- [ ] 原三选项逻辑（采用我的/对方的/手动合并）不受影响

### MergeAssistant

- [ ] 敏感文件白名单检查：`secrets/`、`personal/`、`.env*` 匹配时禁用 AI 选项
- [ ] 白名单可通过 `ConfigManager` 配置扩展
- [ ] 调用 `spawnSubAgent('merge-curator')` 生成合并建议，超时 5 秒
- [ ] Sub-agent 输入包含 localContent / remoteContent / baseContent + 相关上下文
- [ ] Sub-agent 输出包含 mergedContent / attribution / rationale
- [ ] AI 合并结果校验：包含 `<<<<<<<` 未解决标记时拒绝，返回 null
- [ ] 失败时返回 null（不抛异常），由上层降级处理

### AI 合并 UI

- [ ] `ConflictResolver` 在"手动合并"右侧新增"AI 建议合并"按钮
- [ ] 按钮初始为 loading 状态（AI 在后台并行生成）
- [ ] 5 秒内未返回 → 按钮显示"AI 建议生成中..."，用户可选择其他选项不等候
- [ ] AI 生成成功 → 按钮激活可点击
- [ ] AI 生成失败 → 按钮禁用，tooltip 显示"AI 建议不可用"
- [ ] 敏感文件 → 按钮禁用，tooltip 显示"敏感文件不发送给 AI"
- [ ] 点击 AI 选项后展示 `<AIMergePanel />`：
  - 合并内容预览
  - attribution 高亮（fromMine=绿色、fromTheirs=蓝色、byAI=橙色）
  - rationale 说明（引用来源包含在内）
  - 三个操作：采用 / 编辑后采用 / 放弃

### 审计日志

- [ ] 用户采用 AI 合并后，commit message 格式：`[user] AI 辅助合并 {file} (cherry-picked from 冲突 #N)`
- [ ] 审计记录追加到 `.sibylla/sync/merge-history.jsonl`
- [ ] 审计记录包含：conflictId、filePath、rationale、attribution、timestamp、userId
- [ ] Sub-agent Trace 子树通过 `parent_trace_id` 关联到 Sync 操作的 Trace

### 性能要求

- [ ] AI 合并建议生成 < 5 秒（P95）
- [ ] 敏感文件检查 < 10ms
- [ ] AI 结果校验（`<<<<<<<` 标记检测）< 5ms

### 单元测试

- [ ] MergeAssistant 敏感文件白名单测试
- [ ] MergeAssistant AI 合并调用测试（mock Sub-agent）
- [ ] MergeAssistant 结果校验测试（含/不含未解决标记）
- [ ] SyncManager 事件桥接测试
- [ ] AIMergePanel 组件渲染测试
- [ ] ConflictResolver 改造后原三选项回归测试
- [ ] 审计日志写入测试
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：SyncManager 事件桥接 + MergeAssistant Sub-agent + ConflictResolver 第四选项

```
SyncManager.pull() 检测到冲突
    │
    ├── 原有逻辑: this.emit('conflicts', [...]) (保留不变)
    │
    └── 新增: if (this.eventBus)
            eventBus.emitEvent({
              type: 'git.conflict-detected',
              payload: { conflicts: [...] }
            })
              │
              ▼
        TASK006 通知中心 (collab-conflict 规则)
    
ConflictResolver UI 弹出
    │
    ├── 原三选项: 采用我的 / 采用对方的 / 手动合并 (保留不变)
    │
    └── 新增第四选项: "AI 建议合并"
        │
        ├── ConflictResolver 打开时并行触发:
        │   IPC: sync:proposeAIMerge → MergeAssistant.propose(conflict)
        │       │
        │       ├── 敏感文件检查 (白名单)
        │       │   └── 匹配 → 返回 { status: 'sensitive' }
        │       │
        │       ├── spawnSubAgent('merge-curator', {
        │       │     localContent, remoteContent, baseContent,
        │       │     filePath, relatedContext
        │       │   })
        │       │   │
        │       │   ├── 成功 (< 5秒) → 返回 MergeResult
        │       │   ├── 超时 (> 5秒) → 返回 null (UI 显示"生成中")
        │       │   └── 失败 → 返回 null (UI 禁用按钮)
        │       │
        │       └── 结果校验: 包含 <<<<<<< → 拒绝, 返回 null
        │
        ├── 用户点击 "AI 建议合并":
        │   └── AIMergePanel 展示:
        │       ├── 合并内容 (attribution 高亮)
        │       ├── rationale 说明
        │       └── 操作: 采用 / 编辑后采用 / 放弃
        │
        └── 用户采用:
            ├── commit message: "[user] AI 辅助合并 {file}"
            ├── 审计日志 → .sibylla/sync/merge-history.jsonl
            └── Trace 子树关联 (parent_trace_id)
```

### MergeAssistant 数据流

```
MergeAssistant.propose(conflict: ExtendedConflictInfo)
    │
    ├── step 1: 敏感文件检查
    │   const isSensitive = SENSITIVE_PATTERNS.some(p => conflict.filePath.match(p))
    │   if (isSensitive) return { status: 'sensitive' }
    │
    ├── step 2: 搜索相关上下文 (可选, 增强合并质量)
    │   const relatedContext = await searchEngine.search(conflict.filePath, { limit: 3 })
    │
    ├── step 3: 调用 Sub-agent
    │   const result = await subAgentExecutor.spawnSubAgent('merge-curator', {
    │     filePath: conflict.filePath,
    │     localContent: conflict.localContent,
    │     remoteContent: conflict.remoteContent,
    │     baseContent: conflict.baseContent,
    │     relatedContext: relatedContext.map(r => r.snippet).join('\n'),
    │   }, { timeout: 5000, inheritMemory: true })
    │
    ├── step 4: 结果校验
    │   if (result.mergedContent.includes('<<<<<<<')) return null
    │
    └── step 5: 返回 MergeResult
        return {
          status: 'success',
          mergedContent: result.mergedContent,
          attribution: result.attribution,
          rationale: result.rationale,
          conflictId: conflict.conflictId,
        }
```

### Attribution 高亮方案

```
合并内容展示时，根据 attribution 标注不同颜色:

fromMine    → 绿色背景 (rgba(34,197,94,0.15))
fromTheirs  → 蓝色背景 (rgba(59,130,246,0.15))
byAI        → 橙色背景 (rgba(249,115,22,0.15))

Sub-agent 输出格式:
{
  mergedContent: "...",
  attribution: {
    fromMine: [[startLine, endLine], ...],
    fromTheirs: [[startLine, endLine], ...],
    byAI: [[startLine, endLine], ...],
  },
  rationale: "保留了本地的新增段落(L5-8), 采用了远程的修复(L12-15), AI 整合了..."
}
```

### 敏感文件白名单

```
默认白名单 (正则匹配):
  /^secrets\//       → secrets/ 目录下所有文件
  /^personal\//      → 个人空间
  /^\.env/           → .env 文件
  /\.key$/           → 密钥文件
  /\.pem$/           → 证书文件
  /\.p12$/           → PKCS12 证书

可通过 ConfigManager 扩展:
  .sibylla/config.json → { "sensitiveFilePatterns": ["^private/", "\\.cred$"] }
```

## 技术执行路径

### 步骤 1：扩展 ConflictInfo 接口与 SyncManager 事件桥接

**文件：** `src/main/services/sync/types.ts`（修改 Sprint 2 文件）

1. 扩展 `ConflictInfo` 接口：
   ```typescript
   interface ConflictInfo {
     filePath: string
     localContent: string
     remoteContent: string
     baseContent: string
     conflictId: string     // 新增: ULID
     traceId?: string       // 新增: 审计关联
   }
   ```
2. 定义 `ExtendedConflictInfo`（本任务新增类型，不修改原有 ConflictInfo 引用点）：
   ```typescript
   interface ExtendedConflictInfo extends ConflictInfo {
     conflictId: string
     traceId?: string
   }
   ```
3. 定义 `MergeResult` 接口：
   ```typescript
   type MergeResultStatus = 'success' | 'sensitive' | 'failed' | 'timeout'
   
   interface MergeResult {
     status: MergeResultStatus
     mergedContent?: string
     attribution?: {
       fromMine: [number, number][]
       fromTheirs: [number, number][]
       byAI: [number, number][]
     }
     rationale?: string
     conflictId?: string
   }
   ```

**文件：** `src/main/services/sync/sync-manager.ts`（修改 Sprint 2 文件）

4. 在 `SyncManager` 构造函数中新增可选参数 `eventBus?: AppEventBus`：
   ```typescript
   constructor(
     private git: GitAbstraction,
     private configManager: ConfigManager,
     private eventBus?: AppEventBus,  // 新增可选注入
   )
   ```
5. 在冲突检测路径 `handleConflict()` 方法中追加事件发布（不替换原有逻辑）：
   ```typescript
   // 追加在 this.emit('conflicts', ...) 之后
   if (this.eventBus) {
     const conflictsWithId = pullResult.conflicts.map(c => ({
       ...c,
       conflictId: c.conflictId ?? generateUlid(),  // 确保 conflictId 存在
     }))
     this.eventBus.emitEvent({
       type: 'git.conflict-detected',
       source: 'sync-manager',
       payload: {
         conflicts: conflictsWithId.map(c => ({
           filePath: c.filePath,
           conflictId: c.conflictId,
           localPreview: c.localContent?.slice(0, 500),
           remotePreview: c.remoteContent?.slice(0, 500),
           basePreview: c.baseContent?.slice(0, 500),
         }))
       }
     })
   }
   ```
6. 确保 `conflictId` 在冲突检测时就生成（ULID），传递给 ConflictResolver

**验证：** ConflictInfo 接口扩展向后兼容、SyncManager 事件发布正确、无 eventBus 时不报错。

### 步骤 2：实现 MergeAssistant

**文件：** `src/main/services/sync/merge-assistant.ts`（新建）

1. 定义 `MergeAssistant` 类，构造函数注入：
   - `SubAgentExecutor`（Sprint 3.5）
   - `UnifiedSearchEngine`（Sprint 4）
   - `ConfigManager`（获取敏感文件白名单）
   - `Tracer`（Sprint 3.3，可选）
2. 定义敏感文件默认白名单常量：
   ```typescript
   const DEFAULT_SENSITIVE_PATTERNS: RegExp[] = [
     /^secrets\//,
     /^personal\//,
     /^\.env/,
     /\.key$/,
     /\.pem$/,
     /\.p12$/,
   ]
   ```
3. 实现 `isSensitiveFile(filePath: string): boolean` 方法：
   - 合并默认白名单 + ConfigManager 中的自定义模式
   - 遍历所有模式，任一匹配 → return true
   - 不匹配 → return false
4. 实现 `propose(conflict: ExtendedConflictInfo): Promise<MergeResult>` 方法：
   - step 1: 敏感文件检查
     ```typescript
     if (this.isSensitiveFile(conflict.filePath)) {
       return { status: 'sensitive' }
     }
     ```
   - step 2: 搜索相关上下文（增强合并质量）
     ```typescript
     let relatedContext = ''
     try {
       const results = await this.searchEngine.search(conflict.filePath, { limit: 3 })
       relatedContext = results.map(r => r.snippet).join('\n')
     } catch {
       // 搜索失败不影响合并
     }
     ```
   - step 3: 调用 Sub-agent
     ```typescript
     try {
       const result = await this.subAgentExecutor.spawnSubAgent('merge-curator', {
         filePath: conflict.filePath,
         localContent: conflict.localContent,
         remoteContent: conflict.remoteContent,
         baseContent: conflict.baseContent,
         relatedContext,
       }, {
         timeout: 5000,
         inheritMemory: true,
         parentTraceId: conflict.traceId,
       })
       // step 4: 结果校验
       if (result.mergedContent.includes('<<<<<<<') ||
           result.mergedContent.includes('======') ||
           result.mergedContent.includes('>>>>>>>')) {
         return { status: 'failed', conflictId: conflict.conflictId }
       }
       return {
         status: 'success',
         mergedContent: result.mergedContent,
         attribution: result.attribution,
         rationale: result.rationale,
         conflictId: conflict.conflictId,
       }
     } catch (err) {
       if (err.name === 'TimeoutError') {
         return { status: 'timeout', conflictId: conflict.conflictId }
       }
       return { status: 'failed', conflictId: conflict.conflictId }
     }
     ```
5. 实现 `adoptMerge(conflictId: string, mergedContent: string, attribution: Attribution, rationale: string, userId: string): void` 方法：
   - 写入审计日志 `.sibylla/sync/merge-history.jsonl`：
     ```typescript
     const entry = {
       conflictId,
       filePath: conflict.filePath,
       mergedContent,
       attribution,
       rationale,
       adoptedBy: userId,
       adoptedAt: Date.now(),
     }
     appendJsonl('.sibylla/sync/merge-history.jsonl', entry)
     ```
   - 注意：实际 commit 由 ConflictResolver 调用 GitAbstraction 完成，此方法仅记录审计

**验证：** 敏感文件检查正确、Sub-agent 调用正确、结果校验正确、审计日志正确。

### 步骤 3：实现 merge-curator Sub-agent Prompt

**文件：** `resources/prompts/agents/merge-curator.md`（新建）

1. 编写 Sub-agent prompt 文件：
   ```markdown
   ---
   name: merge-curator
   description: 为 Git 冲突生成 AI 合并建议
   inherit_memory: true
   allowed_tools:
     - reference_file
     - unified_search
   output_schema:
     type: object
     properties:
       mergedContent:
         type: string
         description: 合并后的完整文件内容
       attribution:
         type: object
         properties:
           fromMine:
             type: array
             items: { type: array, items: { type: number } }
           fromTheirs:
             type: array
             items: { type: array, items: { type: number } }
           byAI:
             type: array
             items: { type: array, items: { type: number } }
         required: [fromMine, fromTheirs, byAI]
       rationale:
         type: string
         description: 合并决策的简要说明
     required: [mergedContent, attribution, rationale]
   ---
   
   你是 Sibylla 的冲突合并助手。两名团队成员同时修改了同一个文件，产生了 Git 冲突。你需要生成一个合理的合并版本。
   
   ## 输入
   - filePath: 冲突文件路径
   - localContent: 本地版本（用户的修改）
   - remoteContent: 远程版本（队友的修改）
   - baseContent: 共同祖先版本
   - relatedContext: 相关上下文（可选，来自搜索结果）
   
   ## 合并原则
   1. 优先保留双方的实质性修改，不丢弃任何一方的有效工作
   2. 若双方修改了同一段落，尝试整合两者意图
   3. 无法判断时保留远程版本（因为远程已提交，本地是后提交者）
   4. 保持文档结构和格式一致性
   5. 如果搜索结果中有相关历史决策，作为参考依据
   
   ## Attribution 标注
   为合并内容的每一段标注来源:
   - fromMine: 来自本地版本的行号范围 [startLine, endLine]
   - fromTheirs: 来自远程版本的行号范围
   - byAI: AI 整合/新增的行号范围
   
   ## rationale 格式
   用 2-3 句话说明合并策略：保留了什么、修改了什么、为什么这样决定。
   引用搜索结果时标注来源。
   
   ## 输出
   输出结构化 JSON（遵循 output_schema）。mergedContent 必须是完整的文件内容（不能包含 <<<<<<< 或 >>>>>>> 标记）。
   ```

**验证：** prompt 格式符合 Sprint 3.5 规范、output_schema 正确、合并原则清晰。

### 步骤 4：实现 IPC Handlers

**文件：** `src/main/ipc/handlers/sync.ts`（修改或新建，追加到现有 sync handler）

1. 注册 AI 合并相关 IPC handlers：

   **`sync:proposeAIMerge`**：
   - 参数：`{ conflict: ExtendedConflictInfo }`
   - 实现：调用 `mergeAssistant.propose(conflict)`
   - 返回：`MergeResult`
   - 注意：此调用可能耗时 5 秒，使用 `invoke`（非 fire-and-forget）

   **`sync:adoptAIMerge`**：
   - 参数：`{ conflictId: string; mergedContent: string; attribution: Attribution; rationale: string }`
   - 实现：
     - 调用 `mergeAssistant.adoptMerge(...)` 写入审计日志
     - 调用 `gitAbstraction.resolveConflict(filePath, mergedContent)` 执行合并
     - commit message：`[user] AI 辅助合并 {filePath} (cherry-picked from 冲突 #{conflictId.slice(0,8)})`
   - 返回：`{ success: boolean }`

**文件：** `src/shared/types.ts`（扩展）

2. 在 `IPC_CHANNELS` 中追加：
   ```typescript
   SYNC_PROPOSE_AI_MERGE: 'sync:proposeAIMerge',
   SYNC_ADOPT_AI_MERGE: 'sync:adoptAIMerge',
   ```

**文件：** `src/preload/index.ts`（扩展）

3. 在 `sync` 命名空间中追加：
   ```typescript
   sync: {
     // ... 已有通道
     proposeAIMerge: (conflict) => ipcRenderer.invoke('sync:proposeAIMerge', { conflict }),
     adoptAIMerge: (params) => ipcRenderer.invoke('sync:adoptAIMerge', params),
   },
   ```

**验证：** IPC 通道注册正确、proposeAIMerge 返回 MergeResult、adoptAIMerge 执行合并并写审计。

### 步骤 5：实现 AIMergePanel 与 ConflictResolver 改造

**文件：** `src/renderer/components/sync/AIMergePanel.tsx`（新建）

1. AI 合并面板组件（嵌入到 ConflictResolver 右侧）：
   - Props：
     ```typescript
     interface AIMergePanelProps {
       mergeResult: MergeResult
       onAdopt: (mergedContent: string) => void
       onEditAndAdopt: (mergedContent: string) => void
       onDiscard: () => void
     }
     ```
2. 面板内容布局：
   - 顶部标题："AI 建议合并"
   - attribution 图例：
     - 绿色方块 + "你的修改"
     - 蓝色方块 + "对方修改"
     - 橙色方块 + "AI 整合"
   - 合并内容预览区域：
     - 使用代码编辑器或 pre 格式展示 mergedContent
     - 根据 attribution 标注对每行应用对应背景色
     - 行号显示
   - rationale 说明区域：
     - AI 的合并策略说明
     - 引用来源（若有）
   - 底部操作按钮：
     - [采用此方案] → onAdopt(mergedContent)
     - [编辑后采用] → onEditAndAdopt(mergedContent)（打开编辑器）
     - [放弃] → onDiscard()
3. attribution 高亮渲染逻辑：
   ```typescript
   function getLineBackground(lineNumber: number, attribution: Attribution): string {
     if (isInRange(lineNumber, attribution.fromMine)) return 'bg-green-100 dark:bg-green-900/30'
     if (isInRange(lineNumber, attribution.fromTheirs)) return 'bg-blue-100 dark:bg-blue-900/30'
     if (isInRange(lineNumber, attribution.byAI)) return 'bg-orange-100 dark:bg-orange-900/30'
     return ''
   }
   ```

**文件：** `src/renderer/components/sync/ConflictResolver.tsx`（修改 Sprint 2 文件）

4. 在 ConflictResolver 中追加 AI 选项按钮：
   - 状态管理：
     ```typescript
     const [mergeResult, setMergeResult] = useState<MergeResult | null>(null)
     const [aiStatus, setAiStatus] = useState<'loading' | 'ready' | 'failed' | 'sensitive' | 'timeout'>('loading')
     const [showAIMergePanel, setShowAIMergePanel] = useState(false)
     ```
   - ConflictResolver 打开时，并行触发 AI 合并：
     ```typescript
     useEffect(() => {
       if (!conflict) return
       window.electronAPI.sync.proposeAIMerge(conflict).then(result => {
         setMergeResult(result)
         setAiStatus(result.status === 'success' ? 'ready' : result.status)
       }).catch(() => {
         setAiStatus('failed')
       })
     }, [conflict])
     ```
   - 第四按钮渲染：
     ```typescript
     <button
       disabled={aiStatus !== 'ready'}
       onClick={() => setShowAIMergePanel(true)}
       title={
         aiStatus === 'sensitive' ? '敏感文件不发送给 AI' :
         aiStatus === 'failed' ? 'AI 建议不可用' :
         aiStatus === 'loading' ? 'AI 建议生成中...' :
         aiStatus === 'timeout' ? 'AI 建议生成中...' :
         '查看 AI 合并建议'
       }
     >
       🤖 AI 建议合并
       {aiStatus === 'loading' && <Spinner />}
     </button>
     ```
   - AI 面板展开逻辑：
     ```typescript
     {showAIMergePanel && mergeResult?.status === 'success' && (
       <AIMergePanel
         mergeResult={mergeResult}
         onAdopt={handleAdoptAIMerge}
         onEditAndAdopt={handleEditAndAdopt}
         onDiscard={() => setShowAIMergePanel(false)}
       />
     )}
     ```
   - 采用 AI 合并处理：
     ```typescript
     async function handleAdoptAIMerge(mergedContent: string) {
       await window.electronAPI.sync.adoptAIMerge({
         conflictId: conflict.conflictId,
         mergedContent,
         attribution: mergeResult.attribution,
         rationale: mergeResult.rationale,
       })
       onClose() // 关闭 ConflictResolver
     }
     ```
5. 原"采用我的/对方的/手动合并"逻辑完全保留，不修改任何现有分支

**验证：** AI 按钮状态正确切换、敏感文件禁用正确、面板展示正确、采用流程正确、原三选项不受影响。

### 步骤 6：集成测试与验证

1. **MergeAssistant 端到端测试：**
   - 普通文件冲突 → AI 合并成功
   - 敏感文件冲突 → 返回 `{ status: 'sensitive' }`
   - Sub-agent 超时 → 返回 `{ status: 'timeout' }`
   - Sub-agent 返回含 `<<<<<<<` → 返回 `{ status: 'failed' }`

2. **SyncManager 事件桥接测试：**
   - 有 AppEventBus 注入 → 正确发射 `git.conflict-detected`
   - 无 AppEventBus 注入 → 不报错，原有逻辑正常
   - conflictId 正确生成（ULID）

3. **ConflictResolver UI 回归测试：**
   - 原三选项（采用我的/对方的/手动合并）功能不变
   - AI 按钮 loading → ready → click → 面板展示 → 采用/放弃 流程正确
   - 敏感文件场景 AI 按钮禁用 + tooltip 正确

4. **审计日志测试：**
   - 采用 AI 合并后 merge-history.jsonl 正确追加
   - commit message 格式正确

5. **与已有模块集成验证：**
   - Sprint 4 AppEventBus：`git.conflict-detected` 事件正确发射
   - Sprint 3.5 Sub-agent：merge-curator 调用参数正确
   - Sprint 3.3 Trace：Sub-agent Trace 子树通过 parent_trace_id 关联
   - TASK006 通知中心：`collab-conflict` 规则消费 `git.conflict-detected` 事件

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| SyncManager | `src/main/services/sync/sync-manager.ts` | 可选注入 AppEventBus + 追加事件发布 |
| ConflictInfo | `src/main/services/sync/types.ts` | 扩展 conflictId + traceId 字段 |
| ConflictResolver | `src/renderer/components/sync/ConflictResolver.tsx` | 追加第四按钮 + AIMergePanel |
| GitAbstraction | `src/main/services/git/git-abstraction.ts` | 不修改，调用 resolveConflict() |
| SubAgentExecutor | `src/main/services/ai/sub-agent-executor.ts` | 调用 spawnSubAgent |
| UnifiedSearchEngine | `src/main/services/search/unified-search-engine.ts` | 不修改，搜索相关上下文 |
| AppEventBus | `src/main/services/event-bus/` | 发射 git.conflict-detected 事件 |
| Tracer | `src/main/services/trace/tracer.ts` | Sub-agent Trace 关联 |

## 新增文件清单

| 模块 | 文件路径 | 说明 |
|------|---------|------|
| 合并助手 | `src/main/services/sync/merge-assistant.ts` | AI 合并建议生成器 |
| Sub-agent | `resources/prompts/agents/merge-curator.md` | 冲突合并 AI prompt |
| AI 面板 | `src/renderer/components/sync/AIMergePanel.tsx` | AI 合并面板 UI |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/services/sync/types.ts` | 扩展 | ConflictInfo 追加 conflictId + traceId |
| `src/main/services/sync/sync-manager.ts` | 扩展 | 可选注入 AppEventBus + 冲突事件发布 |
| `src/renderer/components/sync/ConflictResolver.tsx` | 扩展 | 追加第四按钮 + AIMergePanel |
| `src/shared/types.ts` | 扩展 | IPC_CHANNELS 追加 2 个通道常量 |
| `src/preload/index.ts` | 扩展 | sync 命名空间追加 2 个方法 |

**不修改的文件：**

- `src/main/services/git/git-abstraction.ts` — 不修改 Git 抽象层
- `src/main/services/ai/sub-agent-executor.ts` — 不修改 Sub-agent 执行器
- `src/main/services/search/unified-search-engine.ts` — 不修改搜索引擎

---

**创建时间：** 2026-04-30
**最后更新：** 2026-04-30
**更新记录：**
- 2026-04-30 — 创建任务文档（含完整技术执行路径 6 步）
