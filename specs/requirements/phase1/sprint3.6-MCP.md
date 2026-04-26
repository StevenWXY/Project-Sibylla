# Sprint 3.6 - 迁移、导入与 MCP 集成需求

## 一、概述

### 1.1 目标与价值

本 Sprint 是 Phase 1 到 Phase 2 之间的关键桥梁,承担两大核心使命:

1. **降低获客门槛**:通过强大的导入能力,让新用户可以一键迁移 Notion / Google Docs / Obsidian / 本地文档,5 分钟内完成"把大脑倒入 Sibylla"。
2. **扩展 AI 能力边界**:通过 MCP 集成,让 Sibylla 从封闭的本地工具进化为连接外部世界的 AI 工作台。

这两个看似独立的功能,共同服务于同一个目标:**让用户第一次打开 Sibylla 时就体验到"全局上下文 + 外部连接"的 AI 协作威力**。

### 1.2 涉及模块

- 模块13:MCP 外部集成
- 模块14:迁移与导入(增强版)
- 模块16:首次体验与引导(新增)

### 1.3 架构约束与既有系统兼容性

本 Sprint 的实现必须遵循以下与既有系统的兼容性约束（基于代码审查结果）:

1. **导入系统**:现有 `ImportManager`（`sibylla-desktop/src/main/services/import-manager.ts`）支持 .md/.txt/.csv/.docx/.pdf 五种格式的简单导入。本 Sprint 需在其上构建 `ImportAdapter` 插件化架构，而非替换。现有 `file:import` IPC 通道保持向后兼容。
2. **Git 抽象层**:现有 `GitAbstraction`（`sibylla-desktop/src/main/services/git-abstraction.ts`）缺少 branch/tag/revert 操作，导入回滚机制需扩展此接口。
3. **AI 对话流程**:MCP 工具调用需集成到现有 `ai.handler.ts` 的流式响应管道中。MCP 功能默认关闭（`mcp.enabled` feature flag），未配置 MCP server 时 AI 行为完全不变。
4. **上下文引擎**:现有三层模型（always/semantic/manual）需扩展 MCP 上下文层，但 MCP 层的 token 预算从 skill/manual 份额中划拨，不压缩现有层级。
5. **SyncManager**:MCP 持续同步与 Git SyncManager 职责分离，MCP Sync 通过 `FileManager.writeFile()` 写入文件，由现有 AutoSaveManager → GitAbstraction 自动纳入 Git 管理。
6. **云端依赖**:MCP 客户端完全运行在桌面主进程，Sprint 3.6 不需要云端代码改动。架构图中的 MCPHub 是 Phase 2 目标。

### 1.4 里程碑定义

**完成标志:**
- 主流平台导出包一键导入可用(Notion / Google Docs / Obsidian / 本地文件夹)
- 批量 PDF / Word 导入与 AI 结构化可用
- MCP 客户端可连接外部 Server,预置模板可用
- MCP 工具可作为"持续导入通道"(如定期同步 GitHub issues)
- "倒入你的大脑" Aha Moment 引导完成
- 首次使用用户 5 分钟内完成从空白到"与 AI 对话"的全流程

### 1.5 为什么把 MCP 与导入放在一起

**共同本质**:两者都是"扩展 Sibylla 与外部世界的数据通道"。

- **导入** = 一次性批量数据通道(把历史搬过来)
- **MCP** = 持续性实时数据通道(把未来连过来)

两者融合后,用户的体验是:"我过去所有的知识,现在都在 Sibylla 里;我未来新增的知识,会自动流入 Sibylla。"——这是真正的 Aha Moment。

---

## 二、功能需求

### 需求 2.1 - 文件导入增强(多平台导出包)

**用户故事**:作为新用户,我想要一键导入 Notion / Google Docs / Obsidian 的导出包,以便快速迁移我的知识库,而不需要手动一个个复制。

#### 验收标准

1. When user drags export zip to import area, the system shall detect format automatically
2. When Notion export is detected, the system shall preserve page hierarchy and database structure
3. When Google Docs export is detected, the system shall convert .docx to Markdown with formatting preserved
4. When Obsidian vault is imported, the system shall preserve [[wikilinks]] and tags
5. When import includes images, the system shall copy to assets/ directory with relative paths rewritten
6. When import completes, the system shall show summary (file count / image count / error count)
7. When import has errors, the system shall show detailed error list with "跳过 / 重试 / 手动修复" options
8. When user cancels import midway, the system shall rollback all changes atomically

