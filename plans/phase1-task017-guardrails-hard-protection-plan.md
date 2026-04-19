# PHASE1-TASK017: Guardrails 硬性保障层 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task017_guardrails-hard-protection.md](../specs/tasks/phase1/phase1-task017_guardrails-hard-protection.md)
> 创建日期：2026-04-19
> 最后更新：2026-04-19

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK017 |
| **任务标题** | Guardrails 硬性保障层 |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **前置依赖** | ✅ FileManager、✅ FileHandler、✅ Logger、✅ AuthHandler（用户身份缓存） |

### 目标

在 Electron 主进程的 IPC handler 层建立确定性（非 LLM、基于规则）防线，拦截 AI 发起的高风险操作。即使 AI 被 prompt injection 攻击，关键文件也不会被破坏。

### 核心命题

当前 `FileHandler`（458 行）直接将渲染进程请求透传给 `FileManager`。Sprint 3 的 AI 对话能力（TASK011-013）使 AI 可通过 Diff 审查机制建议文件修改，但缺乏系统性安全保障：

1. **系统路径缺口**：AI 理论上可建议修改 `.sibylla/`、`.git/`、`node_modules/`
2. **密钥泄露缺口**：AI 生成内容可能含 API Key / 私钥 / JWT
3. **越权访问缺口**：非管理员可能通过 AI 越权访问他人 personal 空间
4. **批量操作缺口**：AI 可能单次批量删除/重命名大量文件

FileManager 内部已有 `CORE_FORBIDDEN_PATHS`（36 行常量）提供基础路径安全，但**不感知操作来源**（用户 vs AI）、**不检查文件内容**、**不了解用户角色**。Guardrails 是在 IPC handler 层的额外语义防线，两层共存不冲突。

### 范围边界

**包含：**
- `GuardrailEngine` 核心引擎
- 4 类 Guard 规则：SystemPath / SecretLeak / PersonalSpace / BulkOperation
- 完整类型定义（tagged union）
- IPC 事件通知（`harness:guardrailBlocked`）
- FileHandler 注入 GuardrailEngine 改造
- 单元测试（每条规则 ≥ 5 用例）

**不包含：**
- LLM 语义级 Guard（后续迭代）
- RateLimitGuard / NoOpGuard / PathTraversalGuard（后续迭代）
- Guardrail 管理 UI（TASK021）
- GuardrailNotification 渲染进程组件（TASK021）

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 | 应用场景 |
|------|------|---------|---------|
| 项目宪法 | `CLAUDE.md` | §三 架构约束：主进程与渲染进程严格隔离通过 IPC 通信；§四 代码规范：TypeScript 严格模式禁止 any，关键操作结构化日志；§七 安全红线：个人空间隔离 | GuardrailEngine 架构定位、类型设计、日志规范 |
| 系统架构 | `specs/design/architecture.md` | §3.2 进程通信架构：invoke/handle 模式 | Guardrail 注入点在 IPC handler 层而非 FileManager 层 |
| 数据模型 | `specs/design/data-and-api.md` | §1.1 Workspace 标准目录结构：`personal/[name]/`、`.sibylla/` | PersonalSpaceGuard 路径匹配规则、SystemPathGuard 受保护目录定义 |
| 测试与安全 | `specs/design/testing-and-security.md` | §1.1 测试金字塔：单元测试 ≥80%；§3.4 客户端安全：渲染进程不直接访问文件系统 | 测试策略、安全设计验证 |
| 需求规格 | `specs/requirements/phase1/sprint3.1-harness.md` | §1.3 设计原则：Guardrails 下沉到主进程 IPC 层，渲染进程无法绕过 | 架构决策依据 |
| 任务规格 | `specs/tasks/phase1/phase1-task017_guardrails-hard-protection.md` | 10 步执行路径、验收标准 | 实施步骤蓝图 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | `safeHandle` 包装模式、`IPCChannelMap` 类型映射、`broadcastToAllWindows` 主进程推送模式 |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | tagged union（`GuardrailVerdict`）设计、类型守卫（`isBlockVerdict` / `isConditionalVerdict`）、禁止 any |
| `electron-desktop-app` | `.kilocode/skills/phase0/electron-desktop-app/SKILL.md` | 主进程服务生命周期管理、进程隔离安全原则 |

### 2.3 前置代码依赖

