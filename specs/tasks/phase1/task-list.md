# Phase 1 — 全阶段任务列表

> **阶段目标：** 实现 Sibylla 的 MVP 核心体验——"团队在 Sibylla 中协作编辑文档，AI 拥有全局上下文并产出高质量结果"。
>
> **前置条件：** Phase 0 全部完成（15/15 ✅）

---

## 一、状态说明

- ⬜ 待开始（Todo）
- 🏃 进行中（In Progress）
- ✅ 已完成（Done）
- ⚠️ 功能完成/测试待补（Done - Tests Pending）
- ⏸️ 已暂停（Paused）
- 🚫 已阻塞（Blocked）

---

## 二、Sprint 总览

| Sprint | 主题 | 任务范围 | 需求文档 | 状态 |
|--------|------|---------|---------|------|
| Sprint 1 | 编辑器与文件系统 | TASK001-004 | [`sprint1-editor-filesystem.md`](../../requirements/phase1/sprint1-editor-filesystem.md) | 🏃 进行中 |
| Sprint 2 | Git 抽象层与同步 | TASK005-010 | [`sprint2-git-sync.md`](../../requirements/phase1/sprint2-git-sync.md) | ⬜ 待开始 |
| Sprint 3 | AI 系统 MVP | TASK011-016 | [`sprint3-ai-mvp.md`](../../requirements/phase1/sprint3-ai-mvp.md) | ⬜ 待开始 |

---

## 三、Sprint 1 — 编辑器与文件系统

> **目标：** 实现"打开 workspace → 浏览文件 → 编辑文档 → 导入外部文件"的核心体验闭环。
>
> **预计周期：** 2-3 周（Week 4 - Week 6）

### Sprint 1 任务

| 状态 | 任务 ID | 任务名称 | 优先级 | 复杂度 | 预估工时 | 备注 |
|------|---------|---------|--------|--------|---------|------|
| ⚠️ | PHASE1-TASK001 | 文件树浏览器与文件操作 | P0 | 复杂 | 3-4 天 | 功能完成，测试待补 |
| ⬜ | PHASE1-TASK002 | WYSIWYG Markdown 编辑器 | P0 | 非常复杂 | 4-5 天 | Tiptap 集成，Markdown 双向转换 |
| ⬜ | PHASE1-TASK003 | 多 Tab 文件编辑系统 | P0 | 中等 | 2-3 天 | Tab 栏 + 专用 Zustand store |
| ⬜ | PHASE1-TASK004 | 文件导入与 CSV 查看器 | P1/P2 | 复杂 | 3-4 天 | Word/PDF/CSV 导入，新增 file:import IPC |

### Sprint 1 依赖关系

```
Phase 0 (已完成)
  ├── FileManager
  ├── GitAbstraction
  ├── SyncManager
  ├── IPC Framework
  └── AppStore (Zustand)
        │
        ▼
  TASK001 (文件树 + CRUD) ──✅ 功能完成──
        │                       │
        ├───────────────┐       │
        ▼               ▼       ▼
  TASK002 (编辑器)  TASK004 (导入 + CSV)
        │
        ▼
  TASK003 (多 Tab)
```

**推荐执行顺序：** TASK001 → TASK002 → TASK003 → TASK004

### Sprint 1 进度

**Sprint 1 总进度：** 1/4（功能层面）

- [x] TASK001 — 文件树浏览器与文件操作（功能完成，测试待补）
- [ ] TASK002 — WYSIWYG Markdown 编辑器
- [ ] TASK003 — 多 Tab 文件编辑系统
- [ ] TASK004 — 文件导入与 CSV 查看器

---

## 四、Sprint 2 — Git 抽象层与同步

> **目标：** 实现"Git 不可见"设计哲学的核心——自动保存、自动同步、冲突解决、版本历史。
>
> **预计周期：** 2-3 周（Week 7 - Week 9）
>
> **前置条件：** Sprint 1 的 TASK001 完成

### Sprint 2 任务