#### 支持格式矩阵

| 源平台 | 格式 | 保留内容 | 已知限制 |
|---|---|---|---|
| Notion | .zip (Markdown+CSV) | 页面层级、数据库、图片 | 不支持嵌入式 Block |
| Notion | .zip (HTML) | 页面、样式(转 MD) | 部分样式丢失 |
| Google Docs | .zip (包含 .docx) | 段落、表格、图片、列表 | 评论需手动处理 |
| Obsidian | 文件夹 / vault | wikilinks、tags、附件 | 插件特有语法跳过 |
| 本地 Markdown | 文件夹 | 原样复制 | - |
| Word | .docx / .doc | 转 Markdown | 复杂表格可能变形 |
| PDF | .pdf | OCR + 结构化(见 2.2) | 见 2.2 |
| Apple Notes | .txt / 导出 | 文本转 MD | 附件需手动处理 |

#### 技术规格要点

每种导入器实现统一接口 `ImportAdapter`,导入过程分为三阶段(**扫描 → 转换 → 写入**),每阶段可暂停或取消。所有导入操作通过事务性文件系统层(基于 Git 暂存),失败可回滚。大包导入(>500 文件)采用流式处理,避免内存爆炸。

**与既有 `ImportManager` 的关系**:现有 `ImportManager`（`src/main/services/import-manager.ts`）支持 .md/.txt/.csv/.docx/.pdf 的简单导入。本需求采用**渐进增强**策略:

1. 新增 `src/main/services/import/` 目录,包含 `ImportAdapter` 接口、`ImportRegistry` 适配器注册表、`ImportPipeline` 三阶段管道
2. 原有 5 种格式的处理逻辑迁移为独立 Adapter（`MarkdownAdapter`/`DocxAdapter`/`PdfAdapter`）
3. `ImportManager` 保留作为兼容层,新增 `importWithPipeline()` 方法委托给 `ImportPipeline`;原有 `importFiles()` 标记 `@deprecated` 但不删除
4. 现有 `file:import` IPC 通道保持不变,内部升级为调用 Pipeline;新增 `file:import:plan`、`file:import:cancel`、`file:import:pause`/`file:import:resume` 通道

```typescript
interface ImportAdapter {
  name: string
  detect(input: string | Buffer): Promise<boolean>
  scan(input: string): Promise<ImportPlan>
  transform(plan: ImportPlan, options: ImportOptions): AsyncIterable<ImportItem>
}
```

**Git 回滚机制**:需扩展 `GitAbstraction` 接口,新增 `createBranch()`、`createTag()`、`revertCommit()`、`getCommitHash()` 方法。导入前创建 tag 快照（如 `import/2026-04-24-001`）,回滚使用 `git revert`（非 hard reset）以保留历史完整性。新增 `ImportHistoryManager` 管理导入记录（存储于 `.sibylla/import-history/`）。

#### 优先级

P0 - 必须完成

---

### 需求 2.2 - AI 结构化与 OCR(PDF / 图片 / 扫描件)

**用户故事**:作为用户,我有一堆 PDF(会议纪要、合同、扫描件),我希望 AI 能自动识别、结构化并归类到合适的目录。

#### 验收标准

1. When user imports PDF, the system shall extract text using layout-aware parser
2. When PDF is scan-based, the system shall run OCR with Chinese + English support
3. When extraction completes, the system shall let AI suggest category and file path
4. When AI suggests category, the user shall confirm or modify before save
5. When batch contains ≥10 files, the system shall show progress bar with ETA
6. When OCR confidence is low (<70%), the system shall mark file with "⚠️ 待复核" tag
7. When document type is recognized (contract / meeting / article), the system shall apply domain template

#### 结构化分类规则

默认分类推断:
- **会议纪要** → `docs/meetings/YYYY/YYYY-MM-DD-标题.md`
- **合同文档** → `docs/contracts/YYYY/`(附加 `⚠️ 敏感` 标签)
- **技术文档** → `docs/tech/` 或按项目归类
- **文章/博客** → `docs/reading/YYYY-MM/`
- **无法识别** → `imports/untriaged/`(等待用户手动整理)

