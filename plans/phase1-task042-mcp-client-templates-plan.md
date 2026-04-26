# PHASE1-TASK042: MCP 客户端核心与模板系统 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task042_mcp-client-templates.md](../specs/tasks/phase1/phase1-task042_mcp-client-templates.md)
> 创建日期：2026-04-24 | 最后更新：2026-04-24

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK042 |
| **任务标题** | MCP 客户端核心与模板系统 |
| **所属阶段** | Phase 1 Sprint 3.6 |
| **优先级** | P0 | **复杂度** | 非常复杂 | **预估工时** | 5-6 天 |
| **前置依赖** | TASK011 + TASK012 + TASK035 |

### 1.1 目标

构建 MCP 客户端核心——MCPClient（stdio/SSE/WebSocket）、MCPRegistry、MCPPermission、MCPCredentials、8 个 v1 模板，以及与 AI 对话流/ContextEngine 的深度集成。

### 1.2 核心设计约束

| # | 约束 | 来源 |
|---|------|------|
| 1 | Feature Flag：`mcp.enabled` 默认 `false`，未配置时零影响 | sprint3.6-MCP.md §2.3 |
| 2 | 客户端化：MCP 完全运行在 Electron 主进程 | architecture.md §1.1 |
| 3 | AI 建议人类决策：工具调用需确认，敏感操作不可永久允许 | CLAUDE.md §二.2 |
| 4 | 沙箱隔离：MCP server 独立子进程 | sprint3.6-MCP.md §2.3 |
| 5 | 审计追踪：`.sibylla/mcp/audit-log.jsonl`，append-only | task042 spec |
| 6 | 渐进集成：MCP 作为 L4 层，token 预算从 skill/manual 划拨 | task042 spec |

### 1.3 核心交付物

| 交付物 | 路径 |
|--------|------|
| MCP 类型 | `services/mcp/types.ts` |
| 3 个 Transport | `services/mcp/transport/{stdio,sse,websocket}-transport.ts` |
| MCPClient | `services/mcp/mcp-client.ts` |
| MCPRegistry | `services/mcp/mcp-registry.ts` |
| MCPPermission | `services/mcp/mcp-permission.ts` |
| MCPCredentials | `services/mcp/mcp-credentials.ts` |
| MCPAuditLog | `services/mcp/mcp-audit.ts` |
| MCPTemplateLoader | `services/mcp/mcp-templates.ts` |
| MCP IPC Handler | `ipc/handlers/mcp.handler.ts` |
| 8 个模板 | `resources/mcp-templates/*.json` |
| 8 个测试 | `tests/main/services/mcp/*.test.ts` |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 场景 |
|------|---------|------|
| `CLAUDE.md` | TS 严格禁止 any；AI 建议/人类决策；IPC 隔离；异步错误处理 | 全局 |
| `specs/design/architecture.md` | 主进程 IPC 隔离；MCP 客户端主进程运行；`@modelcontextprotocol/sdk` 选型 | 架构 |
| `specs/requirements/phase1/sprint3.6-MCP.md` | §2.3 客户端集成；§2.4 模板；§3.x 非功能需求；§6.x 冲突分析 | 需求 |
| task042 spec | 10 步路径、验收标准、IPC 通道清单 | 蓝图 |

### 2.2 Skill 依赖

| Skill | 应用点 |
|-------|--------|
| `electron-ipc-patterns` | MCP IPC 通道设计 + Preload 扩展 + 双向权限确认 |
| `ai-context-engine` | L4 MCP 注入 + Token 预算调整 |
| `llm-streaming-integration` | 流式管道工具调用拦截 + 暂停/恢复 |
| `typescript-strict-mode` | 类型定义严格安全 |

### 2.3 前置代码依赖

| 模块 | 文件 | 复用方式 |
|------|------|---------|
| AIHandler | `ai.handler.ts` | 添加 MCP 拦截层 |
| ContextEngine | `context-engine.ts` | L4 注入 + 预算调整 |
| IpcHandler | `ipc/handler.ts` | MCP handler 基类 |
| IPC_CHANNELS | `shared/types.ts:72-455` | 通道常量扩展 |
| IPCChannelMap | `shared/types.ts:497-775` | 类型安全映射 |
| ContextLayerType | `shared/types.ts:1502` | 新增 `'mcp'` |
| WorkspaceConfig | `shared/types.ts:1142` | 新增 `mcp` 字段 |
| estimateTokens | `context-engine/token-utils.ts` | Token 计算 |
| logger | `main/utils/logger.ts` | 结构化日志 |

