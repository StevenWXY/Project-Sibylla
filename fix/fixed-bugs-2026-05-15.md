# 已修复问题记录（2026-05-15）

## 文档说明

| 项 | 内容 |
| --- | --- |
| **项目** | `Project-Sibylla` |
| **记录分支** | `DIDI`（与 `origin/main` 对齐） |
| **范围** | 本地可复现、已落地修复的问题 |
| **单条结构** | 元信息表 → 现象 → 根因 → 修复 → 验证 →（可选）使用说明 |

---

## 一、修复总览

共 **22** 项已修复（Bug 1–22）。别名 **O-1～O-13**、**R-1～R-3** 与 Bug 编号对应见下表。

| Bug | 别名 | 区域 | 优先级 | 标题 |
| --- | --- | --- | --- | --- |
| 1 | — | Desktop / Test | — | 测试环境文件监听不稳定 |
| 2 | — | Desktop / Test | — | 全量测试 EMFILE（Plan 文件监听） |
| 3 | — | Desktop / Test | — | Renderer 测试 Web Storage 契约缺失 |
| 4 | — | Desktop / Test | — | 文件监听测试污染仓库 fixture |
| 5 | O-1 | Desktop | P0 | IPC 响应格式与 renderer `safeInvoke` |
| 6 | O-2 | Desktop | P0 | Workflow / Sub-agent 未注册 IPC |
| 7 | O-3 | Desktop | P0 | Git 相对路径解析错误 |
| 8 | O-4 | Desktop | P1 | 工作区路径边界前缀绕过 |
| 9 | O-5 | Desktop | P1 | Proactive 监听未在 teardown 后重挂 |
| 10 | O-6 | Cloud | P2 | 云端允许管理员自降权 |
| 11 | O-7 | Desktop / Renderer | P1 | 未打开工作区时 UI 误导 |
| 12 | O-8 | Desktop / Renderer | P2 | Workflow 手动触发调用 `safeInvoke` |
| 13 | O-9 | Desktop | P2 | Skill 删除 / 导出 / 导入为 stub |
| 14 | O-10 | Desktop | P2 | Workflow 自动触发开关无持久化 |
| 15 | O-11 | Desktop / Renderer | P2 | Prompt 版本对比无 IPC |
| 16 | O-12 | Desktop / Dev | P2 | 本地 Cloud API URL 不统一 |
| 17 | O-13 | Desktop | P1 | 会话导出路径校验不安全 |
| 18 | — | Desktop | P1 | Dashboard `sharedKanbanService` 作用域 |
| 19 | R-1 | Desktop / Cloud | P2 | 云端 Embedding 未实现 |
| 20 | R-3 | Desktop / Renderer | P3 | Skill 在线编辑 / 恢复删除 UI |
| 21 | R-2 | Desktop / Cloud | P2 | 创建工作区未同步到云端 |
| 22 | — | Desktop Main | P0 | Proactive `if` 缺闭合括号导致主进程无法构建 |

---

## 二、仍待处理（未修复）

| 别名 | 区域 | 优先级 | 问题 | 说明 |
| --- | --- | --- | --- | --- |
| R-4 | Tooling | P3 | `npm run lint` 的 `--ext` 与 ESLint 9 flat config 不兼容 | 需改 lint 脚本 |
| R-5 | Dev | P3 | Cursor 下 `ELECTRON_RUN_AS_NODE=1` | 使用 `scripts/launch-electron.cjs` |
| R-6 | Test | P3 | Cloud / renderer vitest 偶发 worker 超时 | 环境相关，非主流程阻塞 |
| R-7 | Desktop | P3 | Dashboard / Proactive / Kanban 依赖 sub-agent + unified search 初始化 | 初始化失败时整块能力跳过 |

---

## 三、已修复明细

### Bug 1 — 测试环境文件监听不稳定

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 1 |
| **区域** | Desktop Main / Test |
| **优先级** | — |
| **状态** | 已修复 |

**现象**

- `file-handler`、`file-watcher`、`file-manager-performance` 等监听相关测试无事件或超时（`expected 0 to be greater than 0`）。

**根因**

- 沙箱 / 虚拟化环境中原生 `fs.watch` 不可靠，仅依赖 native 事件导致事件流为空或间歇失败。

