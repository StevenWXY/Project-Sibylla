# Guardrails 硬性保障层

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK017 |
| **任务标题** | Guardrails 硬性保障层 |
| **所属阶段** | Phase 1 - Harness 基础设施 (Sprint 3.1) |
| **优先级** | P0 |
| **复杂度** | 复杂 |
| **预估工时** | 3-4 工作日 |
| **负责人** | 待分配 |
| **状态** | ✅ 已完成 |

## 任务描述

### 目标

在 Electron 主进程的 IPC handler 层建立一道确定性（非 LLM、基于规则的）防线，拦截 AI 发起的高风险操作。这是整个 Harness 工程的安全底座——即使 AI 被 prompt injection 攻击，关键文件也不会被破坏。

### 背景

Sprint 3 已实现 AI 对话和文件修改能力（TASK011-013），AI 可以通过 Diff 审查机制建议文件修改。但当前缺乏**系统性**的安全保障：
- AI 理论上可以建议修改 `.sibylla/` 系统目录或 `.git/` 目录
- AI 生成的文件内容可能包含 API Key 等敏感信息
- 非管理员用户可能通过 AI 越权访问他人的 personal 空间
- AI 可能在一次操作中批量删除/重命名大量文件

FileManager 内部已有 `checkForbiddenPaths()` 提供基础路径安全保护，但它不感知操作来源（用户 vs AI）、不检查文件内容、不了解用户角色。Guardrails 是在 IPC handler 层的一层**额外语义防线**，两层共存不冲突。

### 范围

**包含：**
- `GuardrailEngine` 引擎核心（`src/main/services/harness/guardrails/engine.ts`）
- 4 类 Guard 规则实现：
  - `SystemPathGuard` — 阻止 AI 写入 `.sibylla/`、`.git/`、`node_modules/`
  - `SecretLeakGuard` — 检测 API Key / 私钥 / JWT 模式
  - `PersonalSpaceGuard` — 非管理员跨 personal/ 访问控制
  - `BulkOperationGuard` — 单次操作影响 >3 文件时要求二次确认
- `GuardrailRule` 接口与 `GuardrailVerdict` tagged union 类型定义
- `FileOperation` / `OperationContext` 类型定义
- Guardrail 拦截结果的 IPC 事件通知（`harness:guardrailBlocked`）
- FileHandler 注入 GuardrailEngine 的改造
- 单元测试（每条规则 ≥ 5 个测试用例）

**不包含：**
- LLM 驱动的语义级 Guard（后续迭代）
- RateLimitGuard、NoOpGuard、PathTraversalGuard（后续迭代）
- Guardrail 管理设置 UI（属于 TASK021）
- 渲染进程 GuardrailNotification 组件（属于 TASK021）

## 验收标准

- [ ] AI 尝试写入 `.sibylla/` 或 `.git/` 时操作被阻断并记录日志
- [ ] AI 生成内容匹配 API Key 模式（sk-、sk-ant-、ghp_、AKIA、private key header、JWT）时写入被阻止并通知用户
- [ ] 非管理员用户通过 AI 读取其他成员 personal 文件夹时返回 access denied
- [ ] AI 单次操作删除或重命名超过 3 个文件时要求 UI 二次确认
- [ ] Guardrail 拦截后，阻断原因作为 tool error 注入 AI 下一轮上下文
- [ ] 所有 Guardrail 通过时，主流程透明执行（无 UI 干扰）
- [ ] Guardrail 检查函数自身抛异常时，fail-closed（默认阻止）并记录异常日志
- [ ] 单次 Guardrail 检查耗时 < 5ms（确定性规则，无 LLM 调用）
- [ ] `FileHandler.writeFile` / `deleteFile` / `moveFile` 经过 Guardrail 前置检查
- [ ] FileManager 内部代码不做任何修改（Guardrail 职责在 IPC handler 层）

## 依赖关系

### 前置依赖

- [x] FileManager（`src/main/services/file-manager.ts`）— Guardrail 层读取 FileManager 的 workspace root
- [x] FileHandler（`src/main/ipc/handlers/file.ts`）— Guardrail 注入点
- [x] Logger（`src/main/utils/logger.ts`）— 结构化日志输出

