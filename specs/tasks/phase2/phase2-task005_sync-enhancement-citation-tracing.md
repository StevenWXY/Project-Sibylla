# 多端同步增强与跨源引用追溯

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK005 |
| **任务标题** | 多端同步增强与跨源引用追溯 |
| **所属阶段** | Phase 2 - 跨源数据统一与上下文引擎 v2 (Sprint 4) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

扩展工作区多端同步范围（覆盖 Plans、Agents、加密 MEMORY.md），并实现 AI 响应中跨源引用的统一渲染与可点击跳转。用户在公司设备上创建的 Plan、整理的记忆、执行中的任务状态，回到家后都能在另一台设备上无缝续传。AI 回答中的 `[file:docs/auth.md]`、`[mcp:github:issue/234]` 等引用，点击即可跳转到原始数据源。

### 背景

Sprint 2 的 `SyncManager` 实现了工作区 Git 同步，覆盖用户文档。但 `.sibylla/` 子目录中的核心数据尚未纳入同步：
- `.sibylla/plans/` — Plan 产物（未同步）
- `.sibylla/agents/` — 任务状态（未同步）
- `.sibylla/memory/MEMORY.md` — 精选记忆（在 .gitignore 中，含敏感信息）

Sprint 3-3.6 的 AI 对话会在回答中引用多种数据源（本地文件、记忆、MCP、Handbook），但引用仅为纯文本，用户无法点击跳转。

**核心设计约束：**

1. **不修改 SyncManager**：新增 `MemorySyncManager` 和 `TaskStateMachineSync` 作为 hooks，在 SyncManager 的 push/pull 前后触发
2. **加密同步 opt-in**：MEMORY.md 含敏感信息，用户需主动启用并设置密码后才加密同步
3. **AES-256-GCM 加密**：密钥由用户密码通过 scrypt 派生，密钥永不离开本地
4. **引用格式统一**：`[source:identifier]` 格式，6 种引用类型各有跳转逻辑
5. **同步分层**：核心数据（plans/agents）默认同步；个人偏好（MEMORY）可选同步；本地缓存（trace/events/index）永不同步
6. **降级优雅**：加密密钥丢失时 MEMORY.md 标记为"未解锁"，继续使用空记忆

### 范围

**包含：**

- `.gitignore` 规则更新（排除 trace/events/index/mcp/snapshots/handbook-local）
- `MemorySyncManager` — MEMORY.md 加密同步（beforePush/afterPull）
- `TaskStateMachineSync` — 任务状态多端续传
- `.sibylla/plans/` 和 `.sibylla/agents/` 纳入 Git 追踪
- 加密同步设置 UI（启用/禁用/设置密码）
- "未解锁"状态 UI 提示
- trace 意外同步检测与警告
- 引用格式解析器（`[source:identifier]` → 结构化引用）
- 引用渲染组件（6 种类型各有样式和跳转）
- 损坏引用检测与替代搜索建议
- 引用 tooltip（记忆条目显示 confidence、MCP 显示 provider 图标）
- 对话导出保留引用链接
- IPC handler
- 单元测试

**不包含：**

- `SyncManager` 本身的修改（Sprint 2）
- `AutoSaveManager` 的修改（Sprint 2）
- AI 对话核心逻辑的修改（Sprint 3）
- `ContextEngine` 的修改（TASK003）

## 依赖关系

### 前置依赖

- [x] PHASE2-TASK001 — 事件总线基础设施扩展（消费 `git.pull-completed` 等事件）
- [x] PHASE2-TASK002 — 跨源统一搜索引擎与搜索 UI（引用跳转依赖 search navigation 数据结构）
- [x] PHASE1-TASK005 — 自动保存与隐式提交（`SyncManager` + `AutoSaveManager` 基础）
- [x] PHASE1-TASK006 — 自动同步 Push/Pull（push/pull 流程）
- [x] PHASE1-TASK021 — 状态机追踪器（`TaskStateMachine` 来源）
- [x] PHASE1-TASK011 — AI 对话流式响应（AI 回答中的引用渲染）

### 被依赖任务

- 无（本任务是 Sprint 4 同步线的终点）

## 参考文档