**修复**

- `sibylla-desktop/src/main/services/file-watcher.ts`：在 `VITEST` / `CI` 下自动启用 polling；支持 `SIBYLLA_WATCH_USE_POLLING`；增加 `ignorePermissionErrors`、`awaitWriteFinish` 及 polling 间隔配置。

**验证**

- `tests/ipc/file-handler.test.ts`、`tests/services/file-watcher.test.ts`、`tests/services/file-manager-performance.test.ts`、`tests/main/services/workflow/workflow-executor.test.ts` 通过。

---

### Bug 2 — 全量测试 EMFILE（Plan 文件监听）

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 2 |
| **区域** | Desktop Main / Test |
| **优先级** | — |
| **状态** | 已修复 |

**现象**

- 全量 desktop 测试出现 `EMFILE: too many open files, watch`，多见于 `plan-manager` 测试阶段。

**根因**

- `PlanManager` 在 Vitest worker 中创建 `fs.watch`，高并发下句柄耗尽。

**修复**

- `sibylla-desktop/src/main/services/plan/plan-manager.ts`：`shouldEnableFileWatcher()` 在 `VITEST` 下默认关闭监听；支持 `SIBYLLA_PLAN_WATCHER` 覆盖；避免重复创建 watcher 与 cleanup 定时器。

**验证**

- 全量 main 测试：183 files、1914 tests 通过，无 EMFILE。

---

### Bug 3 — Renderer 测试 Web Storage 契约缺失

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 3 |
| **区域** | Desktop Renderer / Test |
| **优先级** | — |
| **状态** | 已修复 |

**现象**

- Renderer 套件卡住或大面积失败：`TypeError: storage.setItem is not a function`（zustand persist）。

**根因**

- 测试环境未提供完整 `Storage` 实现（`localStorage` / `sessionStorage`）。

**修复**

- `sibylla-desktop/tests/renderer/setup.ts`：内存 `Storage` mock（含 `getItem/setItem/removeItem/clear/key/length`）；绑定 `window` 与 `globalThis`；补充 `electronAPI.app.getConfig/updateConfig` mock；`afterEach` 清理存储。
- `sibylla-desktop/vitest.renderer.config.ts`：`testTimeout` / `hookTimeout` / `teardownTimeout` 设为 15000ms。

**验证**

- `tests/renderer/membersStore.test.ts`：22/22 通过。
- 全量 renderer：`46` files、`587` tests 通过。

---

### Bug 4 — 文件监听测试污染仓库 fixture

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 4 |
| **区域** | Desktop / Test |
| **优先级** | — |
| **状态** | 已修复 |

**现象**

- 运行 watcher 测试会修改 / 删除 `sibylla-desktop/test-workspace-watcher/`，污染 git 状态。

**根因**

- `file-watcher.test.ts` 在仓库内固定路径 `test-workspace-watcher` 读写。

**修复**

- `sibylla-desktop/tests/services/file-watcher.test.ts`：改用 `fs.mkdtemp(os.tmpdir() + 'sibylla-watcher-test-')`，用例结束后清理。

**验证**

- `tests/services/file-watcher.test.ts`：12/12 通过；跑后 `git status` 无 fixture Deletion。

---

### Bug 5（O-1）— IPC 响应格式与 renderer `safeInvoke`

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 5 / O-1 |
| **区域** | Desktop Preload / Renderer |
| **优先级** | P0 |
| **状态** | 已修复 |

**现象**

- Plan / Dashboard / Presence 等检查 `response.success` 失败（主进程返回裸对象/数组）。
- Renderer 调用 `window.electronAPI.safeInvoke` → `TypeError`（preload 未暴露）。

**根因**

- 部分 handler（如 `registerPlanHandlers`）未走统一 `IPCResponse` 包装。
- Renderer 误用不存在的 `safeInvoke`。

**修复**

- `preload/index.ts`：`normalizeIpcResponse()` 将裸结果包为 `{ success: true, data }`。
- Renderer 改为 typed API：`workflow.*`、`ai.skill*`、`promptLibrary.*`、`subAgent.list` 等。

**验证**

