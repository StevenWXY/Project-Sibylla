# PHASE1-TASK020: 本地日志（Daily Log）Append-Only 写入器 — 开发计划

> 任务来源：[plans/phase1-overview.md](./phase1-overview.md)
> 创建日期：2026-04-03
> 最后更新：2026-04-03

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK020 |
| **任务标题** | 本地日志（Daily Log）Append-Only 写入器 |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 2 工作日 |
| **前置依赖** | ✅ Workspace 结构模板、✅ 文件系统读写能力 |

### 目标

实现 `.sibylla/memory/daily/YYYY-MM-DD.md` 的结构化日志追加写入机制，保障日志不可篡改（append-only）与并发写安全。

---

## 二、范围定义

**包含：**
- 日志条目结构规范（时间、类型、会话、摘要、标签、关联文件）
- 按日期分片写入
- 文件锁机制（防并发冲突）
- 异常日志与系统日志写入

**不包含：**
- 日志清洗平台
- UI 日志可视化面板

---

## 三、参考与依赖

- `specs/design/memory-system-design.md`
- `specs/requirements/phase1/sprint3-ai-mvp.md`（需求 2.8 / 2.9）
- `src/main/services/memory-manager.ts`
- `src/main/services/file-lock.ts`

---

## 四、实施步骤

1. 定义日志条目数据结构与 Markdown 序列化格式。
2. 实现按天文件路径策略（`daily/YYYY-MM-DD.md`）。
3. 接入 append-only 写入（仅追加，禁止覆盖历史区块）。
4. 集成文件锁，解决多进程/多请求并发写问题。
5. 对 AI 输入、AI 输出、错误事件增加自动日志钩子。
6. 提供基础读取能力用于调试与后续检索。

---

## 五、验收清单

- [ ] 用户与 AI 交互会自动生成日志条目
- [ ] 写入行为采用追加模式，不覆盖历史记录
- [ ] 并发写场景不会出现内容交叉或损坏
- [ ] 异常路径可记录错误类型与上下文
- [ ] 日志文件命名与目录结构符合规范

