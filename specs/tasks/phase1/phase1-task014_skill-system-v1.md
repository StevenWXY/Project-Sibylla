# Skill 系统 v1

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK014 |
| **任务标题** | Skill 系统 v1 |
| **所属阶段** | Phase 1 - AI 系统 MVP (Sprint 3) |
| **优先级** | P1 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现 Skill 的加载、解析和调用机制，让 AI 能按照特定规范产出内容。

### 范围

**包含：**
- SkillEngine 模块（`src/main/services/skill-engine.ts`）
- Skill Markdown 文件解析
- Workspace `skills/` 目录扫描与加载
- `#skill-name` 触发 + 自动补全
- Skill 内容注入 AI 上下文
- Skill 文件变更自动重载
- 预置 Skill 包（PRD、技术方案、会议纪要、竞品分析、任务规划）

**不包含：**
- Skill 市场 / 分享
- 复杂工作流编排

## Skill 文件格式

```markdown
# Skill: 撰写 PRD

## 适用场景
产品需求文档撰写

## AI 行为指令
你是一位经验丰富的产品经理。在撰写 PRD 时，你应该：
1. 明确定义问题和目标
2. 描述用户故事和使用场景

## 输出格式
# [功能名称] PRD
## 一、背景与目标
...
```

## 验收标准

- [ ] Workspace 打开时自动扫描 `skills/` 目录
- [ ] 用户输入 `#` 弹出 Skill 自动补全
- [ ] 选择 Skill 后 AI 按 Skill 指令行事
- [ ] Skill 文件修改后自动重载
- [ ] 5 个预置 Skill 包可用

## 依赖关系

### 前置依赖

- [ ] TASK012（上下文引擎）— Skill 内容通过上下文引擎注入

### 被依赖任务

- 无

## 参考文档

- [`specs/requirements/phase1/sprint3-ai-mvp.md`](../../requirements/phase1/sprint3-ai-mvp.md) — 需求 2.5
- [`specs/design/skills-list.md`](../../design/skills-list.md) — Skill 结构规范

---

**创建时间：** 2026-04-16
**最后更新：** 2026-04-16
