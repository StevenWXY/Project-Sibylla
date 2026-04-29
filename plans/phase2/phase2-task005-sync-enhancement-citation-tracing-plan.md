# PHASE2-TASK005: 多端同步增强与跨源引用追溯 — 实施计划

> 任务来源：[specs/tasks/phase2/phase2-task005_sync-enhancement-citation-tracing.md](../../specs/tasks/phase2/phase2-task005_sync-enhancement-citation-tracing.md)
> 创建日期：2026-04-29
> 最后更新：2026-04-29

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK005 |
| **任务标题** | 多端同步增强与跨源引用追溯 |
| **所属阶段** | Phase 2 - 跨源数据统一与上下文引擎 v2 (Sprint 4) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **前置依赖** | PHASE2-TASK001（事件总线）+ PHASE2-TASK002（统一搜索）+ PHASE1-TASK005（SyncManager）+ PHASE1-TASK006（Push/Pull）+ PHASE1-TASK021（TaskStateMachine）+ PHASE1-TASK011（AI 流式响应） |

### 1.1 目标

扩展工作区多端同步范围（覆盖 Plans、Agents、加密 MEMORY.md），并实现 AI 响应中跨源引用的统一渲染与可点击跳转。核心交付：

1. **同步分层与 .gitignore 规则** — 核心数据默认同步、个人偏好可选同步、本地缓存永不同步
2. **MEMORY.md 加密同步** — AES-256-GCM 加密，scrypt 密钥派生，opt-in 机制
3. **TaskStateMachineSync** — 任务状态多端续传，last-write-wins 冲突解决
4. **trace 意外同步检测** — 远端不应存在的目录检测与警告
5. **引用格式解析器** — 6 种 `[source:identifier]` 格式解析为结构化引用
6. **引用渲染组件** — 6 种引用类型各有图标、颜色、跳转逻辑
7. **损坏引用处理** — 目标不存在时的黄色警告 + 替代搜索建议
8. **加密同步设置 UI** — 启用/禁用/密码设置/未解锁状态

### 1.2 核心设计约束（来自 CLAUDE.md + 任务文档）

| 约束 | 来源 | 具体要求 |
|------|------|----------|
| 不修改 SyncManager | 任务文档 §核心设计约束 | 新增 `MemorySyncManager` 和 `TaskStateMachineSync` 作为 hooks，在 SyncManager 的 push/pull 前后触发 |
| 加密同步 opt-in | 任务文档 §核心设计约束 | MEMORY.md 含敏感信息，用户需主动启用并设置密码后才加密同步 |
| AES-256-GCM 加密 | 任务文档 §核心设计约束 | 密钥由用户密码通过 scrypt 派生，密钥永不离开本地 |
| 同步分层 | 任务文档 §核心设计约束 | 核心数据默认同步；个人偏好可选同步；本地缓存永不同步 |
| 降级优雅 | 任务文档 §核心设计约束 | 加密密钥丢失时 MEMORY.md 标记为"未解锁"，继续使用空记忆 |
| 文件即真相 | CLAUDE.md §二 | Plans/Agents/MEMORY.md 均为明文存储在本地文件系统中 |
| Git 不可见 | CLAUDE.md §二 | 同步操作在 UI 中用"同步""同步设置"等自然语言描述 |
| TypeScript 严格模式 | CLAUDE.md §四 | 禁止 `any`，所有新增类型必须严格 |
| IPC 安全隔离 | CLAUDE.md §四 | 渲染进程不得直接访问文件系统，通过 IPC 通信 |
| 结构化日志 | CLAUDE.md §四 | 关键操作必须有 who/what/when/result 日志 |
| 错误不可静默 | CLAUDE.md §四 | 所有异步操作必须有明确错误处理 |
| 原子写入 | CLAUDE.md §六 | 文件写入必须先写临时文件再原子替换 |

### 1.3 核心交付物