### 2.4 新增外部依赖

| 依赖 | 用途 | 降级策略 |
|------|------|---------|
| `@modelcontextprotocol/sdk` | MCP 协议客户端 | — |
| `keytar` | 系统密钥库 | Electron `safeStorage` + 加密文件 |
| `ws` | WebSocket 传输 | 若 SDK 内置则不需要 |

### 2.5 新增 IPC 通道

| 常量 | 通道名 | 方向 |
|------|--------|------|
| `MCP_CONNECT` | `mcp:connect` | R→M |
| `MCP_DISCONNECT` | `mcp:disconnect` | R→M |
| `MCP_LIST_SERVERS` | `mcp:listServers` | R→M |
| `MCP_LIST_TOOLS` | `mcp:listTools` | R→M |
| `MCP_CALL_TOOL` | `mcp:callTool` | R→M |
| `MCP_PERMISSION_PROMPT` | `mcp:permissionPrompt` | M→R |
| `MCP_GRANT_PERMISSION` | `mcp:grantPermission` | R→M |
| `MCP_REVOKE_PERMISSION` | `mcp:revokePermission` | R→M |
| `MCP_SERVER_STATUS_CHANGED` | `mcp:serverStatusChanged` | M→R |

> `mcp:configureSync/triggerSync/syncProgress` 留给 TASK043。

---

## 三、现有代码盘点与差距分析

### 3.1 MCP 服务层：完全缺失

`src/main/services/mcp/` 不存在，13 个文件需从零构建。

### 3.2 AI Handler（需修改）

**文件：** `ai.handler.ts`（945 行）

现有流式管道 `handleStream`(166-358)：
```
normalizeRequest → assembleContext() → queryRagSafely() →
chatStream() → for await (chunk) → send AI_STREAM_CHUNK → send AI_STREAM_END
```

MCP 集成点：在 `for await (chunk)` 中添加 `detectToolCall` + `handleToolCall`，注入 MCPClient/Permission/Registry/AuditLog 依赖。

### 3.3 ContextEngine（需修改）

**文件：** `context-engine.ts`（712 行）

现有预算：`always 55% / memory 15% / skill 15% / manual 15%`

需修改：`BudgetAllocation` 新增 `mcpTokens`；`allocateBudget` 条件调整；新增 `collectMcpContext()` + `setMcpRegistry()`。

### 3.4 shared/types.ts（需扩展）

需新增：9 个 MCP IPC 常量 + IPCChannelMap 映射 + `ContextLayerType` 新增 `'mcp'` + `WorkspaceConfig` 新增 `mcp` 字段 + MCP 专有类型。

### 3.5 Preload API（需扩展）

需新增 `mcp` 命名空间（7 个方法 + 2 个事件监听）+ ALLOWED_CHANNELS 扩展。

---

## 四、分步实施计划

### 阶段 A：MCP 类型定义 — 预计 0.5 天

**A1：创建 `services/mcp/types.ts`**

核心类型：`MCPTransportType`, `MCPServerConfig`, `MCPTool`, `MCPToolResult`, `MCPConnectionState`, `MCPServerInfo`, `MCPEvent`, `MCPPermissionLevel`(`once|session|permanent|deny`), `MCPPermissionEntry`, `MCPPermissionPrompt`, `MCPAuditEntry`, `MCPTemplate`, `MCPCredentialField`, `MCPDependency`, `ToolCallIntent`

**A2：扩展 `shared/types.ts`**

- `IPC_CHANNELS` 追加 9 个 MCP 通道
- `IPCChannelMap` 追加 MCP 映射（请求/响应类型安全）
- `ContextLayerType` 新增 `'mcp'`
- `WorkspaceConfig` 新增 `mcp?: { enabled, servers, auditEnabled }`

**A3：验证** — `tsc --noEmit` 通过，无 `any`

---

### 阶段 B：MCPClient + 传输层 — 预计 1 天

**B1：Transport 抽象接口** `transport/types.ts`

```typescript
export interface MCPTransport {
  connect(): Promise<void>
  send(message: unknown): Promise<void>
  onMessage(handler: (message: unknown) => void): void
  close(): Promise<void>
  isConnected(): boolean
}
```