### 被依赖任务

- TASK018（编排器）— HarnessOrchestrator 内部持有 GuardrailEngine 引用
- TASK021（Harness UI）— GuardrailNotification 组件消费 `harness:guardrailBlocked` 事件

## 参考文档

- [`specs/requirements/phase1/sprint3.1-harness.md`](../../requirements/phase1/sprint3.1-harness.md) — 需求 3.1.2 Guardrails 硬性保障层
- [`CLAUDE.md`](../../../CLAUDE.md) — 安全红线（§七）、架构约束（§三）
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构
- [`src/main/ipc/handlers/file.ts`](../../../sibylla-desktop/src/main/ipc/handlers/file.ts) — Guardrail 注入点

## 技术执行路径

### 架构设计

```
Guardrails 模块架构

src/main/services/harness/guardrails/
├── types.ts              ← 接口定义（FileOperation, OperationContext, GuardrailVerdict, GuardrailRule）
├── engine.ts             ← GuardrailEngine 核心引擎（规则链执行、fail-closed、日志记录）
├── system-path.ts        ← SystemPathGuard（.sibylla/ .git/ node_modules/ 写入阻断）
├── secret-leak.ts        ← SecretLeakGuard（API Key / 私钥 / JWT 内容检测）
├── personal-space.ts     ← PersonalSpaceGuard（非管理员跨 personal/ 访问控制）
└── bulk-operation.ts     ← BulkOperationGuard（>3 文件操作二次确认）

src/main/ipc/handlers/file.ts  ← 注入 GuardrailEngine，在 writeFile/deleteFile/moveFile 前拦截
```

### 双层防御共存策略

```
渲染进程发起请求
      │
      ▼
FileHandler (IPC 层)
      │
      ├── [Guardrail 层] ← 仅对 source='ai' 的操作执行完整检查
      │     │
      │     ├── SystemPathGuard      → .sibylla/ .git/ 写入阻断
      │     ├── SecretLeakGuard      → 内容级敏感信息检测
      │     ├── PersonalSpaceGuard   → 用户角色 + 路径组合检查
      │     └── BulkOperationGuard   → 批量操作二次确认
      │
      ▼ (通过后)
FileManager
      │
      ├── [内部安全层] ← 所有 USER context 操作的基础安全
      │     └── checkForbiddenPaths() → 路径遍历、系统目录访问
      │
      ▼
实际文件操作
```

### 核心类型设计

```typescript
// types.ts — 所有 Guardrail 相关类型的统一定义

export interface FileOperation {
  type: 'write' | 'delete' | 'rename' | 'read'
  path: string
  newPath?: string
  content?: string
  affectedPaths?: string[]
}

export interface OperationContext {
  source: 'user' | 'ai' | 'sync'
  userId: string
  userRole: 'admin' | 'editor' | 'viewer'
  workspaceRoot: string
  sessionId?: string
}

// Tagged union 表达三种判定结果
export type GuardrailVerdict =
  | { allow: true }
  | { allow: false; ruleId: string; reason: string; severity: 'block' }
  | { allow: 'conditional'; ruleId: string; requireConfirmation: true; reason: string }

export interface GuardrailRule {
  id: string
  description: string
  check(op: FileOperation, ctx: OperationContext): Promise<GuardrailVerdict>
}
```

## 执行步骤

### 步骤 1：创建类型定义文件

**文件：** `src/main/services/harness/guardrails/types.ts`

1. 定义 `FileOperation` 接口——描述被检查的操作对象
2. 定义 `OperationContext` 接口——描述操作发起的上下文（来源、用户、角色）
3. 定义 `GuardrailVerdict` tagged union——三种判定：放行、阻断、条件放行
4. 定义 `GuardrailRule` 接口——所有 Guard 规则的契约
5. 定义 `GuardrailRuleSummary` 类型——用于 IPC 返回给前端的规则摘要

### 步骤 2：实现 GuardrailEngine 核心引擎