- [`specs/requirements/phase2/sprint4-semantic-search.md`](../../requirements/phase2/sprint4-semantic-search.md) — 需求 4.8 + 4.9
- [`specs/requirements/phase1/sprint2-git-sync.md`](../../requirements/phase1/sprint2-git-sync.md) — SyncManager 设计
- [`specs/requirements/phase1/sprint3.1-harness-infrastructure.md`](../../requirements/phase1/sprint3.1-harness-infrastructure.md) — TaskStateMachine
- [`specs/requirements/phase1/sprint3.2-memory.md`](../../requirements/phase1/sprint3.2-memory.md) — MEMORY.md 格式
- [`specs/design/architecture.md`](../../design/architecture.md) — Git 抽象层架构
- [`CLAUDE.md`](../../../CLAUDE.md) — 文件即真相、本地优先、安全红线

## 验收标准

### .gitignore 规则与同步范围

- [ ] `.sibylla/trace/` 在 .gitignore 中（不同步）
- [ ] `.sibylla/events/` 在 .gitignore 中（不同步）
- [ ] `.sibylla/index/` 在 .gitignore 中（不同步）
- [ ] `.sibylla/mcp/` 在 .gitignore 中（不同步）
- [ ] `.sibylla/snapshots/` 在 .gitignore 中（不同步）
- [ ] `.sibylla/handbook-local/` 在 .gitignore 中（不同步）
- [ ] `.sibylla/plans/` 不在 .gitignore 中（默认同步）
- [ ] `.sibylla/agents/` 不在 .gitignore 中（默认同步）

### Plans 和 Agents 同步

- [ ] `SyncManager.push()` 时自动包含 `.sibylla/plans/` 目录
- [ ] `SyncManager.push()` 时自动包含 `.sibylla/agents/` 目录
- [ ] `SyncManager.pull()` 后 `.sibylla/plans/` 和 `.sibylla/agents/` 正确同步

### MEMORY.md 加密同步

- [ ] 用户未启用"记忆同步"时，MEMORY.md 保持 .gitignore 状态，不同步
- [ ] 用户启用"记忆同步"并设置密码后，push 前自动加密 MEMORY.md
- [ ] 加密后的文件写入 `.sibylla/memory/MEMORY.encrypted`（base64 编码）
- [ ] 本地 `.sibylla/memory/MEMORY.md` 始终保持明文（不受同步影响）
- [ ] pull 后检测到 `.sibylla/memory/MEMORY.encrypted` 时自动解密
- [ ] 解密成功后覆盖本地 MEMORY.md（原子写入）
- [ ] 密钥丢失或错误时标记 MEMORY.md 为"未解锁"，继续使用空记忆
- [ ] 加密算法使用 AES-256-GCM，密钥由 scrypt 从用户密码派生
- [ ] 密钥永不离开本地设备

### 任务状态多端续传

- [ ] `agents/{taskId}/state.json` 从远端同步后验证 JSON 结构合法性
- [ ] 远端任务状态与本地冲突时，使用 last-write-wins（比较 `updatedAt`）
- [ ] 检测到跨设备可续传任务时，发布 `task.cross-device-resumeable` 事件
- [ ] 跨设备续传任务的 `lastSessionId` 与当前 session 不同

### Trace 意外同步检测

- [ ] 检测到 `.sibylla/trace/` 在远端存在时，输出警告日志
- [ ] 弹出提示"检测到 trace 数据被同步，建议添加到 .gitignore"
- [ ] 用户确认后自动更新 .gitignore 并删除远端 trace 数据

### 加密同步设置 UI

- [ ] 设置面板新增"记忆同步"开关（默认关闭）
- [ ] 启用时要求设置加密密码（输入两次确认）
- [ ] 禁用时提示"已同步的加密数据将保留在远端"
- [ ] "未解锁"状态在记忆面板显示提示条

### 引用格式解析

- [ ] `[file:docs/auth-design.md]` 解析为 `{ kind: 'file', path: 'docs/auth-design.md' }`
- [ ] `[file:docs/auth.md#L42]` 解析为 `{ kind: 'file', path: 'docs/auth.md', line: 42 }`
- [ ] `[memory:dec-001]` 解析为 `{ kind: 'memory', entryId: 'dec-001' }`
- [ ] `[handbook:modes/plan]` 解析为 `{ kind: 'handbook', entryId: 'modes/plan' }`
- [ ] `[mcp:github:issue/234]` 解析为 `{ kind: 'mcp', provider: 'github', ref: 'issue/234' }`
- [ ] `[plan:plan-20260418-103000]` 解析为 `{ kind: 'plan', planId: 'plan-20260418-103000' }`