**B2：StdioTransport** — `child_process.spawn` 启动 MCP server，stdin/stdout JSON-RPC 2.0，stderr 日志

**B3：SSETransport** — EventSource 监听 `${url}/sse`，POST 到 `${url}/message`，自定义 headers

**B4：WebSocketTransport** — `ws` 库连接，`ws.send()`/`ws.on('message')` JSON-RPC

**B5：MCPClient**

```
connect(config): 根据 transport 创建 Transport → 10s 超时连接 →
  JSON-RPC initialize → tools/list 缓存 → 注册断线监听 → emit connected

disconnect(name): JSON-RPC shutdown → transport.close() 2s 超时强杀 →
  从 Map 移除 → emit disconnected

handleDisconnect: 指数退避 min(2^retry*1000, 30000)，maxRetries=10
```

---

### 阶段 C：MCPRegistry + MCPCredentials — 预计 0.5 天

**C1：MCPCredentials**

- 优先 `keytar`（macOS Keychain / Win Credential Manager / libsecret）
- 降级 Electron `safeStorage.encryptString()` + `.sibylla/mcp/credentials.enc`
- key 格式：`${serverName}:${credentialKey}`

**C2：MCPRegistry**

```
initialize(): 读 config.json mcp.servers → 替换凭证占位符 {{KEY}} →
  逐个 client.connect() → 缓存工具列表 / 记录错误状态

addServer(config): 验证唯一性 → 替换占位符 → connect → 缓存 → 持久化 config.json

removeServer(name): disconnect → 从 Map 移除 → 更新 config.json

listAllTools(): 遍历 state==='connected' 的服务，汇总工具
```

---

### 阶段 D：MCPPermission + MCPAudit — 预计 0.5 天

**D1：MCPPermission** — 四级权限模型：

| 级别 | 持久化 | 过期 |
|------|--------|------|
| `once` | 不持久化 | 立即 |
| `session` | 内存关联 sessionId | 会话结束 |
| `permanent` | `permissions.json` | 永不过期 |
| `deny` | `permissions.json` | 永不过期 |

敏感工具限制：匹配 `delete_*/write_*/transfer_*/create_*` 的工具，`grantPermission(..., 'permanent')` 时抛错。`cleanup()` 清理非当前会话的 session 条目。

**D2：MCPAuditLog**

- `record()`: enabled 检查 → `sanitizeArgs` 脱敏 → `fs.appendFile` 原子追加 JSONL
- 脱敏规则：key 含 `token/password/secret/key/auth/credential` → `***`
- `query()`: 逐行读取 → 按 serverName/since/limit 过滤 → timestamp 倒序

---

### 阶段 E：AI 对话流程集成 — 预计 1 天

**核心集成点，最敏感的改造。**

**E1：AIHandler 新增 MCP 依赖** + `setMcpServices(deps)` setter

**E2：工具调用检测** — `detectToolCall(accumulated)` 匹配 `<tool_call server="..." tool="...">JSON</tool_call>`

**E3：拦截流程**：

```
原: for await (chunk) → push → send CHUNK
新: for await (chunk) → push →
  if detectToolCall(fullContent) && mcp.enabled:
    暂停发送 → handleToolCall → 注入结果 → 恢复
  else: send CHUNK
```

**E4：handleToolCall 流程**：
1. Feature Flag 检查 → 2. `checkPermission` → 3. 无权限则 `promptUserPermission`（IPC push）→ 4. `callTool` → 5. 审计记录 → 6. 返回结果/错误

**E5：promptUserPermission** — `pendingPermissionRequests` Map + 60s 超时自动 deny + `resolvePermissionRequest` 由 IPC handler 调用

**E6：Feature Flag** — 所有拦截入口 `if (!mcpConfig?.enabled) return null`

**E7：优雅降级** — catch callTool 错误，错误信息注入消息流，AI 尝试其他方式回答

---

### 阶段 F：ContextEngine MCP 注入 — 预计 0.5 天

**F1：新增 `mcpRegistry`/`mcpEnabled` + `setMcpRegistry()` setter**

**F2：`BudgetAllocation` 新增 `mcpTokens`**

**F3：预算调整**
- 未启用：always 55% / memory 15% / skill 15% / manual 15% / mcp 0%
- 启用：always 55% / memory 15% / skill 10% / manual 10% / mcp 10%

**F4：`collectMcpContext()`** — 调用 `mcpRegistry.listAllTools()` → `formatMcpToolDescriptions()`

