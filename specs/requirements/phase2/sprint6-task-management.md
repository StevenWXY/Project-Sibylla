# Phase 2 Sprint 6 - 任务管理与日报需求

## 一、概述

### 1.1 目标与价值

实现 AI 辅助的任务管理和自动日报生成，让项目管理更智能、更高效。

### 1.2 涉及模块

- 模块10：AI 项目管理（任务管理与日报基础版）
- 模块12：权限与访问控制（完整版）
- 模块15：记忆系统（归档机制与决策日志）

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

### 需求 2.5 - 记忆归档机制

**用户故事：** 作为系统，我需要将过时的记忆归档，以便保持 MEMORY.md 的精简和高效。

#### 功能描述

实现记忆归档机制，自动将低相关性或过时的信息从 MEMORY.md 移至归档层。参考 [`memory-system-design.md`](../../design/memory-system-design.md)。

#### 验收标准

1. When MEMORY.md token count exceeds 12K, the system shall trigger compression
2. When compression runs, the system shall identify low-priority content for archiving
3. When content is archived, the system shall create archive file with metadata
4. When archive is created, the system shall update vector index
5. When Phase milestone is completed, the system shall auto-generate milestone archive
6. When content is 30 days old and not accessed, the system shall mark as archive candidate

#### 技术规格

```typescript
// src/main/services/memory-archiver.ts
export class MemoryArchiver {
  async compressMemory(): Promise<CompressionResult> {
    const memory = await this.memoryManager.getMemory()
    
    if (memory.tokenCount < 12000) {
      return { compressed: false, reason: 'Below threshold' }
    }
    
    // LLM 评估每个 section 的优先级
    const priorities = await this.evaluatePriorities(memory.sections)
    
    // 归档低优先级内容
    const toArchive = priorities.filter(p => p.score < 0.3)
    for (const section of toArchive) {
      await this.archiveSection(section)
    }
    
    return { compressed: true, archivedCount: toArchive.length }
  }
  
  async createMilestoneArchive(phase: string): Promise<string> {
    const logs = await this.memoryManager.queryLogs({
      tags: [`#${phase}`]
    })
    
    const archive: Archive = {
      id: `milestone-${phase}`,
      title: `${phase} 里程碑总结`,
      type: 'milestone',
      content: await this.summarizeLogs(logs),
      metadata: {
        createdAt: new Date().toISOString(),
        sources: logs.map(l => l.relatedFiles).flat(),
        tags: [`#${phase}`, '#milestone']
      }
    }
    
    return await this.memoryManager.createArchive(archive)
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.6 - 决策日志记录

**用户故事：** 作为团队成员，我希望系统记录重要决策，以便未来回顾决策理由和结果。

#### 功能描述

实现决策日志功能，记录技术选型、方案对比、最终选择和实际结果。

#### 验收标准

1. When AI detects decision discussion in chat, the system shall suggest creating decision log
2. When user confirms, the system shall create decision log with structured format
3. When decision is made, the system shall save to `.sibylla/memory/decisions/`
4. When decision result is available, the system shall allow updating actual result
5. When decision log is queried, the system shall return with relevance score

#### 技术规格

```typescript
// src/main/services/decision-logger.ts
export class DecisionLogger {
  async detectDecision(conversation: Message[]): Promise<boolean> {
    const prompt = `
分析以下对话，判断是否包含技术决策讨论：
${conversation.map(m => m.content).join('\n')}

如果包含以下特征，返回 true：
- 多个方案对比
- 优劣势分析
- 最终选择
- 决策理由
    `
    
    const response = await this.ai.generate(prompt)
    return response.toLowerCase().includes('true')
  }
  
  async createDecisionLog(conversation: Message[]): Promise<string> {
    const prompt = `
从以下对话中提取决策信息，输出 JSON：
${conversation.map(m => m.content).join('\n')}

格式：
{
  "title": "决策标题",
  "problem": "问题描述",
  "options": [
    {"id": "A", "name": "方案名", "pros": [], "cons": [], "risks": []}
  ],
  "chosen": "选中的方案ID",
  "reason": "选择理由"
}
    `
    
    const decision = JSON.parse(await this.ai.generate(prompt))
    return await this.memoryManager.logDecision(decision)
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.7 - 记忆压缩与预冲洗

**用户故事：** 作为系统，当会话上下文接近限制时，我需要将关键信息持久化，以便不丢失重要内容。

#### 验收标准

1. When session token usage reaches 60%, the system shall show warning indicator
2. When session token usage reaches 75%, the system shall trigger memory flush
3. When flush runs, the system shall identify and persist critical information
4. When flush completes, the system shall compress context and continue session
5. When flush fails, the system shall notify user and suggest manual save

#### 优先级

P1 - 应该完成

---

## 三、验收检查清单

- [ ] 任务看板正常渲染
- [ ] tasks.md 双向同步正常
- [ ] AI 任务创建可用
- [ ] AI 日报生成可用
- [ ] 个人空间权限隔离正确
- [ ] 记忆归档机制正常工作
- [ ] 决策日志记录可用
- [ ] 记忆压缩与预冲洗正常
- [ ] changelog.md 自动维护