#### 技术规格要点

OCR 引擎优先级:本地 tesseract.js（默认,纯 JS 无需系统依赖,免费）→ 云端 PaddleOCR(可选)→ 付费用户云端高精度模型。AI 分类使用"标题 + 首段 + 关键词"作为输入,避免全文 token 消耗过大。用户可在设置中禁用 AI 分类,使用"全部进 inbox"模式,保留完全控制权。

**与既有 PDF 处理的关系**:现有 `ImportManager.convertPdfToMarkdown()` 使用 `pdf-parse` 做纯文本提取。本需求将其替换为 `PdfAdapter`,内部集成 `OcrEngine` 和 `AiClassifier`。新增 `src/main/services/import/ocr-engine.ts`（tesseract.js 封装）和 `ai-classifier.ts`（调用现有 `AiGatewayClient` 完成分类）。

**AI 分类实现细节**:
- 分类 prompt 注入通过现有 `ContextEngine` → `PromptComposer` 完成
- 分类结果包含: `{ category, targetPath, confidence, tags }`
- 低置信度(<0.6)时让用户手动选择;高置信度(≥0.6)仅展示建议并一键确认

#### 优先级

P0 - 必须完成

---

### 需求 2.3 - MCP 客户端集成

**用户故事**:作为用户,我想要让 Sibylla 连接外部工具(GitHub / Slack / 浏览器),以便扩展 AI 能力边界。

#### 验收标准

1. When user adds MCP server in settings, the system shall validate connection within 10 seconds
2. When MCP server is connected, the system shall list available tools with descriptions
3. When AI needs external data, the system shall call MCP tools with user permission
4. When MCP call requires authentication, the system shall prompt user on first call
5. When MCP call fails, the system shall show error and fallback gracefully (继续对话,不中断)
6. When MCP server disconnects, the system shall show warning and retry with exponential backoff
7. When user disables a server, the system shall release all resources within 2 seconds
8. When MCP tool is called, the system shall log call in audit log(可选,默认开启)

#### 连接方式支持

- **stdio**(本地进程):最常见,通过子进程启动 MCP server
- **SSE**(Server-Sent Events):远程 HTTP 服务
- **WebSocket**:双向实时通信场景

#### 权限模型

每个 MCP server 有独立的权限范围。首次调用工具时,弹出确认对话框:"AI 想调用 GitHub MCP 的 `create_issue` 工具,是否允许?" 用户可选:

- **仅此次**:单次允许
- **本次会话**:会话期间允许
- **永久允许**:写入配置,下次不再询问
- **拒绝**:本次与未来都拒绝

**敏感操作限制**:`delete_*` / `write_*` / `transfer_*` 等关键词默认"每次询问",不可设为"永久允许"。

#### 技术规格要点

**MCP 客户端模块架构**:新增 `src/main/services/mcp/` 目录:

```
src/main/services/mcp/
├── mcp-client.ts          # MCPClient 实现（stdio/SSE/WS）
├── mcp-registry.ts        # MCPServer 注册表（连接状态、工具列表）
├── mcp-permission.ts      # 权限管理器（per-call/session/permanent/deny）
├── mcp-templates.ts       # 预置模板
├── mcp-sync.ts            # 持续同步调度器（Pull-based）
├── mcp-credentials.ts     # 凭证管理（macOS Keychain / Windows Credential Manager / libsecret）
└── types.ts               # MCP 相关类型
```

**与 AI 对话流程的集成**:
1. MCP 功能通过 `.sibylla/config.json` 中 `mcp.enabled` 字段控制,默认 `false`
2. 启用后,`ContextEngine.assembleContext()` 在系统提示中注入可用 MCP 工具描述（作为"L4: MCP 上下文"）
3. AI 响应中的工具调用意图（function calling 格式）由 `ai.handler.ts` 识别并拦截
4. 拦截流程:暂停流 → 检查权限（首次调用推送 `mcp:permissionPrompt` 到渲染进程弹窗确认）→ 调用 MCP 工具 → 注入结果 → 恢复流
5. Token 预算:MCP 工具描述从 skill(15%)和 manual(15%)中各划拨 5%,即 always 55% / memory 15% / skill 10% / manual 10% / mcp 10%