| 模块 | 路径 | 行数 | 状态 | 复用方式 |
|------|------|------|------|---------|
| FileManager | `src/main/services/file-manager.ts` | 1581 | ✅ 不修改 | 读取 `getWorkspaceRoot()`；内部 `CORE_FORBIDDEN_PATHS` 与 Guardrail 双层共存 |
| FileHandler | `src/main/ipc/handlers/file.handler.ts` | 458 | ⚠️ 需改造 | 注入 GuardrailEngine，writeFile/deleteFile/moveFile 前置检查 |
| IpcHandler 基类 | `src/main/ipc/handler.ts` | 221 | ✅ 不修改 | `safeHandle` 包装、`wrapResponse`/`wrapError`、`broadcastToAllWindows` 模式 |
| AuthHandler | `src/main/ipc/handlers/auth.handler.ts` | 288 | ✅ 不修改 | `getCachedUser()` 获取当前用户信息构建 OperationContext |
| Logger | `src/main/utils/logger.ts` | 96 | ✅ 不修改 | 结构化日志 `logger.warn('guardrail.triggered', ...)` |
| IPC_CHANNELS | `src/shared/types.ts:72-209` | 1139 | ⚠️ 需扩展 | 新增 `HARNESS_GUARDRAIL_BLOCKED` 等 3 个通道常量 |
| IPCChannelMap | `src/shared/types.ts:251-348` | — | ⚠️ 需扩展 | 新增 guardrail 通道类型映射 |
| MemberRole | `src/shared/types/member.types.ts:8` | 63 | ✅ 不修改 | `OperationContext.userRole: MemberRole` 类型引用 |
| WorkspaceMember | `src/shared/types/member.types.ts:10-17` | — | ✅ 不修改 | PersonalSpaceGuard 通过 `member.id` + `member.role` 做权限判断 |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| TASK018（编排器） | `HarnessOrchestrator` 内部持有 `GuardrailEngine` 引用 |
| TASK021（Harness UI） | `GuardrailNotification` 组件消费 `harness:guardrailBlocked` 事件 |

### 2.5 npm 依赖

无需新增 npm 包。所有核心依赖已安装：
- `vitest` ^1.2.0 — 单元测试运行
- `typescript` ^5.3.3 — 严格类型检查

---

## 三、架构设计

### 3.1 双层防御共存策略

```
渲染进程发起请求
      │
      ▼
FileHandler (IPC 层)
      │
      ├── [Guardrail 层] ← 仅对 source='ai' 的操作执行完整检查
      │     │
      │     ├── SystemPathGuard      → .sibylla/ .git/ node_modules/ 写入阻断
      │     ├── SecretLeakGuard      → 内容级敏感信息检测（所有 source）
      │     ├── PersonalSpaceGuard   → 用户角色 + 路径组合检查
      │     └── BulkOperationGuard   → 批量操作二次确认
      │
      ▼ (通过后)
FileManager
      │
      ├── [内部安全层] ← 所有操作的基础安全
      │     └── CORE_FORBIDDEN_PATHS + checkForbiddenPaths()
      │
      ▼
实际文件操作
```

**关键设计决策：**

| 决策项 | 选择 | 理由 |
|--------|------|------|
| Guardrail 注入层级 | IPC handler（FileHandler） | 任务规格明确要求"Guardrail 职责在 IPC handler 层"；FileManager 不做任何修改 |
| 规则执行方式 | 顺序链，首个拒绝即停止 | 避免不必要计算；SystemPathGuard 最先执行成本最低 |
| fail-closed 策略 | 规则异常时默认阻断 | 安全底座必须保守；宁可误拦不可漏放 |
| Guardrail 引擎注入 | setter 方法注入 | 与 FileHandler 现有 `setFileManager`/`setAutoSaveManager` 模式一致 |
| OperationContext 构建 | handler 层从 AuthHandler + FileManager 获取 | 不引入新的全局状态；复用已有缓存 |

### 3.2 文件结构

本任务需要新建以下文件：

```
sibylla-desktop/src/main/services/harness/guardrails/
├── types.ts              # NEW - 接口定义
├── engine.ts             # NEW - GuardrailEngine 核心引擎
├── system-path.ts        # NEW - SystemPathGuard
├── secret-leak.ts        # NEW - SecretLeakGuard
├── personal-space.ts     # NEW - PersonalSpaceGuard
└── bulk-operation.ts     # NEW - BulkOperationGuard

sibylla-desktop/tests/harness/guardrails/
├── engine.test.ts        # NEW - 引擎级测试
├── system-path.test.ts   # NEW - SystemPathGuard 测试
├── secret-leak.test.ts   # NEW - SecretLeakGuard 测试
├── personal-space.test.ts # NEW - PersonalSpaceGuard 测试
└── bulk-operation.test.ts # NEW - BulkOperationGuard 测试
```

