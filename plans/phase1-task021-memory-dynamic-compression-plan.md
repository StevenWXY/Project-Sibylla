# PHASE1-TASK021: MEMORY.md 动态摘要压缩与阈值触发 — 开发计划

> 任务来源：[plans/phase1-overview.md](./phase1-overview.md)
> 创建日期：2026-04-03
> 最后更新：2026-04-03

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK021 |
| **任务标题** | MEMORY.md 动态摘要压缩算法与触发器 |
| **优先级** | P0 |
| **复杂度** | 较高 |
| **预估工时** | 2-3 工作日 |
| **前置依赖** | ✅ TASK020 Daily Log 写入、✅ MemoryManager 基础读写 |

### 目标

实现 MEMORY 的动态维护能力，使 `MEMORY.md` 在上下文预算内保持高价值信息密度，并在会话 token 使用达到 75% 时触发 silent flush。

---

## 二、范围定义

**包含：**
- token 粗估算与 debt 计算
- 75% 阈值触发策略（`sessionTokens / contextWindowTokens`）
- 动态更新 MEMORY 的重点条目
- 超阈值压缩与低价值内容归档到 `archives/`

**不包含：**
- 复杂语义聚类压缩
- 可视化债务看板

---

## 三、参考与依赖

- `specs/design/memory-system-design.md`（3.2 Silent Memory Flush）
- `plans/phase1-overview.md`（NFR：8-12K token）
- `src/main/services/memory-manager.ts`

---

## 四、实施步骤

1. 建立 token 估算函数与 MEMORY 元信息更新逻辑。
2. 设计 flush 触发入口，接入会话 token 使用量判断。
3. flush 触发后将关键上下文写入 MEMORY 指定章节。
4. 当 MEMORY 超预算时执行压缩并将内容归档。
5. 记录 flush 行为到 Daily Log，便于追溯。
6. 验证重复更新、空更新、并发更新边界情况。

---

## 五、验收清单

- [ ] 支持 token 估算与 token debt 输出
- [ ] 会话达到 75% 阈值时可触发 flush
- [ ] MEMORY 更新后结构稳定、可读
- [ ] 超预算信息可归档而非直接丢弃
- [ ] flush 行为有日志记录可追踪