| 状态 | 任务 ID | 任务名称 | 优先级 | 复杂度 | 预估工时 | 对应需求 | 任务文档 |
|------|---------|---------|--------|--------|---------|---------|---------|
| ✅ | PHASE1-TASK005 | 自动保存与隐式提交 | P0 | 中等 | 2-3 天 | 需求 2.1 | [`task005`](./phase1-task005_auto-save-commit.md) |
| ✅ | PHASE1-TASK006 | 自动同步 Push/Pull | P0 | 复杂 | 3-4 天 | 需求 2.2 | [`task006`](./phase1-task006_auto-sync-push-pull.md) |
| ⬜ | PHASE1-TASK007 | 同步状态 UI | P0 | 简单 | 1-2 天 | 需求 2.3 | [`task007`](./phase1-task007_sync-status-ui.md) |
| ⬜ | PHASE1-TASK008 | 冲突检测与合并界面 | P0 | 复杂 | 3-4 天 | 需求 2.4 | [`task008`](./phase1-task008_conflict-detection-merge.md) |
| ⬜ | PHASE1-TASK009 | 版本历史浏览与 Diff | P1 | 中等 | 2-3 天 | 需求 2.5 | [`task009`](./phase1-task009_version-history-diff.md) |
| ⬜ | PHASE1-TASK010 | Workspace 成员管理 | P1 | 中等 | 2-3 天 | 需求 2.6 | [`task010`](./phase1-task010_workspace-member-management.md) |

### Sprint 2 依赖关系

```
Sprint 1 (TASK001-004)
        │
        ▼
  TASK005 (自动保存 + commit) ← 从 SyncManager 解耦 AutoSaveManager
        │
        ▼
  TASK006 (自动同步) ← NetworkMonitor + SyncManager + AutoSaveManager 联动
        │
        ├──────────────┐
        ▼              ▼
  TASK007 (状态UI)  TASK008 (冲突合并) ← ConflictResolver + 三栏对比
                        │
                        ▼
                  TASK009 (版本历史) ← GitAbstraction.getHistory 扩展

  TASK010 (成员管理) — 独立，依赖云端 API
```

**推荐执行顺序：** TASK005 → TASK006 → TASK007 ∥ TASK008 → TASK009，TASK010 独立并行

### Sprint 2 已有代码基础

> **重要发现：** Phase 0 已完成 Git 抽象层基础和 SyncManager 框架，Sprint 2 核心增量在 AutoSaveManager 解耦、网络监听升级、前端 UI 构建。

| 已有模块 | 文件路径 | 完成度 | Sprint 2 使用方式 |
|---------|---------|--------|-----------------|
| GitAbstraction | `src/main/services/git-abstraction.ts` | 80% | 扩展 restoreVersion、冲突解析 |
| SyncManager | `src/main/services/sync-manager.ts` | 60% | 升级网络监听、AutoSaveManager 联动 |
| ConflictResolutionPanel | `src/renderer/components/studio/ConflictResolutionPanel.tsx` | 30% | 升级为三栏对比视图 |
| GitAbstraction 远程同步 | push/pull/sync + 指数退避 | 90% | 直接复用，无需修改 |
| FileManager 原子写入 | `src/main/services/file-manager.ts` | 100% | AutoSaveManager 直接调用 |

**完全缺失、需新建的模块：**

| 模块 | 对应任务 | 说明 |
|------|---------|------|
| AutoSaveManager | TASK005 | 新建 `auto-save-manager.ts`：从 SyncManager 解耦，批量聚合 + 友好 commit message |
| NetworkMonitor | TASK006 | 新建 `network-monitor.ts`：网络状态监控 + reconnected 事件 |
| SyncStatusIndicator | TASK007 | 新建 `SyncStatusIndicator.tsx` + `SyncDetailPanel.tsx` |
| ConflictResolver | TASK008 | 新建 `conflict-resolver.ts`：conflict markers 解析 + 解决 |
| VersionHistoryPanel | TASK009 | 新建版本历史侧面板 + Diff 对比视图 |
| WorkspaceSettings | TASK010 | 新建成员管理设置页 + API 客户端 |

### Sprint 2 新增 IPC 通道

| IPC 通道 | 对应任务 | 方向 | 说明 |
|---------|---------|------|------|
| `file:notifyChange` | TASK005 | Renderer → Main | 编辑器内容变更通知 |
| `file:autoSaved` | TASK005 | Main → Renderer | 自动保存成功事件 |
| `file:saveFailed` | TASK005 | Main → Renderer | 保存失败事件 |
| `file:retrySave` | TASK005 | Renderer → Main | 手动重试保存 |
| `sync:force` | TASK006 | Renderer → Main | 手动强制同步 |
| `sync:getState` | TASK006 | Renderer → Main | 获取同步状态 |
| `sync:stateChanged` | TASK006 | Main → Renderer | 同步状态变更推送 |
| `git:getConflicts` | TASK008 | Renderer → Main | 获取冲突列表 |
| `git:resolve` | TASK008 | Renderer → Main | 解决冲突 |
| `git:conflictDetected` | TASK008 | Main → Renderer | 冲突检测推送 |
| `git:history` | TASK009 | Renderer → Main | 获取版本历史 |
| `git:diff` | TASK009 | Renderer → Main | 获取版本 Diff |
| `git:restore` | TASK009 | Renderer → Main | 恢复到指定版本 |