| 交付物 | 文件路径 | 类型 |
|--------|---------|------|
| 同步分层配置 | `src/main/services/sync/sync-config.ts` | 新建 |
| 加密工具模块 | `src/main/services/sync/encryption.ts` | 新建 |
| MEMORY.md 加密同步 | `src/main/services/sync/memory-sync.ts` | 新建 |
| 任务状态多端续传 | `src/main/services/sync/task-state-machine-sync.ts` | 新建 |
| 引用格式解析器 | `src/shared/citation-parser.ts` | 新建（共享代码） |
| 引用链接组件 | `src/renderer/components/chat/CitationLink.tsx` | 新建 |
| 引用渲染器 | `src/renderer/components/chat/CitationRenderer.tsx` | 新建 |
| 加密同步设置 UI | `src/renderer/components/settings/MemorySyncSettings.tsx` | 新建 |
| 同步增强 IPC handler | `src/main/ipc/handlers/sync-extra.ts` | 新建 |
| IPC 通道常量 | `src/shared/types.ts` | 修改（扩展） |
| Preload API | `src/preload/index.ts` | 修改（扩展） |
| 主进程装配 | `src/main/index.ts` 或装配文件 | 修改 |
| AI 消息渲染组件 | `src/renderer/components/studio/` 下的消息组件 | 修改 |
| 对话导出模块 | `src/main/services/export/` | 修改 |
| workspace `.gitignore` | workspace `.gitignore` | 修改 |
| 单元测试（同步模块） | `tests/main/services/sync/` | 新建目录 |
| 单元测试（引用解析） | `tests/shared/citation-parser.test.ts` | 新建 |
| 单元测试（引用渲染） | `tests/renderer/components/chat/` | 新建目录 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` §二 | 文件即真相——所有用户内容明文存储，MEMORY.md 加密仅限传输层 | MEMORY.md 加密同步设计：本地明文、远端密文 |
| `CLAUDE.md` §二 | Git 不可见——UI 中用"同步""同步设置"替代 push/pull | 加密同步设置 UI 的文案规范 |
| `CLAUDE.md` §四 | TS 严格模式禁止 `any`；结构化日志（who/what/when/result） | 全局代码约束 |
| `CLAUDE.md` §四 | 主进程与渲染进程严格隔离，通过 IPC 通信 | IPC handler + Preload API 设计 |
| `CLAUDE.md` §六 | 文件写入先写临时文件再原子替换 | MEMORY.md 解密后的原子写入 |
| `CLAUDE.md` §七 | API Key 加密存储在本地不上传云端（BYOK 模式） | 密钥管理策略：密钥仅存内存，不持久化 |
| `specs/design/architecture.md` §3.2 | 进程通信架构：Renderer ↔ IPC ↔ Main | IPC 通道设计与 Preload API |
| `specs/design/architecture.md` §3.3 | Git 抽象层接口：saveFile/sync/getHistory | 引用跳转中文件打开使用 Git 抽象层 |
| `specs/design/testing-and-security.md` | 测试金字塔、覆盖率 ≥ 80% | 单元测试策略 |
| `specs/design/ui-ux-design.md` | 色彩体系、交互规范 | 引用渲染组件的色彩与图标规范 |
| `specs/requirements/phase2/sprint4-semantic-search.md` §需求 4.8 + 4.9 | 多端同步增强与引用追溯验收标准 | 验收标准来源 |
| `specs/requirements/phase1/sprint2-git-sync.md` | SyncManager + AutoSaveManager 设计 | push/pull hooks 注入点 |
| `specs/requirements/phase1/sprint3.1-harness-infrastructure.md` | TaskStateMachine 设计 | findResumeable() 接口约束 |
| `specs/requirements/phase1/sprint3.2-memory.md` | MEMORY.md 格式与三层存储 | 加密同步的文件格式约束 |
| `specs/tasks/phase2/phase2-task005_sync-enhancement-citation-tracing.md` | 8 步技术执行路径、完整验收标准 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | IPC 通道设计、类型安全接口、双向通信 | `sync:memory:*` IPC handler + Preload API 扩展 |
| `typescript-strict-mode` | 联合类型设计、泛型、类型守卫 | `Citation` 联合类型、IPC 通道类型签名、严格类型推断 |
| `llm-streaming-integration` | 流式 AI 响应中的引用渲染集成 | CitationRenderer 与 AI 消息流式渲染的集成点 |

### 2.3 前置代码依赖

| 模块 | 文件路径 | 复用方式 |
|------|---------|----------|
| `SyncManager` | `src/main/services/sync-manager.ts`（Sprint 2） | **不修改**，通过 hooks 注入 beforePush/afterPull |
| `AutoSaveManager` | `src/main/services/auto-save-manager.ts`（Sprint 2） | **不修改**，push 流程中触发 beforePush |
| `TaskStateMachine` | `src/main/services/harness/task-state-machine.ts`（Sprint 3.1） | **不修改**，调用 `findResumeable()` 查询可续传任务 |
| `AppEventBus` | `src/main/services/event-bus.ts`（TASK001 扩展后） | 订阅 `git.pull-completed` 事件，发布 `memory.sync-locked`、`task.cross-device-resumeable` 事件 |
| `FileManager` | `src/main/services/file-manager.ts` | 调用 `atomicWrite()` 写入解密后的 MEMORY.md |
| `IPC_CHANNELS` | `src/shared/types.ts` | **扩展**：新增 `SYNC_MEMORY_ENABLE` 等通道常量 |
| `IPCChannelMap` | `src/shared/types.ts` | **扩展**：注册新通道的类型签名 |
| `Preload API` | `src/preload/index.ts` | **扩展**：新增 `sync` 命名空间 |
| AI 消息渲染组件 | `src/renderer/components/studio/`（Sprint 3） | **修改**：集成 CitationRenderer |
| `ConversationExporter` | `src/main/services/export/`（Sprint 3.4） | **修改**：扩展引用格式保留 |
| `UnifiedSearchEngine` | `src/main/services/unified-search/`（TASK002） | **调用**：损坏引用的替代搜索建议 |

### 2.4 新增外部依赖

| 库 | 版本 | 用途 | 说明 |
|-----|------|------|------|
| 无新增 | — | — | 加密使用 Node.js 内置 `crypto` 模块；引用解析使用内置 `RegExp` |

### 2.5 被依赖关系（下游消费者）

| 下游任务 | 消费能力 | 阻塞关系 |
|---------|---------|----------|
| 无 | 本任务是 Sprint 4 同步线的终点 | — |

> 注：引用渲染组件（CitationRenderer）虽然本任务创建，但它是 Sprint 3 AI 对话的增强，不阻塞后续任务。

---

## 三、现有代码盘点与差距分析

### 3.1 SyncManager 现状（Sprint 2）

**已有能力：**
- `push()` — 将工作区变更推送到远端 Git 仓库
- `pull()` — 从远端拉取变更到本地
- `sync()` — push + pull 合并操作
- 已覆盖用户文档（workspace 根目录下的 *.md 等）

**缺口（本任务需补充）：**

| 缺失能力 | 说明 |
|---------|------|
| beforePush/afterPull hooks 机制 | SyncManager 无生命周期钩子，需通过外部调用注入 |
| `.sibylla/plans/` 和 `.sibylla/agents/` 同步 | 这些目录可能被 .gitignore 排除，需确认并调整 |
| MEMORY.md 加密同步 | 完全缺失，需新建 MemorySyncManager |
| trace 意外同步检测 | 完全缺失 |

**hooks 注入策略：** 不修改 SyncManager 源码。在主进程装配层面，在 `SyncManager.push()` 调用前手动调用 `memorySyncManager.beforePush()`，在 `SyncManager.pull()` 调用后手动调用 `memorySyncManager.afterPull()` + `taskStateMachineSync.detectCrossDeviceTasks()`。

### 3.2 TaskStateMachine 现状（Sprint 3.1）

**已有能力：**
- 状态机驱动任务生命周期（pending → running → completed/failed）
- `state.json` 持久化到 `.sibylla/agents/{taskId}/`
- 跨 session 的任务恢复能力

**缺口：**

| 缺失能力 | 说明 |
|---------|------|
| 跨设备任务检测 | 无 `lastSessionId` 概念，无法区分本设备与远端设备的任务 |
| 多端状态冲突解决 | 无 last-write-wins 冲突检测 |
| 可续传任务查询 | `findResumeable()` 是否存在需确认 |

### 3.3 AppEventBus 现状（TASK001 扩展后）

**已有能力（假设 TASK001 已完成）：**
- `subscribe<T>(type, handler)` 订阅特定事件类型
- `emitEvent<T>()` 发布统一事件
- `git.pull-completed` 事件已定义

**本任务消费的事件：**

| 事件类型 | 消费场景 |
|---------|---------|
| `git.pull-completed` | 触发 MemorySyncManager.afterPull() + TaskStateMachineSync.detectCrossDeviceTasks() |

**本任务发布的事件：**

| 事件类型 | 发布场景 |
|---------|---------|
| `memory.sync-locked` | 解密失败时发布 |
| `task.cross-device-resumeable` | 检测到跨设备可续传任务时发布 |

### 3.4 AI 消息渲染组件现状（Sprint 3）

**已有能力：**
- 流式渲染 AI 回答文本
- Markdown 渲染
- 代码块高亮

**缺口：**
- 引用 `[source:identifier]` 渲染为纯文本，无样式、无图标、无点击跳转
- 无 CitationRenderer 组件

### 3.5 IPC 通道与 Preload 现状

**`shared/types.ts`：**
- `IPC_CHANNELS` 已定义 100+ 个通道
- `IPCChannelMap` 接口提供完整类型映射
- **缺失：** `SYNC_MEMORY_ENABLE`、`SYNC_MEMORY_DISABLE`、`SYNC_MEMORY_SET_PASSWORD`、`SYNC_TASK_LIST_CROSS_DEVICE` 四个通道

**`preload/index.ts`：**
- `ElectronAPI` 接口已有 25+ 命名空间
- **缺失：** `sync` 命名空间

### 3.6 不存在的文件（需新建）

| 文件 | 用途 |
|------|------|
| `src/main/services/sync/sync-config.ts` | 同步分层配置与 .gitignore 管理 |
| `src/main/services/sync/encryption.ts` | AES-256-GCM 加密/解密工具 |
| `src/main/services/sync/memory-sync.ts` | MEMORY.md 加密同步管理 |
| `src/main/services/sync/task-state-machine-sync.ts` | 任务状态多端续传 |
| `src/shared/citation-parser.ts` | 引用格式解析器（共享代码） |
| `src/renderer/components/chat/CitationLink.tsx` | 引用链接渲染组件 |
| `src/renderer/components/chat/CitationRenderer.tsx` | AI 回答引用渲染器 |
| `src/renderer/components/settings/MemorySyncSettings.tsx` | 加密同步设置 UI |
| `src/main/ipc/handlers/sync-extra.ts` | 同步增强 IPC handler |
| `tests/main/services/sync/` | 同步模块测试目录 |
| `tests/shared/citation-parser.test.ts` | 引用解析测试 |
| `tests/renderer/components/chat/` | 引用渲染测试目录 |

---

## 四、分步实施计划

### 阶段 A：.gitignore 规则与同步分层配置（Step 1） — 预计 0.3 天

#### A1：定义同步分层配置

**文件：** `src/main/services/sync/sync-config.ts`（新建）

```typescript
export const SYNC_ALWAYS_EXCLUDE = [
  '.sibylla/trace/',
  '.sibylla/events/',
  '.sibylla/index/',
  '.sibylla/mcp/',
  '.sibylla/snapshots/',
  '.sibylla/handbook-local/',
] as const