### 引用渲染

- [ ] 6 种引用类型在 AI 回答中渲染为可点击链接，各有图标和颜色
- [ ] 本地文件引用 → 蓝色文件图标，点击在编辑器中打开
- [ ] 记忆条目引用 → 紫色脑图标，tooltip 显示 confidence score
- [ ] MCP 引用 → 提供商图标（GitHub/Slack/Notion），点击打开本地副本 + "查看原文"链接
- [ ] Handbook 引用 → 绿色书图标，点击打开 Handbook viewer
- [ ] Plan 引用 → 橙色图标，点击打开 Plan 面板

### 损坏引用处理

- [ ] 引用目标不存在时渲染为黄色警告样式
- [ ] tooltip 显示"目标不存在"
- [ ] 提供替代搜索建议："在全局搜索中查找相似内容"

### 对话导出保留引用

- [ ] 导出 Markdown 格式时引用保持 `[source:identifier]` 原始格式
- [ ] 导出 HTML 格式时引用渲染为 `<a href>` 可点击链接

### 单元测试

- [ ] `MemorySyncManager.beforePush()` 加密流程测试
- [ ] `MemorySyncManager.afterPull()` 解密流程测试
- [ ] 解密失败 graceful degradation 测试
- [ ] `TaskStateMachineSync` pull 后检测可续传任务测试
- [ ] `.gitignore` 规则更新测试
- [ ] trace 意外同步检测测试
- [ ] 引用格式解析测试（6 种类型 + 边界情况）
- [ ] 损坏引用检测测试
- [ ] 引用渲染组件测试
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：SyncManager Hooks + 引用渲染器

```
同步增强架构:
    SyncManager (Sprint 2，不修改)
        │
        ├── beforePush() hooks:
        │   └── MemorySyncManager.beforePush()
        │       └── 若启用记忆同步 → 加密 MEMORY.md → 写入 MEMORY.encrypted
        │
        ├── push() 正常流程
        │   └── plans/ + agents/ 已在 .gitignore 之外，自动被 Git 追踪
        │
        └── afterPull() hooks:
            ├── MemorySyncManager.afterPull()
            │   └── 若启用记忆同步 → 解密 MEMORY.encrypted → 写入 MEMORY.md
            └── TaskStateMachineSync.onPullCompleted()
                └── 扫描 agents/ 目录 → 检测跨设备可续传任务

引用渲染架构:
    AI 回答流式响应 (Sprint 3)
        │
        ├── 文本内容到达渲染进程
        │
        └── CitationRenderer 组件:
            ├── 正则扫描: /\[(file|memory|handbook|mcp|plan):[^\]]+\]/g
            ├── 解析为结构化引用 { kind, path?, entryId?, provider?, ref? }
            ├── 验证引用目标是否存在（IPC 调用）
            ├── 渲染为带图标的可点击链接
            └── 损坏引用 → 黄色警告 + 搜索建议
```

### MEMORY.md 加密同步流程

```
启用记忆同步 (用户 opt-in):
    │
    ├── 用户设置密码 → scrypt(password, workspaceId, 32) → 256-bit key
    │   └── 密钥仅存内存，不持久化到磁盘
    │
    ├── beforePush():
    │   ├── 读取 .sibylla/memory/MEMORY.md（明文）
    │   ├── AES-256-GCM 加密（key + random IV）
    │   ├── 写入 .sibylla/memory/MEMORY.encrypted（base64 编码）
    │   ├── 更新 .gitignore: 移除 MEMORY.md，保留 MEMORY.encrypted
    │   └── MEMORY.encrypted 被 Git 追踪并推送
    │
    ├── afterPull():
    │   ├── 检测 .sibylla/memory/MEMORY.encrypted 是否存在
    │   ├── 读取并 base64 解码
    │   ├── AES-256-GCM 解密（key + IV from ciphertext）
    │   ├── 原子写入 .sibylla/memory/MEMORY.md
    │   └── 解密失败 → 标记"未解锁" + 发布 memory.sync-locked 事件
    │
    └── 密钥丢失（用户忘记密码）:
        ├── 解密失败 → MemoryManager 使用空 MEMORY.md
        └── UI 提示"记忆已锁定，请输入密码解锁或使用空记忆"
```