**文件：** `src/main/services/harness/guardrails/engine.ts`

1. 创建 `GuardrailEngine` 类，构造函数接收 `Logger` 实例
2. 在构造函数中初始化规则数组：`[SystemPathGuard, SecretLeakGuard, PersonalSpaceGuard, BulkOperationGuard]`
3. 实现 `check(op, ctx)` 方法：顺序执行所有规则，首个非通过结果即返回
4. 每条规则执行包裹在 try-catch 中：catch 时返回 fail-closed（阻断 + 记录异常）
5. 所有规则通过后返回 `{ allow: true }`
6. 实现 `listRules()` 方法——返回规则 id + description 列表
7. 实现 `setRuleEnabled(ruleId, enabled)` 方法——动态启用/禁用规则
8. 每次检查的触发/结果写入结构化日志（`logger.warn('guardrail.triggered', ...)`）

### 步骤 3：实现 SystemPathGuard

**文件：** `src/main/services/harness/guardrails/system-path.ts`

1. 实现 `GuardrailRule` 接口，`id = 'system-path'`
2. 定义 `FORBIDDEN_PREFIXES = ['.sibylla/', '.git/', 'node_modules/']`
3. `check()` 逻辑：仅对 `source === 'ai'` 且 `op.type !== 'read'` 的操作检查
4. 归一化路径（去除前导 `/`），检查是否以任一前缀开头
5. 匹配时返回 `{ allow: false, ruleId, severity: 'block', reason }` 
6. 不匹配时返回 `{ allow: true }`

### 步骤 4：实现 SecretLeakGuard

**文件：** `src/main/services/harness/guardrails/secret-leak.ts`

1. 实现 `GuardrailRule` 接口，`id = 'secret-leak'`
2. 定义 6 种正则模式：
   - OpenAI: `/sk-[a-zA-Z0-9]{32,}/`
   - Anthropic: `/sk-ant-[a-zA-Z0-9\-_]{95,}/`
   - GitHub PAT: `/ghp_[a-zA-Z0-9]{36}/`
   - AWS: `/AKIA[0-9A-Z]{16}/`
   - Private Key: `/-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/`
   - JWT: `/eyJ[A-Za-z0-9_\-]{20,}\.eyJ[A-Za-z0-9_\-]{20,}\.[A-Za-z0-9_\-]{20,}/`
3. `check()` 逻辑：仅对 `op.type === 'write'` 且 `op.content` 存在的操作检查
4. 遍历所有模式，匹配时返回 `{ allow: false, severity: 'block', reason: 'Content contains pattern matching {name}' }`
5. 全部不匹配时返回 `{ allow: true }`
6. 注意：此 Guard 对所有 source 生效（不仅限 AI），因为用户也不应写入含密钥的文件

### 步骤 5：实现 PersonalSpaceGuard

**文件：** `src/main/services/harness/guardrails/personal-space.ts`

1. 实现 `GuardrailRule` 接口，`id = 'personal-space'`
2. 定义 `PERSONAL_PREFIX = 'personal/'`
3. `check()` 逻辑：
   - 提取路径中的 personal 前缀和成员名（如 `personal/alice/`）
   - 如果路径不包含 `personal/`，放行
   - 如果路径包含 `personal/` 且用户角色为 admin，放行
   - 如果路径包含 `personal/{memberName}/` 且 `memberName !== userId`，阻断
   - 否则放行（访问自己的 personal 空间）
4. 阻断时返回 `{ allow: false, severity: 'block', reason: 'Access denied to personal space of {memberName}' }`

### 步骤 6：实现 BulkOperationGuard

**文件：** `src/main/services/harness/guardrails/bulk-operation.ts`

1. 实现 `GuardrailRule` 接口，`id = 'bulk-operation'`
2. 定义 `BULK_THRESHOLD = 3`
3. `check()` 逻辑：
   - 仅对 `op.type === 'delete'` 或 `op.type === 'rename'` 的操作检查
   - 如果 `op.affectedPaths` 存在且长度 > BULK_THRESHOLD，返回 `{ allow: 'conditional', requireConfirmation: true, reason }`
   - 否则放行
