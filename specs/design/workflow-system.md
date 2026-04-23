# Workflow 自动化系统设计文档

> Sprint 3.5 — AI 能力扩展体系
> 版本: v1.0 | 最后更新: 2026-04-23

## 1. 概述

Workflow 系统允许用户定义自动化工作流，通过文件触发器、定时触发器和手动触发器启动，按步骤执行 Skill、Sub-agent、条件判断和通知操作。支持用户确认、失败策略、中断恢复和 scope 隔离。

## 2. 架构设计

```
┌──────────────────────────────────────────────────┐
│                WorkflowScheduler                   │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ File      │ │ Cron         │ │ Recovery     │ │
│  │ Watchers  │ │ Timers       │ │ Engine       │ │
│  └──────────┘ └──────────────┘ └──────────────┘ │
├──────────────────────────────────────────────────┤
│                WorkflowExecutor                    │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ Step      │ │ Confirmation │ │ Timeout      │ │
│  │ Runner    │ │ Handler      │ │ Warning      │ │
│  └──────────┘ └──────────────┘ └──────────────┘ │
├──────────────────────────────────────────────────┤
│                WorkflowParser                      │
│  YAML 校验 + 模板渲染 + when 条件求值              │
├──────────────────────────────────────────────────┤
│                WorkflowRegistry                    │
│  Workflow 注册与查找                               │
├──────────────────────────────────────────────────┤
│                WorkflowRunStore                    │
│  运行记录持久化                                    │
└──────────────────────────────────────────────────┘
```

## 3. Workflow 定义格式

```yaml
metadata:
  id: auto-review
  version: "1.0.0"
  name: 自动代码审查
  description: 文件变更时自动执行代码审查
  scope: public                    # public | private | personal
  author: user@example.com

triggers:
  - type: file_changed
    pattern: "src/**/*.ts"

params:
  - name: severity
    type: string
    default: medium
    enum: [low, medium, high]

steps:
  - id: analyze
    name: 代码分析
    type: sub_agent
    sub_agent: code-analyzer
    input:
      file_path: "{{ params.file_path }}"
    when: "params.file_path endsWith '.ts'"

  - id: review
    name: 审查报告
    type: skill
    skill: code-review
    requires_user_confirm: true
    input:
      analysis: "{{ steps.analyze.output }}"
    on_failure: stop

  - id: notify
    name: 通知
    type: notify
    action: "代码审查完成: {{ steps.review.output }}"
    when: "steps.review.status == 'completed'"

on_failure:
  notify_user: true
  rollback: false
```

## 4. 核心行为

### 4.1 触发器类型

| 类型 | 说明 |
|------|------|
| `file_created` | 文件创建时触发，1s debounce |
| `file_changed` | 文件变更时触发，1s debounce |
| `schedule` | 定时触发（cron 表达式，简化为 1min 间隔） |
| `manual` | 手动触发 |

### 4.2 个人空间触发器隔离

`scope: personal` 的 Workflow：
- 仅作者触发器生效
- 文件 watcher 路径限定在 `personal/{userId}/` 下
- 非作者的触发器不注册

### 4.3 用户确认

`requires_user_confirm: true` 的步骤暂停执行，向 UI 推送确认请求。用户可选择：
- `confirm`: 继续执行
- `skip`: 跳过此步骤
- `cancel`: 取消整个 Workflow

### 4.4 失败策略

- `on_failure: stop` → 终止执行，标记 `failed`
- `on_failure: continue` → 继续执行后续步骤

### 4.5 中断恢复

- 短期中断（< 24h）：重新启动 Workflow 执行
- 长期过期（> 24h）：标记为 `cancelled`

### 4.6 超时警告

运行超过 30 分钟触发 `logger.warn`。

## 5. 步骤类型

| 类型 | 说明 |
|------|------|
| `skill` | 调用指定 Skill |
| `sub_agent` | 生成 Sub-agent |
| `condition` | 条件判断 |
| `notify` | 通知用户 |

## 6. 模板渲染

支持 Handlebars 风格模板：
- `{{ params.xxx }}` → 参数引用
- `{{ steps.xxx.output }}` → 步骤结果引用（未执行返回 undefined）

## 7. 并发控制

每个 Workflow 最大并发运行数: 2

## 8. 自动触发开关

支持通过 `workflow:set-trigger-enabled` IPC 通道禁用自动触发。禁用后：
- 文件触发器和定时触发器不生效
- 手动触发仍可用

## 9. IPC 通道

| 通道 | 功能 |
|------|------|
| `workflow:list` | 列出所有 Workflow |
| `workflow:list-runs` | 列出运行记录 |
| `workflow:trigger-manual` | 手动触发 |
| `workflow:set-trigger-enabled` | 启用/禁用自动触发 |