export const SYNC_ALWAYS_INCLUDE = [
  '.sibylla/plans/',
  '.sibylla/agents/',
] as const

export const SYNC_OPTIONAL = [
  '.sibylla/memory/MEMORY.encrypted',
] as const
```

#### A2：实现 .gitignore 管理函数

1. `ensureGitignoreRules(workspaceRoot: string): Promise<void>`
   - 读取现有 `.gitignore`
   - 检查 `SYNC_ALWAYS_EXCLUDE` 中每条是否已存在
   - 缺失条目追加到 `.gitignore` 末尾
   - 确保 `.sibylla/plans/` 和 `.sibylla/agents/` **不在** .gitignore 中

2. `detectStaleSyncedPaths(workspaceRoot: string): Promise<string[]>`
   - 调用 Git 抽象层检查远端是否存在 `.sibylla/trace/` 等不应同步的目录
   - 返回需清理的路径列表

**验证：** .gitignore 更新正确；不应同步的目录被排除；`npx tsc --noEmit` 通过

---

### 阶段 B：加密工具模块（Step 2） — 预计 0.5 天

#### B1：实现密钥派生

**文件：** `src/main/services/sync/encryption.ts`（新建）

1. `deriveKeyFromPassword(password: string, salt: string): Buffer`
   - `crypto.scryptSync(password, salt, 32)` 派生 256-bit 密钥
   - salt 使用 workspaceId（确保每个 workspace 密钥唯一）

#### B2：实现 AES-256-GCM 加密

2. `encrypt(plaintext: string, key: Buffer): string`
   - 生成随机 12-byte IV：`crypto.randomBytes(12)`
   - `crypto.createCipheriv('aes-256-gcm', key, iv)`
   - 输出格式：`base64(iv:hex + ':' + cipher:hex + ':' + authTag:hex)`

#### B3：实现 AES-256-GCM 解密

3. `decrypt(ciphertext: string, key: Buffer): string`
   - base64 解码 → 按 `:` 分割提取 iv/cipher/authTag
   - `crypto.createDecipheriv('aes-256-gcm', key, iv)`
   - 设置 authTag 后解密
   - 解密失败（密钥错误或数据损坏）抛出 `DecryptionError`

**验证：** encrypt/decrypt 往返正确；密钥错误抛异常；空文本和大文本（>10KB）正确处理

---

### 阶段 C：MemorySyncManager（Step 3） — 预计 0.8 天

#### C1：实现 MemorySyncManager 类

**文件：** `src/main/services/sync/memory-sync.ts`（新建）

```typescript
export class MemorySyncManager {
  private userPassword?: string