### 引用格式解析与渲染

```
AI 回答文本:
    "根据记忆中的记录，团队选择了 JWT（[memory:dec-001]），
     参考 [file:docs/auth-design.md#L42] 和 GitHub Issue
     [mcp:github:issue/234] 中的讨论。"

正则扫描 → 结构化引用:
    [memory:dec-001]        → { kind: 'memory', entryId: 'dec-001' }
    [file:docs/auth-des...] → { kind: 'file', path: 'docs/auth-design.md', line: 42 }
    [mcp:github:issue/234]  → { kind: 'mcp', provider: 'github', ref: 'issue/234' }

渲染结果:
    "根据记忆中的记录，团队选择了 JWT（🧠 dec-001[紫色链接]），
     参考 📄 auth-design.md[蓝色链接] 和 GitHub Issue
     🔌 #234[绿色链接] 中的讨论。"

点击行为:
    🧠 dec-001     → 聚焦记忆面板到该条目
    📄 auth-design  → 编辑器打开文件跳转到第 42 行
    🔌 #234        → 编辑器打开本地副本 + "在 GitHub 查看"外链
```

### 任务状态多端续传

```
设备 A: TaskStateMachine 写入 state.json
    │
    ├── Git push → state.json 同步到远端
    │
    ▼ 设备 B
Git pull → state.json 到达本地
    │
    ▼ TaskStateMachineSync
    ├── 扫描 agents/ 目录下所有 state.json
    ├── 解析 JSON → 验证结构合法性
    ├── 比较 updatedAt → last-write-wins 冲突解决
    ├── 检测 lastSessionId !== currentSessionId
    └── 发布 task.cross-device-resumeable 事件
        └── UI 显示"检测到其他设备上的未完成任务"
```

### 同步分层策略

```
核心数据（默认同步）:
    ├── 用户文档 (*.md, *.csv 等)
    ├── .sibylla/plans/          ← Plan 产物
    ├── .sibylla/agents/         ← 任务状态
    └── .sibylla/handbook/       ← 用户克隆版 Handbook

个人偏好（可选同步）:
    └── .sibylla/memory/MEMORY.md  ← 加密后同步（opt-in）

本地缓存（永不同步）:
    ├── .sibylla/trace/         ← Trace 数据（设备独立）
    ├── .sibylla/events/        ← 事件日志（设备独立）
    ├── .sibylla/index/         ← 搜索索引（可重建）
    ├── .sibylla/mcp/           ← MCP 配置（设备独立）
    ├── .sibylla/snapshots/     ← 快照（可重建）
    └── .sibylla/handbook-local/ ← 本地 Handbook 缓存
```

### 依赖库选型

| 用途 | 库 | 说明 |
|------|-----|------|
| 加密 | Node.js `crypto`（内置） | AES-256-GCM 加密/解密 |
| 密钥派生 | Node.js `crypto.scryptSync`（内置） | scrypt 密码 → 256-bit key |
| 引用解析 | 内置 `RegExp` | `/\[(file|memory|handbook|mcp|plan):[^\]]+\]/g` |
| 设置 UI | TailwindCSS（已有） | 开关和密码输入 |

## 技术执行路径

### 步骤 1：更新 .gitignore 规则与同步范围

**文件：** workspace `.gitignore`（修改）

1. 新增排除规则：
   ```
   .sibylla/trace/
   .sibylla/events/
   .sibylla/index/
   .sibylla/mcp/
   .sibylla/snapshots/
   .sibylla/handbook-local/
   ```

2. 确认以下目录**不在** .gitignore 中：
   - `.sibylla/plans/`
   - `.sibylla/agents/`
   - `.sibylla/handbook/`

**文件：** `src/main/services/sync/sync-config.ts`（新建）

3. 定义同步分层配置：
   ```typescript
   export const SYNC_ALWAYS_EXCLUDE = [
     '.sibylla/trace/', '.sibylla/events/', '.sibylla/index/',
     '.sibylla/mcp/', '.sibylla/snapshots/', '.sibylla/handbook-local/',
   ]
   export const SYNC_ALWAYS_INCLUDE = ['.sibylla/plans/', '.sibylla/agents/']
   ```