- `npm run type-check`（desktop）通过；renderer 中 `safeInvoke` 调用已清除。

---

### Bug 6（O-2）— Workflow / Sub-agent 未注册 IPC

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 6 / O-2 |
| **区域** | Desktop Main |
| **优先级** | P0 |
| **状态** | 已修复 |

**现象**

- 打开 Workflow / Agent 库时报 `No handler registered`（`workflow:*`、`sub-agent:*`）。

**根因**

- `WorkflowHandler`、`SubAgentHandler` 已实现但未在 workspace open 时 `registerHandler`。

**修复**

- `main/index.ts`：工作区打开时初始化 workflow 组件并注册 handler；关闭时 `destroy` / `cleanup`。

**验证**

- `npm run type-check`（desktop）通过。

---

### Bug 7（O-3）— Git 相对路径解析错误

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 7 / O-3 |
| **区域** | Desktop Main |
| **优先级** | P0 |
| **状态** | 已修复 |

**现象**

- `docs/prd.md` 等相对路径调用 `git:history` 失败，提示 outside workspace boundary。

**根因**

- `GitHandler.validateFilepath` 用 `path.resolve(filepath)` 相对进程 CWD，而非工作区根目录。

**修复**

- `git.handler.ts`：相对路径基于 workspace root 解析；使用统一边界校验。

**验证**

- `npm run type-check`（desktop）通过。

---

### Bug 8（O-4）— 工作区路径边界前缀绕过

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 8 / O-4 |
| **区域** | Desktop Main |
| **优先级** | P1 |
| **状态** | 已修复 |

**现象**

- 兄弟目录名以 workspace 根为前缀（如 `/tmp/ws-evil` vs `/tmp/ws`）可能通过 `startsWith` 校验。

**根因**

- `FileManager.validatePath` 使用 `normalized.startsWith(workspaceRoot)`。

**修复**

- 新增 `utils/path-boundary.ts`：`isPathInsideRoot()`（`path.relative`）。
- 应用于 `file-manager.ts`、`git.handler.ts`、`file-system-provider.ts`。
- 测试补充 sibling 前缀用例。

**验证**

- `npx vitest --run tests/services/file-manager-core.test.ts -t "Path Utilities"`：7 passed。

---

### Bug 9（O-5）— Proactive 监听未在 teardown 后重挂

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 9 / O-5 |
| **区域** | Desktop Renderer |
| **优先级** | P1 |
| **状态** | 已修复 |

**现象**

- React 卸载 / 重挂载后，主动建议不再出现。

**根因**

- `initProactiveListener` 在模块级 `suggestionUnsubscribe` 仍存在时直接返回缓存，未重新订阅。

**修复**

- `renderer/store/proactiveStore.ts`：teardown 清空 `suggestionUnsubscribe`；init 始终重新注册监听。

**验证**

- `npm run type-check`（desktop）通过。

---

### Bug 10（O-6）— 云端允许管理员自降权

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 10 / O-6 |
| **区域** | Cloud API |
| **优先级** | P2 |
| **状态** | 已修复 |

**现象**

- 管理员可将自身角色从 `admin` 降为 `editor`/`viewer`，工作区可能失去最后一名 admin。

**根因**

- `PATCH .../members/:memberUserId` 无自降权校验（删除自己已有拦截）。

**修复**

- `sibylla-cloud/src/routes/workspace.ts`：当 `memberUserId === userId`、当前为 `admin` 且新角色非 `admin` 时拒绝。

**验证**

- 建议在 Cloud 栈运行环境下做联调验证。

---

### Bug 11（O-7）— 未打开工作区时 UI 误导

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 11 / O-7 |
| **区域** | Desktop Renderer |
| **优先级** | P1 |
| **状态** | 已修复 |

**现象**

- 未打开工作区时主区域长期 `Loading workspace...`。
- 顶栏同步显示「等待同步」（实为 `idle` 默认），用户以为卡住。

**根因**

- `App.tsx` 在 `currentWorkspace === null` 时仍只显示 loading。
- `useSyncStatus` 未区分有无工作区；无工作区时 `idle` 文案不当。

**修复**