  constructor(
    private readonly fileManager: FileManager,
    private readonly eventBus: AppEventBus,
    private readonly config: { syncMemory: boolean; workspaceId: string },
  ) {}
}
```

#### C2：核心方法

1. `setPassword(password: string): void` — 存储到内存，不持久化
2. `isPasswordSet(): boolean`
3. `async isLocked(): Promise<boolean>` — 检查 MEMORY.encrypted 存在但无法解密

4. `async beforePush(): Promise<void>`
   - 检查 `config.syncMemory` 和 `userPassword`，不满足则 return
   - 读取 `.sibylla/memory/MEMORY.md` 明文
   - `deriveKeyFromPassword()` → `encrypt()` → 写入 `.sibylla/memory/MEMORY.encrypted`
   - 确保 `.sibylla/memory/MEMORY.encrypted` 不在 .gitignore 中（仅移除这一行）

5. `async afterPull(): Promise<void>`
   - 检查 `config.syncMemory` 和 `userPassword`
   - 检测 `.sibylla/memory/MEMORY.encrypted` 是否存在
   - 存在 → 读取密文 → `decrypt()` → 原子写入 MEMORY.md
   - 解密失败 → 发布 `memory.sync-locked` 事件 + `logger.error`

**验证：** 加密同步往返正确；密钥丢失 graceful degradation；事件发布正确

---

### 阶段 D：TaskStateMachineSync（Step 4） — 预计 0.5 天

#### D1：实现 TaskStateMachineSync 类

**文件：** `src/main/services/sync/task-state-machine-sync.ts`（新建）

1. 构造函数订阅 `git.pull-completed` 事件：
   ```typescript
   this.eventBus.subscribe('git.pull-completed', async () => {
     await this.detectCrossDeviceTasks()
   })
   ```

2. `async detectCrossDeviceTasks(): Promise<void>`
   - 扫描 `.sibylla/agents/` 目录下所有 `state.json`
   - 解析 JSON → 验证结构合法性（必需字段：taskId、status、updatedAt）
   - 过滤 `lastSessionId !== this.currentSessionId`
   - 对每个跨设备任务发布 `task.cross-device-resumeable` 事件

3. `static validateStateJson(filePath: string): Promise<boolean>` — 验证 JSON 结构

4. `static resolveConflict(local: TaskState, remote: TaskState): TaskState` — last-write-wins

**验证：** pull 后检测跨设备任务正确；JSON 验证正确；冲突解决正确

---

### 阶段 E：引用格式解析器（Step 5） — 预计 0.5 天

#### E1：定义 Citation 联合类型

**文件：** `src/shared/citation-parser.ts`（新建，共享代码）

```typescript
export type Citation =
  | { kind: 'file'; path: string; line?: number }
  | { kind: 'memory'; entryId: string }
  | { kind: 'handbook'; entryId: string }
  | { kind: 'mcp'; provider: string; ref: string }
  | { kind: 'plan'; planId: string }
