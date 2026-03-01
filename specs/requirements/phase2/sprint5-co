# Phase 2 Sprint 5 - 通知、评论、审核需求

## 一、概述

### 1.1 目标与价值

实现团队协作的核心信息流通机制：通知系统让成员及时了解变更，评论系统支持异步讨论，审核流程确保重要文件的质量控制。

### 1.2 涉及模块

- 模块8：通知与信息流
- 模块9：评论与讨论
- 模块3：Git 审核流程

### 1.3 里程碑定义

**完成标志：**
- 通知中心可用，支持多种通知类型
- 段落级评论可用，支持讨论线程
- 审核流程可用，管理员能审批修改

---

## 二、功能需求

### 需求 2.1 - 通知系统

**用户故事：** 作为用户，我想要及时收到重要通知，以便不错过关键信息。

#### 验收标准

1. When file is modified by others, the system shall send notification to watchers
2. When user is @mentioned, the system shall send notification immediately
3. When task is assigned, the system shall send notification to assignee
4. When notification is received, the system shall show badge count in sidebar
5. When user clicks notification, the system shall navigate to related content
6. When user marks notification as read, the system shall update badge count

#### 通知类型

- 文件变更通知
- @提及通知
- 任务分配通知
- 审核通知
- 评论回复通知

#### 优先级

P0 - 必须完成

---

### 需求 2.2 - 段落级评论

**用户故事：** 作为用户，我想要对文档的特定段落发起讨论，以便精准沟通。

#### 验收标准

1. When user selects text and clicks comment button, the system shall create comment thread
2. When comment is created, the system shall show indicator in margin
3. When user clicks indicator, the system shall show comment thread
4. When user replies to comment, the system shall add to thread
5. When comment is resolved, the system shall collapse thread but keep accessible
6. When user @mentions in comment, the system shall send notification

#### 优先级

P0 - 必须完成

---

### 需求 2.3 - 审核流程

**用户故事：** 作为管理员，我想要审核特定文件夹的修改，以便控制重要内容的质量。

#### 验收标准

1. When admin marks folder as "需审核", the system shall enable review workflow
2. When editor modifies file in reviewed folder, the system shall create review request
3. When review request is created, the system shall notify admin
4. When admin approves, the system shall merge changes to main
5. When admin rejects, the system shall notify editor with reason
6. When review is pending, the system shall show "待审核" status

#### 优先级

P1 - 应该完成

---

## 三、验收检查清单

- [ ] 通知中心正常工作
- [ ] 各类通知正确发送
- [ ] 段落级评论可用
- [ ] 评论线程正常
- [ ] 审核流程可用
- [ ] WebSocket 推送正常