- `App.tsx`：bootstrap 后展示「尚未打开工作区」（创建 / 打开 / 最近列表）。
- `useSyncStatus.ts`：有工作区时 `sync.getState()`，无工作区 reset。
- `SyncStatusIndicator.tsx`、`SyncDetailPanel.tsx`：无工作区显示「未打开工作区」。

**验证**

- `npm run type-check`（desktop）通过。

---

### Bug 12（O-8）— Workflow 手动触发调用 `safeInvoke`

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 12 / O-8 |
| **区域** | Desktop Renderer |
| **优先级** | P2 |
| **状态** | 已修复 |

**现象**

- Workflow 页「手动触发」无效或 `safeInvoke is not a function`。

**根因**

- `WorkflowManager.tsx` 调用未暴露的 `electronAPI.safeInvoke('workflow:trigger-manual', ...)`。

**修复**

- 改为 `electronAPI.workflow.triggerManual(workflowId, {})`。

**验证**

- `npm run type-check`（desktop）通过。

---

### Bug 13（O-9）— Skill 删除 / 导出 / 导入为 stub

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 13 / O-9 |
| **区域** | Desktop Main |
| **优先级** | P2 |
| **状态** | 已修复 |

**现象**

- 技能库删除 / 导出 / 导入抛出 `not yet implemented`。

**根因**

- `ai.handler.ts` 中对应 handler 为占位实现。

**修复**

- 新增 `SkillBundle.ts`（adm-zip）：`.sibylla-skill` 导出，导入至 `.sibylla/skills/{id}`。
- `handleSkillDelete`：删除目录或 v1 文件后 `discoverAll()`。
- `handleSkillExport`：返回 `{ bundlePath, base64 }`；`SkillCard` 下载 zip。
- `handleSkillImport`：支持绝对路径 bundle。

**验证**

- `npm run type-check`（desktop）通过。

---

### Bug 14（O-10）— Workflow 自动触发开关无持久化

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 14 / O-10 |
| **区域** | Desktop Main / Renderer |
| **优先级** | P2 |
| **状态** | 已修复 |

**现象**

- 「自动触发」仅改前端 Set，重启丢失；或调用不存在的 IPC。

**根因**

- 无 `workflow:set-trigger-enabled`；`WorkflowScheduler` 未跳过已禁用 workflow。

**修复**

- IPC：`workflow:set-trigger-enabled`、`workflow:get-disabled-triggers`。
- `WorkflowScheduler`：`.sibylla/disabled-workflow-triggers.json` 持久化；触发前检查。
- Preload + `WorkflowManager` 启动时加载禁用列表。

**验证**

- `npm run type-check`（desktop）通过。

---

### Bug 15（O-11）— Prompt 版本对比无 IPC

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 15 / O-11 |
| **区域** | Desktop Main / Renderer |
| **优先级** | P2 |
| **状态** | 已修复 |

**现象**

- `PromptVersionComparison` 调用不存在 channel 或显示「尚未接入」。

**根因**

- 未注册 `prompt-performance:compare-versions`；collector 未暴露给 IPC。

**修复**

- 新增 `prompt-performance.ts` handler；preload `promptPerformance.compareVersions()`。
- 读取 `.sibylla/prompt-performance.jsonl` 聚合为 `PromptVersionComparisonResult`。

**验证**

- `npm run type-check`（desktop）通过。

---

### Bug 16（O-12）— 本地 Cloud API URL 不统一

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 16 / O-12 |
| **区域** | Desktop Main / Dev |
| **优先级** | P2 |
| **状态** | 已修复 |

**现象**

- Auth / Cloud 默认端口不一致（3000 vs 3001 或端口被占用），登录与成员 API 失败。

**根因**

- 各服务硬编码 URL；无统一 `.env` 约定。

**修复**

- 新增 `config/cloud-api-url.ts`：`CLOUD_API_URL` 默认 `http://localhost:3000`，加载 `sibylla-desktop/.env`。
- `AuthClient`、`WorkspaceHandler`、`AiGatewayClient` 统一引用。
- 新增 `.env.example`；`dev:electron` 注入 `CLOUD_API_URL`。

**验证**

- `npm run type-check`（desktop + cloud）通过。

---

