# Skill 系统设计文档

> Sprint 3.5 — AI 能力扩展体系
> 版本: v1.0 | 最后更新: 2026-04-23

## 1. 概述

Skill 系统是 Sibylla 的能力扩展机制，支持用户通过结构化的 Prompt 指令扩展 AI 行为。系统支持三源加载（内置/工作区/个人）、触发匹配、工具权限控制、token 预算管理和 scope 作用域。

## 2. 架构设计

### 2.1 核心组件

```
┌──────────────────────────────────────────────────┐
│                  SkillRegistry                     │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Three-   │ │ Trigger      │ │ Scope        │ │
│  │ Source   │ │ Index        │ │ Guard        │ │
│  │ Scanner  │ │ (slash/regex)│ │ (team fb)    │ │
│  └──────────┘ └──────────────┘ └──────────────┘ │
├──────────────────────────────────────────────────┤
│                  SkillExecutor                     │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Tool     │ │ Example      │ │ Trace        │ │
│  │ Validator│ │ Trimmer      │ │ Recorder     │ │
│  └──────────┘ └──────────────┘ └──────────────┘ │
├──────────────────────────────────────────────────┤
│                  SkillLoader                       │
│  ┌──────────────┐ ┌──────────────────────────┐   │
│  │ V1 Loader    │ │ V2 Loader                │   │
│  │ (legacy .md) │ │ (_index.md + prompt.md)  │   │
│  └──────────────┘ └──────────────────────────┘   │
├──────────────────────────────────────────────────┤
│                  SkillValidator                    │
│  Frontmatter 校验 + 必填字段检测                    │
└──────────────────────────────────────────────────┘
```

### 2.2 文件布局

```
# V2 格式 (推荐)
.sibylla/skills/{skill-id}/
├── _index.md          # Frontmatter 元数据
├── prompt.md          # 主 Prompt 内容
├── tools.yaml         # 工具声明（可选）
└── examples/          # 示例目录（可选）
    └── *.md

# V1 格式 (兼容)
skills/{skill-name}.md
```

## 3. _index.md 格式

```yaml
---
id: code-review
version: "2.0.0"
name: 代码审查
description: 自动化代码审查和改进建议
author: sibylla
category: coding
tags: [code, review, quality]
scope: public                    # public | private | personal | team
triggers:
  - slash: /review
  - mention: "@reviewer"
  - pattern: "review\\s+(this\\s+)?code"
loadable_in:
  modes: [write, review, analyze]
estimated_tokens: 500
---
```

## 4. 三源扫描优先级

| 优先级 | 来源 | 路径 |
|--------|------|------|
| 0 (最低) | builtin | `resources/skills/` |
| 1 | workspace | `.sibylla/skills/` |
| 2 (最高) | personal | `personal/{userId}/skills/` |

同 ID 的 Skill，高优先级来源覆盖低优先级。

## 5. Scope 作用域

| Scope | 可见性 | 说明 |
|-------|--------|------|
| `public` | 全部 | 默认 scope |
| `private` | 创建者 | 仅创建者可见 |
| `personal` | 创建者 | 存储在 personal 空间，跨成员拒绝访问 |
| `team` | 团队 | 需团队同步功能支持；未启用时 fallback 到 workspace |

### 5.1 scope:team Fallback

当 `scope: team` 的 Skill 被匹配但团队同步未启用时：
1. 尝试查找同 ID 的 workspace 版本
2. 未找到时使用原 team skill（降级为 workspace 行为）
3. 记录 warning 日志

## 6. 工具权限

### 6.1 allowed_tools 校验

Skill 声明的 `allowed_tools` 必须是主 agent 工具集的子集。校验失败抛出 `SkillNotAllowedError`。

### 6.2 触发确认

通过 `setConfirmationHandler()` 注册确认回调，实现触发 → 确认面板 → 加载的流程。

## 7. Example 裁剪策略

- Token 预算: 50% estimatedTokens
- 最多保留: 3 个 example
- 优先保留: 最短 example（以节省 token）

## 8. 软删除机制

- 删除时移动到 `.trash/skills/{skill-id}/`
- 记录 `trashedAt` 时间戳
- 7 天后由定时器自动清理
- 恢复时移回原路径

## 9. 导出格式

`.sibylla-skill` 格式 = JSON 包含 `{ id, name, version, description, prompt, tools, examples, metadata }`

## 10. IPC 通道

| 通道 | 功能 |
|------|------|
| `ai:skill:list` | 列出所有 Skill |
| `ai:skill:create` | 创建 Skill |
| `ai:skill:edit` | 编辑 Skill |
| `ai:skill:soft-delete` | 软删除 |
| `ai:skill:restore` | 恢复 |
| `ai:skill:export` | 导出 |
| `ai:skill:import` | 导入 |