4. 实现 `ensureGitignoreRules(workspaceRoot: string)` 函数：
   - 读取现有 .gitignore
   - 检查是否包含所有 SYNC_ALWAYS_EXCLUDE 条目
   - 缺失的条目追加到 .gitignore 末尾

5. 实现 `detectStaleSyncedPaths(workspaceRoot: string): string[]` 函数：
   - 检测远端是否存在 `.sibylla/trace/` 等不应同步的目录
   - 返回需要清理的路径列表

**验证：** .gitignore 更新正确；不应同步的目录被排除

### 步骤 2：实现加密工具模块

**文件：** `src/main/services/sync/encryption.ts`（新建）

1. 实现 `deriveKeyFromPassword(password: string, salt: string): Buffer` 函数：
   - 使用 `crypto.scryptSync(password, salt, 32)` 派生 256-bit 密钥
   - salt 使用 workspaceId（确保每个 workspace 密钥唯一）

2. 实现 `encrypt(plaintext: string, key: Buffer): string` 函数：
   - 生成随机 12-byte IV（`crypto.randomBytes(12)`）
   - AES-256-GCM 加密：`crypto.createCipheriv('aes-256-gcm', key, iv)`
   - 输出格式：`iv.toString('hex') + ':' + cipher.toString('hex') + ':' + authTag.toString('hex')`
   - 返回 base64 编码的完整密文

3. 实现 `decrypt(ciphertext: string, key: Buffer): string` 函数：
   - base64 解码
   - 按 `:` 分割提取 iv/cipher/authTag
   - AES-256-GCM 解密：`crypto.createDecipheriv('aes-256-gcm', key, iv)`
   - 设置 authTag 后解密
   - 解密失败抛出 Error（密钥错误或数据损坏）

4. 单元测试验证加密往返正确性和密钥错误时的异常

**验证：** 加密/解密往返正确；密钥错误抛出异常；输出格式可序列化

### 步骤 3：实现 MemorySyncManager

**文件：** `src/main/services/sync/memory-sync.ts`（新建）

1. 实现 `MemorySyncManager` 类：
   - 构造函数接收 `fileManager`、`eventBus`、`config: { syncMemory: boolean, workspaceId: string }`
   - 私有属性 `userPassword?: string`（仅存内存，不持久化）

2. 实现 `setPassword(password: string): void` 方法：
   - 存储到内存（`this.userPassword = password`）
   - 不持久化到磁盘

3. 实现 `async beforePush(): Promise<void>` 方法：
   - 检查 `config.syncMemory` 和 `userPassword`，不满足则 return
   - 读取 `.sibylla/memory/MEMORY.md` 明文
   - 调用 `deriveKeyFromPassword(this.userPassword, this.workspaceId)` 获取密钥
   - 调用 `encrypt(plaintext, key)` 加密
   - 写入 `.sibylla/memory/MEMORY.encrypted`（base64 密文）

4. 实现 `async afterPull(): Promise<void>` 方法：
   - 检查 `config.syncMemory` 和 `userPassword`
   - 检查 `.sibylla/memory/MEMORY.encrypted` 是否存在
   - 读取密文 → base64 解码 → `decrypt(ciphertext, key)` 解密
   - 成功：`fileManager.atomicWrite('.sibylla/memory/MEMORY.md', plaintext)`
   - 失败：发布 `memory.sync-locked` 事件，logger.error

5. 实现 `isPasswordSet(): boolean` 方法

6. 实现 `isLocked(): Promise<boolean>` 方法：
   - 检查 MEMORY.encrypted 是否存在且无法解密

**验证：** 加密同步往返正确；密钥丢失时 graceful degradation；事件发布正确

### 步骤 4：实现 TaskStateMachineSync

**文件：** `src/main/services/sync/task-state-machine-sync.ts`（新建）

1. 实现 `TaskStateMachineSync` 类：
   - 构造函数接收 `taskStateMachine: TaskStateMachine`、`eventBus: AppEventBus`、`currentSessionId: string`

2. 在构造函数中订阅 `git.pull-completed` 事件：
   ```typescript
   this.eventBus.subscribe('git.pull-completed', async () => {
     await this.detectCrossDeviceTasks()
   })
   ```

