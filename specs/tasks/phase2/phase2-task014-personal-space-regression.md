# 个人空间权限回归与 Admin 警告

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK014 |
| **任务标题** | 个人空间权限回归与 Admin 警告 |
| **所属阶段** | Phase 2 - 项目管理闭环 (Sprint 6) |
| **优先级** | P2 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

对 Sprint 6 新增的所有功能（任务看板、决策日志、日报周报、Dashboard）执行个人空间权限隔离的全面回归验证，并为 Admin 访问他人 personal/ 空间实现显式警告 UI 和审计事件记录。本任务 70% 工作量是测试，30% 是 Admin 警告 UI 实现。

### 背景

Sprint 3.1 的 `PersonalSpaceGuard`（`src/main/services/harness/guardrails/personal-space.ts`）已实现个人空间的硬性拦截。Sprint 5 的 `PrivacyFilter`（`src/main/services/presence/privacy-filter.ts`）已实现路径脱敏和角色过滤。但 Sprint 6 新增了多个会触及 personal/ 路径的功能入口，需要验证隔离在新场景下仍然生效：

| 新增功能 | 触及 personal/ 的场景 | 需验证的隔离点 |
|---------|----------------------|---------------|
| 任务看板 | tasks.md 引用的"关联文件"位于 personal/ | TaskStatusTracker 不自动加载他人 personal/ 文件内容 |
| 决策日志 | 决策日志存放在 personal/{user}/ 下 | 其他用户搜索不返回、AI Context 不包含 |
| 个人日报 | 保存到 personal/{user}/reports/ | 写入校验仅写入当前用户目录 |
| 产出分析 | ProductivityAnalyzer 聚合含 personal/ 数据 | 非 Admin 看匿名化数据 |
| Dashboard | Admin 视图包含 personal/ 数据 | 显示警告 + 记录审计事件 |

**核心设计约束：**

