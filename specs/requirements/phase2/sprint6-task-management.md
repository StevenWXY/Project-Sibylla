# Phase 2 Sprint 6 - 任务管理与日报需求

## 一、概述

### 1.1 目标与价值

实现 AI 辅助的任务管理和自动日报生成，让项目管理更智能、更高效。

### 1.2 涉及模块

- 模块10：AI 项目管理（任务管理与日报基础版）
- 模块12：权限与访问控制（完整版）

### 1.3 里程碑定义

**完成标志：**
- tasks.md 解析与任务看板可用
- AI 辅助任务创建可用
- AI 日报/周报自动生成可用
- 个人空间权限隔离完成

---

## 二、功能需求

### 需求 2.1 - 任务看板

**用户故事：** 作为用户，我想要在看板中管理任务，以便直观了解项目进度。

#### 验收标准

1. When workspace is opened, the system shall parse tasks.md and render as kanban board
2. When user drags task to different column, the system shall update task status in tasks.md
3. When user clicks task, the system shall show task details panel
4. When user creates task in board, the system shall append to tasks.md
5. When tasks.md is modified externally, the system shall reload board within 2 seconds

#### 技术规格

**tasks.md 格式：**
```markdown
# 任务清单

## 待开始

- [ ] 完成 PRD 初稿
  - 负责人: Alice
  - 优先级: P0
  - 截止日期: 2024-01-15
  - 关联文件: docs/product/prd.md

## 进行中

- [ ] 设计系统架构
  - 负责人: Bob
  - 优先级: P0
  - 截止日期: 2024-01-20

## 已完成

- [x] 项目启动会议
  - 负责人: Alice
  - 完成时间: 2024-01-10
```

#### 优先级

P0 - 必须完成

---

### 需求 2.2 - AI 辅助任务创建

**用户故事：** 作为用户，我希望 AI 能将讨论结论自动拆解为任务。

#### 验收标准

1. When user discusses work in AI chat, the system shall detect actionable items
2. When AI suggests creating tasks, the system shall show task preview
3. When user confirms, the system shall append tasks to tasks.md
4. When tasks are created, the system shall auto-assign based on discussion context

#### 优先级

P1 - 应该完成

---

### 需求 2.3 - AI 日报/周报

**用户故事：** 作为用户，我希望系统自动生成工作报告，以便节省时间。

#### 验收标准

1. When daily report time arrives, the system shall auto-generate personal report
2. When report is generated, the system shall include: work summary, task progress, pending items
3. When user is admin, the system shall also generate team report
4. When report is generated, the system shall save to personal/[name]/reports/
5. When user opens report, the system shall show formatted view

#### 技术规格

**日报生成逻辑：**
```typescript
async generateDailyReport(userId: string, date: Date): Promise<Report> {
  const commits = await this.getCommitsByUser(userId, date)
  const tasks = await this.getTasksByUser(userId)
  const files = this.extractFilesFromCommits(commits)
  
  const prompt = `
基于以下信息生成今日工作报告：

提交记录：
${commits.map(c => `- ${c.message}`).join('\n')}

任务进展：
${tasks.map(t => `- ${t.title}: ${t.status}`).join('\n')}

请生成结构化的日报，包括：
1. 今日工作摘要
2. 任务进展
3. 明日计划
  `
  
  return await this.ai.generate(prompt)
}
```

#### 优先级

P1 - 应该完成

---

### 需求 2.4 - 个人空间权限隔离

**用户故事：** 作为用户，我希望我的个人空间内容只有我和管理员能看到。

#### 验收标准

1. When user accesses personal/[other-user]/, the system shall deny access if not admin
2. When AI assembles context, the system shall exclude other users' personal files
3. When user searches, the system shall not return results from others' personal space
4. When admin accesses personal space, the system shall show warning indicator

#### 优先级

P0 - 必须完成

---

## 三、验收检查清单

- [ ] 任务看板正常渲染
- [ ] tasks.md 双向同步正常
- [ ] AI 任务创建可用
- [ ] AI 日报生成可用
- [ ] 个人空间权限隔离正确
- [ ] changelog.md 自动维护