**F5：`formatMcpToolDescriptions()`** — 按 server 分组，格式化工具名+描述，前置 `<tool_call>` 调用格式说明

**F6：修改 `assembleContextInternal`** — 并行收集后新增 MCP 层，传入 `allocateBudget` + `truncateToBudget`

---

### 阶段 G：IPC + Preload + 模板 — 预计 1 天

**G1：McpHandler** extends `IpcHandler`

| 方法 | 实现 |
|------|------|
| handleConnect | `registry.addServer(config)` → push statusChanged |
| handleDisconnect | `registry.removeServer(name)` → push statusChanged |
| handleListServers | `registry.listServers()` |
| handleListTools | `registry.listAllTools()` |
| handleCallTool | 权限检查 → `client.callTool()` → 审计 |
| handleGrantPermission | `permission.grantPermission()` + `aiHandler.resolvePermissionRequest()` |
| handleRevokePermission | `permission.revokePermission()` |

**G2：Preload API** — `mcp` 命名空间：connect/disconnect/listServers/listTools/callTool/grantPermission/revokePermission + onPermissionPrompt/onServerStatusChanged 事件监听 + ALLOWED_CHANNELS 扩展

**G3：8 个 v1 模板** `resources/mcp-templates/`

| 模板 | command | 凭证 |
|------|---------|------|
| GitHub | `npx -y @modelcontextprotocol/server-github` | GITHUB_PAT |
| GitLab | `npx -y @modelcontextprotocol/server-gitlab` | GITLAB_TOKEN |
| Slack | `npx -y @modelcontextprotocol/server-slack` | SLACK_BOT_TOKEN |
| Filesystem | `npx -y @modelcontextprotocol/server-filesystem` | 无（目录路径） |
| PostgreSQL | `npx -y @modelcontextprotocol/server-postgres` | 连接串 |
| Notion | `npx -y @modelcontextprotocol/server-notion` | NOTION_TOKEN |
| Linear | `npx -y mcp-linear` | LINEAR_API_KEY |
| Browser | `npx -y @playwright/mcp` | 无 |

**G4：MCPTemplateLoader** — 读取 `resources/mcp-templates/*.json`，解析为 `MCPTemplate`，校验必填字段

---

### 阶段 H：测试 + 主进程装配 — 预计 1.5 天

**H1：8 个测试文件** `tests/main/services/mcp/`

| 文件 | 关键用例 |
|------|---------|
| mcp-client.test | stdio 连断/listTools/callTool/重连/超时 |
| mcp-registry.test | initialize/addServer/removeServer/listAllTools/持久化 |
| mcp-permission.test | check/grant/revoke/敏感限制/session 清理 |
| mcp-credentials.test | save/get/delete/降级 |
| mcp-audit.test | 追加/脱敏/查询 |
| ai-handler-mcp.test | detectToolCall/权限确认/注入/Feature Flag/降级 |
| context-engine-mcp.test | L4 注入/预算调整/未启用零影响 |
| mcp-templates.test | 8 模板格式/必填字段 |

**H2：主进程装配顺序**

```
1. 读 config.json mcp 字段
2. if mcp?.enabled:
   MCPAuditLog → MCPClient → MCPCredentials → MCPPermission.initialize()
   → MCPRegistry.initialize() → MCPTemplateLoader
   → AIHandler.setMcpServices() → ContextEngine.setMcpRegistry()
3. 注册 McpHandler
```

**H3：`services/mcp/index.ts`** — 统一导出所有 MCP 模块

---

## 五、验收标准追踪

### MCPClient

| # | 标准 | 位置 | 测试 |
|---|------|------|------|
| 1 | connect 10s 超时 | B5 | mcp-client |
| 2 | disconnect 2s 释放 | B5 | mcp-client |
| 3 | listTools/callTool 正确 | B5 | mcp-client |
| 4 | stdio/SSE/WebSocket 三种传输 | B2-B4 | mcp-client |
| 5 | 指数退避重连 | B5 | mcp-client |
| 6 | 状态变更 push | G1 | — |

### MCPRegistry

| # | 标准 | 位置 | 测试 |
|---|------|------|------|
| 1 | 启动加载 config.json | C2 | mcp-registry |
| 2 | addServer/removeServer | C2 | mcp-registry |
| 3 | listAllTools 汇总 | C2 | mcp-registry |
| 4 | 配置持久化 | C2 | mcp-registry |