**IPC 通道设计**:
| 通道 | 方向 | 说明 |
|------|------|------|
| `mcp:connect` | R→M | 连接 MCP Server |
| `mcp:disconnect` | R→M | 断开 MCP Server |
| `mcp:listServers` | R→M | 列出已配置的 Server |
| `mcp:listTools` | R→M | 列出可用工具 |
| `mcp:callTool` | R→M | 手动调用工具 |
| `mcp:permissionPrompt` | M→R | 权限确认弹窗推送 |
| `mcp:grantPermission` | R→M | 用户授权 |
| `mcp:revokePermission` | R→M | 撤销授权 |
| `mcp:configureSync` | R→M | 配置持续同步 |
| `mcp:triggerSync` | R→M | 手动触发同步 |
| `mcp:syncProgress` | M→R | 同步进度推送 |

```typescript
interface MCPClient {
  connect(config: MCPServerConfig): Promise<void>
  disconnect(serverName: string): Promise<void>
  listTools(serverName: string): Promise<Tool[]>
  callTool(serverName: string, toolName: string, args: any): Promise<any>
  onServerEvent(handler: (event: MCPEvent) => void): void
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.4 - 预置 MCP 配置模板

**用户故事**:作为用户,我想要快速配置常用工具,不需要手动编写 JSON 配置文件。

#### 验收标准

1. When user clicks "添加集成", the system shall show template gallery
2. When user selects template, the system shall pre-fill configuration with placeholders
3. When user fills credentials, the system shall test connection before save
4. When connection test fails, the system shall show diagnostic message with fix guide
5. When template has dependencies (如 Node.js), the system shall check and guide installation
6. When template is updated by Sibylla, the system shall notify user with changelog

#### 预置模板(v1)

**分批交付策略**:基于 MCP Server 生态成熟度,将 12 种模板分为 v1 首批（有官方/成熟社区 Server）和 v1.1 扩展（需等待生态或自建 Server）。

**v1 首批（Sprint 3.6 必须交付）:**

| 模板 | 用途 | 配置复杂度 | MCP Server 来源 | 目标用户 |
|---|---|---|---|---|
| GitHub | 读取 issue / PR / code | 需 PAT | `@modelcontextprotocol/server-github`（官方） | 开发者、Crypto 团队 |
| GitLab | 读取 issue / MR | 需 Token | 社区 Server | 开发者 |
| Slack | 发送/读取消息 | 需 Bot Token | `@modelcontextprotocol/server-slack`（官方） | 小型创业团队 |
| Filesystem | 访问本地其他目录 | 无需配置 | `@modelcontextprotocol/server-filesystem`（官方） | 通用 |
| PostgreSQL | 查询数据库 | 需连接串 | `@modelcontextprotocol/server-postgres`（官方） | 技术场景 |
| Notion | 读取/写入 pages | 需 Integration Token | `@modelcontextprotocol/server-notion`（官方） | 迁移过渡用户 |
| Linear | 读取任务 | 需 API Key | 社区 Server | 小型创业者 |
| 浏览器 | 网页抓取 | 无需配置 | `@playwright/mcp` 或类似 | 通用 |

**v1.1 扩展（Sprint 3.6 后交付,模板结构预留）:**

| 模板 | 用途 | 配置复杂度 | MCP Server 来源 | 目标用户 |
|---|---|---|---|---|
| Discord | 发送通知 / 读取频道 | 需 Bot Token | 无官方 Server,需等待生态 | Crypto 社区 |
| Telegram | 发送/读取消息 | 需 Bot Token | 无官方 Server,需等待生态 | Crypto 社区 |
| Obsidian | 访问其他 vault | 无需配置 | 社区 Server,成熟度待验证 | 迁移过渡用户 |
| Zotero | 文献管理 | 无需配置 | 无已知 MCP Server,需等待生态 | 学生、研究者 |

**说明**:Notion MCP 与需求 2.1 的 Notion 导入形成组合拳——用户可以一次性导入历史,然后通过 MCP 持续同步新增内容。这是 Sibylla 给"迁移中的用户"一个平滑过渡的关键路径。

#### 优先级

P0 - 必须完成

---

### 需求 2.5 - MCP 作为持续导入通道

**用户故事**:作为用户,我不想每次 GitHub 有新 issue 都手动导入,我希望它自动同步到我的工作区。

#### 功能描述

本需求是 Sprint 3.6 的核心创新点:将 MCP 工具配置为"数据订阅源",实现持续性的知识流入。这是区别于其他 AI 工具的关键差异化能力。

#### 验收标准

1. When user marks MCP tool as "持续同步", the system shall schedule periodic fetches
2. When scheduled fetch runs, the system shall pull new data and save as Markdown files
3. When new data arrives, the system shall trigger notification(可选,用户可关闭)
4. When data conflict exists (same source updated), the system shall use last-write-wins with history preserved
5. When sync fails repeatedly (3 次), the system shall pause and notify user
6. When user manually triggers sync, the system shall fetch immediately
7. When user pauses a sync task, the system shall stop polling but preserve configuration

#### 预置同步场景

| 场景 | 频率 | 保存位置 |
|---|---|---|
| GitHub issues → tasks.md | 每 30 分钟 | 追加到项目 tasks.md |
| GitHub PRs → 评审队列 | 每 30 分钟 | `.sibylla/inbox/prs/` |
| Slack 重要频道 → 日志 | 每小时 | `docs/logs/slack/YYYY-MM-DD.md` |
| Discord 公告 → 知识库 | 每天 | `docs/announcements/` |
| 浏览器"稍后读" → 阅读列表 | 用户触发 | `docs/reading/inbox/` |
| Zotero 新增文献 → 文献库 | 每天 | `docs/references/` |

#### 与 AI 的联动

- 同步进来的数据自动建立 embedding 索引(接 Sprint 4 的能力)
- AI 对话时可自动引用,如"上周 Slack 里讨论的那个 bug 在 `docs/logs/slack/...`"
- 用户可通过 `@github:issue-123` 语法直接引用外部数据源
- 同步任务产生的变更记录在 `changelog.md`,与人工操作一视同仁

#### 技术规格要点

采用 **Pull-based** 架构,避免实时 Push 对系统稳定性的冲击。每个同步任务有独立的状态管理(last_sync_at / cursor / error_count)。大数据量场景采用**增量同步**(基于 updated_at 或 etag),避免重复拉取。同步任务运行在独立后台进程,不阻塞用户交互。

**与既有 `SyncManager` 的关系**:MCP Sync 与 Git SyncManager 职责完全分离:
- `SyncManager` 负责工作区自身的 Git push/pull 同步
- `McpSyncManager`（`src/main/services/mcp/mcp-sync.ts`）负责从外部数据源拉取数据
- MCP Sync 拉取的数据通过 `FileManager.writeFile()` 写入文件系统,随后由现有 `AutoSaveManager` → `GitAbstraction.commit()` 自动纳入 Git 管理
- MCP Sync 使用独立定时器,不与 SyncManager 共享调度器
- 同步状态存储于 `.sibylla/mcp/sync-state.json`

**与上下文引擎的联动**:
- 同步产生的文件自动触发 `LocalSearchEngine` 索引更新
- `ContextEngine` 的语义检索自然覆盖同步产生的文件
- `@github:issue-123` 引用语法需在 `ContextEngine.extractFileReferences()` 中扩展解析

#### 优先级

P1 - 应该完成

---

### 需求 2.6 - Aha Moment 首次引导

**用户故事**:作为首次打开 Sibylla 的新用户,我希望在 5 分钟内体验到 AI 的全局理解能力,而不是面对空白界面不知所措。

#### 用户体验流程

```
Step 1: 欢迎页
  → "欢迎!让我们 3 分钟完成设置"
  → 展示三大核心能力:本地优先、全局理解、外部连接