需要修改的文件：

```
sibylla-desktop/src/shared/types.ts                    # MODIFY - 新增 IPC 通道常量 + 类型映射
sibylla-desktop/src/main/ipc/handlers/file.handler.ts  # MODIFY - 注入 GuardrailEngine
```

### 3.3 数据流

```
渲染进程                          主进程 FileHandler                   GuardrailEngine
    │                               │                                  │
    │ ipcRenderer.invoke('file:write', path, content)
    │──────────────────────────────▶│                                  │
    │                               │ buildOperationContext(event,'ai') │
    │                               │─────────────────────────────────▶│
    │                               │                                  │ SystemPathGuard.check()
    │                               │                                  │ SecretLeakGuard.check()
    │                               │                                  │ PersonalSpaceGuard.check()
    │                               │◀── verdict ─────────────────────│
    │                               │                                  │
    │                               │ [if blocked]                     │
    │                               │   broadcast('harness:guardrailBlocked', verdict)
    │                               │   throw Error                    │
    │                               │                                  │
    │                               │ [if conditional]                 │
    │                               │   return { status: 'pending_     │
    │                               │     confirmation', verdict }     │
    │                               │                                  │
    │                               │ [if allowed]                     │
    │                               │   fileManager.writeFile(...)     │
    │◀── IPCResponse ◀─────────────│                                  │
```

---

## 四、类型系统设计

### 4.1 Guardrail 核心类型

`src/main/services/harness/guardrails/types.ts` 需要定义以下类型，作为全模块唯一来源：

```typescript
import type { MemberRole } from '../../../../shared/types/member.types'

export type FileOperationType = 'write' | 'delete' | 'rename' | 'read'
export type OperationSource = 'user' | 'ai' | 'sync'

export interface FileOperation {
  readonly type: FileOperationType
  readonly path: string
  readonly newPath?: string
  readonly content?: string
  readonly affectedPaths?: readonly string[]
}

export interface OperationContext {
  readonly source: OperationSource
  readonly userId: string
  readonly userRole: MemberRole
  readonly workspaceRoot: string
  readonly sessionId?: string
}

export type GuardrailVerdict =
  | { readonly allow: true }
  | {
      readonly allow: false
      readonly ruleId: string
      readonly reason: string
      readonly severity: 'block'
    }
  | {
      readonly allow: 'conditional'
      readonly ruleId: string
      readonly requireConfirmation: true
      readonly reason: string
    }

export interface GuardrailRule {
  readonly id: string
  readonly description: string
  check(op: FileOperation, ctx: OperationContext): Promise<GuardrailVerdict>
}

export interface GuardrailRuleSummary {
  readonly id: string
  readonly description: string
  readonly enabled: boolean
}
```

### 4.2 类型设计约束

| 类型 | 设计要求 | 理由 |
|------|---------|------|
| `FileOperation` | 全字段 `readonly` | Guard 规则不得篡改输入，只做判定 |
| `OperationContext` |userRole` 直接复用 `MemberRole` | 避免角色字面量重复定义 |
| `GuardrailVerdict` | 使用 tagged union | 严格区分 allow / block / conditional 三类返回 |
| `affectedPaths` | `readonly string[]` | 批量操作只读输入，避免 rule 内误修改 |
| `sessionId` | 可选 | 当前 FileHandler 未必始终具备 AI session 上下文 |

### 4.3 类型守卫辅助函数

建议在 `types.ts` 中同步提供判别辅助函数，减少 handler 层分支噪音：

```typescript
export function isBlockedVerdict(
  verdict: GuardrailVerdict,
): verdict is Extract<GuardrailVerdict, { allow: false }> {
  return verdict.allow === false
}

export function isConditionalVerdict(
  verdict: GuardrailVerdict,
): verdict is Extract<GuardrailVerdict, { allow: 'conditional' }> {
  return verdict.allow === 'conditional'
}
```

这样 `file.handler.ts` 可在严格模式下无断言分支处理 `verdict.ruleId`、`verdict.reason`。

### 4.4 IPC 共享类型扩展

`src/shared/types.ts` 需追加以下通道与共享类型：

```typescript
// Harness / Guardrail operations
HARNESS_GUARDRAIL_BLOCKED: 'harness:guardrailBlocked',
HARNESS_LIST_GUARDRAILS: 'harness:listGuardrails',
HARNESS_SET_GUARDRAIL_ENABLED: 'harness:setGuardrailEnabled',
```

新增共享结构：

```typescript
export interface GuardrailBlockedEvent {
  readonly ruleId: string
  readonly reason: string
  readonly severity: 'block'
  readonly path?: string
  readonly operationType?: 'write' | 'delete' | 'rename' | 'read'
}