3. 实现 `async detectCrossDeviceTasks(): Promise<void>` 方法：
   - 调用 `taskStateMachine.findResumeable()` 获取可续传任务
   - 过滤 `lastSessionId !== this.currentSessionId`
   - 对每个跨设备任务发布 `task.cross-device-resumeable` 事件

4. 实现 `validateStateJson(filePath: string): Promise<boolean>` 静态方法：
   - 读取并解析 JSON
   - 验证必需字段存在（`taskId`、`status`、`updatedAt`）
   - 返回是否合法

5. 实现 `resolveConflict(local: TaskState, remote: TaskState): TaskState` 静态方法：
   - 比较 `updatedAt` 时间戳
   - 返回时间戳较新的状态（last-write-wins）

**验证：** pull 后检测到跨设备任务正确；JSON 验证正确；冲突解决正确

### 步骤 5：实现引用格式解析器

**文件：** `src/shared/citation-parser.ts`（新建，共享代码）

1. 定义 `Citation` 联合类型：
   ```typescript
   export type Citation =
     | { kind: 'file'; path: string; line?: number }
     | { kind: 'memory'; entryId: string }
     | { kind: 'handbook'; entryId: string }
     | { kind: 'mcp'; provider: string; ref: string }
     | { kind: 'plan'; planId: string }
   ```

2. 实现正则表达式：
   ```typescript
   const CITATION_REGEX = /\[(file|memory|handbook|mcp|plan):([^\]]+)\]/g
   ```

3. 实现 `parseCitation(raw: string): Citation | null` 函数：
   - `[file:path#Lline]` → 分离 path 和 line
   - `[memory:id]` → entryId
   - `[handbook:id]` → entryId
   - `[mcp:provider:ref]` → 三段式解析
   - `[plan:id]` → planId
   - 无法解析时返回 null

4. 实现 `extractCitations(text: string): Array<{ citation: Citation; raw: string; index: number }>` 函数：
   - 全文扫描 CITATION_REGEX
   - 对每个匹配调用 parseCitation
   - 返回带位置信息的引用列表

5. 实现 `citationToMarkdown(citation: Citation): string` 函数（导出用）：
   - 反向序列化为 `[kind:value]` 格式

**验证：** 6 种引用格式解析正确；边界情况（空引用、非法格式）返回 null；位置信息正确

### 步骤 6：实现引用渲染组件

**文件：** `src/renderer/components/chat/CitationLink.tsx`（新建）

1. 定义引用样式映射：
   ```typescript
   const CITATION_STYLES: Record<string, { icon: string; color: string; label: string }> = {
     file:     { icon: '📄', color: 'text-blue-600',   label: '文件' },
     memory:   { icon: '🧠', color: 'text-purple-600', label: '记忆' },
     handbook: { icon: '📖', color: 'text-green-600',  label: '手册' },
     mcp:      { icon: '🔌', color: 'text-indigo-600', label: '外部' },
     plan:     { icon: '📋', color: 'text-orange-600', label: '计划' },
   }
   ```

2. 实现 `CitationLink` 组件：
   - Props: `citation: Citation`、`raw: string`、`broken?: boolean`
   - 正常引用：图标 + 彩色链接 + tooltip（hover 显示详情）
   - 损坏引用：黄色警告样式 + "目标不存在" tooltip

3. 实现点击处理 `handleCitationClick(citation: Citation)`：
   - `file` → `window.electronAPI.editor.openFile(path, { line })`
   - `memory` → 聚焦记忆面板到 entryId
   - `handbook` → 打开 Handbook viewer
   - `mcp` → 编辑器打开本地副本 + 提供"查看原文"外链
   - `plan` → 打开 Plan 面板

4. 实现 tooltip 内容：
   - `memory` 引用 → 显示 confidence score（从 IPC 获取）
   - `mcp` 引用 → 显示 provider 图标（GitHub/Slack/Notion）
   - `file` 引用 → 显示文件路径
   - 损坏引用 → "目标不存在" + "搜索相似内容"链接

**文件：** `src/renderer/components/chat/CitationRenderer.tsx`（新建）

