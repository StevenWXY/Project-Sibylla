# 记忆系统 IPC 暴露与联调

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK016 |
| **任务标题** | 记忆系统 IPC 暴露与联调 |
| **所属阶段** | Phase 1 - AI 系统 MVP (Sprint 3) |
| **优先级** | P1 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

将已完成的后端记忆系统（MemoryManager + LocalRagEngine + FileLock）暴露给渲染进程，完成 AI 对话与记忆系统的端到端联调。

### 背景

代码库中记忆系统后端已完成 90%+：

| 模块 | 文件 | 行数 | 完成度 |
|------|------|------|--------|
| MemoryManager | `src/main/services/memory-manager.ts` | 415 | 95% — appendLog、MEMORY 读写、压缩、flush、归档 |
| FileLock | `src/main/services/file-lock.ts` | 74 | 100% |
| LocalRagEngine | `src/main/services/local-rag-engine.ts` | 293 | 90% — BM25 检索、索引重建、snippet |
| TokenStorage | `src/main/services/token-storage.ts` | 213 | 100% |

**核心缺口：**
1. `ai.handler.ts` 已调用 MemoryManager/RAG，但渲染进程无法查询 MEMORY 状态
2. 渲染进程无法查询 RAG 检索结果
3. AI 响应中的 `ragHits` 和 `memory` 信息在 UI 中未展示
4. Daily Log 无查询接口

### 范围

**包含：**
- 新增 IPC 通道：`memory:snapshot`、`memory:update`、`memory:flush`
- 新增 IPC 通道：`rag:search`、`rag:rebuild`
- 新增 IPC 通道：`memory:daily-log:query`
- Preload API 扩展
- 渲染进程 MEMORY 状态展示（Token 用量、债务、上次 flush 时间）
- 渲染进程 RAG 检索结果展示（AI 回复中显示引用的归档片段）
- AI 对话 → memory flush → UI 状态更新联调

**不包含：**
- MEMORY 可视化编辑器
- Daily Log 可视化面板
- 归档管理 UI

## 新增 IPC 通道

```typescript
// src/shared/types.ts 扩展
MEMORY_SNAPSHOT: 'memory:snapshot'       // 获取 MEMORY 当前状态
MEMORY_UPDATE: 'memory:update'           // 手动更新 MEMORY
MEMORY_FLUSH: 'memory:flush'             // 手动触发 flush
RAG_SEARCH: 'rag:search'                // 搜索 archives
RAG_REBUILD: 'rag:rebuild'              // 重建 RAG 索引
```

## 验收标准

- [ ] 渲染进程可查询 MEMORY 状态（Token 数、债务、内容）
- [ ] AI 对话后 UI 展示本次 RAG 检索命中的归档片段
- [ ] AI 对话后 UI 展示 MEMORY flush 是否触发
- [ ] 手动触发 RAG 索引重建可用
- [ ] Daily Log 可通过 IPC 查询指定日期的条目
- [ ] 所有新增 IPC 通道类型安全（IPCChannelMap）

## 依赖关系

### 前置依赖

- [x] MemoryManager（主进程服务完成）
- [x] LocalRagEngine（主进程服务完成）
- [ ] TASK011（AI 流式对话）— 需要对话完成后展示记忆状态

### 被依赖任务

- Phase 2 Sprint 4 将在此基础上增强记忆管理 UI

## 参考文档

- [`specs/requirements/phase1/sprint3-ai-mvp.md`](../../requirements/phase1/sprint3-ai-mvp.md) — 需求 2.8、2.9
- [`specs/design/memory-system-design.md`](../../design/memory-system-design.md) — 记忆系统设计
- `src/main/services/memory-manager.ts` — 已完成的 MemoryManager
- `src/main/services/local-rag-engine.ts` — 已完成的 RAG 引擎

---

**创建时间：** 2026-04-16
**最后更新：** 2026-04-16