1. **不修改 PersonalSpaceGuard 核心逻辑**——仅做回归测试验证
2. **不修改 PrivacyFilter 核心逻辑**——仅做回归测试验证
3. **Admin 警告 UI 是纯增量**——新增警告条组件 + 审计事件发射，不修改现有组件
4. **管理员也不能写他人 personal/**——读写分离，Admin 只读
5. **AI Context 始终排除他人 personal/**——即使 Admin 也不在 AI 对话上下文中包含

### 范围

**包含：**

- Admin 警告条组件（`PersonalSpaceWarningBanner`）
- `admin.access-personal-space` 事件发射集成（事件类型已在 TASK013 定义）
- Dashboard "管理员视图"提示完善
- 完整回归测试矩阵覆盖（7×2 = 14 个场景）
- Sprint 6 各新功能的 personal/ 写入校验验证
- 单元测试 + 集成测试

**不包含：**

- PersonalSpaceGuard 核心逻辑修改
- PrivacyFilter 核心逻辑修改
- 新的权限模型设计
- SSO/审计系统实现（预留接口，Sprint 9 范围）

## 依赖关系

### 前置依赖

- [x] PHASE2-TASK010 — 任务看板（tasks.md 关联文件 personal/ 场景）
- [x] PHASE2-TASK011 — 决策日志（决策日志 personal/ 存放场景）
- [x] PHASE2-TASK012 — 日报周报（报告保存 personal/ 场景 + PrivacyFilter）
- [x] PHASE2-TASK013 — Dashboard（Admin 视图 personal/ 场景 + admin.access-personal-space 事件定义）
- [x] Sprint 3.1 — PersonalSpaceGuard（核心隔离逻辑）
- [x] Sprint 3.5 — PrivacyFilter（路径脱敏 + 角色过滤）

### 被依赖任务

- 无（本任务是 Sprint 6 的收官回归任务）

## 参考文档

- [`specs/requirements/phase2/sprint6-task-management.md`](../../requirements/phase2/sprint6-task-management.md) — 需求 6.9（个人空间权限回归与 Admin 警告）、§8 风险与缓解
- [`specs/design/testing-and-security.md`](../../design/testing-and-security.md) — 安全设计、隐私保护
- [`CLAUDE.md`](../../../CLAUDE.md) — 第七章安全红线（personal/ 隔离）
- `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` — Electron IPC 通信模式

## 验收标准

### 回归测试矩阵 — 普通用户

| # | 操作 | 期望结果 | 覆盖的功能 |
|---|------|---------|-----------|
| 1 | 读 `personal/{self}/` | 允许 | 基线（Sprint 3.1） |
| 2 | 读 `personal/{other}/` | 拒绝 | 基线（Sprint 3.1） |
| 3 | 写 `personal/{self}/` | 允许 | 基线 + 日报保存路径校验 |
| 4 | 写 `personal/{other}/` | 拒绝 | 基线 |
| 5 | AI Context 包含 `personal/{other}/` | 不包含 | CollabContextProvider L7 |
| 6 | Search 返回 `personal/{other}/` 结果 | 不返回 | UnifiedSearch |
| 7 | 团队周报包含 `personal/{other}/` 数据 | 匿名化 | team-report-curator |

- [ ] 测试 1-7 全部通过

### 回归测试矩阵 — 管理员

| # | 操作 | 期望结果 | 覆盖的功能 |
|---|------|---------|-----------|
| 1 | 读 `personal/{self}/` | 允许 | 基线 |
| 2 | 读 `personal/{other}/` | 允许 + 警告条 | **本任务新增** |
| 3 | 写 `personal/{self}/` | 允许 | 基线 |
| 4 | 写 `personal/{other}/` | 拒绝（Admin 也不能写） | 基线 |
| 5 | AI Context 包含 `personal/{other}/` | 不包含（即使 Admin） | ContextEngine |
| 6 | Search 返回 `personal/{other}/` 结果 | 返回 + 显式标记 | UnifiedSearch |
| 7 | 团队周报包含 `personal/{other}/` 数据 | 匿名化（报告级别） | team-report-curator |

- [ ] 测试 1-7 全部通过

### Admin 警告条 UI

- [ ] Admin 访问 `personal/{other}/` 时，页面顶部显示警告条：
  - 内容："您正在访问 {otherUser} 的个人空间（管理员模式）"
  - 背景：浅黄色 + 锁图标
  - 关闭按钮（关闭后本次会话内该路径不再显示）
  - 不阻断操作，仅提示
- [ ] 警告条组件 `PersonalSpaceWarningBanner` 可复用于文件查看、搜索结果、Dashboard 等场景

### admin.access-personal-space 事件

- [ ] Admin 打开他人 personal/ 文件时，系统触发 `admin.access-personal-space` 事件
- [ ] Payload：`{ adminId, targetUser, timestamp }`
- [ ] 事件写入 EventLogStore（审计日志，为 Sprint 9 SSO/审计 预留）
- [ ] Dashboard 数据涉及他人 personal/ 内容时同样触发此事件

### Dashboard "管理员视图"提示

- [ ] Admin Dashboard 显示他人产出数据时，顶部显示"管理员视图，包含个人空间数据"提示
- [ ] 提示与 TASK013 的 AdminDashboard 组件集成

### Sprint 6 新功能的 personal/ 写入校验

- [ ] 个人日报保存：`personal/{self}/reports/daily/{date}.md` — 校验 self 匹配当前用户
- [ ] 决策日志创建（选 personal/ 位置时）：校验写入路径属于当前用户
- [ ] 任务看板创建：tasks.md 位于 workspace 根目录，不涉及 personal/ 写入
- [ ] 以上场景中，如写入路径不匹配当前用户，FileManager 拒绝写入

### 性能要求

- [ ] PersonalSpaceGuard.check() < 5ms（已有，回归验证）
- [ ] Admin 警告条渲染不影响页面加载速度
- [ ] 事件发射为异步非阻塞

### 单元测试 + 集成测试

- [ ] PersonalSpaceWarningBanner 组件渲染测试
- [ ] admin.access-personal-space 事件发射测试
- [ ] 回归测试矩阵 14 个场景（7 普通用户 + 7 管理员）
- [ ] Sprint 6 新功能 personal/ 写入校验测试（日报/决策日志/看板）
- [ ] 覆盖率：回归测试场景 100% 覆盖、Admin 警告组件 ≥ 80%

## 技术策略

### 权限隔离架构：三层防护验证

Sprint 6 新功能通过以下三层防护保证个人空间隔离，本任务逐一验证每层在新场景下仍然生效：

```
第一层：PersonalSpaceGuard（Sprint 3.1）
  │  位置: harness/guardrails/personal-space.ts
  │  机制: 文件操作前检查路径，非 Admin 拒绝 personal/{other}/
  │  覆盖: 所有通过 FileManager 的读写操作
  │
  ├─ 验证点: 日报保存、决策日志创建、tasks.md 写入
  │           均通过 FileManager，已自动受 Guard 保护
  │
第二层：PrivacyFilter（Sprint 5）
  │  位置: presence/privacy-filter.ts
  │  机制: 路径脱敏 personal/* → '[personal-redacted]'
  │  覆盖: Presence 状态广播、活动事件过滤
  │
  ├─ 验证点: ProductivityAnalyzer 输出、团队周报生成
  │           使用 PrivacyFilter 过滤他人 personal/ 数据
  │
第三层：ContextEngine 排除（Sprint 3.2 + Sprint 5）
  │  机制: CollabContextProvider 不注入他人 personal/ 内容
  │  覆盖: AI 对话上下文组装
  │
  └─ 验证点: AI 回答不引用他人 personal/ 文件内容
             即使 Admin 也不在 AI Context 中包含
```

### Admin 警告条触发流程

```
Admin 在文件树点击 personal/{other}/file.md
    │
    ▼
FileManager.readFile() 调用
    │
    ├─ PersonalSpaceGuard.check() → 通过（Admin 允许读）
    │
    ▼
触发 admin.access-personal-space 事件
    │  { adminId, targetUser, timestamp }
    │
    ├─ EventLogStore.append() → 审计日志
    │
    ▼
渲染进程收到事件
    │
    ▼
PersonalSpaceWarningBanner 显示
    "您正在访问 {otherUser} 的个人空间（管理员模式）"
```

### 回归测试架构

```
tests/
  regression/
    personal-space/
      │
      ├─ baseline.test.ts          — Sprint 3.1 基线回归（读/写 self/other）
      ├─ ai-context.test.ts        — AI Context 排除他人 personal/
      ├─ search.test.ts            — UnifiedSearch 不返回他人 personal/
      ├─ team-report.test.ts       — 团队周报匿名化
      ├─ dashboard.test.ts         — Dashboard Admin 视图提示
      ├─ write-validation.test.ts  — Sprint 6 新功能写入路径校验
      └─ admin-warning.test.ts     — Admin 警告条 + 审计事件
```

## 技术执行路径

### 步骤 1：实现 PersonalSpaceWarningBanner 组件

**文件：** `src/renderer/components/common/PersonalSpaceWarningBanner.tsx`（新建）

1. 组件接口：
   ```typescript
   interface PersonalSpaceWarningBannerProps {
     targetUser: string
     onDismiss?: () => void
   }
   ```

2. 组件渲染：
   - 固定在页面顶部（`sticky top-0`）
   - 浅黄色背景（`bg-amber-50 dark:bg-amber-900/30`）
   - 左侧锁图标（`lucide-react` 的 `ShieldAlert`）
   - 文本："您正在访问 {targetUser} 的个人空间（管理员模式）"
   - 右侧关闭按钮（×），点击后调用 `onDismiss()`
   - 关闭后本次会话内该路径不再显示（存储在 sessionStorage）

3. 显示条件逻辑（在父组件中判断）：
   - 当前用户角色为 Admin
   - 当前查看的文件路径匹配 `personal/{otherUser}/`
   - sessionStorage 中无该路径的 dismissal 记录

**验证：** 组件渲染正确、关闭功能正确、sessionStorage 记录正确。

### 步骤 2：集成 admin.access-personal-space 事件发射

**文件：** `src/main/ipc/handlers/file.handler.ts`（修改）

1. 在文件读取 handler 中新增逻辑：
   - 读取文件成功后，检查路径是否匹配 `personal/{otherUser}/`
   - 检查当前用户角色是否为 Admin
   - 如果两个条件都满足：
     a. 提取 targetUser 从路径中（`personal/{targetUser}/...`）
     b. 触发 `admin.access-personal-space` 事件
     c. 通过 IPC push 通知渲染进程显示警告条

2. 路径提取辅助函数：
   ```typescript
   function extractPersonalUser(filePath: string): string | null {
     const match = filePath.match(/^personal\/([^/]+)\//)
     return match ? match[1] : null
   }
   ```

3. 不修改 FileManager 或 PersonalSpaceGuard——仅在读取成功后追加事件发射。

**验证：** Admin 读取他人 personal/ 文件时事件正确触发、payload 正确。

### 步骤 3：集成警告条到文件查看/搜索/Dashboard 场景

**文件：** `src/renderer/pages/WorkspaceStudioPage.tsx`（修改）

1. 在文件查看区域顶部集成 `PersonalSpaceWarningBanner`：
   - 当 `currentFile` 路径匹配 `personal/{other}/` 且用户为 Admin 时显示
   - 监听 `admin.access-personal-space` IPC push 事件更新显示状态

2. 在文件树组件中，Admin 展开 `personal/{other}/` 目录时显示目录级警告。

**文件：** `src/renderer/components/dashboard/AdminDashboard.tsx`（TASK013 修改）

3. 在 Dashboard 顶部新增"管理员视图，包含个人空间数据"提示：
   - 条件：Dashboard 数据中包含他人 personal/ 路径的内容
   - 显示为固定提示条（不可关闭，与警告条样式区分）

**验证：** 文件查看、文件树展开、Dashboard 三处警告/提示正确显示。

### 步骤 4：验证 Sprint 6 新功能的 personal/ 写入校验

本步骤不写代码，仅验证现有写入路径的安全性。

1. **个人日报保存路径校验**（验证 TASK012）：
   - 检查 `daily-personal-report.yaml` Workflow 的文件保存步骤
   - 确认保存路径为 `personal/{currentUser}/reports/daily/{date}.md`
   - 确认 `{currentUser}` 从认证上下文获取，不可伪造
   - FileManager 的 `validatePath()` + PersonalSpaceGuard 提供双保险

2. **决策日志创建路径校验**（验证 TASK011）：
   - 检查 `DecisionLogger.create()` 的文件写入路径
   - 当用户选择 personal/ 存放时，确认路径为 `.sibylla/memory/decisions/`（系统目录）或 `personal/{currentUser}/...`
   - 确认不直接接受用户输入的完整路径

3. **任务看板 tasks.md 校验**（验证 TASK010）：
   - tasks.md 位于 workspace 根目录，不涉及 personal/ 写入
   - TaskStatusTracker 的"关联文件"内容不自动加载到 AI Context（仅元数据可见）

4. **ProductivityAnalyzer 隐私校验**（验证 TASK012）：
   - 确认 `analyze()` 的 `viewerId` 参数驱动过滤
   - 非 self 非 admin 的查询返回匿名化数据
   - personal/ 路径的 commit 数据通过 PrivacyFilter 脱敏

**验证：** 以上 4 项均通过代码审查确认安全。

### 步骤 5：实现回归测试 — 基线 + AI Context

**文件：** `tests/regression/personal-space/baseline.test.ts`（新建）

1. 普通用户基线测试：
   - 读 `personal/{self}/notes/test.md` → 成功
   - 读 `personal/{other}/notes/test.md` → 拒绝（PERMISSION_DENIED）
   - 写 `personal/{self}/notes/new.md` → 成功
   - 写 `personal/{other}/notes/new.md` → 拒绝

2. 管理员基线测试：
   - 读 `personal/{self}/notes/test.md` → 成功
   - 读 `personal/{other}/notes/test.md` → 成功（触发 admin.access-personal-space 事件）
   - 写 `personal/{self}/notes/new.md` → 成功
   - 写 `personal/{other}/notes/new.md` → 拒绝（Admin 也不能写）

**文件：** `tests/regression/personal-space/ai-context.test.ts`（新建）

3. AI Context 排除测试：
   - 普通用户：ContextEngine.assembledContext 不包含 `personal/{other}/` 内容
   - 管理员：ContextEngine.assembledContext 不包含 `personal/{other}/` 内容（即使 Admin）
   - 任务"关联文件"位于 `personal/{other}/`：TaskStatusTracker 不自动加载内容

**验证：** 基线 8 个测试用例全部通过、AI Context 排除 3 个测试用例全部通过。

### 步骤 6：实现回归测试 — Search + 团队周报 + Dashboard

**文件：** `tests/regression/personal-space/search.test.ts`（新建）

1. UnifiedSearch 过滤测试：
   - 普通用户搜索 → 结果不包含 `personal/{other}/` 路径
   - 管理员搜索 → 结果包含 `personal/{other}/` 路径但带显式标记

**文件：** `tests/regression/personal-space/team-report.test.ts`（新建）

2. 团队周报匿名化测试：
   - 非 Admin 查看团队周报 → 不包含他人个人数据细节
   - Admin 查看团队周报 → 包含团队成员细节但 personal/ 路径数据匿名化

**文件：** `tests/regression/personal-space/dashboard.test.ts`（新建）

3. Dashboard 权限测试：
   - 非 Admin 打开 Dashboard → 显示"权限不足"提示
   - Admin Dashboard 包含 personal/ 数据 → 显示"管理员视图"提示
   - Admin Dashboard 打开时触发 admin.access-personal-space 事件

**验证：** Search 2 + 团队周报 2 + Dashboard 3 = 7 个测试用例全部通过。

### 步骤 7：实现回归测试 — 写入校验 + Admin 警告

**文件：** `tests/regression/personal-space/write-validation.test.ts`（新建）

1. Sprint 6 新功能写入路径测试：
   - 日报保存到 `personal/{self}/reports/` → 成功
   - 日报保存到 `personal/{other}/reports/` → 拒绝
   - 决策日志保存到 `.sibylla/memory/decisions/` → 成功（系统目录）
   - 决策日志保存到 `personal/{other}/...` → 拒绝

**文件：** `tests/regression/personal-space/admin-warning.test.ts`（新建）

2. Admin 警告条测试：
   - Admin 读取 `personal/{other}/` 文件 → admin.access-personal-space 事件触发
   - 事件 payload 包含正确的 adminId、targetUser、timestamp
   - 事件写入 EventLogStore
   - Admin 读取 `personal/{self}/` → 不触发事件
   - 普通用户读取 `personal/{other}/` → 拒绝（不触发事件，因为读不到）

3. PersonalSpaceWarningBanner 组件测试：
   - 渲染正确文本内容
   - 关闭按钮点击后 sessionStorage 记录 dismissal
   - 有 dismissal 记录时不显示

**验证：** 写入校验 4 + Admin 警告 5 + 组件 3 = 12 个测试用例全部通过。

**总计回归测试覆盖：** 8（基线）+ 3（AI Context）+ 2（Search）+ 2（周报）+ 3（Dashboard）+ 4（写入）+ 5（事件）+ 3（组件）= **30 个测试用例**

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| PersonalSpaceGuard | `src/main/services/harness/guardrails/personal-space.ts` | 回归验证，不修改 |
| PrivacyFilter | `src/main/services/presence/privacy-filter.ts` | 回归验证，不修改 |
| FileManager | `src/main/services/file-manager.ts` | 回归验证写入校验 |
| AppEventBus | `src/main/services/event-bus.ts` | 发射 admin.access-personal-space 事件 |
| EventLogStore | `src/main/services/event-log-store.ts` | 审计日志记录 |
| ContextEngine | `src/main/services/context-engine/` | 回归验证 AI Context 排除 |
| UnifiedSearchEngine | `src/main/services/search/` | 回归验证搜索过滤 |
| KanbanService | TASK010 | 回归验证关联文件不加载 |
| DecisionLogger | TASK011 | 回归验证写入路径 |
| ProductivityAnalyzer | TASK012 | 回归验证隐私过滤 |
| AdminDashboard | TASK013 | 集成管理员视图提示 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `renderer/components/common/PersonalSpaceWarningBanner.tsx` | Admin 警告条组件 |
| `tests/regression/personal-space/baseline.test.ts` | 基线回归测试 |
| `tests/regression/personal-space/ai-context.test.ts` | AI Context 排除测试 |
| `tests/regression/personal-space/search.test.ts` | 搜索过滤测试 |
| `tests/regression/personal-space/team-report.test.ts` | 团队周报匿名化测试 |
| `tests/regression/personal-space/dashboard.test.ts` | Dashboard 权限测试 |
| `tests/regression/personal-space/write-validation.test.ts` | 写入路径校验测试 |
| `tests/regression/personal-space/admin-warning.test.ts` | Admin 警告+事件测试 |

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/ipc/handlers/file.handler.ts` | 扩展 | Admin 读取他人 personal/ 时发射 admin.access-personal-space 事件 |
| `src/renderer/pages/WorkspaceStudioPage.tsx` | 修改 | 集成 PersonalSpaceWarningBanner |
| `src/renderer/components/dashboard/AdminDashboard.tsx`（TASK013） | 修改 | 集成"管理员视图"提示条 |

**不修改的文件：**

- `src/main/services/harness/guardrails/personal-space.ts` — 核心隔离逻辑不变
- `src/main/services/presence/privacy-filter.ts` — 核心过滤逻辑不变
- `src/main/services/file-manager.ts` — 写入校验已有，不改

---

**创建时间：** 2026-05-01
**最后更新：** 2026-05-01
**更新记录：**
- 2026-05-01 — 创建任务文档（含完整技术执行路径 7 步 + 30 个回归测试用例）