export interface SetGuardrailEnabledRequest {
  readonly ruleId: string
  readonly enabled: boolean
}
```

`IPCChannelMap` 对应追加：

```typescript
[IPC_CHANNELS.HARNESS_LIST_GUARDRAILS]: {
  params: []
  return: GuardrailRuleSummary[]
}
[IPC_CHANNELS.HARNESS_SET_GUARDRAIL_ENABLED]: {
  params: [request: SetGuardrailEnabledRequest]
  return: void
}
```

### 4.5 FileHandler 返回类型兼容策略

当前 `FILE_WRITE` / `FILE_DELETE` / `FILE_MOVE` 在 `IPCChannelMap` 中大概率返回 `void`。但任务规格要求 `conditional` 时返回 `{ status: 'pending_confirmation', verdict }`。

因此计划采用以下兼容策略：

| 接口 | 当前行为 | 新行为建议 |
|------|---------|-----------|
| `file:write` | `Promise<void>` | 升级为 `Promise<FileOperationResult>` |
| `file:delete` | `Promise<void>` | 升级为 `Promise<FileOperationResult>` |
| `file:move` | `Promise<void>` | 升级为 `Promise<FileOperationResult>` |

共享类型建议：

```typescript
export type FileOperationResult =
  | { readonly status: 'completed' }
  | {
      readonly status: 'pending_confirmation'
      readonly verdict: Extract<GuardrailVerdict, { allow: 'conditional' }>
    }
```

**兼容性说明：**
- 旧调用方若忽略返回值，不受影响
- 新调用方可在 future UI 中识别 `pending_confirmation`
- 本任务不实现前端确认 UI，但必须先把协议预留完整

---

## 五、规则设计

### 5.1 GuardrailEngine 设计

`engine.ts` 负责规则编排、启停控制、异常隔离与日志记录。

建议结构：

```typescript
export class GuardrailEngine {
  private readonly rules: GuardrailRule[]
  private readonly enabledRules: Map<string, boolean>