5. 实现 `CitationRenderer` 组件（文本 → 引用链接转换器）：
   - Props: `content: string`（AI 回答文本）
   - 调用 `extractCitations(content)` 提取所有引用
   - 将文本按引用位置分割，交替渲染纯文本和 CitationLink
   - 无引用时纯文本渲染（零开销）

**验证：** 6 种引用渲染正确；点击跳转正确；损坏引用警告正确

### 步骤 7：实现加密同步设置 UI + IPC handler + 装配

**文件：** `src/renderer/components/settings/MemorySyncSettings.tsx`（新建）

1. 实现 `MemorySyncSettings` 组件：
   - "记忆同步"开关（Toggle，默认关闭）
   - 启用时显示密码输入框（两次确认）
   - 禁用时显示确认对话框
   - "未解锁"提示条（检测到 MEMORY.encrypted 存在但未解密）
   - "解锁"按钮 → 弹出密码输入框 → 尝试解密

2. 调用 IPC：
   - `sync:memory:enable` — 启用记忆同步
   - `sync:memory:disable` — 禁用记忆同步
   - `sync:memory:setPassword` — 设置加密密码

**文件：** `src/main/ipc/handlers/sync-extra.ts`（新建）

3. 注册 `sync:memory:enable` handler：
   - 更新配置 `syncMemory = true`
   - 返回成功

4. 注册 `sync:memory:disable` handler：
   - 更新配置 `syncMemory = false`
   - 返回成功

5. 注册 `sync:memory:setPassword` handler：
   - 调用 `memorySyncManager.setPassword(password)`
   - 触发一次 `beforePush()` 立即加密并同步

6. 注册 `sync:task:listCrossDevice` handler：
   - 返回当前检测到的跨设备可续传任务列表

**文件：** `src/shared/types.ts`（修改，扩展）

7. 新增 IPC 通道常量：
   ```typescript
   SYNC_MEMORY_ENABLE: 'sync:memory:enable',
   SYNC_MEMORY_DISABLE: 'sync:memory:disable',
   SYNC_MEMORY_SET_PASSWORD: 'sync:memory:setPassword',
   SYNC_TASK_LIST_CROSS_DEVICE: 'sync:task:listCrossDevice',
   ```

**文件：** `src/preload/index.ts`（修改，扩展）

8. 新增 `sync` 命名空间扩展：
   ```typescript
   sync: {
     memoryEnable: () => ipcRenderer.invoke('sync:memory:enable'),
     memoryDisable: () => ipcRenderer.invoke('sync:memory:disable'),
     memorySetPassword: (pw) => ipcRenderer.invoke('sync:memory:setPassword', pw),
     listCrossDeviceTasks: () => ipcRenderer.invoke('sync:task:listCrossDevice'),
   }
   ```

**文件：** AI 对话消息渲染组件（修改）

9. 在 AI 消息渲染中集成 `CitationRenderer`：
   - 替换现有的纯文本渲染为 `<CitationRenderer content={message.content} />`

**文件：** 对话导出模块（修改，Sprint 3.4）

10. 导出时保留引用格式：
    - Markdown 导出：`citationToMarkdown()` 序列化
    - HTML 导出：渲染为 `<a href>` 链接

**文件：** `src/main/main.ts` 或服务装配文件（修改）

11. 主进程装配：
    - 创建 `MemorySyncManager` 实例
    - 创建 `TaskStateMachineSync` 实例
    - 在 `SyncManager.push()` 前调用 `memorySyncManager.beforePush()`
    - 在 `SyncManager.pull()` 后调用 `memorySyncManager.afterPull()` + `taskStateMachineSync.detectCrossDeviceTasks()`
    - 注册 `sync-extra.ts` IPC handler
    - 调用 `ensureGitignoreRules()` 确保 .gitignore 正确

**验证：** 设置 UI 可用；加密同步链路通畅；引用渲染集成到 AI 对话

### 步骤 8：单元测试

**文件：** `tests/main/services/sync/`（新建目录）

1. `encryption.test.ts`：
   - encrypt/decrypt 往返测试
   - 密钥错误时 decrypt 抛出异常测试
   - 空 plaintext 加密/解密测试
   - 大文本（> 10KB）加密/解密测试

