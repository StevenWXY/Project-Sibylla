# MCP 客户端核心与模板系统

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK042 |
| **任务标题** | MCP 客户端核心与模板系统 |
| **所属阶段** | Phase 1 - 迁移、导入与 MCP 集成 (Sprint 3.6) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 5-6 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 3.6 的 MCP（Model Context Protocol）客户端核心——让 Sibylla 从封闭的本地工具进化为连接外部世界的 AI 工作台。实现 MCPClient（支持 stdio/SSE/WebSocket 三种连接方式）、MCPRegistry（服务注册表）、MCPPermission（权限管理器）、MCPCredentials（凭证管理）、8 个 v1 预置模板，以及与现有 AI 对话流程的深度集成。

### 背景

Sprint 3.0-3.5 建立了完整的单 agent 体系，但 AI 能力局限于 workspace 内部。MCP 让 AI 能够：

| 场景 | 无 MCP | 有 MCP |
|------|--------|--------|
| 查看项目进度 | 用户手动截图 | AI 直接调用 GitHub 读取 issue |
| 团队沟通 | 用户复制粘贴 | AI 直接调用 Slack 读取消息 |
| 外部知识检索 | 用户手动搜索 | AI 直接调用浏览器抓取网页 |
| 数据库查询 | 用户导出 CSV | AI 直接查询 PostgreSQL |

**核心设计约束**：

1. **Feature Flag 控制**：`.sibylla/config.json` 中 `mcp.enabled` 默认 `false`，未配置 MCP 时 AI 行为零影响
2. **客户端化**：MCP 客户端完全运行在 Electron 主进程，Sprint 3.6 不涉及云端改动
3. **AI 建议，人类决策**：MCP 工具调用需用户确认，敏感操作（`delete_*`/`write_*`/`transfer_*`）不可设为永久允许
4. **沙箱隔离**：MCP server 在独立子进程中运行，禁止访问 workspace 根目录以外的文件系统
5. **审计追踪**：MCP 工具调用产生的审计日志存储于 `.sibylla/mcp/audit-log.jsonl`，append-only
6. **渐进集成**：MCP 工具描述注入到 ContextEngine 的系统提示中作为"L4: MCP 上下文"，token 预算从 skill/manual 份额划拨

### 范围

**包含：**

- MCPClient 实现 — 支持 stdio（子进程）/ SSE（远程 HTTP）/ WebSocket（双向实时）三种连接
- MCPRegistry — 服务注册表（连接状态管理、工具列表缓存、生命周期）
- MCPPermission — 权限管理器（仅此次/本次会话/永久允许/拒绝 四级）
- MCPCredentials — 凭证管理（macOS Keychain / Windows Credential Manager / libsecret）
- MCP 上下文注入 — ContextEngine 集成，MCP 工具描述作为 L4 层注入系统提示
- AI 对话流程集成 — ai.handler.ts 工具调用拦截、暂停流、权限确认、恢复流
- 8 个 v1 预置模板 — GitHub/GitLab/Slack/Filesystem/PostgreSQL/Notion/Linear/浏览器
- IPC 通道 — 11 个新增通道（连接/断开/列表/权限确认等）
- 审计日志 — append-only JSONL 格式
- 单元测试

**不包含：**

- MCP 持续同步调度（TASK043）
- 首次引导 UI（TASK044）
- 云端 MCPHub（Phase 2 目标）
- v1.1 扩展模板（Discord/Telegram/Obsidian/Zotero）
- MCP Server 开发（Sibylla 仅作为客户端）

## 依赖关系

### 前置依赖

- [x] TASK011 — AI 对话流式响应（ai.handler.ts + AiGatewayClient 已可用）
- [x] TASK012 — 上下文引擎 v1（ContextEngine + PromptComposer 已可用）
- [x] TASK035 — Prompt 库基础设施（PromptComposer 可用于注入 MCP 工具描述）

### 被依赖任务

- TASK043 — MCP 持续同步调度（依赖 MCPClient + MCPRegistry）
- TASK044 — Aha Moment 首次引导体验（MCP 连接步骤复用 MCPRegistry）

### 并行机会

TASK042 与 TASK040/041 无交叉依赖，可以并行开发。

## 参考文档