  constructor(private readonly logger: typeof logger) {
    this.rules = [
      new SystemPathGuard(),
      new SecretLeakGuard(),
      new PersonalSpaceGuard(),
      new BulkOperationGuard(),
    ]
    this.enabledRules = new Map(this.rules.map(rule => [rule.id, true]))
  }
}
```

引擎职责：
1. 顺序执行已启用规则
2. 捕获单条规则异常并 fail-closed
3. 首个 `block` / `conditional` 即返回
4. 提供 `listRules()` / `setRuleEnabled()` 管理接口
5. 输出结构化日志，字段至少包含 `ruleId`、`path`、`operationType`、`source`、`user`、`result`

### 5.2 规则执行顺序

推荐顺序：

1. `SystemPathGuard`
2. `SecretLeakGuard`
3. `PersonalSpaceGuard`
4. `BulkOperationGuard`

排序理由：

| 顺位 | 规则 | 原因 |
|------|------|------|
| 1 | SystemPathGuard | 字符串前缀检查成本最低，优先拦截系统目录写入 |
| 2 | SecretLeakGuard | 内容扫描成本次低，且写入泄密风险高 |
| 3 | PersonalSpaceGuard | 需要路径语义判断与用户角色信息 |
| 4 | BulkOperationGuard | 仅 delete/rename 生效，属于条件确认而非直接封堵 |

### 5.3 SystemPathGuard

**文件：** `system-path.ts`

核心规则：
- 仅对 `ctx.source === 'ai'` 生效
- 仅对 `op.type !== 'read'` 生效
- 检查 `op.path` 与 `op.newPath`（rename 目标）
- 归一化后禁止前缀：`.sibylla/`、`.git/`、`node_modules/`

建议补充细节：
- 统一去除开头 `./`、`/`
- 对目录本体也拦截：`.git`、`.sibylla`、`node_modules`
- rename 时同时检查源路径与目标路径，防止把普通文件移动进系统目录

### 5.4 SecretLeakGuard

**文件：** `secret-leak.ts`

核心规则：
- 对所有 `source` 生效
- 仅 `op.type === 'write' && op.content` 生效
- 使用具名模式数组便于日志与测试断言

建议模式表：

| 名称 | 正则 |
|------|------|
| openai | `/sk-[a-zA-Z0-9]{32,}/` |
| anthropic | `/sk-ant-[a-zA-Z0-9\-_]{95,}/` |
| github_pat | `/ghp_[a-zA-Z0-9]{36}/` |
| aws_access_key | `/AKIA[0-9A-Z]{16}/` |
| private_key | `/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/` |
| jwt | `/eyJ[A-Za-z0-9_\-]{20,}\.eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}/` |

日志中仅记录匹配模式名，**不得输出命中的原始敏感片段**。

### 5.5 PersonalSpaceGuard

**文件：** `personal-space.ts`

核心规则：
- 路径不在 `personal/` 下直接放行
- `admin` 全放行
- 非管理员只允许访问 `personal/{ctx.userId}/...`
- 检查 `op.path` 与 `op.newPath`，避免 rename 绕过

建议路径匹配逻辑：
1. 归一化路径
2. 提取第一段是否为 `personal`
3. 提取第二段成员名
4. 若成员名缺失（如 `personal/` 根目录）默认放行或仅允许 list/read，由实现阶段根据现有 FileHandler 能力选择；本任务优先覆盖明确文件路径场景

### 5.6 BulkOperationGuard

**文件：** `bulk-operation.ts`

核心规则：
- 仅 `op.type === 'delete' || op.type === 'rename'`
- `affectedPaths?.length > 3` 时返回 `conditional`
- 它是唯一可返回 `allow: 'conditional'` 的规则

建议补充：
- 若 `affectedPaths` 缺失，则按单文件处理直接放行
- `rename` 时批量场景通常来自未来批量重命名 API，本任务先兼容类型层
- reason 中携带影响文件数量，方便 UI 二次确认展示

---

## 六、FileHandler 集成方案

### 6.1 集成目标

在不修改 `FileManager` 内部实现的前提下，将 Guardrail 前置到 `FileHandler` 的 `writeFile`、`deleteFile`、`moveFile`，并预留读操作上下文构建能力供后续 Harness 编排层复用。

### 6.2 FileHandler 改造点

**文件：** `sibylla-desktop/src/main/ipc/handlers/file.handler.ts`

新增字段：

```typescript
private guardrailEngine: GuardrailEngine | null = null
private authHandler: AuthHandler | null = null
```

新增 setter：

```typescript
setGuardrailEngine(engine: GuardrailEngine): void
setAuthHandler(authHandler: AuthHandler): void
```

这样与现有 `setFileManager()`、`setAutoSaveManager()` 注入风格保持一致。

### 6.3 OperationContext 构建策略

新增私有方法：

```typescript
private buildOperationContext(source: OperationSource): OperationContext
```

构建来源：

| 字段 | 来源 | 说明 |
|------|------|------|
| `workspaceRoot` | `this.fileManager.getWorkspaceRoot()` | 直接复用 FileManager 已归一化根目录 |
| `userId` | `this.authHandler?.getCachedUser()?.id ?? 'anonymous'` | 优先使用 AuthHandler 缓存 |
| `userRole` | 默认 `'viewer'`，若后续已拿到成员角色则覆盖 | 保守默认，避免权限放大 |
| `source` | 由 handler 调用处显式传入 | 本任务默认支持 `'ai' | 'user'` |
| `sessionId` | 暂为空或从后续 harness 请求附带 | 先预留字段 |

**关键约束：**
- 若无法可靠解析角色，默认使用最小权限 `viewer`
- 不从渲染进程透传 userRole，避免伪造
- 后续若接入 workspace members，可在主进程查询 `members.json` 或 `workspace:getMembers` 结果缓存补齐角色

### 6.4 source 判定策略

本任务规格要求“仅对 source='ai' 的操作执行完整检查”，但当前 `FileHandler` 现有 IPC 签名并未携带 source。

因此实施计划分两步：

#### 阶段 A：协议预留
- 在共享类型中为文件操作追加可选元信息参数，如 `source?: 'user' | 'ai' | 'sync'`
- preload 层后续由 AI 专用调用链传入 `source: 'ai'`

#### 阶段 B：兼容落地
- 当前普通文件编辑默认按 `source: 'user'` 处理
- SecretLeakGuard 仍对所有 source 生效
- 当 Harness / AI Diff Review 落地调用 FileHandler 时，明确传入 `source: 'ai'`

**原因：** 当前代码库尚无“AI 文件操作专用 IPC 通道”，若强行把全部 `file:write` 视为 AI 操作，将误伤用户正常编辑流。

### 6.5 三类操作接入细节

#### writeFile

执行顺序：
1. 检查 `fileManager` 是否已初始化
2. 构建 `OperationContext`
3. 调用 `guardrailEngine.check({ type: 'write', path, content }, ctx)`
4. 若 `block`：
   - `broadcastToAllWindows(IPC_CHANNELS.HARNESS_GUARDRAIL_BLOCKED, payload)`
   - `throw new Error(reason)`
5. 若 `conditional`：返回 `FileOperationResult`
6. 若 `allow`：执行原有 `fileManager.writeFile()`
7. 返回 `{ status: 'completed' }`

#### deleteFile

调用：

```typescript
await this.guardrailEngine.check({ type: 'delete', path }, ctx)
```

说明：
- 当前单文件删除通常不会触发 BulkOperationGuard
- 未来批量删除 API 可通过 `affectedPaths` 扩展而不破坏现有结构

#### moveFile

调用：

```typescript
await this.guardrailEngine.check({
  type: 'rename',
  path: sourcePath,
  newPath: destPath,
}, ctx)
```

说明：
- move 在 Guardrail 语义层视作 rename
- SystemPathGuard 与 PersonalSpaceGuard 都必须同时检查源与目标

### 6.6 Guardrail 阻断事件格式

广播事件建议统一为：

```typescript
const payload: GuardrailBlockedEvent = {
  ruleId: verdict.ruleId,
  reason: verdict.reason,
  severity: 'block',
  path,
  operationType: 'write',
}
```

广播原因：
- 满足 TASK021 的前端通知消费需求
- 即便 IPC invoke 返回错误，渲染进程仍能收到异步事件用于展示 toast / banner

### 6.7 引擎管理接口暴露

虽然本任务不实现管理 UI，但建议在 `FileHandler` 或未来 `HarnessHandler` 中预留：
- `harness:listGuardrails`
- `harness:setGuardrailEnabled`

**实现建议：**
- 若当前不新增独立 `HarnessHandler`，可由 FileHandler 临时注册该两个 handler
- 若项目已有 `src/main/services/harness/` 主干并即将引入 TASK018，优先新建 `HarnessHandler`

为降低本任务耦合，推荐：
- 本任务先只在共享类型和 `GuardrailEngine` 中完成支持
- IPC handler 暴露可放在 TASK018 一并承接

### 6.8 主进程装配点

建议在主进程初始化阶段完成：

```typescript
const guardrailEngine = new GuardrailEngine(logger)
fileHandler.setGuardrailEngine(guardrailEngine)
fileHandler.setAuthHandler(authHandler)
```

这样后续 `HarnessOrchestrator` 也可直接复用同一实例，保证规则启停状态一致。

---

## 七、测试策略与用例矩阵

### 7.1 测试分层

遵循 `specs/design/testing-and-security.md`：

| 层级 | 目标 | 文件位置 |
|------|------|---------|
| 单元测试 | 每个 Guard 规则的确定性逻辑 | `tests/harness/guardrails/*.test.ts` |
| 引擎测试 | 规则链、fail-closed、启停控制 | `tests/harness/guardrails/engine.test.ts` |
| IPC 集成测试 | FileHandler 与 GuardrailEngine 联动、广播事件 | `tests/ipc/file-handler.test.ts` 扩展或新增 guardrail 专项测试 |

### 7.2 每条规则最低覆盖矩阵

#### SystemPathGuard

| 用例 | 预期 |
|------|------n| AI 写 `.sibylla/config.json` | block |
| AI 写 `.git/HEAD` | block |
| AI 写 `node_modules/foo/index.js` | block |
| AI 读 `.sibylla/memory/daily/...` | allow |
| user 写 `.sibylla/config.json` | allow |
| AI 写 `docs/product/prd.md` | allow |
| AI move `docs/a.md -> .git/a.md` | block |

#### SecretLeakGuard

| 用例 | 预期 |
|------|------|
| 内容含 OpenAI key | block |
| 内容含 GitHub PAT | block |
| 内容含 AWS key | block |
| 内容含 private key header | block |
| 内容含 JWT | block |
| 正常 markdown | allow |
| delete 操作 | allow |

#### PersonalSpaceGuard

| 用例 | 预期 |
|------|------|
| bob 读 `personal/alice/notes.md` | block |
| bob 读 `personal/bob/notes.md` | allow |
| admin 读 `personal/alice/notes.md` | allow |
| 非 personal 路径 | allow |
| bob move `personal/bob/a.md -> personal/alice/a.md` | block |

#### BulkOperationGuard

| 用例 | 预期 |
|------|------|
| delete 4 files | conditional |
| delete 3 files | allow |
| rename 4 files | conditional |
| write 4 files | allow |
| missing `affectedPaths` | allow |

### 7.3 GuardrailEngine 测试重点

| 场景 | 断言 |
|------|------|
| 所有规则通过 | 返回 `{ allow: true }` |
| 第一条规则阻断 | 后续规则不再执行 |
| 规则抛异常 | 返回 block，reason 含 fail-closed 语义 |
| 规则被禁用 | 被跳过且后续规则继续执行 |
| `listRules()` | 返回 4 条规则摘要 |
| `setRuleEnabled()` 未知 ruleId | 抛出明确错误 |

### 7.4 IPC 集成测试重点

在 `tests/ipc/file-handler.test.ts` 基础上补充：

1. write 被 Guardrail 阻断时返回 `success: false`
2. block 时触发 `BrowserWindow.getAllWindows().webContents.send`
3. conditional 时返回 `pending_confirmation`
4. allow 时仍保持既有文件写入成功路径
5. 无 `guardrailEngine` 注入时，handler 应按原逻辑执行或直接跳过 Guardrail（需在实现时统一决策，推荐：未注入则跳过并记 warn 日志）

### 7.5 性能与日志验证

虽然单元测试难以精准断言 `<5ms`，但可通过以下方式验证：
- 规则实现禁止任何 I/O、网络调用、LLM 调用
- engine test 中对 1000 次 check 做简单基准，确保平均耗时远低于阈值
- 日志测试中确认不输出敏感内容明文

---

## 八、实施步骤与阶段目标

### 阶段 1：类型与骨架搭建

**目标：** 先建立最小可编译骨架，锁定类型边界。

执行项：
1. 新建 `types.ts`，定义 `FileOperation` / `OperationContext` / `GuardrailVerdict` / `GuardrailRule`
2. 在 `src/shared/types.ts` 追加 guardrail 事件与管理通道类型
3. 新建 `engine.ts` 空实现与 4 个 rule 文件骨架
4. 新建测试目录与空测试文件

**阶段完成标志：**
- `npm run type-check` 通过
- 新增文件均能被 TypeScript 正确解析

### 阶段 2：四类规则实现

**目标：** 完成所有纯规则逻辑，并通过独立单元测试。

执行项：
1. 实现 `SystemPathGuard`
2. 实现 `SecretLeakGuard`
3. 实现 `PersonalSpaceGuard`
4. 实现 `BulkOperationGuard`
5. 为每条规则补齐 ≥5 测试用例

**阶段完成标志：**
- `tests/harness/guardrails/*.test.ts` 全绿
- 每条规则独立可用，无引擎依赖

### 阶段 3：GuardrailEngine 实现

**目标：** 完成规则编排、异常隔离、启停控制。

执行项：
1. 按既定顺序注册 4 条规则
2. 实现 `check()` 顺序执行
3. 实现 fail-closed
4. 实现 `listRules()` / `setRuleEnabled()`
5. 完成 engine 测试

**阶段完成标志：**
- 引擎层全部测试通过
- fail-closed 与 skip-disabled 行为稳定

### 阶段 4：FileHandler 接入

**目标：** 把 Guardrail 前置到真实文件操作入口。

执行项：
1. 在 `file.handler.ts` 注入 `guardrailEngine`
2. 新增 `buildOperationContext()`
3. 改造 `writeFile` / `deleteFile` / `moveFile`
4. 新增 `harness:guardrailBlocked` 广播
5. 视需要扩展 `FileOperationResult` 共享类型

**阶段完成标志：**
- IPC 集成测试覆盖 block / conditional / allow 三条路径
- 不修改 `FileManager` 任何业务逻辑

### 阶段 5：主进程装配与回归验证

**目标：** 确保服务初始化、测试、类型、lint 全部通过。

执行项：
1. 在主进程入口装配 `GuardrailEngine`
2. 关联 `fileHandler` 与 `authHandler`
3. 运行 type-check / lint / test
4. 人工验证典型路径：AI 写系统目录、写敏感密钥、跨 personal 访问、批量删除

**阶段完成标志：**
- 全量验证通过
- 验收标准具备逐条映射证据

### 8.6 推荐开发顺序

为降低返工，建议严格按以下顺序提交代码：

1. `types.ts`
2. 4 条 rule
3. `engine.ts`
4. `shared/types.ts`
5. `file.handler.ts`
6. main 装配
7. 测试补齐

这样能避免 handler 改造时类型协议尚未稳定。

---

## 九、风险、验证与交付标准

### 9.1 主要风险

| 风险 | 表现 | 缓解策略 |
|------|------|---------|
| source 无法区分 AI / 用户 | 普通编辑被误拦或 AI 绕过 | 先协议预留 `source`，普通调用默认 `user`，AI 调用链后续显式传入 |
| userRole 解析不完整 | PersonalSpaceGuard 误判 | 默认最小权限 `viewer`；后续结合 workspace member 缓存增强 |
| 返回类型变更影响旧调用 | 前端文件操作兼容性波动 | 使用兼容联合类型，旧调用方忽略返回值即可 |
| 日志泄露敏感内容 | SecretLeakGuard 反而暴露密钥 | 仅记录 pattern name，不输出原文 |
| 规则异常导致写入放过 | 安全底座失效 | 统一 fail-closed + error log |

### 9.2 验收标准映射

| 验收项 | 实现位置 | 验证方式 |
|------|---------|---------|
| AI 写 `.sibylla/` / `.git/` 被阻断 | `SystemPathGuard` + `FileHandler` | 单测 + IPC 集成测试 |
| 内容匹配密钥模式被阻止 | `SecretLeakGuard` | 单测 |
| 非管理员跨 personal 访问 denied | `PersonalSpaceGuard` | 单测 + 集成测试 |
| >3 文件 delete/rename 要求确认 | `BulkOperationGuard` | 单测 |
| 阻断原因进入下一轮上下文 | 事件 + 错误消息协议预留 | 本任务完成主进程侧输出，编排层在 TASK018 消费 |
| 所有规则通过时透明执行 | `file.handler.ts` | 回归测试 |
| Guardrail 抛异常 fail-closed | `engine.ts` | engine test |
| 单次检查 <5ms | 纯内存规则实现 | code review + 基准测试 |
| `writeFile/deleteFile/moveFile` 经过检查 | `file.handler.ts` | IPC 集成测试 |
| FileManager 内部不改动 | 代码 diff 审核 | 变更范围核查 |

### 9.3 完成定义（Definition of Done）

以下条件全部满足，方可判定 TASK017 完成：

1. Guardrail 模块 6 个文件全部落地
2. `file.handler.ts` 成功接入 3 个高风险入口
3. `src/shared/types.ts` 完成 guardrail 相关协议扩展
4. 每条规则测试不少于 5 条，engine test 完整覆盖关键分支
5. `npm run type-check` 通过
6. `npm run lint` 通过
7. `npm run test` 通过
8. 人工验证至少覆盖 4 条典型风险路径
9. `specs/tasks/phase1/task-list` 或对应任务状态文件按 `CLAUDE.md` 要求更新完成状态

### 9.4 最终交付物清单

- `sibylla-desktop/src/main/services/harness/guardrails/types.ts`
- `sibylla-desktop/src/main/services/harness/guardrails/engine.ts`
- `sibylla-desktop/src/main/services/harness/guardrails/system-path.ts`
- `sibylla-desktop/src/main/services/harness/guardrails/secret-leak.ts`
- `sibylla-desktop/src/main/services/harness/guardrails/personal-space.ts`
- `sibylla-desktop/src/main/services/harness/guardrails/bulk-operation.ts`
- `sibylla-desktop/src/shared/types.ts` 更新
- `sibylla-desktop/src/main/ipc/handlers/file.handler.ts` 更新
- `sibylla-desktop/tests/harness/guardrails/*.test.ts`
- `sibylla-desktop/tests/ipc/file-handler.test.ts` 更新

---

## 十、结论

本任务本质上不是“再加几条校验”，而是为 Harness 建立第一道**确定性、不可绕过、与 FileManager 解耦**的主进程安全边界。实施时必须坚持四条底线：

1. **Guardrail 只在 IPC 层，不侵入 FileManager**
2. **所有规则纯同步/纯内存推理，不做 I/O**
3. **异常一律 fail-closed**
4. **所有阻断都必须有结构化日志和可消费事件**

按本计划推进，可在不破坏现有文件系统主链路的前提下，为后续 TASK018 编排器与 TASK021 UI 通知层提供稳定、安全、可扩展的 Guardrail 基础设施。