2. `memory-sync.test.ts`：
   - `beforePush()` 正常加密流程测试
   - `afterPull()` 正常解密流程测试
   - 未启用时 beforePush/afterPull 无操作测试
   - 解密失败 graceful degradation 测试
   - MEMORY.encrypted 不存在时 afterPull 无操作测试

3. `task-state-machine-sync.test.ts`：
   - pull 后检测跨设备任务测试
   - JSON 验证（合法/非法结构）测试
   - last-write-wins 冲突解决测试
   - 无跨设备任务时不发布事件测试

4. `sync-config.test.ts`：
   - `ensureGitignoreRules()` 规则追加测试
   - `detectStaleSyncedPaths()` 检测测试

**文件：** `tests/shared/citation-parser.test.ts`（新建）

5. `citation-parser.test.ts`：
   - 6 种引用格式解析测试
   - `[file:path#L42]` 行号解析测试
   - `[mcp:github:issue/234]` 三段式解析测试
   - 无效格式返回 null 测试
   - 多引用混合文本 extractCitations 测试
   - `citationToMarkdown()` 反序列化测试

**文件：** `tests/renderer/components/chat/`（新建目录）

6. `citation-link.test.tsx`：
   - 6 种引用类型渲染正确性测试
   - 损坏引用警告样式测试
   - 点击跳转 mock 测试
   - tooltip 内容测试

7. `citation-renderer.test.tsx`：
   - 纯文本无引用渲染测试
   - 单引用和多引用渲染测试
   - 引用位置正确分割测试

**覆盖率目标：** ≥ 80%

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| SyncManager | `src/main/services/sync-manager.ts`（Sprint 2） | 不修改，通过 hooks 注入 beforePush/afterPull |
| AutoSaveManager | `src/main/services/auto-save-manager.ts`（Sprint 2） | 不修改，push 流程中触发 beforePush |
| TaskStateMachine | `src/main/services/harness/task-state-machine.ts`（Sprint 3.1） | 不修改，findResumeable() 查询可续传任务 |
| AppEventBus | `src/main/services/event-bus.ts`（TASK001） | 订阅 git.pull-completed 事件 |
| AI 消息渲染组件 | `src/renderer/components/studio/`（Sprint 3） | 集成 CitationRenderer |
| ConversationExporter | `src/main/services/export/`（Sprint 3.4） | 扩展引用格式保留 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `sync/sync-config.ts` | 同步分层配置与 .gitignore 管理 |
| `sync/encryption.ts` | AES-256-GCM 加密/解密工具 |
| `sync/memory-sync.ts` | MEMORY.md 加密同步管理 |
| `sync/task-state-machine-sync.ts` | 任务状态多端续传 |
| `shared/citation-parser.ts` | 引用格式解析器（共享代码） |
| `chat/CitationLink.tsx` | 引用链接渲染组件 |
| `chat/CitationRenderer.tsx` | AI 回答引用渲染器 |
| `settings/MemorySyncSettings.tsx` | 加密同步设置 UI |
| `ipc/handlers/sync-extra.ts` | 同步增强 IPC handler |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `sync:memory:enable` | Renderer → Main | 启用记忆加密同步 |
| `sync:memory:disable` | Renderer → Main | 禁用记忆加密同步 |
| `sync:memory:setPassword` | Renderer → Main | 设置加密密码 |
| `sync:task:listCrossDevice` | Renderer → Main | 列出跨设备可续传任务 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| workspace `.gitignore` | 修改 | 追加排除规则 |
| `src/shared/types.ts` | 扩展 | 新增 SYNC_* IPC 通道常量 |
| `src/preload/index.ts` | 扩展 | 新增 sync 命名空间扩展 |
| `src/main/main.ts`（或装配文件） | 修改 | 创建 Sync hooks + 注册 IPC |
| AI 消息渲染组件 | 修改 | 集成 CitationRenderer |
| 对话导出模块 | 修改 | 保留引用格式 |

**不修改的文件：**
- `src/main/services/sync-manager.ts` — 通过 hooks 注入，不直接修改
- `src/main/services/auto-save-manager.ts` — push 流程不变
- `src/main/services/harness/task-state-machine.ts` — 仅调用 findResumeable()

---

**创建时间：** 2026-04-27
**最后更新：** 2026-04-27
**更新记录：**
- 2026-04-27 — 创建任务文档（含完整技术执行路径 8 步）