- [`specs/requirements/phase1/sprint3.6-MCP.md`](../../requirements/phase1/sprint3.6-MCP.md) — 需求 2.3、2.4、§1.3、§3.3、§6.2
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构、AI 模型网关、MCP Hub
- [`CLAUDE.md`](../../../CLAUDE.md) — AI 建议/人类决策、安全红线、本地优先
- [MCP 规范](https://modelcontextprotocol.io/) — Model Context Protocol 官方规范
- `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` — TypeScript 严格模式
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — IPC 类型安全设计
- `.kilocode/skills/phase1/ai-context-engine/SKILL.md` — 上下文引擎设计指南
- `.kilocode/skills/phase1/llm-streaming-integration/SKILL.md` — LLM 流式响应集成

## 验收标准

### MCPClient 连接管理

- [ ] `src/main/services/mcp/mcp-client.ts` 创建，实现 MCPClient 接口
- [ ] `connect(config: MCPServerConfig): Promise<void>` — 建立 MCP 连接，10 秒内完成或超时
- [ ] `disconnect(serverName: string): Promise<void>` — 断开连接，2 秒内释放所有资源
- [ ] `listTools(serverName: string): Promise<Tool[]>` — 获取服务端可用工具列表
- [ ] `callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<ToolResult>` — 调用工具
- [ ] `onServerEvent(handler: (event: MCPEvent) => void): void` — 监听服务端事件
- [ ] 支持 stdio 连接（`child_process.spawn` 启动本地 MCP server 子进程）
- [ ] 支持 SSE 连接（远程 HTTP Server-Sent Events）
- [ ] 支持 WebSocket 连接（双向实时通信）
- [ ] 连接断开时指数退避重连（base=1s, max=30s, maxRetries=10）
- [ ] 连接状态变化推送 `mcp:serverStatusChanged` 到渲染进程

### MCPRegistry 服务注册表

- [ ] `src/main/services/mcp/mcp-registry.ts` 创建
- [ ] 启动时从 `.sibylla/config.json` 的 `mcp.servers` 加载服务配置
- [ ] `addServer(config: MCPServerConfig): Promise<void>` — 添加新服务并验证连接
- [ ] `removeServer(serverName: string): Promise<void>` — 移除服务并断开连接
- [ ] `listServers(): MCPServerInfo[]` — 返回所有服务及其连接状态
- [ ] `listAllTools(): Tool[]` — 返回所有已连接服务的可用工具汇总
- [ ] `getTool(serverName: string, toolName: string): Tool | null` — 查找特定工具
- [ ] 服务配置持久化到 `.sibylla/config.json` 的 `mcp.servers` 字段

### MCPPermission 权限管理

- [ ] `src/main/services/mcp/mcp-permission.ts` 创建
- [ ] 四级权限模型：`once`（仅此次）/ `session`（本次会话）/ `permanent`（永久允许）/ `deny`（拒绝）
- [ ] 首次调用工具时触发权限确认流程（IPC 推送到渲染进程弹窗）
- [ ] `delete_*` / `write_*` / `transfer_*` 关键词工具不可设为 `permanent`（每次询问）
- [ ] 权限配置持久化到 `.sibylla/mcp/permissions.json`
- [ ] `checkPermission(serverName, toolName): PermissionLevel | null` — 查询已有权限
- [ ] `grantPermission(serverName, toolName, level): void` — 授权
- [ ] `revokePermission(serverName, toolName): void` — 撤销授权
- [ ] `revokeAll(serverName): void` — 撤销某服务全部权限

### MCPCredentials 凭证管理

- [ ] `src/main/services/mcp/mcp-credentials.ts` 创建
- [ ] macOS 使用 Keychain 存储凭证
- [ ] Windows 使用 Credential Manager 存储凭证
- [ ] Linux 使用 libsecret 存储凭证
- [ ] `saveCredential(serverName, key, value): Promise<void>` — 存储凭证
- [ ] `getCredential(serverName, key): Promise<string | null>` — 读取凭证
- [ ] `deleteCredential(serverName, key): Promise<void>` — 删除凭证
- [ ] 凭证不出现在日志和审计记录中（脱敏处理）
- [ ] 凭证访问需要用户确认（首次访问时弹窗授权）

### AI 对话流程集成

- [ ] `ai.handler.ts` 流式管道中识别 AI 响应的工具调用意图（function calling 格式）
- [ ] 拦截流程：暂停流 → 检查权限 →（首次调用推送 `mcp:permissionPrompt` 到渲染进程）→ 调用 MCP 工具 → 注入结果 → 恢复流
- [ ] MCP 工具描述注入到 `ContextEngine.assembleContext()` 的系统提示中（作为 L4: MCP 上下文）
- [ ] Token 预算调整：always 55% / memory 15% / skill 10% / manual 10% / mcp 10%
- [ ] MCP 功能通过 `.sibylla/config.json` 中 `mcp.enabled` 控制，默认 false
- [ ] 未启用 MCP 时 AI 行为零影响（不注入工具描述、不拦截工具调用）
- [ ] MCP 调用失败时优雅降级（继续对话、不中断、展示错误信息）

### 预置 MCP 模板（v1 首批 8 个）

- [ ] GitHub — 读取 issue / PR / code，需 PAT
- [ ] GitLab — 读取 issue / MR，需 Token
- [ ] Slack — 发送/读取消息，需 Bot Token
- [ ] Filesystem — 访问本地其他目录，无需配置
- [ ] PostgreSQL — 查询数据库，需连接串
- [ ] Notion — 读取/写入 pages，需 Integration Token
- [ ] Linear — 读取任务，需 API Key
- [ ] 浏览器 — 网页抓取，无需配置
- [ ] 每个模板包含：`id`、`name`、`description`、`serverConfig`（连接参数占位符）、`credentialFields`（需填写的凭证字段）、`dependencies`（如 Node.js）、`tools`（可用工具列表预览）
- [ ] 模板选择后预填配置（placeholder 替换）
- [ ] 填写凭证后测试连接，失败展示诊断信息

### 审计日志

- [ ] `src/main/services/mcp/mcp-audit.ts` 创建
- [ ] MCP 工具调用记录追加到 `.sibylla/mcp/audit-log.jsonl`（append-only）
- [ ] 记录结构：`{ timestamp, serverName, toolName, args: string, result: 'success'|'error', durationMs, userDecision: 'confirmed'|'auto' }`
- [ ] 凭证不出现在审计日志中（args 中脱敏处理）
- [ ] 默认开启审计，用户可在设置中关闭

### Feature Flag

- [ ] `.sibylla/config.json` 新增 `mcp` 字段：
  ```json
  {
    "mcp": {
      "enabled": false,
      "servers": {},
      "auditEnabled": true
    }
  }
  ```
- [ ] `mcp.enabled` 为 false 时：不注入 MCP 工具描述、不拦截工具调用、不加载 MCP 相关服务
- [ ] 启用后首次启动时，自动检测已安装的依赖（如 Node.js）并提示

### 单元测试

- [ ] MCPClient stdio 连接/断开/重连测试
- [ ] MCPClient SSE 连接测试
- [ ] MCPRegistry 服务注册/移除/列表测试
- [ ] MCPPermission 权限检查/授权/撤销测试
- [ ] MCPPermission 敏感操作限制测试（delete_* 不可永久允许）
- [ ] MCPCredentials 凭证存储/读取/删除测试
- [ ] AI 对话流程集成测试（工具调用拦截/权限确认/结果注入）
- [ ] 审计日志追加/脱敏测试
- [ ] Feature Flag 开关测试
- [ ] 8 个模板配置校验测试
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：MCP 客户端 + AI 流式管道集成

```
用户添加 MCP Server（设置页）
       │
       ▼
MCPRegistry.addServer(config)
       │
       ├── MCPCredentials.saveCredential() → 系统密钥库
       ├── MCPClient.connect(config) → stdio/SSE/WebSocket
       └── 验证连接 → listTools() → 缓存工具列表
       │
       ▼
ContextEngine.assembleContext()
       │
       ├── L1: always（CLAUDE.md + 当前文件）55%
       ├── L2: memory（MEMORY.md）15%
       ├── L3: skill + manual 20%
       └── L4: MCP 工具描述 10% ← 新增
              │
              └── MCPRegistry.listAllTools() → 工具描述注入系统提示
       │
       ▼
ai.handler.ts 流式管道
       │
       ├── Generator.chat() → AI 响应
       │
       ├── 检测工具调用意图（function calling 格式）
       │   └── if MCP tool call detected:
       │       ├── 暂停流
       │       ├── MCPPermission.checkPermission()
       │       │   └── if 无权限 → IPC push mcp:permissionPrompt
       │       │       └── 渲染进程弹窗 → 用户确认
       │       ├── MCPClient.callTool(server, tool, args)
       │       ├── 注入工具结果到消息流
       │       └── 恢复流
       │
       └── 审计日志记录
```

### MCPClient 连接模型

```
MCPClient
       │
       ├── Transport 层（策略模式）
       │   ├── StdioTransport — child_process.spawn（本地 MCP server）
       │   ├── SSETransport — EventSource（远程 HTTP）
       │   └── WebSocketTransport — ws://（双向实时）
       │
       ├── 消息协议（JSON-RPC 2.0）
       │   ├── initialize → capabilities 协商
       │   ├── tools/list → 工具发现
       │   ├── tools/call → 工具调用
       │   └── shutdown → 优雅关闭
       │
       └── 生命周期管理
           ├── 连接状态：disconnected → connecting → connected → disconnected
           ├── 指数退避重连
           └── 超时控制
```

### 权限确认时序

```
AI 响应包含工具调用意图
       │
       ▼
ai.handler.ts 拦截
       │
       ├── 1. 解析工具调用：{ serverName, toolName, args }
       ├── 2. MCPPermission.checkPermission()
       │   ├── 已有 permanent 权限 → 直接执行
       │   ├── 已有 session 权限（会话内有效）→ 直接执行
       │   ├── 已有 deny 权限 → 拒绝，告知 AI
       │   └── 无权限 → 进入确认流程
       │
       ├── 3. 确认流程：
       │   ├── IPC push mcp:permissionPrompt → 渲染进程
       │   │   └── 弹窗："AI 想调用 GitHub 的 create_issue 工具"
       │   │       └── [仅此次] [本次会话] [永久允许] [拒绝]
       │   │       └── 敏感操作隐藏 [永久允许] 选项
       │   └── 等待用户决策（Promise await）
       │
       ├── 4. 执行工具调用
       │   └── MCPClient.callTool(serverName, toolName, args)
       │
       ├── 5. 注入结果
       │   └── 将 ToolResult 追加到消息流
       │
       └── 6. 审计记录
```

### Token 预算调整

```
原预算分配（Sprint 3.5）：
  always: 55% / memory: 15% / skill: 15% / manual: 15%

新预算分配（Sprint 3.6，MCP 启用时）：
  always: 55% / memory: 15% / skill: 10% / manual: 10% / mcp: 10%

调整方式：
  skill 从 15% → 10%（划拨 5%）
  manual 从 15% → 10%（划拨 5%）
  新增 mcp 层 10%
```

### 预置模板架构

```
resources/mcp-templates/
├── github.json
├── gitlab.json
├── slack.json
├── filesystem.json
├── postgresql.json
├── notion.json
├── linear.json
└── browser.json

每个模板 JSON 结构：
{
  "id": "github",
  "name": "GitHub",
  "description": "读取 issue / PR / code",
  "icon": "github",
  "category": "developer",
  "serverConfig": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "{{GITHUB_PAT}}"
    }
  },
  "credentialFields": [
    {
      "key": "GITHUB_PAT",
      "label": "Personal Access Token",
      "type": "password",
      "required": true,
      "placeholder": "ghp_xxxxxxxxxxxx"
    }
  ],
  "dependencies": [
    { "name": "Node.js", "checkCommand": "node --version", "installUrl": "https://nodejs.org" }
  ],
  "tools": ["list_issues", "get_issue", "create_issue", "list_prs", "get_pr", "search_code"],
  "sensitiveToolPatterns": ["create_*", "write_*", "delete_*"]
}
```

### 依赖库选型

| 用途 | 库 | 说明 |
|------|-----|------|
| MCP SDK | `@modelcontextprotocol/sdk` | 官方 MCP 客户端 SDK |
| 系统密钥库 | `keytar` | macOS Keychain / Windows Credential Manager / libsecret |
| JSON-RPC | 内置或 `@modelcontextprotocol/sdk` | MCP 协议基于 JSON-RPC 2.0 |
| 子进程管理 | Node.js `child_process` | stdio 传输方式 |
| SSE 客户端 | 内置 EventSource | SSE 传输方式 |
| WebSocket 客户端 | `ws` | WebSocket 传输方式 |

## 技术执行路径

### 步骤 1：定义 MCP 共享类型

**文件：** `src/main/services/mcp/types.ts`（新建）

1. 定义 MCP 服务配置类型：
   ```typescript
   export type MCPTransportType = 'stdio' | 'sse' | 'websocket'

   export interface MCPServerConfig {
     name: string
     transport: MCPTransportType
     command?: string                    // stdio 模式
     args?: string[]                     // stdio 模式
     env?: Record<string, string>        // 环境变量（含凭证占位符）
     url?: string                        // SSE/WebSocket 模式
     headers?: Record<string, string>    // SSE 模式
     timeout?: number                    // 连接超时（ms），默认 10000
     autoReconnect?: boolean             // 自动重连，默认 true
     maxRetries?: number                 // 最大重连次数，默认 10
   }
   ```

2. 定义 MCP 工具类型：
   ```typescript
   export interface MCPTool {
     name: string
     description: string
     inputSchema: Record<string, unknown>  // JSON Schema
     serverName: string
   }

   export interface MCPToolResult {
     content: string | Array<{ type: string; text: string }>
     isError?: boolean
   }
   ```

3. 定义连接状态和事件类型：
   ```typescript
   export type MCPConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error'

   export interface MCPServerInfo {
     name: string
     state: MCPConnectionState
     toolCount: number
     lastConnectedAt?: number
     error?: string
   }

   export interface MCPEvent {
     type: 'connected' | 'disconnected' | 'error' | 'tools_changed'
     serverName: string
     data?: unknown
   }
   ```

4. 定义权限类型：
   ```typescript
   export type MCOPermissionLevel = 'once' | 'session' | 'permanent' | 'deny'

   export interface MCOPermissionEntry {
     serverName: string
     toolName: string
     level: MCOPermissionLevel
     grantedAt: number
     grantedBySession?: string           // session 模式记录会话 ID
   }

   export interface MCOPermissionPrompt {
     serverName: string
     toolName: string
     toolDescription: string
     args: Record<string, unknown>
     isSensitive: boolean                // 敏感操作不可永久允许
   }
   ```

5. 定义审计日志类型：
   ```typescript
   export interface MCPAuditEntry {
     timestamp: number
     serverName: string
     toolName: string
     args: string                        // 脱敏后的参数 JSON
     result: 'success' | 'error' | 'denied'
     durationMs: number
     userDecision: 'confirmed' | 'auto' | 'denied'
     error?: string
   }
   ```

6. 定义模板类型：
   ```typescript
   export interface MCPTemplate {
     id: string
     name: string
     description: string
     icon: string
     category: string
     serverConfig: MCPServerConfig
     credentialFields: MCPCredentialField[]
     dependencies: MCPDependency[]
     tools: string[]
     sensitiveToolPatterns: string[]
   }

   export interface MCPCredentialField {
     key: string
     label: string
     type: 'password' | 'text'
     required: boolean
     placeholder?: string
   }

   export interface MCPDependency {
     name: string
     checkCommand: string
     installUrl: string
   }
   ```

**验证：** TypeScript 编译通过，类型完整无 `any`。

### 步骤 2：实现 MCPClient 连接核心

**文件：** `src/main/services/mcp/mcp-client.ts`（新建）

1. 构造函数和内部状态：
   ```typescript
   export class MCPClient {
     private connections = new Map<string, MCPConnection>()
     private eventHandlers: ((event: MCPEvent) => void)[] = []

     constructor(
       private readonly logger: Logger,
       private readonly auditLog: MCPAuditLog,
     ) {}
   }
   ```

2. 实现 `async connect(config: MCPServerConfig): Promise<void>`：
   ```
   a. 根据 transport 类型创建 Transport：
      - stdio → StdioTransport（spawn 子进程）
      - sse → SSETransport（EventSource）
      - websocket → WebSocketTransport（ws）

   b. 建立连接（10 秒超时）：
      connection = new MCPConnection(transport, config)
      await connection.initialize()  // JSON-RPC initialize 握手

   c. 缓存连接：
      this.connections.set(config.name, connection)

   d. 触发事件：
      this.emitEvent({ type: 'connected', serverName: config.name })

   e. 启动重连监听：
      connection.onDisconnect(() => this.handleDisconnect(config))
   ```

3. 实现 `async disconnect(serverName: string): Promise<void>`：
   - 获取连接实例
   - 发送 JSON-RPC shutdown 请求
   - 关闭 Transport（杀死子进程或关闭连接）
   - 2 秒内完成，超时强制关闭
   - 从 connections Map 中移除
   - 触发 disconnected 事件

4. 实现 `async listTools(serverName: string): Promise<MCPTool[]>`：
   - 获取连接实例
   - 发送 JSON-RPC `tools/list` 请求
   - 缓存结果到连接实例
   - 返回工具列表（附加 serverName 字段）

5. 实现 `async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<MCPToolResult>`：
   - 获取连接实例
   - 发送 JSON-RPC `tools/call` 请求
   - 记录审计日志
   - 返回结果（3 秒超时，不含外部服务延迟则正常返回）
   - 失败时返回 `{ content: '工具调用失败: ...', isError: true }`

6. 实现 `onServerEvent(handler)` / `emitEvent(event)` 事件机制

7. 实现 `private handleDisconnect(config: MCPServerConfig)` 指数退避重连：
   ```
   for retry in 1..config.maxRetries:
     delay = min(2^retry * 1000, 30000)  // 指数退避，最大 30 秒
     await sleep(delay)
     try:
       await this.connect(config)
       return  // 重连成功
     catch:
       continue  // 继续重试
   // 超过最大重试次数
   this.emitEvent({ type: 'error', serverName: config.name, data: '重连失败' })
   ```

**验证：** MCPClient 可连接 stdio MCP server、可列出工具、可调用工具、可断开连接、重连机制正确。

### 步骤 3：实现 MCPRegistry + MCPCredentials

**文件：** `src/main/services/mcp/mcp-registry.ts`（新建）

1. 构造函数注入依赖：
   ```typescript
   export class MCPRegistry {
     private servers = new Map<string, MCPServerConfig>()
     private serverInfo = new Map<string, MCPServerInfo>()

     constructor(
       private readonly client: MCPClient,
       private readonly credentials: MCPCredentials,
       private readonly configPath: string,    // .sibylla/config.json
       private readonly logger: Logger,
     ) {}
   }
   ```

2. 实现 `async initialize(): Promise<void>`：
   - 读取 `.sibylla/config.json` 的 `mcp.servers` 字段
   - 对每个已配置的服务，尝试自动连接
   - 连接成功的服务缓存工具列表
   - 连接失败的记录错误状态

3. 实现 `async addServer(config: MCPServerConfig): Promise<void>`：
   - 替换配置中的凭证占位符为实际值（从 MCPCredentials 获取）
   - 调用 `client.connect(config)` 验证连接
   - 连接成功后缓存工具列表
   - 持久化服务配置到 config.json

4. 实现 `async removeServer(serverName: string): Promise<void>`：
   - 调用 `client.disconnect(serverName)`
   - 从 servers Map 和 serverInfo Map 中移除
   - 更新 config.json

5. 实现 `listServers(): MCPServerInfo[]` — 返回所有服务及状态

6. 实现 `listAllTools(): MCPTool[]`：
   - 遍历所有已连接服务
   - 汇总返回所有工具列表
   - 每个工具附加 serverName 标识

7. 实现 `getTool(serverName: string, toolName: string): MCPTool | null`

**文件：** `src/main/services/mcp/mcp-credentials.ts`（新建）

8. 使用 `keytar` 实现系统密钥库抽象：
   ```typescript
   export class MCPCredentials {
     private static readonly SERVICE_NAME = 'sibylla-mcp'

     constructor(private readonly logger: Logger) {}

     async saveCredential(serverName: string, key: string, value: string): Promise<void> {
       await keytar.setPassword(MCPCredentials.SERVICE_NAME, `${serverName}:${key}`, value)
     }

     async getCredential(serverName: string, key: string): Promise<string | null> {
       return keytar.getPassword(MCPCredentials.SERVICE_NAME, `${serverName}:${key}`)
     }

     async deleteCredential(serverName: string, key: string): Promise<void> {
       await keytar.deletePassword(MCPCredentials.SERVICE_NAME, `${serverName}:${key}`)
     }

     async deleteAllCredentials(serverName: string): Promise<void> {
       // 遍历删除该服务所有凭证
     }
   }
   ```

9. 降级策略：如果 keytar 不可用（如 Linux 未安装 libsecret），降级为加密文件存储：
   - 使用 Node.js `crypto` 模块 AES-256 加密
   - 存储路径：`.sibylla/mcp/credentials.enc`
   - 加密密钥派生自用户 workspace 密码

**验证：** MCPRegistry 正确加载/保存配置、MCPCredentials 正确存储/读取凭证、降级策略正确。

### 步骤 4：实现 MCPPermission 权限管理器

**文件：** `src/main/services/mcp/mcp-permission.ts`（新建）

1. 构造函数：
   ```typescript
   export class MCPPermission {
     private permissions = new Map<string, MCOPermissionEntry>()
     private currentSessionId: string

     constructor(
       private readonly permissionsPath: string,  // .sibylla/mcp/permissions.json
       private readonly logger: Logger,
     ) {}
   }
   ```

2. 实现 `async initialize(): Promise<void>`：
   - 从 `.sibylla/mcp/permissions.json` 加载已有权限
   - 清理已过期的 session 权限

3. 实现 `checkPermission(serverName: string, toolName: string): MCOPermissionLevel | null`：
   - 查询 Map 缓存
   - 如果是 `session` 权限，检查 sessionId 是否匹配当前会话
   - 返回权限级别或 null（无权限）

4. 实现 `isSensitiveTool(serverName: string, toolName: string): boolean`：
   - 检查工具名是否匹配敏感模式：`delete_*` / `write_*` / `transfer_*`
   - 从对应模板的 `sensitiveToolPatterns` 读取
   - 敏感工具不可设为 `permanent`

5. 实现 `grantPermission(serverName: string, toolName: string, level: MCOPermissionLevel): void`：
   - 如果是敏感工具且 level === 'permanent'：拒绝并抛出错误
   - 创建权限条目
   - 更新 Map 缓存
   - 持久化到 permissions.json

6. 实现 `revokePermission(serverName: string, toolName: string): void`

7. 实现 `revokeAll(serverName: string): void` — 撤销某服务全部权限

8. 实现 `async cleanup(): Promise<void>`：
   - 清理已过期的 session 权限（非当前会话）
   - 持久化

**验证：** 权限检查/授权/撤销正确、敏感工具限制正确、session 权限过期清理正确。

### 步骤 5：实现 MCP 审计日志

**文件：** `src/main/services/mcp/mcp-audit.ts`（新建）

1. 构造函数：
   ```typescript
   export class MCPAuditLog {
     constructor(
       private readonly logPath: string,    // .sibylla/mcp/audit-log.jsonl
       private readonly enabled: boolean,   // 从 config 读取
       private readonly logger: Logger,
     ) {}
   }
   ```

2. 实现 `async record(entry: MCPAuditEntry): Promise<void>`：
   - 如果 enabled 为 false，跳过
   - 脱敏处理：替换 args 中的 token/password/key 等敏感字段为 `***`
   - 追加到 `.sibylla/mcp/audit-log.jsonl`（每行一个 JSON）
   - 使用 appendFile（原子追加，append-only）

3. 实现 `sanitizeArgs(args: Record<string, unknown>): string`：
   - 递归遍历 args 对象
   - 对 key 包含 token/password/secret/key/auth 的字段替换为 `***`
   - 返回 JSON 字符串

4. 实现 `async query(filter: { serverName?: string; since?: number; limit?: number }): Promise<MCPAuditEntry[]>`：
   - 逐行读取 JSONL 文件
   - 按过滤条件筛选
   - 按 timestamp 倒序返回

**验证：** 审计日志正确追加、敏感信息正确脱敏、查询过滤正确。

### 步骤 6：实现 AI 对话流程集成（ai.handler.ts 改造）

**文件：** `src/main/ipc/handlers/ai.handler.ts`（修改）

这是 MCP 与 AI 对话的集成点，是最核心也最敏感的改造。

1. 在流式响应管道中添加工具调用拦截：
   ```
   原有流式管道：
     Generator.chat() → 逐 token 推送到渲染进程

   新增拦截层：
     Generator.chat() → 检测 function_call block → 拦截处理 → 继续流
   ```

2. 实现工具调用检测：
   ```typescript
   private detectToolCall(responseChunk: string): ToolCallIntent | null {
     // 检测 AI 响应中的 function calling 格式
     // 格式：<tool_call server="github" tool="list_issues">{"repo": "..."}</tool_call >
     // 或 JSON 格式：{ "type": "tool_call", "server": "...", "tool": "...", "args": {...} }
   }
   ```

3. 实现拦截流程：
   ```typescript
   private async handleToolCall(
     intent: ToolCallIntent,
     streamContext: StreamContext,
   ): Promise<void> {
     // 1. Feature flag 检查
     if (!this.config.mcp.enabled) {
       // 未启用 MCP，跳过拦截，让 AI 正常输出
       return
     }

     // 2. 暂停流
     streamContext.pause()

     try {
       // 3. 权限检查
       const existingPermission = this.mcpPermission.checkPermission(intent.serverName, intent.toolName)

       if (existingPermission === 'deny') {
         // 已拒绝，告知 AI
         streamContext.injectMessage({ role: 'tool_result', content: '用户已拒绝此工具调用' })
         return
       }

       if (!existingPermission) {
         // 无权限，需要用户确认
         const decision = await this.promptUserPermission({
           serverName: intent.serverName,
           toolName: intent.toolName,
           toolDescription: this.mcpRegistry.getTool(intent.serverName, intent.toolName)?.description ?? '',
           args: intent.args,
           isSensitive: this.mcpPermission.isSensitiveTool(intent.serverName, intent.toolName),
         })

         if (decision === 'deny') {
           this.mcpPermission.grantPermission(intent.serverName, intent.toolName, 'deny')
           streamContext.injectMessage({ role: 'tool_result', content: '用户拒绝工具调用' })
           return
         }

         this.mcpPermission.grantPermission(intent.serverName, intent.toolName, decision)
       }

       // 4. 执行工具调用
       const startTime = Date.now()
       const result = await this.mcpClient.callTool(intent.serverName, intent.toolName, intent.args)

       // 5. 审计记录
       await this.auditLog.record({
         timestamp: Date.now(),
         serverName: intent.serverName,
         toolName: intent.toolName,
         args: JSON.stringify(intent.args),
         result: result.isError ? 'error' : 'success',
         durationMs: Date.now() - startTime,
         userDecision: existingPermission ? 'auto' : 'confirmed',
       })

       // 6. 注入结果
       const resultContent = typeof result.content === 'string'
         ? result.content
         : result.content.map(c => c.text).join('\n')
       streamContext.injectMessage({ role: 'tool_result', content: resultContent })
     } catch (error) {
       // 7. 优雅降级
       streamContext.injectMessage({
         role: 'tool_result',
         content: `工具调用失败: ${error.message}。请尝试其他方式回答用户问题。`,
       })
     } finally {
       // 8. 恢复流
       streamContext.resume()
     }
   }
   ```

4. 实现 `promptUserPermission(prompt: MCOPermissionPrompt): Promise<MCOPermissionLevel>`：
   - 通过 IPC push `mcp:permissionPrompt` 到渲染进程
   - 使用 Promise + Map 存储待确认请求
   - 等待渲染进程通过 `mcp:grantPermission` 返回用户决策
   - 超时 60 秒自动拒绝

**验证：** 工具调用正确拦截、权限确认流程正确、结果正确注入、失败优雅降级。

### 步骤 7：实现 ContextEngine MCP 上下文注入

**文件：** `src/main/services/context-engine/context-engine.ts`（修改）

在 ContextEngine 的 `assembleContext()` 方法中新增 L4: MCP 上下文层。

1. 在 `assembleContext()` 中新增 MCP 层注入点：
   ```typescript
   // L4: MCP 上下文（仅在 mcp.enabled 时注入）
   if (this.config.mcp?.enabled && this.mcpRegistry) {
     const mcpTools = this.mcpRegistry.listAllTools()
     if (mcpTools.length > 0) {
       const mcpContext = this.formatMcpToolDescriptions(mcpTools)
       // Token 预算：从 skill 和 manual 各划拨 5%
       const mcpBudget = Math.floor(totalBudget * 0.10)
       const truncatedMcpContext = this.truncateToTokenLimit(mcpContext, mcpBudget)
       systemPrompt += '\n\n## 可用外部工具（MCP）\n' + truncatedMcpContext
     }
   }
   ```

2. 实现 `private formatMcpToolDescriptions(tools: MCPTool[]): string`：
   - 将工具列表格式化为 AI 可理解的描述
   - 格式：
     ```
     你可以通过以下外部工具获取信息或执行操作。调用格式：
     <tool_call server="服务名" tool="工具名">参数JSON</tool_call >

     ### GitHub (已连接)
     - list_issues: 列出 GitHub issues。参数: { repo: string, state?: 'open'|'closed' }
     - get_issue: 获取 issue 详情。参数: { repo: string, issue_number: number }
     ...
     ```
   - 仅列出已连接服务的工具（断开的服务不列出）

3. Token 预算调整：
   - 更新 `TokenBudget` 类型新增 `mcp: number` 字段
   - 调整预算分配：always 55% / memory 15% / skill 10% / manual 10% / mcp 10%
   - MCP 未启用时保持原分配

**验证：** MCP 启用时工具描述正确注入系统提示、token 预算调整正确、未启用时零影响。

### 步骤 8：创建 8 个 v1 预置模板

**目录：** `resources/mcp-templates/`（新建）

1. 创建 `github.json`：
   ```json
   {
     "id": "github",
     "name": "GitHub",
     "description": "读取 issue / PR / code，需要 Personal Access Token",
     "icon": "github",
     "category": "developer",
     "serverConfig": {
       "transport": "stdio",
       "command": "npx",
       "args": ["-y", "@modelcontextprotocol/server-github"],
       "env": {
         "GITHUB_PERSONAL_ACCESS_TOKEN": "{{GITHUB_PAT}}"
       }
     },
     "credentialFields": [
       {
         "key": "GITHUB_PAT",
         "label": "Personal Access Token",
         "type": "password",
         "required": true,
         "placeholder": "ghp_xxxxxxxxxxxx"
       }
     ],
     "dependencies": [
       { "name": "Node.js", "checkCommand": "node --version", "installUrl": "https://nodejs.org" }
     ],
     "tools": ["list_issues", "get_issue", "create_issue", "list_prs", "get_pr", "search_code", "get_file_contents"],
     "sensitiveToolPatterns": ["create_*", "write_*", "delete_*"]
   }
   ```

2. 创建 `gitlab.json`：
   - transport: stdio, command: `npx -y @modelcontextprotocol/server-gitlab`
   - 凭证：GitLab Personal Access Token

3. 创建 `slack.json`：
   - transport: stdio, command: `npx -y @modelcontextprotocol/server-slack`
   - 凭证：Slack Bot Token (`xoxb-...`)

4. 创建 `filesystem.json`：
   - transport: stdio, command: `npx -y @modelcontextprotocol/server-filesystem`
   - 无需凭证，参数为允许访问的本地目录路径

5. 创建 `postgresql.json`：
   - transport: stdio, command: `npx -y @modelcontextprotocol/server-postgres`
   - 凭证：PostgreSQL 连接串 (`postgresql://user:pass@host:port/db`)

6. 创建 `notion.json`：
   - transport: stdio, command: `npx -y @modelcontextprotocol/server-notion`
   - 凭证：Notion Integration Token (`ntn_...`)

7. 创建 `linear.json`：
   - transport: stdio, command: `npx -y mcp-linear`
   - 凭证：Linear API Key

8. 创建 `browser.json`：
   - transport: stdio, command: `npx -y @playwright/mcp`
   - 无需凭证

**验证：** 8 个模板 JSON 格式正确、可通过模板加载器解析。

### 步骤 9：实现 IPC 通道 + 渲染进程 API

**文件：** `src/main/ipc/handlers/mcp.ts`（新建）

1. 注册 `mcp:connect` handler：
   ```typescript
   ipcMain.handle('mcp:connect', async (_, config: MCPServerConfig) => {
     await mcpRegistry.addServer(config)
     return { success: true }
   })
   ```

2. 注册 `mcp:disconnect` handler

3. 注册 `mcp:listServers` handler → `mcpRegistry.listServers()`

4. 注册 `mcp:listTools` handler → `mcpRegistry.listAllTools()`

5. 注册 `mcp:callTool` handler（手动调用工具，如设置页测试）：
   - 包含权限检查和审计记录

6. 注册 `mcp:permissionPrompt` push 事件（Main → Renderer）

7. 注册 `mcp:grantPermission` handler（Renderer → Main）：
   - 接收用户权限决策
   - resolve 对应的 Promise（与步骤 6 的等待配对）

8. 注册 `mcp:revokePermission` handler

9. 注册 `mcp:serverStatusChanged` push 事件（Main → Renderer）

**文件：** `src/shared/types.ts`（扩展）

10. 新增 MCP IPC 通道常量：
    ```typescript
    MCP_CONNECT: 'mcp:connect',
    MCP_DISCONNECT: 'mcp:disconnect',
    MCP_LIST_SERVERS: 'mcp:listServers',
    MCP_LIST_TOOLS: 'mcp:listTools',
    MCP_CALL_TOOL: 'mcp:callTool',
    MCP_PERMISSION_PROMPT: 'mcp:permissionPrompt',
    MCP_GRANT_PERMISSION: 'mcp:grantPermission',
    MCP_REVOKE_PERMISSION: 'mcp:revokePermission',
    MCP_SERVER_STATUS_CHANGED: 'mcp:serverStatusChanged',
    ```

**文件：** `src/preload/index.ts`（扩展）

11. 新增 `mcp` 命名空间：
    ```typescript
    mcp: {
      connect: (config: MCPServerConfig) => ipcRenderer.invoke('mcp:connect', config),
      disconnect: (serverName: string) => ipcRenderer.invoke('mcp:disconnect', serverName),
      listServers: () => ipcRenderer.invoke('mcp:listServers'),
      listTools: () => ipcRenderer.invoke('mcp:listTools'),
      callTool: (serverName: string, toolName: string, args: Record<string, unknown>) =>
        ipcRenderer.invoke('mcp:callTool', serverName, toolName, args),
      onPermissionPrompt: (callback: (prompt: MCOPermissionPrompt) => void) =>
        ipcRenderer.on('mcp:permissionPrompt', (_, data) => callback(data)),
      grantPermission: (requestId: string, level: MCOPermissionLevel) =>
        ipcRenderer.invoke('mcp:grantPermission', requestId, level),
      revokePermission: (serverName: string, toolName: string) =>
        ipcRenderer.invoke('mcp:revokePermission', serverName, toolName),
      onServerStatusChanged: (callback: (info: MCPServerInfo) => void) =>
        ipcRenderer.on('mcp:serverStatusChanged', (_, data) => callback(data)),
    }
    ```

**验证：** IPC 通道注册正确、渲染进程可通过 IPC 调用 MCP 功能、权限确认双向通信正确。

### 步骤 10：单元测试 + 主进程装配

**文件：** `tests/main/services/mcp/`（新建目录）

1. `mcp-client.test.ts`：
   - stdio 连接/断开测试（使用 mock MCP server）
   - SSE 连接测试
   - listTools 正确返回工具列表
   - callTool 正确调用并返回结果
   - 调用失败返回 isError: true
   - 重连机制测试（模拟断连后重连）
   - 超时测试（连接超时 10 秒）

2. `mcp-registry.test.ts`：
   - initialize() 正确加载已配置服务
   - addServer() 添加并验证连接
   - removeServer() 断开并移除
   - listServers() 返回正确状态
   - listAllTools() 汇总所有工具
   - 配置持久化正确

3. `mcp-permission.test.ts`：
   - checkPermission() 查询正确
   - grantPermission() 授权正确
   - revokePermission() 撤销正确
   - 敏感工具（delete_*）不可设为 permanent
   - session 权限过期清理

4. `mcp-credentials.test.ts`：
   - 凭证存储/读取正确
   - 凭证删除正确
   - 降级策略（keytar 不可用时）

5. `mcp-audit.test.ts`：
   - 审计日志正确追加
   - 敏感信息脱敏正确
   - 查询过滤正确

6. `ai-handler-integration.test.ts`：
   - 工具调用检测正确
   - 权限确认流程正确（mock IPC）
   - 工具结果注入正确
   - MCP 未启用时零影响
   - 调用失败优雅降级

7. `context-engine-mcp.test.ts`：
   - MCP 启用时工具描述注入系统提示
   - token 预算调整正确
   - MCP 未启用时不注入

8. `mcp-templates.test.ts`：
   - 8 个模板 JSON 格式正确
   - 必填字段完整
   - credentialFields 类型正确

**覆盖率目标：** ≥ 80%

**文件：** 主进程初始化入口（修改）

9. 装配顺序：
   ```
   a. 读取 .sibylla/config.json 的 mcp 字段
   b. if mcp.enabled:
      1. MCPAuditLog(logPath, mcp.auditEnabled, logger)
      2. MCPClient(logger, auditLog)
      3. MCPCredentials(logger)
      4. MCPPermission(permissionsPath, logger)
      5. MCPRegistry(client, credentials, configPath, logger)
      6. await mcpRegistry.initialize()
      7. 注入到 ai.handler.ts
      8. 注入到 ContextEngine
   c. 注册 mcp IPC handler
   ```

10. MCP 模块统一导出：
    - `src/main/services/mcp/index.ts` — 导出所有 MCP 模块

**验证：** 应用启动后 MCP 模块正确初始化、IPC 通道可用、AI 对话可调用 MCP 工具。

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| ai.handler.ts | `src/main/ipc/handlers/ai.handler.ts` | 添加工具调用拦截层 |
| ContextEngine | `src/main/services/context-engine.ts` | 新增 L4: MCP 上下文注入 |
| PromptComposer | `src/main/services/context-engine/PromptComposer.ts`（TASK035） | MCP 工具描述格式化 |
| AiGatewayClient | `src/main/services/ai-gateway-client.ts` | 不修改，MCP 工具调用独立 |
| FileManager | `src/main/services/file-manager.ts` | 审计日志文件写入 |
| AutoSaveManager | `src/main/services/auto-save-manager.ts` | 审计日志自动提交 |
| HarnessOrchestrator | `src/main/services/harness/orchestrator.ts` | 可能需要工具注册扩展 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `mcp/types.ts` | MCP 全部类型定义 |
| `mcp/mcp-client.ts` | MCPClient 实现 |
| `mcp/mcp-registry.ts` | 服务注册表 |
| `mcp/mcp-permission.ts` | 权限管理器 |
| `mcp/mcp-credentials.ts` | 凭证管理 |
| `mcp/mcp-audit.ts` | 审计日志 |
| `mcp/mcp-templates.ts` | 模板加载器 |
| `mcp/transport/stdio-transport.ts` | stdio 传输 |
| `mcp/transport/sse-transport.ts` | SSE 传输 |
| `mcp/transport/websocket-transport.ts` | WebSocket 传输 |
| `mcp/index.ts` | 统一导出 |
| `ipc/handlers/mcp.ts` | MCP IPC 处理器 |
| `resources/mcp-templates/`（8 文件） | v1 预置模板 |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `mcp:connect` | Renderer → Main | 连接 MCP Server |
| `mcp:disconnect` | Renderer → Main | 断开 MCP Server |
| `mcp:listServers` | Renderer → Main | 列出已配置的 Server |
| `mcp:listTools` | Renderer → Main | 列出可用工具 |
| `mcp:callTool` | Renderer → Main | 手动调用工具 |
| `mcp:permissionPrompt` | Main → Renderer | 权限确认弹窗推送 |
| `mcp:grantPermission` | Renderer → Main | 用户授权 |
| `mcp:revokePermission` | Renderer → Main | 撤销授权 |
| `mcp:serverStatusChanged` | Main → Renderer | 服务状态变更推送 |

注：`mcp:configureSync` 和 `mcp:triggerSync` 和 `mcp:syncProgress` 留给 TASK043。

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/ipc/handlers/ai.handler.ts` | 修改 | 添加 MCP 工具调用拦截层 |
| `src/main/services/context-engine/context-engine.ts` | 修改 | 新增 L4: MCP 上下文注入点 + token 预算调整 |
| `src/shared/types.ts` | 扩展 | 新增 MCP 相关类型 + IPC 通道常量 |
| `src/preload/index.ts` | 扩展 | 新增 mcp 命名空间 |
| IPC 注册入口 | 扩展 | 注册 mcp handler |

**不修改的文件：**
- `src/main/services/sync-manager.ts` — MCP 独立
- `src/main/services/file-manager.ts` — 仅作为被调用方
- `src/main/services/ai-gateway-client.ts` — MCP 工具调用独立于 AI Gateway

---

**创建时间：** 2026-04-24
**最后更新：** 2026-04-24
**更新记录：**
- 2026-04-24 — 创建任务文档（含完整技术执行路径 10 步）
