# Phase 3 Sprint 8 - 积分系统需求

## 一、概述

### 1.1 目标与价值

实现积分系统，量化团队成员的工作贡献，为后续 Token 化奠定基础。这是 Sibylla 面向 Crypto 团队的核心差异化功能。

### 1.2 涉及模块

- 模块11：积分系统

### 1.3 里程碑定义

**完成标志：**
- 积分引擎能基于工作产出自动计算积分
- tokenomics.md 配置解析可用
- 积分结算流程可用
- 积分明细与历史查看可用
- 团队排行榜可用

---

## 二、功能需求

### 需求 2.1 - 积分引擎

**用户故事：** 作为团队成员，我希望我的工作贡献能被公平量化。

#### 验收标准

1. When settlement period ends, the system shall calculate points for each member
2. When calculating points, the system shall apply weights from tokenomics.md
3. When task is completed on time, the system shall apply 1.2x bonus
4. When document quality is high, the system shall apply quality bonus
5. When calculation completes, the system shall generate detailed breakdown

#### 积分来源

| 来源 | 默认权重 | 说明 |
|------|---------|------|
| 任务完成 | 40% | 按时完成有 1.2x 加成 |
| 文档贡献 | 30% | AI 评定质量高于基线有加成 |
| 协作贡献 | 20% | 评论回复、审核处理 |
| 质量加成 | 10% | 文档质量评分 |

#### 优先级

P0 - 必须完成

---

### 需求 2.2 - tokenomics.md 配置

**用户故事：** 作为管理员，我想要自定义积分权重，以便适应团队特点。

#### 验收标准

1. When tokenomics.md is modified, the system shall reload configuration within 5 seconds
2. When configuration is invalid, the system shall show error and use default values
3. When settlement runs, the system shall use current configuration

#### 配置格式

```markdown
# 积分经济模型

## 积分来源权重

| 来源 | 权重 | 说明 |
|------|------|------|
| 任务完成 | 40% | 按时完成有 1.2x 加成 |
| 文档贡献 | 30% | AI 评定质量高于基线有加成 |
| 协作贡献 | 20% | 评论回复、审核处理 |
| 质量加成 | 10% | 文档质量评分 |

## 结算周期

- 周期：每周一结算
- 流程：AI 计算 → 管理员审核 → 正式记录

## 分配模型

- 类型：二次方分配
- 参数：k = 0.5
```

#### 优先级

P0 - 必须完成

---

### 需求 2.3 - 积分结算流程

**用户故事：** 作为管理员，我想要审核积分计算结果，以便确保公平。

#### 验收标准

1. When settlement time arrives, the system shall auto-calculate points
2. When calculation completes, the system shall notify admin for review
3. When admin reviews, the system shall show detailed breakdown per member
4. When admin approves, the system shall commit points to ledger
5. When admin rejects, the system shall allow manual adjustment

#### 优先级

P0 - 必须完成

---

### 需求 2.4 - 积分明细与历史

**用户故事：** 作为用户，我想要查看我的积分明细，以便了解贡献分布。

#### 验收标准

1. When user opens points dashboard, the system shall show current balance
2. When user clicks "明细", the system shall show transaction history
3. When user filters by date range, the system shall update results
4. When user exports history, the system shall generate CSV file

#### 优先级

P1 - 应该完成

---

### 需求 2.5 - 团队排行榜

**用户故事：** 作为用户，我想要看到团队排行榜，以便了解相对贡献。

#### 验收标准

1. When user opens leaderboard, the system shall show top contributors
2. When leaderboard is displayed, the system shall show points and rank
3. When admin disables leaderboard, the system shall hide it from all users

#### 优先级

P2 - 可以延后

---

### 需求 2.6 - Token 化预留

**用户故事：** 作为开发者，我需要为后续 Token 化预留接口。

#### 验收标准

1. When designing data structure, the system shall incluockchain mapping fields
2. When storing points ledger, the system shall use append-only format
3. When user profile is created, the system shall reserve wallet address field

#### 优先级

P2 - 可以延后

---

## 三、非功能需求

### 3.1 数据完整性

- 积分账本采用 append-only 日志，不可篡改历史
- 所有积分变更有完整审计日志
- 结算过程可回溯

### 3.2 性能要求

- 积分计算 < 10 秒（100 个成员）
- 明细查询 < 500ms
- 排行榜加载 < 1 秒

---

## 四、验收检查清单

- [ ] 积分引擎计算正确
- [ ] tokenomics.md 配置解析正常
- [ ] 结算流程可用
- [ ] 积分明细查看可用
- [ ] 排行榜可用
- [ ] 数据完整性保证
- [ ] Token 化接口预留完成