Step 2: 选择数据源(可多选,也可跳过)
  → [Notion 导出包] [Google Docs] [本地文件夹] [Obsidian] [空白开始]

Step 3: 导入进度(如选择了数据源)
  → 实时显示:"正在导入 234 个文档..."
  → 同时后台建立索引

Step 4: 连接外部工具(可选)
  → "要不要连一下 GitHub?这样 AI 能看到你的 issue"
  → [连接 GitHub] [连接 Slack] [稍后再说]

Step 5: 第一次 AI 对话(核心 Aha Moment)
  → 系统预填三个建议问题:
    • "我们项目目前的整体状况是什么?"
    • "总结一下我的核心目标和挑战"
    • "帮我梳理一下待办事项的优先级"
  → 用户点击任一问题,AI 基于导入内容给出回答
  → AI 回答中自动标注引用的文件(可点击跳转)

Step 6: 庆祝与下一步
  → "🎉 Sibylla 已经了解你了!"
  → 引导用户创建第一个任务 / 写第一条笔记
```

#### 验收标准

1. When user launches for the first time, the system shall show onboarding wizard
2. When user selects data source, the system shall guide through import (复用 2.1/2.2)
3. When import completes, the system shall suggest connecting MCP(可选)
4. When onboarding reaches "首次对话" step, the system shall show 3 pre-filled questions
5. When user clicks pre-filled question, the system shall invoke AI with full context
6. When AI response is streamed, the system shall highlight referenced files(让用户看到"它真的读了我的东西")
7. When user completes first conversation, the system shall mark onboarding as done
8. When user skips onboarding, the system shall show "倒入你的大脑" button persistently in sidebar

#### 设计要点

- **每步都可跳过,但跳过后 sidebar 保留"未完成设置"提示**,避免硬塞
- 首次对话的 AI 回答要**明显展示文件引用**,比如:
  > 你的项目目前有 3 个进行中的任务(来自 [tasks.md](...)),其中"完成 PRD"延期了 2 天(来自 [prd.md](...))...
- **动画和反馈要流畅**,避免让用户觉得"这个工具好慢"
- 对无数据源导入的用户(空白开始),引导其使用"示例工作区"以体验 AI 能力

**与既有 UI 的集成**:
- 新增 `src/renderer/pages/OnboardingPage.tsx` 引导主页,通过 `appStore.onboardingCompleted` 控制路由
- 条件: `isAuthenticated && !onboardingCompleted` → 跳转 OnboardingPage;否则 → WorkspaceStudioPage
- 已有 workspace 的用户（非首次）不触发引导
- 引导完成状态持久化至 `localStorage` + `.sibylla/config.json` 双重存储
- `WorkspaceStudioPage` Sidebar 新增 "倒入你的大脑" 按钮（引导未完成时常驻）
- 首次对话复用现有 `StudioAIPanel` + `aiChatStore`,预填 3 个建议问题作为 `addUserMessage()` 触发

#### 针对不同用户群体的差异化引导

- **学生用户**(.edu 邮箱识别):默认展示"论文管理 / 课程笔记"示例场景
- **Crypto 团队**(Web3 登录):默认展示"DAO 治理 / 白皮书协作"示例
- **小型创业者**:默认展示"PRD / 客户沟通 / 会议纪要"示例

#### 优先级

P0 - 必须完成(这是留存率的生死线,首次 Aha Moment 直接决定次日留存)

---

### 需求 2.7 - 导入历史与回滚

**用户故事**:作为用户,我导入了一堆文件但发现分类错了,我希望一键撤销,而不是手动删除几百个文件。

#### 验收标准

1. When import completes, the system shall create snapshot in `.sibylla/import-history/`
2. When user opens "导入历史", the system shall list all imports with timestamp and file count
3. When user clicks "回滚", the system shall prompt confirmation with affected files preview
4. When user confirms rollback, the system shall restore pre-import state atomically
5. When rollback completes, the system shall refresh UI and show success message
6. When import is ≥7 days old, the system shall show warning before rollback(因为可能已有新修改)

#### 设计要点

- 利用 Git 的 tag + revert 机制实现"快照"
- 导入前创建 tag 快照（如 `import/2026-04-24-001`）,通过扩展 `GitAbstraction.createTag()` 实现
- 回滚 = 创建 revert commit,而非 hard reset（保留历史）
- 超过 30 天的导入记录自动清理（可配置）
- 回滚过程中新产生的冲突（用户在导入后修改了文件）由系统标记,交给用户决策

**新增服务**: `ImportHistoryManager`（`src/main/services/import/import-history-manager.ts`）:
- 存储路径: `.sibylla/import-history/{importId}.json`
- 记录结构: `{ importId, timestamp, sourceFormat, preImportCommitHash, files: string[], tag }`
- 回滚操作: 调用 `gitAbstraction.revertCommit()` 创建反转提交
- 自动清理: 30 天阈值,可配置

#### 优先级

P1 - 应该完成

---

## 三、非功能需求

### 3.1 性能要求

- **小型导入**(<100 文件):10 秒内完成
- **中型导入**(100-1000 文件):≤2 分钟
- **大型导入**(1000-10000 文件):≤15 分钟,支持后台运行
- **MCP 连接建立**:≤5 秒(stdio) / ≤10 秒(远程)
- **MCP 工具调用**:≤3 秒(不含外部服务延迟)
- **Aha Moment 完整流程**:≤5 分钟(从首次启动到首次 AI 对话完成)

### 3.2 可用性要求

- 导入过程可暂停、取消、查看日志
- 错误信息必须人类可读,避免堆栈信息直接展示
- 所有耗时操作有进度指示 + ETA
- 支持拖拽、文件选择器、命令行三种入口
- 首次使用新手友好,老手可快速跳过所有引导

### 3.3 安全要求

- MCP server 在独立子进程中运行（stdio 场景使用 `child_process.spawn`，需配置超时和资源限制）
- MCP 敏感操作(写入 / 删除)默认二次确认（权限模型中的 `delete_*`/`write_*`/`transfer_*` 不可设为"永久允许"）
- 导入过程不向云端发送文件内容(除非用户显式使用云端 OCR)
- MCP 凭证(Token / Key)使用系统密钥库(macOS Keychain / Windows Credential Manager / libsecret)加密存储，通过 `mcp-credentials.ts` 抽象层统一访问
- 导入的文件默认无任何云端同步,完全本地优先
- MCP 子进程需配置 sandbox 选项:禁止访问 workspace 根目录以外的文件系统
- MCP 工具调用产生的审计日志存储于 `.sibylla/mcp/audit-log.jsonl`，遵循 append-only 原则

### 3.4 可扩展性要求

- `ImportAdapter` 接口支持用户自定义(为未来的插件市场铺路)
- MCP server 列表支持"社区共享"模式(未来规划)
- 导入器与 MCP 模板均为声明式配置,便于贡献

---

## 四、验收检查清单

### 导入能力
- [ ] Notion 导出包导入正常(页面 + 数据库)
- [ ] Google Docs 导出包导入正常
- [ ] Obsidian vault 导入正常(wikilinks 保留)
- [ ] 批量 PDF OCR + AI 分类可用
- [ ] 批量 Word 导入可用
- [ ] 本地 Markdown 文件夹导入可用
- [ ] 导入进度与 ETA 准确
- [ ] 导入错误处理友好
- [ ] 导入可暂停、取消、回滚
- [ ] 导入历史可查

### MCP 能力
- [ ] MCP 客户端可连接 stdio / SSE / WebSocket
- [ ] MCP 工具调用权限模型工作正常
- [ ] 至少 8 种 v1 预置 MCP 模板可用（GitHub/GitLab/Slack/Filesystem/PostgreSQL/Notion/Linear/浏览器）
- [ ] MCP 持续同步任务(GitHub issues)可用
- [ ] MCP 失败降级与错误提示友好
- [ ] 凭证安全存储(系统密钥库)
- [ ] MCP 功能默认关闭,未配置时不影响现有 AI 行为

### Aha Moment
- [ ] Aha Moment 首次引导流程完整
- [ ] 首次对话 AI 正确引用导入的文件
- [ ] 三类用户群体的差异化引导正确
- [ ] 跳过引导后 sidebar 提示正确
- [ ] 完整流程 ≤ 5 分钟

### 性能与安全
- [ ] 各项性能指标达标
- [ ] MCP 沙箱隔离正常
- [ ] 凭证不出现在日志中

---

## 五、参考资料

- [MCP 规范](https://modelcontextprotocol.io/)
- [Notion 导出格式说明](https://www.notion.so/help/export-your-content)
- [Obsidian Vault 结构](https://help.obsidian.md/vault)
- [`architecture.md`](../../design/architecture.md) - MCP 与导入架构设计
- [`onboarding-design.md`](../../design/onboarding-design.md) - 首次引导体验设计
- [`commercialization-strategy.md`](../../business/commercialization-strategy.md) - 免费/付费获客路径

---

## 六、冲突分析与架构调整记录

> 本节记录 Sprint 3.6 需求与既有代码之间的冲突分析结果,以及据此对需求文档的调整。分析基于 2026-04-24 的代码快照。

### 6.1 冲突总览

共识别 7 大类冲突,按影响程度排序:

| # | 冲突 | 影响范围 | 破坏风险 | 文档调整 |
|---|------|---------|---------|---------|
| 1 | MCP 客户端与 AI 对话流程集成缺口 | 大 | 中 | 需求 2.3 新增模块架构、IPC 通道、token 预算调整 |
| 2 | ImportManager 接口与 ImportAdapter 不兼容 | 中 | 低 | 需求 2.1 新增渐进增强策略说明 |
| 3 | GitAbstraction 缺少 branch/tag/revert | 中 | 低 | 需求 2.1/2.7 新增 Git 扩展说明 |
| 4 | Onboarding 与现有 UI 路由缺口 | 中 | 低 | 需求 2.6 新增 UI 集成说明 |
| 5 | MCP Sync 与 SyncManager 职责重叠 | 小 | 低 | 需求 2.5 新增职责分离说明 |
| 6 | OCR/AI 分类与 PDF 处理管道差异 | 小 | 低 | 需求 2.2 新增替换策略说明 |
| 7 | 云端 MCPHub 缺口 | 小(本Sprint) | 无 | 1.3 节新增约束说明 |

### 6.2 关键架构决策

1. **MCP 完全客户端化**:Sprint 3.6 的 MCP 客户端完全运行在 Electron 主进程,不需要云端代码改动。架构图中的 MCPHub 是 Phase 2 目标。
2. **Feature Flag 控制**:`.sibylla/config.json` 中 `mcp.enabled` 默认 false,确保未配置 MCP 时现有 AI 行为零影响。
3. **渐进式导入增强**:保留现有 `ImportManager` 作为兼容层,新增 `ImportPipeline` + `ImportAdapter` 注册表,通过 `@deprecated` 标记引导迁移。
4. **Git 扩展而非替换**:在 `GitAbstraction` 上新增 `createTag()`/`revertCommit()` 方法,不改现有方法签名。
5. **SyncManager 职责分离**:MCP Sync 独立于 Git SyncManager,通过 `FileManager.writeFile()` → `AutoSaveManager` → `GitAbstraction` 间接纳入 Git 管理。
6. **模板分批交付**:12 种预置模板分为 v1 首批（8 种,有官方 Server）和 v1.1 扩展（4 种,需等待生态）。

### 6.3 涉及的既有文件变更清单

**新增文件（最小侵入）:**
- `src/main/services/import/` 目录（6-8 个文件）: ImportAdapter 接口、ImportRegistry、ImportPipeline、各平台 Adapter
- `src/main/services/mcp/` 目录（7 个文件）: MCPClient、MCPRegistry、MCPPermission 等
- `src/renderer/pages/OnboardingPage.tsx` + `src/renderer/components/onboarding/`（6 个步骤组件）
- `src/renderer/store/onboardingStore.ts`: 引导状态管理

**修改文件（扩展接口,保持兼容）:**
- `src/main/services/git-abstraction.ts`: 新增 branch/tag/revert 方法
- `src/main/services/context-engine/context-engine.ts`: 新增 MCP 上下文注入点
- `src/main/ipc/handlers/ai.handler.ts`: MCP 工具调用拦截
- `src/shared/types.ts`: 扩展 ImportOptions、新增 MCP 相关类型和 IPC 通道常量
- `src/preload/index.ts`: 新增 MCP IPC 暴露
- `src/renderer/store/appStore.ts`: 新增 onboardingCompleted 字段
- `src/renderer/pages/WorkspaceStudioPage.tsx`: 条件路由 + Sidebar 按钮

**不修改的文件:**
- `src/main/services/sync-manager.ts`: MCP Sync 完全独立
- `src/main/services/file-manager.ts`: 仅作为被调用方
- `src/main/services/auto-save-manager.ts`: 仅作为被调用方
- `sibylla-cloud/src/` 全部文件: Sprint 3.6 不涉及云端改动