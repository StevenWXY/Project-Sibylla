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

| 状态 | 任务 ID | 任务名称 | 优先级 | 复杂度 | 预估工时 | 对应需求 | 备注 |
|------|---------|---------|--------|--------|---------|---------|------|
| ⬜ | PHASE1-TASK005 | 自动保存与隐式提交 | P0 | 中等 | 2-3 天 | 需求 2.1 | 防抖保存 + 批量 commit + commit message 生成 |
| ⬜ | PHASE1-TASK006 | 自动同步 Push/Pull | P0 | 复杂 | 3-4 天 | 需求 2.2 | 30s 周期同步 + 离线支持 + 网络监听 |
| ⬜ | PHASE1-TASK007 | 同步状态 UI | P0 | 简单 | 1-2 天 | 需求 2.3 | 状态栏同步指示器 + 详情面板 |
| ⬜ | PHASE1-TASK008 | 冲突检测与合并界面 | P0 | 复杂 | 3-4 天 | 需求 2.4 | 三栏对比 + 选择/手动合并 + 自动提交 |
| ⬜ | PHASE1-TASK009 | 版本历史浏览与 Diff | P1 | 中等 | 2-3 天 | 需求 2.5 | 文件历史列表 + diff 对比 + 版本回退 |
| ⬜ | PHASE1-TASK010 | Workspace 成员管理 | P1 | 中等 | 2-3 天 | 需求 2.6 | 成员邀请 + 角色权限 + 成员列表 |

### Sprint 2 依赖关系

```
Sprint 1 (TASK001-004)
        │
        ▼
  TASK005 (自动保存 + commit)
        │
        ▼
  TASK006 (自动同步)
        │
        ├──────────────┐
        ▼              ▼
  TASK007 (状态UI)  TASK008 (冲突合并)
                       │
                       ▼
                 TASK009 (版本历史)

  TASK010 (成员管理) — 独立，依赖云端 API
```

**已有代码基础：**

| 模块 | 文件路径 | 说明 |
|------|---------|------|
| GitAbstraction | `src/main/services/git-abstraction.ts` | Phase 0 已有基础实现 |
| SyncManager | `src/main/services/sync-manager.ts` | Phase 0 已有框架 |
| ConflictResolutionPanel | `src/renderer/components/studio/ConflictResolutionPanel.tsx` | 前端已有 UI 组件 |

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
| ⬜ | PHASE1-TASK013 | AI 文件修改 Diff 审查 | P0 | 复杂 | 3-4 天 | 需求 2.4 | Diff 解析 → 展示 → 确认 → 写入 |
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

**Phase 1 总进度：** 1/16 任务完成（功能层面）

| Sprint | 任务数 | 已完成 | 进度 | 状态 |
|--------|--------|--------|------|------|
| Sprint 1 | 4 | 1 ⚠️ | 25% | 🏃 进行中 |
| Sprint 2 | 6 | 0 | 0% | ⬜ 待开始 |
| Sprint 3 | 6 | 0 | 0% | ⬜ 待开始 |

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

---

**创建时间：** 2026-03-31
**最后更新：** 2026-04-16
**更新记录：**
- 2026-03-31 — 创建 Sprint 1 任务列表
- 2026-04-01 — 追加 TASK016/017/018 完成记录
- 2026-04-15 — TASK001 fileTreeStore 重写完成
- 2026-04-16 — 统一编号体系，扩展为 Phase 1 全阶段任务列表（Sprint 1/2/3），标注已有代码基础和编号映射