4. 这是唯一返回 `'conditional'` 判定的 Guard——需要 UI 弹出二次确认

### 步骤 7：改造 FileHandler 注入 Guardrail

**文件：** `src/main/ipc/handlers/file.ts`

1. 在 `FileHandler` 类中新增 `private guardrailEngine: GuardrailEngine | null = null`
2. 新增 `setGuardrailEngine(engine: GuardrailEngine): void` 方法
3. 在 `writeFile()` 方法中，执行原有写入逻辑之前，插入 Guardrail 检查：
   - 调用 `this.guardrailEngine.check({ type: 'write', path, content }, ctx)`
   - 判定 `allow === false` 时：通过 `broadcastToAllWindows('harness:guardrailBlocked', verdict)` 通知渲染进程，throw Error
   - 判定 `allow === 'conditional'` 时：返回 `{ status: 'pending_confirmation', verdict }` 给渲染进程
4. 在 `deleteFile()` 和 `moveFile()` 方法中做类似处理
5. 新增 `buildOperationContext(event, source)` 私有方法，构建 `OperationContext`
6. **关键约束**：FileManager 的原有逻辑完全不动，仅在 handler 层添加前置检查

### 步骤 8：在 `shared/types.ts` 中追加 IPC 通道常量

**文件：** `src/shared/types.ts`

1. 在 `IPC_CHANNELS` 中追加 `'harness:guardrailBlocked'` 事件通道
2. 在 `IPC_CHANNELS` 中追加 `'harness:listGuardrails'` 和 `'harness:setGuardrailEnabled'` 调用通道
3. 所有新增常量为追加式，不修改已有定义

### 步骤 9：编写单元测试

**文件：** `tests/harness/guardrails/`

为每条规则编写独立测试文件：

1. `system-path.test.ts` — 测试用例：
   - AI 写入 `.sibylla/config.json` → 阻断
   - AI 写入 `.git/HEAD` → 阻断
   - AI 写入 `node_modules/foo/index.js` → 阻断
   - AI 读取 `.sibylla/memory/daily/2026-04-18.md` → 放行（read 不拦）
   - 用户写入 `.sibylla/config.json` → 放行（source=user 不触发）
   - AI 写入 `docs/product/prd.md` → 放行

2. `secret-leak.test.ts` — 测试用例：
   - 内容含 `sk-proj-abc...` (32+ chars) → 阻断
   - 内容含 `ghp_xxxx` (36 chars) → 阻断
   - 内容含 `-----BEGIN RSA PRIVATE KEY-----` → 阻断
   - 内容含 `AKIA...` (16 chars) → 阻断
   - 内容含 `eyJ...` JWT pattern → 阻断
   - 内容为正常 Markdown → 放行
   - 操作类型为 delete（无 content）→ 放行

3. `personal-space.test.ts` — 测试用例：
   - 非管理员读取 `personal/alice/notes.md`（userId=bob）→ 阻断
   - 非管理员读取 `personal/bob/notes.md`（userId=bob）→ 放行
   - 管理员读取 `personal/alice/notes.md` → 放行
   - 读取非 personal 路径 → 放行

4. `bulk-operation.test.ts` — 测试用例：
   - 删除 4 个文件 → conditional（需要确认）
   - 删除 3 个文件 → 放行
   - 删除 2 个文件 → 放行
   - 写入 4 个文件 → 放行（写入不触发此 Guard）

5. `engine.test.ts` — 引擎级测试：
   - 所有规则通过 → `{ allow: true }`
   - 第一条规则阻断 → 不执行后续规则
   - 规则抛异常 → fail-closed
   - 规则被禁用 → 跳过该规则

### 步骤 10：集成验证

1. 运行 `npm run typecheck` 确保类型无误
2. 运行 `npm run lint` 确保代码规范
3. 运行 `npm run test` 确保所有测试通过
4. 在开发环境中验证：通过 AI 对话尝试写入 `.sibylla/` 路径，确认 Guardrail 拦截生效

---

**创建时间：** 2026-04-18
**最后更新：** 2026-04-18