```

#### E2：核心函数

1. **正则表达式：** `/\[(file|memory|handbook|mcp|plan):([^\]]+)\]/g`

2. `parseCitation(raw: string): Citation | null`
   - `[file:path#Lline]` → 分离 path 和 line（`#L42` → line: 42）
   - `[memory:id]` → `{ kind: 'memory', entryId: id }`
   - `[handbook:id]` → `{ kind: 'handbook', entryId: id }`
   - `[mcp:provider:ref]` → 三段式解析
   - `[plan:id]` → `{ kind: 'plan', planId: id }`
   - 无法解析返回 null

3. `extractCitations(text: string): Array<{ citation: Citation; raw: string; index: number }>`
   - 全文扫描，返回带位置信息的引用列表

4. `citationToMarkdown(citation: Citation): string` — 反向序列化为 `[kind:value]`

**验证：** 6 种引用格式解析正确；边界情况返回 null；位置信息正确

---

### 阶段 F：引用渲染组件（Step 6） — 预计 1 天

#### F1：CitationLink 组件

**文件：** `src/renderer/components/chat/CitationLink.tsx`（新建）

1. **样式映射：**

| kind | icon | color | label |
|------|------|-------|-------|
| file | `FileText` (lucide-react) | `text-blue-600` | 文件 |
| memory | `Brain` | `text-purple-600` | 记忆 |
| handbook | `BookOpen` | `text-green-600` | 手册 |
| mcp | `Plug` | `text-indigo-600` | 外部 |
| plan | `ClipboardList` | `text-orange-600` | 计划 |

2. **Props：** `citation: Citation`、`raw: string`、`broken?: boolean`
3. **正常引用：** 图标 + 彩色链接 + tooltip（hover 显示详情）
4. **损坏引用：** 黄色警告样式（`text-yellow-600 bg-yellow-50`）+ "目标不存在" tooltip + "搜索相似内容"链接
5. **点击处理：** 根据 kind 通过 IPC 跳转到对应面板/编辑器

#### F2：CitationRenderer 组件

**文件：** `src/renderer/components/chat/CitationRenderer.tsx`（新建）

1. **Props：** `content: string`（AI 回答文本）
2. 调用 `extractCitations(content)` 提取所有引用
3. 文本按引用位置分割，交替渲染纯文本和 `<CitationLink />`
4. 无引用时纯文本渲染（零开销）

#### F3：Tooltip 内容

- `memory` → 显示 confidence score（通过 IPC 获取）
- `mcp` → 显示 provider 图标（GitHub/Slack/Notion）
- `file` → 显示文件路径
- 损坏引用 → "目标不存在" + "搜索相似内容"（调用 UnifiedSearchEngine）

**验证：** 6 种引用渲染正确；点击跳转正确；损坏引用警告正确；纯文本无开销

---

### 阶段 G：IPC handler + 设置 UI + 装配（Step 7） — 预计 1.2 天

#### G1：IPC 通道常量扩展

**文件：** `src/shared/types.ts`（扩展）

```typescript
SYNC_MEMORY_ENABLE: 'sync:memory:enable' as const,
SYNC_MEMORY_DISABLE: 'sync:memory:disable' as const,
SYNC_MEMORY_SET_PASSWORD: 'sync:memory:setPassword' as const,
SYNC_TASK_LIST_CROSS_DEVICE: 'sync:task:listCrossDevice' as const,
```

#### G2：IPC Handler 实现

**文件：** `src/main/ipc/handlers/sync-extra.ts`（新建）

| IPC 通道 | 处理逻辑 |
|---------|---------|
| `sync:memory:enable` | 更新配置 `syncMemory = true` |
| `sync:memory:disable` | 更新配置 `syncMemory = false` |
| `sync:memory:setPassword` | 调用 `memorySyncManager.setPassword(pw)` + 触发一次 `beforePush()` |
| `sync:task:listCrossDevice` | 返回跨设备可续传任务列表 |

#### G3：Preload API 扩展

**文件：** `src/preload/index.ts`（扩展）

```typescript
sync: {
  memoryEnable: () => ipcRenderer.invoke('sync:memory:enable'),
  memoryDisable: () => ipcRenderer.invoke('sync:memory:disable'),
  memorySetPassword: (pw: string) => ipcRenderer.invoke('sync:memory:setPassword', pw),
  listCrossDeviceTasks: () => ipcRenderer.invoke('sync:task:listCrossDevice'),
}
```

#### G4：MemorySyncSettings 组件

**文件：** `src/renderer/components/settings/MemorySyncSettings.tsx`（新建）

1. "记忆同步"开关（Toggle，默认关闭）
2. 启用时：密码输入框（两次确认）→ 调用 `sync.memorySetPassword()`
3. 禁用时：确认对话框（"已同步的加密数据将保留在远端"）
4. "未解锁"提示条（检测到 MEMORY.encrypted 存在但未解密）
5. "解锁"按钮 → 密码输入框 → 尝试解密

#### G5：AI 消息渲染集成

**文件：** AI 消息渲染组件（修改）

- 替换纯文本渲染为 `<CitationRenderer content={message.content} />`

#### G6：对话导出扩展

**文件：** 对话导出模块（修改）

- Markdown 导出：`citationToMarkdown()` 保持原始格式
- HTML 导出：渲染为 `<a href>` 可点击链接

#### G7：主进程装配

**文件：** `src/main/index.ts` 或服务装配文件（修改）

```typescript
// 1. 确保 .gitignore 规则
await ensureGitignoreRules(workspaceRoot)

// 2. 创建 MemorySyncManager
const memorySyncManager = new MemorySyncManager(fileManager, appEventBus, config)

// 3. 创建 TaskStateMachineSync
const taskStateMachineSync = new TaskStateMachineSync(taskStateMachine, appEventBus, sessionId)

// 4. 注入 hooks（在 SyncManager.push/pull 调用前后）
// push 前: await memorySyncManager.beforePush()
// pull 后: await memorySyncManager.afterPull()
//          await taskStateMachineSync.detectCrossDeviceTasks()

// 5. 注册 sync-extra IPC handler
registerSyncExtraHandlers({ memorySyncManager, taskStateMachineSync })

// 6. trace 意外同步检测
const stalePaths = await detectStaleSyncedPaths(workspaceRoot)
if (stalePaths.length > 0) { /* 发布警告事件 */ }
```

**验证：** 设置 UI 可用；加密同步链路通畅；引用渲染集成到 AI 对话；应用启动正常

---

### 阶段 H：单元测试（Step 8） — 预计 1.2 天

#### H1：加密模块测试（`encryption.test.ts`）

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | encrypt/decrypt 往返 | 明文一致 |
| 2 | 密钥错误时 decrypt 抛异常 | DecryptionError |
| 3 | 空 plaintext 加密/解密 | 正确处理 |
| 4 | 大文本（>10KB）加密/解密 | 正确处理 |
| 5 | 不同 salt 派生不同密钥 | 密钥不重复 |

#### H2：MemorySyncManager 测试（`memory-sync.test.ts`）

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | `beforePush()` 正常加密流程 | MEMORY.encrypted 生成 |
| 2 | `afterPull()` 正常解密流程 | MEMORY.md 被原子写入 |
| 3 | 未启用时 beforePush/afterPull 无操作 | 无副作用 |
| 4 | 解密失败 graceful degradation | `memory.sync-locked` 事件发布 |
| 5 | MEMORY.encrypted 不存在时 afterPull 无操作 | 无副作用 |

#### H3：TaskStateMachineSync 测试（`task-state-machine-sync.test.ts`）

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | pull 后检测跨设备任务 | 事件发布 |
| 2 | JSON 验证（合法/非法结构） | 返回正确 boolean |
| 3 | last-write-wins 冲突解决 | updatedAt 较新者胜出 |
| 4 | 无跨设备任务时不发布事件 | 静默 |

#### H4：同步配置测试（`sync-config.test.ts`）

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | `ensureGitignoreRules()` 追加缺失规则 | .gitignore 内容正确 |
| 2 | `detectStaleSyncedPaths()` 检测远端不应存在的目录 | 返回路径列表 |

#### H5：引用解析器测试（`citation-parser.test.ts`）

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 6 种引用格式解析 | 类型、字段正确 |
| 2 | `[file:path#L42]` 行号解析 | line: 42 |
| 3 | `[mcp:github:issue/234]` 三段式 | provider + ref 正确 |
| 4 | 无效格式返回 null | 不崩溃 |
| 5 | 多引用混合文本 extractCitations | 位置信息正确 |
| 6 | `citationToMarkdown()` 反序列化 | 与原始格式一致 |

#### H6：引用渲染组件测试（`citation-link.test.tsx` + `citation-renderer.test.tsx`）

| # | 测试用例 | 验证点 |
|---|---------|--------|
| 1 | 6 种引用类型渲染正确性 | 图标、颜色、链接 |
| 2 | 损坏引用警告样式 | 黄色背景、警告文案 |
| 3 | 点击跳转 mock | IPC 调用正确 |
| 4 | tooltip 内容 | 详情正确 |
| 5 | 纯文本无引用渲染 | 零引用开销 |
| 6 | 单引用和多引用渲染 | 交替分割正确 |

**覆盖率目标：** ≥ 80%

---

## 五、验收标准追踪

### .gitignore 规则与同步范围

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `.sibylla/trace/` 在 .gitignore 中 | A1 SYNC_ALWAYS_EXCLUDE + A2 ensureGitignoreRules | H4-1 |
| 2 | `.sibylla/events/` 在 .gitignore 中 | A1 SYNC_ALWAYS_EXCLUDE | H4-1 |
| 3 | `.sibylla/index/` 在 .gitignore 中 | A1 SYNC_ALWAYS_EXCLUDE | H4-1 |
| 4 | `.sibylla/mcp/` 在 .gitignore 中 | A1 SYNC_ALWAYS_EXCLUDE | H4-1 |
| 5 | `.sibylla/snapshots/` 在 .gitignore 中 | A1 SYNC_ALWAYS_EXCLUDE | H4-1 |
| 6 | `.sibylla/handbook-local/` 在 .gitignore 中 | A1 SYNC_ALWAYS_EXCLUDE | H4-1 |
| 7 | `.sibylla/plans/` 不在 .gitignore 中 | A2 ensureGitignoreRules 确认 | H4-1 |
| 8 | `.sibylla/agents/` 不在 .gitignore 中 | A2 ensureGitignoreRules 确认 | H4-1 |

### Plans 和 Agents 同步

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | push 时自动包含 `.sibylla/plans/` | A1 SYNC_ALWAYS_INCLUDE + G7 装配 | 手动验证 |
| 2 | push 时自动包含 `.sibylla/agents/` | A1 SYNC_ALWAYS_INCLUDE + G7 装配 | 手动验证 |
| 3 | pull 后 plans/ 和 agents/ 正确同步 | G7 装配 | 手动验证 |

### MEMORY.md 加密同步

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 未启用时 MEMORY.md 保持 .gitignore 不同步 | C2 beforePush() 检查 config | H2-3 |
| 2 | 启用后 push 前自动加密 MEMORY.md | C2 beforePush() | H2-1 |
| 3 | 加密后写入 `.sibylla/memory/MEMORY.encrypted`（base64） | C2 beforePush() + B2 encrypt() | H2-1 |
| 4 | 本地 MEMORY.md 始终保持明文 | C2 beforePush() 不修改 MEMORY.md | H2-1 |
| 5 | pull 后检测 MEMORY.encrypted 自动解密 | C2 afterPull() | H2-2 |
| 6 | 解密后原子写入 MEMORY.md | C2 afterPull() → fileManager.atomicWrite() | H2-2 |
| 7 | 密钥丢失标记"未解锁" | C2 afterPull() 失败分支 | H2-4 |
| 8 | AES-256-GCM + scrypt 密钥派生 | B1 + B2 + B3 | H1-1 |
| 9 | 密钥永不离开本地 | C1 userPassword 仅存内存 | 设计约束 |

### 任务状态多端续传

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | state.json 验证 JSON 结构合法性 | D1 validateStateJson() | H3-2 |
| 2 | last-write-wins 冲突解决 | D1 resolveConflict() | H3-3 |
| 3 | 跨设备可续传任务发布事件 | D1 detectCrossDeviceTasks() | H3-1 |
| 4 | lastSessionId 与 currentSessionId 不同 | D1 过滤逻辑 | H3-1 |

### Trace 意外同步检测

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 远端存在 trace 时输出警告日志 | A2 detectStaleSyncedPaths() | H4-2 |
| 2 | 弹出提示建议添加到 .gitignore | G7 装配中的警告处理 | 手动验证 |

### 加密同步设置 UI

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 设置面板"记忆同步"开关（默认关闭） | G4 MemorySyncSettings | 手动验证 |
| 2 | 启用时密码输入框（两次确认） | G4 | 手动验证 |
| 3 | 禁用时提示信息 | G4 | 手动验证 |
| 4 | "未解锁"提示条 | G4 | 手动验证 |

### 引用格式解析

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `[file:docs/auth-design.md]` → `{ kind: 'file', path: 'docs/auth-design.md' }` | E2 parseCitation() | H5-1 |
| 2 | `[file:docs/auth.md#L42]` → `{ kind: 'file', path: 'docs/auth.md', line: 42 }` | E2 parseCitation() | H5-2 |
| 3 | `[memory:dec-001]` → `{ kind: 'memory', entryId: 'dec-001' }` | E2 parseCitation() | H5-1 |
| 4 | `[handbook:modes/plan]` → `{ kind: 'handbook', entryId: 'modes/plan' }` | E2 parseCitation() | H5-1 |
| 5 | `[mcp:github:issue/234]` → `{ kind: 'mcp', provider: 'github', ref: 'issue/234' }` | E2 parseCitation() | H5-3 |
| 6 | `[plan:plan-20260418-103000]` → `{ kind: 'plan', planId: 'plan-20260418-103000' }` | E2 parseCitation() | H5-1 |

### 引用渲染

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 6 种引用渲染为可点击链接（各有图标和颜色） | F1 CitationLink | H6-1 |
| 2 | 文件引用 → 蓝色文件图标，编辑器打开 | F1 handleCitationClick | H6-3 |
| 3 | 记忆引用 → 紫色脑图标，tooltip 显示 confidence | F1 + F3 | H6-4 |
| 4 | MCP 引用 → 提供商图标，打开本地副本 + "查看原文" | F1 + F3 | H6-3 |
| 5 | Handbook 引用 → 绿色书图标，打开 Handbook viewer | F1 | H6-3 |
| 6 | Plan 引用 → 橙色图标，打开 Plan 面板 | F1 | H6-3 |

### 损坏引用处理

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 目标不存在时黄色警告样式 | F1 broken prop | H6-2 |
| 2 | tooltip 显示"目标不存在" | F1 | H6-2 |
| 3 | 替代搜索建议 | F1 "搜索相似内容"链接 | H6-2 |

### 对话导出保留引用

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | Markdown 导出保持原始格式 | G6 + E2 citationToMarkdown() | 手动验证 |
| 2 | HTML 导出渲染为 `<a href>` 链接 | G6 | 手动验证 |

---

## 六、风险与缓解

| # | 风险 | 影响 | 概率 | 缓解策略 |
|---|------|------|------|---------|
| 1 | **SyncManager 无 hooks 机制** — SyncManager 没有 beforePush/afterPull 生命周期钩子，需在主进程装配层手动注入调用 | 中 | 已确认 | 在主进程装配文件中，在 `SyncManager.push()` 调用前手动调用 `memorySyncManager.beforePush()`，pull 后手动调用 `afterPull()`。虽然不够优雅，但不修改 SyncManager 符合约束 |
| 2 | **密钥仅存内存的 UX 问题** — 应用重启后用户需重新输入密码才能解密 MEMORY.md | 中 | 高 | 设置 UI 提供"解锁"按钮，应用启动时检测 MEMORY.encrypted 存在且 MEMORY.md 为空时自动弹出解锁提示 |
| 3 | **MEMORY.encrypted 与 MEMORY.md 冲突** — 远端 MEMORY.encrypted 解密后覆盖本地 MEMORY.md，可能丢失本地新增内容 | 高 | 中 | beforePush() 先加密再推送，确保本地最新内容始终在远端；afterPull() 仅在远端更新时间较新时覆盖 |
| 4 | **引用解析正则误匹配** — AI 回答中可能出现 `[file:something]` 格式的非引用文本（如代码示例） | 中 | 中 | 引用解析器仅在 AI 回答的文本内容中扫描，不在代码块内扫描（利用已有的代码块分段机制） |
| 5 | **SyncManager.push() 未包含 .sibylla/plans/** — 如果 SyncManager 只追踪 workspace 根目录文件，可能不包含 `.sibylla/` 子目录 | 高 | 中 | 确认 SyncManager 的 Git add 范围：如果 `git add .` 覆盖整个 workspace（含 .sibylla/），则只要 .gitignore 正确即可 |
| 6 | **TaskStateMachine.findResumeable() 不存在** — 如果 Sprint 3.1 的 TaskStateMachine 没有此方法 | 中 | 低 | 实现内部扫描逻辑：直接读取 `.sibylla/agents/*/state.json` 文件，不依赖 TaskStateMachine API |
| 7 | **引用跳转依赖尚未实现的面板** — 如 Plan 面板、Handbook viewer 可能尚未完成 | 低 | 中 | 引用跳转通过 IPC 调用，目标面板不存在时显示"功能即将上线"提示 |
| 8 | **加密性能** — scrypt 密钥派生较慢（~100ms），可能阻塞主进程 | 低 | 低 | scrypt 仅在设置密码时调用一次，后续使用缓存的 Buffer 密钥；可考虑 worker 线程但 MVP 不需要 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 | 验证方式 |
|----|------|--------|---------|
| Day 1 上午 | A1-A2 | `sync-config.ts` 完成 + .gitignore 更新 | `npx tsc --noEmit` 通过 |
| Day 1 下午 | B1-B3 | `encryption.ts` 加密/解密模块完成 | 单元测试 H1 通过 |
| Day 2 上午 | C1-C2 | `memory-sync.ts` MemorySyncManager 完成 | 单元测试 H2 通过 |
| Day 2 下午 | D1 | `task-state-machine-sync.ts` 完成 | 单元测试 H3 通过 |
| Day 3 上午 | E1-E2 | `citation-parser.ts` 引用解析器完成 | 单元测试 H5 通过 |
| Day 3 下午 | F1-F3 | `CitationLink.tsx` + `CitationRenderer.tsx` 完成 | 手动验证渲染效果 |
| Day 4 上午 | G1-G4 | IPC handler + Preload + 设置 UI 完成 | 应用内功能验证 |
| Day 4 下午 | G5-G7 | AI 消息集成 + 导出扩展 + 主进程装配 | 全链路验证 |
| Day 5 上午 | H4, H6 | sync-config 测试 + 引用渲染测试 | 单元测试通过 |
| Day 5 下午 | — | 集成验证 + Bug 修复 | `npx vitest run` 覆盖率 ≥ 80% |
| Day 6 | — | 缓冲：集成验证 + 文档更新 | 全量回归 |

### 关键里程碑

| 里程碑 | 时间点 | 判定标准 |
|--------|--------|----------|
| M1: 同步基础就绪 | Day 1 结束 | .gitignore 规则正确 + 加密模块单元测试通过 |
| M2: 同步链路通畅 | Day 2 结束 | MemorySyncManager + TaskStateMachineSync 完成，单元测试通过 |
| M3: 引用系统就绪 | Day 3 结束 | 引用解析器 + 渲染组件完成，6 种引用正确解析和渲染 |
| M4: 全量集成完成 | Day 4 结束 | IPC + 设置 UI + AI 消息集成 + 主进程装配全部工作 |
| M5: 全量验收通过 | Day 5 结束 | 所有单元测试通过，覆盖率 ≥ 80%，应用启动正常 |

---

**文档版本**: v1.0
**最后更新**: 2026-04-29
**维护者**: Sibylla 架构团队