### Bug 17（O-13）— 会话导出路径校验不安全

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 17 / O-13 |
| **区域** | Desktop Main |
| **优先级** | P1 |
| **状态** | 已修复 |

**现象**

- 与 O-4 同类：兄弟目录前缀可能被判为工作区内路径。

**根因**

- `conversation-exporter.ts` 使用 `resolved.startsWith(workspaceRoot)`。

**修复**

- 改用 `isPathInsideRoot(workspaceRoot, resolved)`。

**验证**

- `npm run type-check`（desktop）通过。

---

### Bug 18 — Dashboard `sharedKanbanService` 作用域错误

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 18 |
| **区域** | Desktop Main |
| **优先级** | P1 |
| **状态** | 已修复 |

**现象**

- Patrol 触发器 try 失败时，Dashboard 注册可能 `ReferenceError: sharedKanbanService is not defined`。

**根因**

- `KanbanService` 在内部 `try` 中声明，Dashboard 注册在 try 外引用。

**修复**

- `main/index.ts`：将 `KanbanService` 构造移到 Patrol `try` 之前。

**验证**

- `npm run type-check`（desktop）通过。

---

### Bug 19（R-1）— 云端 Embedding 未实现

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 19 / R-1 |
| **区域** | Desktop Main / Cloud |
| **优先级** | P2 |
| **状态** | 已修复 |

**现象**

- `embeddingProvider: 'cloud'` 时向量不可用；`CloudEmbeddingProvider` 抛出 `not yet implemented`。
- Memory v2（indexer / checkpoint）未在工作区打开时初始化。

**根因**

- Desktop 仅有 stub；未调用 `POST /api/v1/ai/embeddings`。
- 无 memory bootstrap 挂钩。

**修复**

- 实现 `CloudEmbeddingProvider`（`AiGatewayClient.embeddings`，384 维，与 `memory_vec` 一致）。
- `createEmbeddingProvider()`；`memory-workspace-bootstrap.ts`；`main/index.ts` open/close 挂钩。

**验证**

- `npm run type-check`（desktop）通过。
- `tests/memory/embedding-provider.test.ts` 通过。

**使用说明**

1. 登录 Cloud。
2. 在 `.sibylla/memory/config.json` 设置 `"embeddingProvider": "cloud"` 并重新打开工作区。
3. Cloud 需配置 `OPENAI_API_KEY`（未配置时网关回退 hash 向量，仍可按 384 维返回）。

---

### Bug 20（R-3）— Skill 在线编辑 / 恢复删除 UI

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 20 / R-3 |
| **区域** | Desktop Main / Renderer |
| **优先级** | P3 |
| **状态** | 已修复 |

**现象**

- 工作区 Skill「编辑」仅 `alert` 提示手改目录。
- 已删除 Skill「恢复」无效果。

**根因**

- 无 `SkillEditorDialog`；`ai:skill:edit` / `ai:skill:restore` 未注册。
- 删除为硬删除，无 `.trash/skills` 软删除。

**修复**

- 后端：`handleSkillEdit`、`updateSkillV2`、`softDeleteSkill`、`restoreSkillFromTrash`；注册 `AI_SKILL_EDIT`、`AI_SKILL_RESTORE`。
- `SkillRegistry` 扫描回收站；`SkillSummary` 含 `trashedAt` 等字段。
- 前端：`SkillEditorDialog`；`SkillLibrary`「回收站」Tab；`SkillCard` 接 IPC。

**验证**

- `npm run type-check`（desktop）通过。

---

### Bug 21（R-2）— 创建工作区未同步到云端

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 21 / R-2 |
| **区域** | Desktop Main / Cloud |
| **优先级** | P2 |
| **状态** | 已修复 |

**现象**

- 勾选「云端同步」后本地工作区创建成功，Cloud 无对应 workspace；成员 API 使用本地 `ws-*` ID 无法匹配。

**根因**

- `workspace-manager.ts` 仅打 TODO 日志，未调用 `POST /api/v1/workspaces`。
- `WorkspaceHandler` 未注入 `TokenStorage`。

**修复**