---

## 五、Sprint 3 — AI 系统 MVP

> **目标：** 实现 Sibylla 的核心差异化能力——AI 拥有全局上下文，让 AI 能够访问 workspace 内所有文档并产出高质量结果。
>
> **预计周期：** 3-4 周（Week 10 - Week 13）
>
> **前置条件：** Sprint 1 完成（编辑器可用），Sprint 2 部分完成（自动保存可用）

### Sprint 3 任务

| 状态 | 任务 ID | 任务名称 | 优先级 | 复杂度 | 预估工时 | 对应需求 | 备注 |
|------|---------|---------|--------|--------|---------|---------|------|
| ⬜ | PHASE1-TASK011 | AI 对话流式响应集成 | P0 | 复杂 | 3-4 天 | 需求 2.2+2.3 | SSE streaming → IPC event → 增量渲染 |
| ⬜ | PHASE1-TASK012 | 上下文引擎 v1 | P0 | 非常复杂 | 4-5 天 | 需求 2.1+2.6 | CLAUDE.md 加载 + @文件引用 + Token 预算 |
| ⬜ | PHASE1-TASK013 | AI 文件修改 Diff 审查 | P0 | 复杂 | 3-4 天 | 需求 2.4 | ✅ 已完成 |
| ⬜ | PHASE1-TASK014 | Skill 系统 v1 | P1 | 中等 | 2-3 天 | 需求 2.5 | Skill 加载/解析/调用 + 预置包 |
| ⬜ | PHASE1-TASK015 | 本地全文搜索 | P1 | 中等 | 2-3 天 | 需求 2.7 | SQLite FTS5 索引 + 搜索 UI |
| ⬜ | PHASE1-TASK016 | 记忆系统 IPC 暴露与联调 | P1 | 中等 | 2-3 天 | 需求 2.8+2.9 | 暴露 IPC + RAG 集成 + MEMORY 状态 UI |

### Sprint 3 依赖关系

```
Sprint 1+2 基础设施
        │
        ▼
  TASK011 (AI 流式对话) ──────── 关键路径
        │
        ├──────────────┐
        ▼              ▼
  TASK012 (上下文引擎)  TASK013 (Diff 审查)
        │
        ▼
  TASK014 (Skill 系统)

  TASK015 (全文搜索) ─── 独立
  TASK016 (记忆联调) ─── 依赖 TASK011
```

### Sprint 3 已有代码基础

> **重要发现：** Sprint 3 的后端服务大部分已在代码库中实现，核心缺口在前端集成和关键功能串通。

| 已有模块 | 文件路径 | 行数 | 完成度 | Sprint 3 使用方式 |
|---------|---------|------|--------|-----------------|
| AiGatewayClient | `src/main/services/ai-gateway-client.ts` | 82 | 70% | HTTP 客户端已有，缺 SSE 流式解析 |
| AIHandler | `src/main/ipc/handlers/ai.handler.ts` | 222 | 75% | IPC handler 已有，stream() 未做真正流式 |
| StudioAIPanel | `src/renderer/components/studio/StudioAIPanel.tsx` | 250 | 80% | AI 对话 UI 已有，缺真实 streaming 渲染 |
| AIDiffPreviewCard | `src/renderer/components/studio/AIDiffPreviewCard.tsx` | ~100 | 30% | Diff 展示 UI 已有，缺真实 diff 解析 |
| MemoryManager | `src/main/services/memory-manager.ts` | 415 | 95% | 日志/压缩/flush 全完成，缺 IPC 暴露 |
| FileLock | `src/main/services/file-lock.ts` | 74 | 100% | 文件锁完成 |
| LocalRagEngine | `src/main/services/local-rag-engine.ts` | 293 | 90% | BM25 检索完成，缺 IPC 暴露 |
| TokenStorage | `src/main/services/token-storage.ts` | 213 | 100% | Token 加密存储完成 |
| AIChatRequest/Response | `src/shared/types.ts` | — | 100% | AI IPC 类型定义完成 |

**完全缺失、需新建的模块：**

| 模块 | 对应任务 | 说明 |
|------|---------|------|
| ContextEngine | TASK012 | 新建 `context-engine.ts`：CLAUDE.md 加载 + @文件引用 + Token 预算 |
| SkillEngine | TASK014 | 新建 `skill-engine.ts`：Skill 加载/解析/调用 |
| LocalSearchEngine | TASK015 | 新建 `local-search.ts`：SQLite FTS5 全局搜索（区别于 RAG 仅搜索 archives） |

