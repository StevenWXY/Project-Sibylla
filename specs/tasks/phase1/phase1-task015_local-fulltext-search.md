# 本地全文搜索

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK015 |
| **任务标题** | 本地全文搜索 |
| **所属阶段** | Phase 1 - AI 系统 MVP (Sprint 3) |
| **优先级** | P1 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现基于 SQLite FTS5 的本地全文搜索，让用户能快速搜索 workspace 内所有文档内容。

### 背景

代码库已有 `LocalRagEngine`（293 行），但它仅检索 `.sibylla/memory/archives/` 目录，不是全局文件搜索。本任务需要新建独立的全文搜索服务。

注意与 Phase 2 的边界：Phase 2 Sprint 4 将实现云端语义搜索（embedding-based），本任务的 FTS5 本地搜索在 Phase 2 保留为离线 fallback。

### 范围

**包含：**
- LocalSearchEngine（`src/main/services/local-search.ts`）
- SQLite FTS5 索引构建（文本文件内容索引）
- 增量索引更新（文件变更时更新索引）
- 搜索 IPC 通道 + 前端搜索 UI 联动
- 搜索结果高亮 + 点击跳转

**不包含：**
- 语义搜索（Phase 2 Sprint 4）
- 向量检索
- 跨 workspace 搜索

## 技术要求

### 与 LocalRagEngine 的区别

| 特性 | LocalRagEngine | LocalSearchEngine |
|------|---------------|------------------|
| 搜索范围 | `.sibylla/memory/archives/` | 全 workspace 文本文件 |
| 索引方式 | 自定义 JSON 索引（BM25） | SQLite FTS5 |
| 用途 | AI 对话前 RAG 召回 | 用户主动搜索 |
| Phase 2 归宿 | 保留为离线 RAG | 保留为离线 fallback |

## 验收标准

- [ ] 用户在搜索框输入关键词后 100ms 内返回结果
- [ ] 搜索结果高亮匹配关键词
- [ ] 点击搜索结果打开对应文件并滚动到匹配位置
- [ ] 文件修改后 2 秒内更新索引
- [ ] Workspace 打开时后台构建初始索引
- [ ] 仅索引文本文件（.md/.txt/.json 等）

## 依赖关系

### 前置依赖

- [x] FileManager（文件列表和读取）
- [x] IPC 框架

### 被依赖任务

- Phase 2 Sprint 4 将在此基础上升级

## 参考文档

- [`specs/requirements/phase1/sprint3-ai-mvp.md`](../../requirements/phase1/sprint3-ai-mvp.md) — 需求 2.7
- [`specs/requirements/phase2/sprint4-semantic-search.md`](../../requirements/phase2/sprint4-semantic-search.md) — Phase 2 升级方向

---

**创建时间：** 2026-04-16
**最后更新：** 2026-04-16