- 新增 `CloudWorkspaceClient`（`POST /api/v1/workspaces`）。
- `WorkspaceManager.setCloudSyncAdapter()`：`enableCloudSync` 时用云端 UUID 作为 `config.workspaceId`，写入 `gitRemote`、`lastSyncAt`。
- `main/index.ts` 注入 adapter 与 `setTokenStorage`；`generateMembersConfig` 支持云端 owner user id。

**验证**

- `npm run type-check`（desktop）通过。
- `tests/services/cloud-workspace-client.test.ts` 通过。

**使用说明**

1. 登录 Sibylla Cloud。
2. 创建向导勾选「云端同步」。
3. 确认 `.sibylla/config.json` 中 `workspaceId` 为云端 UUID（非 `ws-` 前缀）。

---

### Bug 22 — Proactive `if` 缺闭合括号导致主进程无法构建

| 字段 | 内容 |
| --- | --- |
| **ID** | Bug 22 |
| **区域** | Desktop Main |
| **优先级** | P0 |
| **状态** | 已修复 |

**现象**

- `npm run build:main` 失败：`index.ts:1298:10 ERROR: Unexpected "catch"`。
- Electron 主进程无法打包 / 启动；`tsc --noEmit` 仍可通过（esbuild 解析更严格）。

**根因**

- `main/index.ts` 中 `if (subAgentExecutor && subAgentRegistry && unifiedSearchEngine)`（Proactive Engine 注册块）在 `registerProactiveEngineHandlers` 之后**缺少闭合 `}`**。
- 后续 Kanban、Presence、Dashboard 等代码被错误地包在该 `if` 内，且外层 `try/catch` 括号不匹配。

**修复**

- 在 `proactiveCleanup = registerProactiveEngineHandlers(...)` 之后补上 `}`，仅 Proactive Engine 与 patrol 触发器注册保留在 sub-agent 条件内。
- Kanban、`memberDirectory`、Presence、Collab Context、Dashboard 等改为在条件外初始化（sub-agent 失败时仍可用，部分缓解原 R-7）。

**验证**

- `npm run build:main`、`npm run build:preload` 通过。
- `npm run type-check`（desktop）通过。
- 定向测试：`tests/memory/embedding-provider.test.ts`（14）、`tests/services/cloud-workspace-client.test.ts`（3）、`tests/services/file-manager-core.test.ts`（37）共 54 passed。

---

## 四、变更文件索引（按模块）

### Cloud

- `sibylla-cloud/src/routes/workspace.ts`
- `sibylla-cloud/.env.example`

### Desktop — 主进程 / IPC

- `sibylla-desktop/src/main/index.ts`
- `sibylla-desktop/src/main/config/cloud-api-url.ts`
- `sibylla-desktop/src/main/utils/path-boundary.ts`
- `sibylla-desktop/src/main/services/workspace-manager.ts`
- `sibylla-desktop/src/main/services/cloud-workspace-client.ts`
- `sibylla-desktop/src/main/services/workspace-templates.ts`
- `sibylla-desktop/src/main/services/file-manager.ts`
- `sibylla-desktop/src/main/services/file-watcher.ts`
- `sibylla-desktop/src/main/services/plan/plan-manager.ts`
- `sibylla-desktop/src/main/services/auth-client.ts`
- `sibylla-desktop/src/main/services/ai-gateway-client.ts`
- `sibylla-desktop/src/main/services/export/conversation-exporter.ts`
- `sibylla-desktop/src/main/services/workflow/WorkflowScheduler.ts`
- `sibylla-desktop/src/main/services/skill-system/SkillBundle.ts`
- `sibylla-desktop/src/main/services/skill-system/skill-trash.ts`
- `sibylla-desktop/src/main/services/skill-system/skill-edit.ts`
- `sibylla-desktop/src/main/services/skill-system/SkillRegistry.ts`
- `sibylla-desktop/src/main/services/memory/embedding-provider.ts`
- `sibylla-desktop/src/main/services/memory/memory-workspace-bootstrap.ts`
- `sibylla-desktop/src/main/services/memory/types.ts`
- `sibylla-desktop/src/main/services/memory/index.ts`
- `sibylla-desktop/src/main/services/datasource/providers/file-system-provider.ts`
- `sibylla-desktop/src/main/ipc/handlers/ai.handler.ts`
- `sibylla-desktop/src/main/ipc/handlers/git.handler.ts`
- `sibylla-desktop/src/main/ipc/handlers/workflow.ts`
- `sibylla-desktop/src/main/ipc/handlers/workspace.handler.ts`
- `sibylla-desktop/src/main/ipc/handlers/prompt-performance.ts`
- `sibylla-desktop/src/preload/index.ts`
- `sibylla-desktop/src/shared/types.ts`
- `sibylla-desktop/scripts/launch-electron.cjs`
- `sibylla-desktop/package.json`
- `sibylla-desktop/.env.example`