### 与 Phase 2 的边界

| Sprint 3 功能 | Phase 2 对应 | 边界说明 |
|-------------|------------|---------|
| 本地 BM25 RAG（archives） | Phase2 Sprint4 云端语义搜索 | Phase2 是升级为云端 embedding，本地保留为离线 fallback |
| 本地 FTS5 全文搜索 | Phase2 Sprint4 语义搜索 UI | Phase2 搜索 UI 展示混合结果（FTS5 + 语义），本地 FTS5 保留 |
| 记忆系统基础架构 | Phase2 Sprint4 精选记忆提取 | Phase2 增加自动精选 + 检查点，基础架构复用 |
| AI 对话窗口 | 无直接升级 | Phase2 不涉及 AI 对话改造 |

---

## 六、Phase 1 全局进度

**Phase 1 总进度：** 3/16 任务完成

| Sprint | 任务数 | 已完成 | 进度 | 状态 |
|--------|--------|--------|------|------|
| Sprint 1 | 4 | 1 ⚠️ | 25% | 🏃 进行中 |
| Sprint 2 | 6 | 1 | 17% | 🏃 进行中 |
| Sprint 3 | 6 | 1 | 17% | 🏃 进行中 |

---

## 七、编号体系说明

> **历史编号映射：** 早期 `plans/phase1-overview.md` 使用 TASK016-025 编号，现已统一为 Specs 体系。映射关系如下：

| 废弃编号 | 新编号 | 说明 |
|---------|--------|------|
| TASK016 | TASK001 | 文件树（功能完成） |
| TASK017 | TASK002 | 编辑器（待升级到 Tiptap） |
| TASK018 | TASK011 | AI 对话面板 |
| TASK019 | TASK011 | AI 网关（合并进 TASK011） |
| TASK020 | TASK016 | Daily Log（主进程已完成） |
| TASK021 | TASK016 | MEMORY 压缩（主进程已完成） |
| TASK022 | TASK016 | RAG 检索（主进程已完成） |
| TASK023 | TASK011 的一部分 | 意图路由 |
| TASK024 | TASK013 | Diff 审查 UI |
| TASK025 | 贯穿 Sprint 3 | 集成测试 |

---

## 八、质量要求

- TypeScript 严格模式，禁止 `any`
- ESLint 零警告
- P0 任务单元测试覆盖率 ≥ 80%
- P1/P2 任务单元测试覆盖率 ≥ 60%
- 所有公开函数必须有 JSDoc 注释
- 代码注释使用英文，文档使用中文
- 所有异步操作必须有明确的错误处理，禁止静默吞掉异常

---

## 九、进度记录

| 日期 | 任务 | 状态变更 | 备注 |
|------|------|---------|------|
| 2026-03-31 | — | — | Sprint 1 任务拆解完成 |
| 2026-04-01 | TASK016/017/018 | ✅ 完成 | 桌面端 Phase 1 工作台集成（文件树 + 编辑器 + AI 对话） |
| 2026-04-15 | TASK001 | ⚠️ 功能完成 | fileTreeStore 语义化重写、懒加载、乐观更新已完成；测试待补 |
| 2026-04-16 | — | — | 统一编号体系，新增 Sprint 2（TASK005-010）和 Sprint 3（TASK011-016）任务规划 |
| 2026-04-17 | — | — | Sprint 2 详细任务拆解完成，生成 6 个任务文档（TASK005-010） |
| 2026-04-17 | TASK005 | ✅ 完成 | AutoSaveManager 实现 + IPC 集成 + SaveFailureBanner + 单元测试 17/17 通过（覆盖率 94.6%） |
| 2026-04-18 | TASK013 | ✅ 完成 | AI Diff 审查完整链路：diffParser + diffReviewStore + DiffReviewPanel + 集成改造；type-check/lint/828 tests 全部通过 |

---

**创建时间：** 2026-03-31
**最后更新：** 2026-04-18
**更新记录：**
- 2026-03-31 — 创建 Sprint 1 任务列表
- 2026-04-01 — 追加 TASK016/017/018 完成记录
- 2026-04-15 — TASK001 fileTreeStore 重写完成
- 2026-04-16 — 统一编号体系，扩展为 Phase 1 全阶段任务列表（Sprint 1/2/3），标注已有代码基础和编号映射
- 2026-04-17 — Sprint 2 详细任务拆解完成：6 个任务文档 + 已有代码基础评估 + 新增 IPC 通道清单 + 依赖关系细化
- 2026-04-18 — TASK013 AI Diff 审查完成：diffParser + diffReviewStore + DiffReviewPanel + 集成改造，66 个新增测试全部通过