### MCPPermission

| # | 标准 | 位置 | 测试 |
|---|------|------|------|
| 1 | 四级权限 + 敏感限制 | D1 | mcp-permission |
| 2 | 首次调用触发权限确认 | E5 | ai-handler-mcp |
| 3 | 持久化 permissions.json | D1 | mcp-permission |

### AI 对话集成

| # | 标准 | 位置 | 测试 |
|---|------|------|------|
| 1 | 工具调用检测 | E2 | ai-handler-mcp |
| 2 | 暂停→权限→调用→注入→恢复 | E3/E4 | ai-handler-mcp |
| 3 | MCP L4 注入 + 预算 10% | F3/F4 | context-engine-mcp |
| 4 | Feature Flag 零影响 | E6 | ai-handler-mcp |
| 5 | 优雅降级 | E7 | ai-handler-mcp |

### 模板 + 审计

| # | 标准 | 位置 | 测试 |
|---|------|------|------|
| 1 | 8 模板格式正确 | G3 | mcp-templates |
| 2 | 审计 JSONL + 脱敏 | D2 | mcp-audit |

---

## 六、风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| SDK API 变更 | 高 | 锁版本；Transport 抽象隔离 |
| keytar Linux 不可用 | 中 | safeStorage + 加密文件降级 |
| 子进程泄漏 | 高 | disconnect 2s 超时强杀；process 退出清理 |
| 工具调用误判 | 中 | 严格 XML 格式匹配 |
| 流式拦截消息丢失 | 高 | 暂停/恢复原子性；注入后继续流 |
| IPC 类型不匹配 | 中 | IPCChannelMap 编译时检查 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A | types.ts + shared/types.ts |
| Day 1 下午 | B | Transport + MCPClient |
| Day 2 上午 | C | Credentials + Registry |
| Day 2 下午 | D | Permission + Audit |
| Day 3 | E | AI 对话集成（核心） |
| Day 4 上午 | F | ContextEngine MCP 注入 |
| Day 4 下午 | G | IPC + Preload + 8 模板 |
| Day 5 | H | 测试 + 装配 |
| Day 6 | — | 集成验证 + 修复 |

---

## 八、涉及文件变更总览

### 新建文件（29 个）

| 文件 | 说明 |
|------|------|
| `services/mcp/types.ts` | 类型定义 |
| `services/mcp/transport/types.ts` | Transport 接口 |
| `services/mcp/transport/stdio-transport.ts` | stdio |
| `services/mcp/transport/sse-transport.ts` | SSE |
| `services/mcp/transport/websocket-transport.ts` | WebSocket |
| `services/mcp/mcp-client.ts` | MCPClient |
| `services/mcp/mcp-registry.ts` | Registry |
| `services/mcp/mcp-permission.ts` | Permission |
| `services/mcp/mcp-credentials.ts` | Credentials |
| `services/mcp/mcp-audit.ts` | Audit |
| `services/mcp/mcp-templates.ts` | Templates |
| `services/mcp/index.ts` | 导出 |
| `ipc/handlers/mcp.handler.ts` | IPC Handler |
| `resources/mcp-templates/{github,gitlab,slack,filesystem,postgresql,notion,linear,browser}.json` | 8 模板 |
| `tests/main/services/mcp/{mcp-client,mcp-registry,mcp-permission,mcp-credentials,mcp-audit,ai-handler-mcp,context-engine-mcp,mcp-templates}.test.ts` | 8 测试 |

### 修改文件（4 个）

| 文件 | 变更 |
|------|------|
| `ai.handler.ts` | MCP 拦截层（detectToolCall + handleToolCall + promptUserPermission + Feature Flag） |
| `context-engine.ts` | L4 MCP 注入 + mcpTokens + collectMcpContext + formatMcpToolDescriptions |
| `shared/types.ts` | 9 MCP 通道 + IPCChannelMap + ContextLayerType 'mcp' + WorkspaceConfig.mcp |
| `preload/index.ts` | mcp 命名空间 + ALLOWED_CHANNELS |

### 不修改

- `ai-gateway-client.ts` — MCP 调用独立于 Gateway
- `sync-manager.ts` / `file-manager.ts` / `memory-manager.ts` — 不涉及

---

**文档版本**: v1.0 | **最后更新**: 2026-04-24 | **维护者**: Sibylla 架构团队
