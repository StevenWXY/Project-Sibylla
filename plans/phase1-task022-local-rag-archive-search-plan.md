# PHASE1-TASK022: 本地 RAG 检索引擎（Archives）— 开发计划

> 任务来源：[plans/phase1-overview.md](./phase1-overview.md)
> 创建日期：2026-04-03
> 最后更新：2026-04-03

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK022 |
| **任务标题** | 本地 RAG 检索引擎搭建（针对 archives） |
| **优先级** | P1 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **前置依赖** | ✅ TASK020、✅ TASK021、✅ 本地文件系统索引目录 |

### 目标

为 `.sibylla/memory/archives/` 提供本地可用检索能力，在 AI 回答前召回相关历史片段，提升回答上下文质量。

---

## 二、范围定义

**包含：**
- archives 文档扫描与索引构建
- 本地索引持久化（`/.sibylla/memory/index/`）
- 查询接口（Top-K + snippet + score）
- 与 AI 请求前置召回链路联动

**不包含：**
- 大规模向量数据库部署
- 跨 workspace 全局检索

---

## 三、参考与依赖

- `specs/design/memory-system-design.md`（第五章 向量检索引擎）
- `specs/requirements/phase2/sprint4-semantic-search.md`
- `src/main/services/local-rag-engine.ts`
- `src/main/ipc/handlers/ai.handler.ts`

---

## 四、实施步骤

1. 定义本地索引结构（文档长度、term 频次、doc 频次、fingerprint）。
2. 实现 archives 全量扫描与增量重建策略。
3. 实现基础检索评分（关键词/BM25 或混合得分）。
4. 生成可读 snippet 并返回 Top-K 结果。
5. 在 AI 调用前执行 RAG 查询并注入上下文。
6. 处理无命中、索引不存在、文档损坏等异常场景。

---

## 五、验收清单

- [ ] archives 文档可被成功索引
- [ ] 本地查询能返回相关片段与路径
- [ ] AI 请求可携带 RAG 命中上下文
- [ ] 索引可持久化并在下次启动复用
- [ ] 无命中场景不影响主对话流程