### Desktop — Renderer

- `sibylla-desktop/src/renderer/App.tsx`
- `sibylla-desktop/src/renderer/hooks/useSyncStatus.ts`
- `sibylla-desktop/src/renderer/store/proactiveStore.ts`
- `sibylla-desktop/src/renderer/store/workflowStore.ts`
- `sibylla-desktop/src/renderer/components/statusbar/SyncStatusIndicator.tsx`
- `sibylla-desktop/src/renderer/components/statusbar/SyncDetailPanel.tsx`
- `sibylla-desktop/src/renderer/components/workflow/WorkflowManager.tsx`
- `sibylla-desktop/src/renderer/components/skill-library/SkillCard.tsx`
- `sibylla-desktop/src/renderer/components/skill-library/SkillEditorDialog.tsx`
- `sibylla-desktop/src/renderer/components/skill-library/SkillLibrary.tsx`
- `sibylla-desktop/src/renderer/components/skill-library/PromptVersionComparison.tsx`
- `sibylla-desktop/src/renderer/components/agent/AgentLibrary.tsx`

### Desktop — 测试

- `sibylla-desktop/tests/renderer/setup.ts`
- `sibylla-desktop/tests/services/file-watcher.test.ts`
- `sibylla-desktop/tests/services/file-manager-core.test.ts`
- `sibylla-desktop/tests/services/cloud-workspace-client.test.ts`
- `sibylla-desktop/tests/services/workspace-manager.test.ts`
- `sibylla-desktop/tests/memory/embedding-provider.test.ts`
- `sibylla-desktop/tests/memory/memory-indexer.test.ts`
- `sibylla-desktop/vitest.renderer.config.ts`

---

## 五、整体验证摘要

| 检查项 | 结果 |
| --- | --- |
| `sibylla-desktop` `npm run type-check` | 通过 |
| `sibylla-cloud` `npm run type-check` | 通过 |
| `sibylla-desktop` `npm run build:main` / `build:preload` | 通过（Bug 22 修复后） |
| `sibylla-desktop` `npm run lint` | 失败（R-4：`--ext` 与 ESLint 9 flat config 不兼容） |
| `tests/memory/embedding-provider.test.ts` | 14 passed |
| `tests/services/cloud-workspace-client.test.ts` | 3 passed |
| `tests/services/file-manager-core.test.ts` | 37 passed |
| `sibylla-cloud` `npm test`（全量） | 6 passed；7 个 worker 超时（R-6，环境相关） |
| Renderer `electronAPI.safeInvoke` 直接调用 | 0 处 |
| Skill / Workflow / Prompt 原 P2 stub | 已实现 |
| Renderer 全量 vitest（历史记录） | 46 files / 587 tests passed |
| Desktop main 全量 vitest（历史记录） | 1914 tests passed |

---

## 六、本地联调说明

1. **Cloud**：`cd sibylla-cloud && npm run docker:up && npm run migrate:up && npm run dev`（默认 `:3000`）。
2. **Desktop**：`cd sibylla-desktop && cp .env.example .env`，设置 `CLOUD_API_URL=http://localhost:3000`；`npm run dev`（或 Vite + `launch-electron.cjs`）。
3. **Electron**：若在 Cursor 终端遇 `ELECTRON_RUN_AS_NODE`，使用 `npm run dev:electron`。
4. **注意**：全量 vitest 在本机仍可能偶发 worker 超时（R-6），不代表类型检查或主流程必然错误。
5. **延后（未纳入 Bug 表）**：云端 `gitRemote` 创建后未自动配置本地 Git remote；Skill 回收站 7 天自动清理；v1 Skill 在线编辑仍提示仅支持 v2。
