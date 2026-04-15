# Phase 1 阶段规划：MVP 核心体验（统一编号版）

> **最后更新：** 2026-04-16
> **编号体系：** 已统一为 Specs 体系（TASK001-016），废弃旧编号 TASK016-025。详见 [task-list.md 第七节](../specs/tasks/phase1/task-list.md)。

---

## 阶段目标

本阶段将基于 Phase 0 已经跑通的基础设施，实现 Sibylla 的 MVP 核心体验——"团队在 Sibylla 中协作编辑文档，AI 拥有全局上下文并产出高质量结果"。

交付可内测的 Electron 桌面应用（Mac + Windows），覆盖以下核心场景：

1. 创建 workspace → 导入文件 → 编辑文档
2. 自动保存 → 自动同步 → 多端协作
3. AI 对话（带全局上下文）→ AI 修改文件

## 关键非功能需求 (NFR)

1. **记忆动态维护**: `MEMORY.md` 需要始终控制在 8-12K Tokens 内，通过滚动合并（Rolling Summarization）和预压缩机制实现。
2. **离线高可用**: 本地检索引擎可充当向量数据库的替代角色处理精选记忆的召回。
3. **响应速度**: 桌面端 AI 唤起延迟 < 500ms，上下文检索装载延迟 < 2000ms。

---

## Sprint 规划

### Sprint 1: 编辑器与文件系统（TASK001-004）

| 任务 ID | 任务名称 | 优先级 | 状态 | 备注 |
|---------|---------|--------|------|------|
| TASK001 | 文件树浏览器与文件操作 | P0 | ⚠️ 功能完成 | 代码完成，测试待补 |
| TASK002 | WYSIWYG Markdown 编辑器（Tiptap） | P0 | ⬜ 待开始 | 当前仅有 textarea 基础版 |
| TASK003 | 多 Tab 文件编辑系统 | P0 | ⬜ 待开始 | 当前无独立 tabStore |
| TASK004 | 文件导入与 CSV 查看器 | P1/P2 | ⬜ 待开始 | 无代码 |

需求文档：[`sprint1-editor-filesystem.md`](../specs/requirements/phase1/sprint1-editor-filesystem.md)

### Sprint 2: Git 抽象层与同步（TASK005-010）

| 任务 ID | 任务名称 | 优先级 | 状态 | 已有代码基础 |
|---------|---------|--------|------|------------|
| TASK005 | 自动保存与隐式提交 | P0 | ⬜ | `git-abstraction.ts` + `sync-manager.ts` |
| TASK006 | 自动同步 Push/Pull | P0 | ⬜ | `sync-manager.ts` 框架 |
| TASK007 | 同步状态 UI | P0 | ⬜ | 无 |
| TASK008 | 冲突检测与合并界面 | P0 | ⬜ | `ConflictResolutionPanel.tsx` |
| TASK009 | 版本历史浏览与 Diff | P1 | ⬜ | 无 |
| TASK010 | Workspace 成员管理 | P1 | ⬜ | 无（依赖云端 API） |

需求文档：[`sprint2-git-sync.md`](../specs/requirements/phase1/sprint2-git-sync.md)

### Sprint 3: AI 系统 MVP（TASK011-016）

| 任务 ID | 任务名称 | 优先级 | 状态 | 已有代码基础 |
|---------|---------|--------|------|------------|
| TASK011 | AI 对话流式响应集成 | P0 | ⬜ | `ai.handler.ts`(222 行) + `StudioAIPanel.tsx`(250 行) + `ai-gateway-client.ts`(82 行) |
| TASK012 | 上下文引擎 v1 | P0 | ⬜ | **无**（新建 `context-engine.ts`） |
| TASK013 | AI 文件修改 Diff 审查 | P0 | ⬜ | `AIDiffPreviewCard.tsx`(30%) |
| TASK014 | Skill 系统 v1 | P1 | ⬜ | **无**（新建 `skill-engine.ts`） |
| TASK015 | 本地全文搜索 | P1 | ⬜ | **无**（新建 `local-search.ts`，FTS5） |
| TASK016 | 记忆系统 IPC 暴露与联调 | P1 | ⬜ | `memory-manager.ts`(415 行, 95%) + `local-rag-engine.ts`(293 行, 90%) + `file-lock.ts`(74 行, 100%) |

需求文档：[`sprint3-ai-mvp.md`](../specs/requirements/phase1/sprint3-ai-mvp.md)

**Sprint 3 核心发现：** 后端服务大部分已完成（AI Gateway、MemoryManager、LocalRagEngine、TokenStorage），核心缺口在：
1. 流式响应（SSE → IPC → 增量渲染）
2. 上下文引擎（CLAUDE.md + @文件引用 + Token 预算）
3. 前端集成（真实 streaming、diff 审查链路、IPC 暴露）

---

## 与 Phase 2 的边界

| Phase 1 功能 | Phase 2 升级 | 边界 |
|-------------|------------|------|
| 本地 FTS5 全文搜索 | 云端语义搜索 + 混合结果 UI | Phase2 升级搜索方式，FTS5 保留为离线 fallback |
| 本地 BM25 RAG（archives） | 云端 embedding + 上下文 v2 | Phase2 是检索升级，本地 RAG 保留 |
| 记忆系统基础 | 精选记忆自动提取 + 检查点 | Phase2 增强自动化，基础架构复用 |

---

## 进度记录

- 2026-04-01: 完成 TASK001（文件树）、TASK002 基础版（textarea 编辑器）、TASK011 UI 部分（AI 对话面板）的桌面端集成
- 2026-04-15: TASK001 fileTreeStore 语义化重写完成（乐观更新、懒加载、回滚）
- 2026-04-16: 统一编号体系，完成 Sprint 2/3 任务拆解与已有代码盘点
