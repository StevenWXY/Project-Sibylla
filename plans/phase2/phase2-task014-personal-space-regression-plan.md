# PHASE2-TASK014: 个人空间权限回归与 Admin 警告 — 实施计划

> 任务来源：[specs/tasks/phase2/phase2-task014-personal-space-regression.md](../../specs/tasks/phase2/phase2-task014-personal-space-regression.md)
> 创建日期：2026-05-01
> 最后更新：2026-05-01

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE2-TASK014 |
| **任务标题** | 个人空间权限回归与 Admin 警告 |
| **所属阶段** | Phase 2 - 项目管理闭环 (Sprint 6) |
| **优先级** | P2 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **前置依赖** | TASK010(看板) + TASK011(决策日志) + TASK012(日报周报/产出分析) + TASK013(Dashboard) + Sprint 3.1(PersonalSpaceGuard) + Sprint 5(PrivacyFilter) |

### 1.1 目标

对 Sprint 6 新增的所有功能（任务看板、决策日志、日报周报、Dashboard）执行个人空间权限隔离的全面回归验证，并为 Admin 访问他人 `personal/` 空间实现显式警告 UI 和审计事件记录。本任务 70% 工作量是测试，30% 是 Admin 警告 UI 实现。

### 1.2 核心设计约束（不可违反）

1. **不修改 PersonalSpaceGuard 核心逻辑** — 仅做回归测试验证
2. **不修改 PrivacyFilter 核心逻辑** — 仅做回归测试验证
3. **Admin 警告 UI 是纯增量** — 新增警告条组件 + 审计事件发射，不修改现有组件核心逻辑
4. **管理员也不能写他人 personal/** — 读写分离，Admin 只读
5. **AI Context 始终排除他人 personal/** — 即使 Admin 也不在 AI 对话上下文中包含
6. **事件发射为异步非阻塞** — 不影响文件读取性能

### 1.3 核心交付物

| 交付物 | 文件路径 | 说明 |
|--------|---------|------|
| 警告条组件 | `src/renderer/components/common/PersonalSpaceWarningBanner.tsx` | Admin 访问他人 personal/ 时显示 |
| 路径提取工具 | `src/main/utils/personal-path.ts`（新建） | personal/ 路径解析辅助函数 |
| 基线回归测试 | `tests/regression/personal-space/baseline.test.ts` | 读/写 self/other 基线 |
| AI Context 测试 | `tests/regression/personal-space/ai-context.test.ts` | AI Context 排除验证 |
| 搜索过滤测试 | `tests/regression/personal-space/search.test.ts` | UnifiedSearch 隐私过滤 |
| 团队周报测试 | `tests/regression/personal-space/team-report.test.ts` | 周报匿名化验证 |
| Dashboard 测试 | `tests/regression/personal-space/dashboard.test.ts` | Dashboard 权限提示 |
| 写入校验测试 | `tests/regression/personal-space/write-validation.test.ts` | Sprint 6 新功能写入路径 |
| Admin 警告测试 | `tests/regression/personal-space/admin-warning.test.ts` | 事件发射 + 组件测试 |

### 1.4 涉及修改的现有文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/main/ipc/handlers/file.handler.ts` | 扩展 | Admin 读取他人 personal/ 后发射 `admin.access-personal-space` 事件 |
| `src/renderer/pages/WorkspaceStudioPage.tsx` | 修改 | 集成 PersonalSpaceWarningBanner |
| `src/renderer/components/dashboard/AdminDashboard.tsx` | 修改 | 集成"管理员视图"提示条 |
| `src/preload/index.ts` | 扩展 | 注册 `admin:accessPersonalSpace` IPC push 通道 |
| `src/shared/types.ts` | 扩展 | IPC_CHANNELS 追加 admin access 事件推送通道 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------|
| `CLAUDE.md` | TS 严格模式禁止 any；personal/ 隔离（第七章安全红线）；注释英文/文档中文 | 全局约束 |
| `specs/design/testing-and-security.md` | 测试覆盖率 ≥ 80%；隐私保护（§3.6 personal/ 权限隔离） | 测试设计 + 安全验证 |
| `specs/design/architecture.md` | 进程通信架构(§3.2)、IPC 模式 | IPC 事件推送设计 |
| `specs/design/ui-ux-design.md` | 色彩体系(#6366F1 主色)、组件规范(6px 圆角) | 警告条 UI 设计 |
| `specs/requirements/phase2/sprint6-task-management.md` | 需求 6.9（个人空间权限回归与 Admin 警告）、§2.4 命名空间、§8 风险与缓解 | 验收标准 |
| `specs/tasks/phase2/phase2-task014-personal-space-regression.md` | 7 步执行路径、30 个回归测试用例、三层防护架构 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------|
| `electron-ipc-patterns` | admin.access-personal-space IPC push 通道设计；M→R 事件推送 | `file.handler.ts` + `preload/index.ts` + `shared/types.ts` |
| `zustand-state-management` | 警告条状态管理；sessionStorage dismissal 持久化 | `PersonalSpaceWarningBanner` 组件内状态 |
| `typescript-strict-mode` | personal-path 工具函数类型安全；GuardrailVerdict 类型约束 | `personal-path.ts` + 全部测试文件 |

### 2.3 前置代码依赖

| 模块 | 实际文件路径 | 关键接口/方法 | 本任务使用方式 |
|------|------------|-------------|-------------|
| `PersonalSpaceGuard` | `src/main/services/harness/guardrails/personal-space.ts:86-121` | `check(op, ctx) → GuardrailVerdict` | 回归验证，不修改 |
| `extractPersonalMember` | `src/main/services/harness/guardrails/personal-space.ts:41` | `(normalizedPath) → string \| null` | 路径提取参考，不直接调用（内部函数） |
| `GuardrailEngine` | `src/main/services/harness/guardrails/` | `evaluate(op, ctx) → GuardrailVerdict` | `file.handler.ts` 已注入，不修改 |
| `PrivacyFilter` | `src/main/services/presence/privacy-filter.ts:11-85` | `redactPath()` / `filterPeerStateForViewer()` | 回归验证，不修改 |
| `FileManager` | `src/main/services/file-manager.ts:423` | `writeFile()` / `readFile()` | 回归验证写入校验 |
| `FileHandler` | `src/main/ipc/handlers/file.handler.ts:65-609` | `readFile()`(L217) / `buildOperationContext()`(L533) | 扩展：读取后追加事件发射 |
| `AppEventBus` | `src/main/services/event-bus.ts:43` | `emitEvent<T>(partial)` (L64) | 发射 `admin.access-personal-space` 事件 |
| `EventLogStore` | `src/main/services/event-log-store.ts:5-104` | `append(event)` (L20) | 审计日志记录（事件总线自动调用） |
| `SibyllaEventType` | `src/main/services/event-bus-types.ts:5-71` | 含 `'admin.access-personal-space'` (L70) | 已定义，直接使用 |
| `EventPayloadMap` | `src/main/services/event-bus-types.ts:85-151` | `'admin.access-personal-space': { adminId, targetUser, timestamp }` (L150) | 已定义，直接使用 |
| `AdminDashboard` | `src/renderer/components/dashboard/AdminDashboard.tsx:1-88` | `isAdmin` 硬编码为 true (L19) | 修改：集成管理员视图提示 |
| `WorkspaceStudioPage` | `src/renderer/pages/WorkspaceStudioPage.tsx:186` | 文件编辑器布局 (L1196-1303) | 修改：集成警告条 |
| `IPC_CHANNELS` | `src/shared/types.ts:88-590` | 通道常量映射 | 扩展：追加事件推送通道 |
| `DashboardHandler` | `src/main/ipc/handlers/dashboard.ts:142` | 已发射 `admin.access-personal-space` | 参考实现，不修改 |
| `KanbanService` | TASK010 | `parseTasksMd()` | 回归验证关联文件不加载 |
| `DecisionLogger` | TASK011 | `create()` | 回归验证写入路径 |
| `ProductivityAnalyzer` | TASK012 | `analyze({ viewerId })` | 回归验证隐私过滤 |
| `ContextEngine` | Sprint 3.2 | `assembledContext` | 回归验证 AI Context 排除 |
| `UnifiedSearchEngine` | Sprint 4 | `search()` | 回归验证搜索过滤 |

### 2.4 已定义的事件类型（无需扩展）

| 事件 | 位置 | Payload |
|------|------|---------|
| `admin.access-personal-space` | `event-bus-types.ts:70` | `{ adminId: string; targetUser: string; timestamp: number }` |

**已发射场景：** Dashboard handler (`dashboard.ts:142`) 在 Admin 获取 overview 时已发射，`targetUser: '__dashboard_overview__'`。

**本任务新增发射场景：** File handler `readFile()` 路径 — Admin 读取他人 personal/ 文件时发射。

---

## 三、现有代码盘点与差距分析

### 3.1 PersonalSpaceGuard（已就绪 ✅ — 不修改）

**文件：** `src/main/services/harness/guardrails/personal-space.ts` (121 行)

- `check(op: FileOperation, ctx: OperationContext): Promise<GuardrailVerdict>` (L90)
- Admin 用户绕过所有检查 (L73)，非 Admin 用户读取/写入 `personal/{other}/` 均被拦截
- `extractPersonalMember(normalizedPath)` (L41) 为内部函数，不可直接调用

**回归验证点：** 读/写 self/other 四种组合的行为在新场景下是否仍然正确。

### 3.2 PrivacyFilter（已就绪 ✅ — 不修改）

**文件：** `src/main/services/presence/privacy-filter.ts` (92 行)

- `redactPath(filePath)` — `personal/*` → `[personal-redacted]` (L16)
- `filterPeerStateForViewer(peerState, viewerRole)` — 角色过滤 (L24)
- `filterActivityEvents(events, forUserId)` — 活动事件脱敏 (L69)

**回归验证点：** ProductivityAnalyzer 输出、团队周报生成是否正确调用 PrivacyFilter。

### 3.3 FileHandler.readFile()（需扩展 ⚠️）

**文件：** `src/main/ipc/handlers/file.handler.ts` (609 行)

**现状问题：**

| 问题 | 位置 | 影响 |
|------|------|------|
| `readFile()` 无 guardrail 检查 | L217-235 | Admin 读取他人 personal/ 文件时无事件发射 |
| `buildOperationContext()` 硬编码 `userRole: 'viewer'` | L539-540 | 无法获取真实用户角色，Admin 检测失效 |
| 无 personal/ 路径提取逻辑 | — | 无法判断读取的文件是否属于他人 personal/ |

**扩展计划：**
1. 在 `readFile()` 成功后追加 personal/ 路径检测 + Admin 角色判断 + 事件发射
2. 不修改 guardrail 逻辑（read 操作不走 guardrail，这是设计决策：Admin 允许读）
3. `buildOperationContext()` 中 `userRole` 硬编码问题需要通过 `setAuthUserProvider()` 注入的 resolver 获取真实角色

### 3.4 AdminDashboard（需修改 ⚠️）

**文件：** `src/renderer/components/dashboard/AdminDashboard.tsx` (88 行)

**现状问题：**

| 问题 | 位置 | 影响 |
|------|------|------|
| `isAdmin` 硬编码为 `true` | L19 | 无法区分 Admin/非 Admin 显示逻辑 |
| 无"管理员视图"提示条 | — | TASK013 预期在此组件显示 personal/ 数据提示 |
| 非 Admin 显示"权限不足" | L30-49 | UI 已有 fallback，但 isAdmin 判断是 stub |

**修改计划：**
1. 将 `isAdmin` 从硬编码改为从 `useAppStore` 或 `useDashboardStore` 获取真实角色
2. 在 Admin 视图顶部追加"管理员视图，包含个人空间数据"提示条（不可关闭）

### 3.5 WorkspaceStudioPage（需修改 ⚠️）

**文件：** `src/renderer/pages/WorkspaceStudioPage.tsx` (1312 行)

**现状：** 文件查看编辑区域在 `StudioEditorPanel` (L1196-1303) 中渲染。

**修改计划：**
1. 在文件查看区域顶部集成 `PersonalSpaceWarningBanner`
2. 条件：`currentFile` 路径匹配 `personal/{other}/` 且用户角色为 Admin
3. 监听 `admin:accessPersonalSpace` IPC push 事件更新显示状态

### 3.6 IPC 通道与 Preload（需扩展 ⚠️）

**现状：**
- `IPC_CHANNELS` (`shared/types.ts:88-590`) 无 admin personal space push 通道常量
- `preload/index.ts` 的 `ALLOWED_CHANNELS` 列表无 `admin:accessPersonalSpace`
- `preload/index.ts` 的 `ElectronAPI` 接口无 `onAccessPersonalSpace` 事件监听

**扩展计划：** 追加 1 个 M→R push 通道 + preload 事件监听 API。

### 3.7 事件类型（已就绪 ✅ — 无需修改）

- `SibyllaEventType` 已包含 `'admin.access-personal-space'` (event-bus-types.ts:70)
- `EventPayloadMap` 已包含对应 payload 类型 (event-bus-types.ts:150)
- Dashboard handler 已实现发射 (dashboard.ts:142)

### 3.8 测试基础设施（完全缺失 ❌）

| 缺失项 | 说明 |
|--------|------|
| `tests/regression/` 目录 | 不存在，需创建 |
| `tests/regression/personal-space/` 目录 | 不存在，需创建 |
| 全部 7 个测试文件 | 不存在，需新建 |

### 3.9 完全缺失的文件

| 文件路径 | 说明 |
|---------|------|
| `src/renderer/components/common/PersonalSpaceWarningBanner.tsx` | Admin 警告条组件 |
| `src/main/utils/personal-path.ts` | personal/ 路径解析工具函数 |
| `tests/regression/personal-space/baseline.test.ts` | 基线回归测试 |
| `tests/regression/personal-space/ai-context.test.ts` | AI Context 排除测试 |
| `tests/regression/personal-space/search.test.ts` | 搜索过滤测试 |
| `tests/regression/personal-space/team-report.test.ts` | 团队周报匿名化测试 |
| `tests/regression/personal-space/dashboard.test.ts` | Dashboard 权限测试 |
| `tests/regression/personal-space/write-validation.test.ts` | 写入路径校验测试 |
| `tests/regression/personal-space/admin-warning.test.ts` | Admin 警告 + 事件测试 |

---

## 四、分步实施计划

### 阶段 A：personal-path 工具函数（Step 1） — 预计 0.3 天

#### A1：创建 personal-path.ts

**文件：** `sibylla-desktop/src/main/utils/personal-path.ts`（新建）

从 `PersonalSpaceGuard` 的内部 `extractPersonalMember()` 提取公共逻辑为独立工具函数：

```typescript
export function extractPersonalUser(filePath: string): string | null

export function isPersonalPath(filePath: string): boolean

export function isOtherUsersPersonal(filePath: string, currentUserId: string): boolean
```

**实现要点：**

1. `extractPersonalUser(filePath)` — 正则 `^personal\/([^\/]+)\/` 提取用户名，复用 PersonalSpaceGuard:41 的逻辑
2. `isPersonalPath(filePath)` — 检查路径是否以 `personal/` 开头
3. `isOtherUsersPersonal(filePath, currentUserId)` — 组合判断：是 personal/ 路径且用户名不等于当前用户

**验证：** 单元测试覆盖各种路径格式（`personal/alice/notes.md`、`docs/readme.md`、`personal/bob/`、`` 等）。

---

### 阶段 B：PersonalSpaceWarningBanner 组件（Step 2） — 预计 0.5 天

#### B1：创建 PersonalSpaceWarningBanner.tsx

**文件：** `sibylla-desktop/src/renderer/components/common/PersonalSpaceWarningBanner.tsx`（新建）

**组件接口：**

```typescript
interface PersonalSpaceWarningBannerProps {
  targetUser: string
  onDismiss?: () => void
}
```

**组件渲染规范：**

| 属性 | 实现 |
|------|------|
| 定位 | `sticky top-0 z-30`，固定在页面顶部 |
| 背景 | `bg-amber-50 dark:bg-amber-900/30`，浅黄色 |
| 左侧图标 | `ShieldAlert`（lucide-react），`text-amber-600` |
| 文本 | "您正在访问 {targetUser} 的个人空间（管理员模式）" |
| 右侧关闭按钮 | × 按钮，`text-amber-600 hover:text-amber-800` |
| 动画 | `transition-all duration-200`，关闭时 `h-0 opacity-0 overflow-hidden` |

**Dismissal 逻辑：**

```typescript
const DISMISS_KEY_PREFIX = 'personal-space-warning-dismissed:'

function isDismissed(targetUser: string): boolean {
  return sessionStorage.getItem(DISMISS_KEY_PREFIX + targetUser) === 'true'
}

function markDismissed(targetUser: string): void {
  sessionStorage.setItem(DISMISS_KEY_PREFIX + targetUser, 'true')
}
```

- 关闭后本次会话内该 targetUser 不再显示
- `onDismiss()` 回调通知父组件更新状态

**显示条件（在父组件中判断）：**

1. 当前用户角色为 Admin
2. 当前查看的文件路径匹配 `personal/{otherUser}/`
3. sessionStorage 中无该 targetUser 的 dismissal 记录

#### B2：Dashboard 管理员视图提示条

**文件：** `sibylla-desktop/src/renderer/components/dashboard/AdminDashboard.tsx`（修改）

在 AdminDashboard 组件顶部追加不可关闭的提示条：

```typescript
{isAdmin && hasPersonalData && (
  <div className="bg-indigo-50 dark:bg-indigo-900/20 px-4 py-2 rounded-lg mb-4
                  flex items-center gap-2 text-sm text-indigo-700 dark:text-indigo-300">
    <EyeIcon className="w-4 h-4" />
    <span>管理员视图，包含个人空间数据</span>
  </div>
)}
```

- `hasPersonalData` 从 dashboardStore 的 overview 数据中判断是否包含 `personal/` 路径内容
- 此提示条**不可关闭**，与警告条样式区分（indigo vs amber）

---

### 阶段 C：file.handler.ts 事件发射集成（Step 3） — 预计 0.5 天

#### C1：扩展 FileHandler.readFile()

**文件：** `sibylla-desktop/src/main/ipc/handlers/file.handler.ts`（修改）

**修改范围：** 仅在 `readFile()` 方法（L217-235）返回成功后追加事件发射逻辑。不修改 guardrail 检查流程。

**实现方案：**

```typescript
import { extractPersonalUser, isOtherUsersPersonal } from '../../utils/personal-path'

private async readFile(event: IpcMainInvokeEvent, filePath: string): Promise<string> {
  // ... 现有读取逻辑不变 ...
  const content = await this.fileManager.readFile(filePath)

  // === 新增：Admin 访问他人 personal/ 事件发射 ===
  this.emitAdminAccessEventIfApplicable(event, filePath)

  return content
}

private emitAdminAccessEventIfApplicable(
  event: IpcMainInvokeEvent,
  filePath: string,
): void {
  try {
    const targetUser = extractPersonalUser(filePath)
    if (!targetUser) return

    const operationCtx = this.buildOperationContext(event)
    const currentUser = operationCtx.userId
    if (targetUser === currentUser) return

    if (operationCtx.userRole !== 'admin') return

    this.eventBus.emitEvent({
      type: 'admin.access-personal-space',
      source: 'file-handler',
      payload: {
        adminId: currentUser,
        targetUser,
        timestamp: Date.now(),
      },
      persist: true,
    }).catch(() => {})
  } catch {
    // Non-blocking: event emission failure must not affect file read
  }
}
```

**关键设计决策：**

1. **异步非阻塞** — `emitEvent()` 返回 Promise，`.catch(() => {})` 确保不影响读取
2. **角色判断依赖 buildOperationContext()** — 当前 `buildOperationContext()` 硬编码 `userRole: 'viewer'`（L539），需先修复此问题
3. **persist: true** — 事件写入 EventLogStore 审计日志

#### C2：修复 buildOperationContext() 角色解析

**问题：** `file.handler.ts:539` 硬编码 `userRole: 'viewer'`。

**修复方案：** 使用已注入的 `authUserProvider` 获取真实角色：

```typescript
private buildOperationContext(source: IpcMainInvokeEvent | string): OperationContext {
  const userId = this.authUserProvider?.getUserId() ?? 'anonymous'
  const userRole = this.authUserProvider?.getUserRole() ?? 'viewer'
  return {
    userId,
    userRole,
    source: typeof source === 'string' ? source : 'ipc',
    timestamp: new Date(),
  }
}
```

**前提：** 确认 `authUserProvider` 接口是否已包含 `getUserRole()` 方法。若无，需在 `AuthUserProvider` 接口中追加。

#### C3：扩展 shared/types.ts + preload/index.ts

**shared/types.ts IPC_CHANNELS 追加：**

```typescript
ADMIN_ACCESS_PERSONAL_SPACE: 'admin:accessPersonalSpace',
```

**preload/index.ts 追加：**

1. `ALLOWED_CHANNELS` 注册 `'admin:accessPersonalSpace'`
2. `ElectronAPI` 接口追加事件监听：

```typescript
onAccessPersonalSpace: (callback: (payload: {
  adminId: string
  targetUser: string
  timestamp: number
}) => void) => () => void
```

3. Preload 实现：

```typescript
onAccessPersonalSpace: (callback) => {
  const handler = (_event, payload) => callback(payload)
  ipcRenderer.on('admin:accessPersonalSpace', handler)
  return () => ipcRenderer.off('admin:accessPersonalSpace', handler)
}
```

#### C4：注入 AppEventBus 到 FileHandler

**问题：** FileHandler 当前未持有 `eventBus` 引用。

**修改方案：** 追加 `setEventBus(eventBus: AppEventBus)` setter（与现有 `setFileManager()` 模式一致），在 WorkspaceManager 初始化时注入。

**验证：** Admin 读取他人 personal/ 文件时事件正确触发、payload 正确、事件写入 EventLogStore。

---

### 阶段 D：WorkspaceStudioPage 警告条集成（Step 4） — 预计 0.3 天

#### D1：集成到文件查看区域

**文件：** `sibylla-desktop/src/renderer/pages/WorkspaceStudioPage.tsx`（修改）

**修改位置：** `StudioEditorPanel` 组件（L1196-1303），在编辑器区域顶部插入警告条。

**实现方案：**

```typescript
import { PersonalSpaceWarningBanner } from '../components/common/PersonalSpaceWarningBanner'

const [warningTargetUser, setWarningTargetUser] = useState<string | null>(null)

useEffect(() => {
  const unsub = window.electronAPI.onAccessPersonalSpace((payload) => {
    setWarningTargetUser(payload.targetUser)
  })
  return unsub
}, [])

const handleDismissWarning = useCallback(() => {
  if (warningTargetUser) {
    setWarningTargetUser(null)
  }
}, [warningTargetUser])

const shouldShowWarning = useMemo(() => {
  if (!warningTargetUser) return false
  const currentUser = useAppStore.getState().currentUser
  if (!currentUser || currentUser.role !== 'admin') return false
  return true
}, [warningTargetUser])

// In StudioEditorPanel JSX:
{shouldShowWarning && (
  <PersonalSpaceWarningBanner
    targetUser={warningTargetUser!}
    onDismiss={handleDismissWarning}
  />
)}
```

**验证：** 文件查看、文件树展开时警告正确显示和关闭。

---

### 阶段 E：回归测试 — 基线 + AI Context（Step 5） — 预计 0.5 天

#### E1：创建测试目录结构

```bash
mkdir -p tests/regression/personal-space
```

#### E2：baseline.test.ts

**文件：** `sibylla-desktop/tests/regression/personal-space/baseline.test.ts`（新建）

**测试用例（8 个）：**

| # | 场景 | 角色 | 操作 | 期望结果 |
|---|------|------|------|---------|
| 1 | 读 self | user | `readFile('personal/alice/notes/test.md')` | 成功 |
| 2 | 读 other | user | `readFile('personal/bob/notes/test.md')` | 拒绝 PERMISSION_DENIED |
| 3 | 写 self | user | `writeFile('personal/alice/notes/new.md')` | 成功 |
| 4 | 写 other | user | `writeFile('personal/bob/notes/new.md')` | 拒绝 |
| 5 | 读 self | admin | `readFile('personal/alice/notes/test.md')` | 成功 |
| 6 | 读 other + 事件 | admin | `readFile('personal/bob/notes/test.md')` | 成功 + `admin.access-personal-space` 事件触发 |
| 7 | 写 self | admin | `writeFile('personal/alice/notes/new.md')` | 成功 |
| 8 | 写 other | admin | `writeFile('personal/bob/notes/new.md')` | 拒绝（Admin 也不能写） |

**Mock 策略：**
- Mock `FileManager` 的 `readFile()` / `writeFile()`
- Mock `GuardrailEngine` 的 `evaluate()` 返回 PersonalSpaceGuard 的实际逻辑（或直接使用 GuardrailEngine 实例 + PersonalSpaceGuard 注册）
- Mock `AppEventBus` 的 `emitEvent()` 捕获事件
- Mock `AuthUserProvider` 切换 user/admin 角色

#### E3：ai-context.test.ts

**文件：** `sibylla-desktop/tests/regression/personal-space/ai-context.test.ts`（新建）

**测试用例（3 个）：**

| # | 场景 | 期望结果 |
|---|------|---------|
| 1 | 普通用户：ContextEngine.assembledContext 不包含 `personal/{other}/` 内容 | 无他人 personal/ 内容 |
| 2 | 管理员：ContextEngine.assembledContext 不包含 `personal/{other}/` 内容（即使 Admin） | 无他人 personal/ 内容 |
| 3 | 任务"关联文件"位于 `personal/{other}/`：TaskStatusTracker 不自动加载内容 | 仅元数据可见 |

**Mock 策略：**
- Mock `ContextEngine` 的 `assembleContext()` 返回值
- 注入包含他人 personal/ 路径的文件索引，验证 ContextEngine 过滤

**验证：** 基线 8 + AI Context 3 = 11 个测试全部通过。

---

### 阶段 F：回归测试 — Search + 团队周报 + Dashboard（Step 6） — 预计 0.5 天

#### F1：search.test.ts

**文件：** `sibylla-desktop/tests/regression/personal-space/search.test.ts`（新建）

**测试用例（2 个）：**

| # | 场景 | 期望结果 |
|---|------|---------|
| 1 | 普通用户搜索 → 结果不包含 `personal/{other}/` 路径 | 过滤正确 |
| 2 | 管理员搜索 → 结果包含 `personal/{other}/` 路径但带显式标记 | 标记 `[personal-space]` |

**验证逻辑：** 搜索结果数组中每个 item 的 filePath 不匹配 `personal/{other}/`（普通用户）或匹配但带标记（Admin）。

#### F2：team-report.test.ts

**文件：** `sibylla-desktop/tests/regression/personal-space/team-report.test.ts`（新建）

**测试用例（2 个）：**

| # | 场景 | 期望结果 |
|---|------|---------|
| 1 | 非 Admin 查看团队周报 → 不包含他人个人数据细节 | 匿名化 |
| 2 | Admin 查看团队周报 → 包含团队成员细节但 personal/ 路径数据匿名化 | 路径脱敏 |

#### F3：dashboard.test.ts

**文件：** `sibylla-desktop/tests/regression/personal-space/dashboard.test.ts`（新建）

**测试用例（3 个）：**

| # | 场景 | 期望结果 |
|---|------|---------|
| 1 | 非 Admin 打开 Dashboard → 显示"权限不足"提示 | 拒绝访问 |
| 2 | Admin Dashboard 包含 personal/ 数据 → 显示"管理员视图"提示 | 提示条可见 |
| 3 | Admin Dashboard 打开时触发 `admin.access-personal-space` 事件 | 事件触发 |

**验证：** Search 2 + 团队周报 2 + Dashboard 3 = 7 个测试全部通过。

---

### 阶段 G：回归测试 — 写入校验 + Admin 警告（Step 7） — 预计 0.5 天

#### G1：write-validation.test.ts

**文件：** `sibylla-desktop/tests/regression/personal-space/write-validation.test.ts`（新建）

**测试用例（4 个）：**

| # | 场景 | 操作 | 期望结果 |
|---|------|------|---------|
| 1 | 日报保存到 self | `writeFile('personal/alice/reports/daily/2026-05-01.md')` | 成功 |
| 2 | 日报保存到 other | `writeFile('personal/bob/reports/daily/2026-05-01.md')` | 拒绝 |
| 3 | 决策日志保存到系统目录 | `writeFile('.sibylla/memory/decisions/2026-05-01-xxx.md')` | 成功 |
| 4 | 决策日志保存到 other personal/ | `writeFile('personal/bob/decisions/xxx.md')` | 拒绝 |

#### G2：admin-warning.test.ts

**文件：** `sibylla-desktop/tests/regression/personal-space/admin-warning.test.ts`（新建）

**事件发射测试（5 个）：**

| # | 场景 | 期望结果 |
|---|------|---------|
| 1 | Admin 读取 `personal/{other}/` 文件 → `admin.access-personal-space` 事件触发 | 事件触发 |
| 2 | 事件 payload 包含正确的 adminId、targetUser、timestamp | payload 正确 |
| 3 | 事件写入 EventLogStore | persist=true |
| 4 | Admin 读取 `personal/{self}/` → 不触发事件 | 无事件 |
| 5 | 普通用户读取 `personal/{other}/` → 拒绝（不触发事件） | 被拦截 |

**组件渲染测试（3 个）：**

| # | 场景 | 期望结果 |
|---|------|---------|
| 6 | 渲染正确文本 "您正在访问 alice 的个人空间（管理员模式）" | 文本匹配 |
| 7 | 关闭按钮点击后 sessionStorage 记录 dismissal | 记录存在 |
| 8 | 有 dismissal 记录时不显示 | 组件不渲染 |

**验证：** 写入校验 4 + 事件 5 + 组件 3 = 12 个测试全部通过。

**总计回归测试覆盖：** 8（基线）+ 3（AI Context）+ 2（Search）+ 2（周报）+ 3（Dashboard）+ 4（写入）+ 5（事件）+ 3（组件）= **30 个测试用例**。

---

## 五、验收标准追踪

### 需求 6.9 — 回归测试矩阵 — 普通用户（7 项）

| # | 操作 | 期望结果 | 测试文件 | 用例编号 |
|---|------|---------|---------|---------|
| 1 | 读 `personal/{self}/` | 允许 | baseline.test.ts | E2-#1 |
| 2 | 读 `personal/{other}/` | 拒绝 | baseline.test.ts | E2-#2 |
| 3 | 写 `personal/{self}/` | 允许 | baseline.test.ts | E2-#3 |
| 4 | 写 `personal/{other}/` | 拒绝 | baseline.test.ts | E2-#4 |
| 5 | AI Context 不包含 `personal/{other}/` | 不包含 | ai-context.test.ts | E3-#1 |
| 6 | Search 不返回 `personal/{other}/` | 不返回 | search.test.ts | F1-#1 |
| 7 | 团队周报不包含他人数据 | 匿名化 | team-report.test.ts | F2-#1 |

### 需求 6.9 — 回归测试矩阵 — 管理员（7 项）

| # | 操作 | 期望结果 | 测试文件 | 用例编号 |
|---|------|---------|---------|---------|
| 1 | 读 `personal/{self}/` | 允许 | baseline.test.ts | E2-#5 |
| 2 | 读 `personal/{other}/` | 允许 + 警告条 | baseline.test.ts + admin-warning.test.ts | E2-#6 + G2-#1 |
| 3 | 写 `personal/{self}/` | 允许 | baseline.test.ts | E2-#7 |
| 4 | 写 `personal/{other}/` | 拒绝 | baseline.test.ts | E2-#8 |
| 5 | AI Context 不包含 `personal/{other}/` | 不包含（即使 Admin） | ai-context.test.ts | E3-#2 |
| 6 | Search 返回 `personal/{other}/` | 返回 + 显式标记 | search.test.ts | F1-#2 |
| 7 | 团队周报包含他人数据 | 匿名化 | team-report.test.ts | F2-#2 |

### Admin 警告条 UI

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 显示"您正在访问 {otherUser} 的个人空间（管理员模式）" | B1 PersonalSpaceWarningBanner | G2-#6 |
| 2 | 浅黄色背景 + ShieldAlert 图标 | B1 PersonalSpaceWarningBanner | G2-#6 |
| 3 | 关闭按钮关闭后 sessionStorage 记录 | B1 PersonalSpaceWarningBanner | G2-#7 |
| 4 | 有 dismissal 记录时不显示 | B1 PersonalSpaceWarningBanner | G2-#8 |
| 5 | 可复用于文件查看、搜索结果、Dashboard | B1 独立组件 | — |

### admin.access-personal-space 事件

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | Admin 读取他人 personal/ 文件时触发 | C1 file.handler.ts | G2-#1 |
| 2 | Payload：`{ adminId, targetUser, timestamp }` | C1 file.handler.ts | G2-#2 |
| 3 | 事件写入 EventLogStore | C1 persist=true | G2-#3 |
| 4 | Admin 读取 self 不触发 | C1 条件判断 | G2-#4 |
| 5 | 普通用户被拦截不触发 | PersonalSpaceGuard | G2-#5 |
| 6 | Dashboard 数据涉及 personal/ 同样触发 | TASK013 已实现 | F3-#3 |

### Dashboard "管理员视图"提示

| # | 验收标准 | 实现位置 |
|---|---------|---------|
| 1 | Admin Dashboard 显示"管理员视图，包含个人空间数据" | B2 AdminDashboard.tsx |
| 2 | 提示不可关闭，与警告条样式区分 | B2 AdminDashboard.tsx |

### Sprint 6 新功能写入校验

| # | 验收标准 | 测试文件 |
|---|---------|---------|
| 1 | 日报保存路径 `personal/{self}/reports/` 校验 | G1 write-validation.test.ts #1,#2 |
| 2 | 决策日志保存路径校验 | G1 write-validation.test.ts #3,#4 |
| 3 | tasks.md 位于 workspace 根目录，不涉及 personal/ | 代码审查确认（无测试） |

### 性能要求

| 指标 | 目标 | 实现方式 |
|------|------|---------|
| PersonalSpaceGuard.check() | < 5ms | 已有，回归验证（E2 基线测试含时间断言） |
| Admin 警告条渲染 | 不影响页面加载 | 纯条件渲染，无异步依赖 |
| 事件发射 | 异步非阻塞 | `.catch(() => {})` + try/catch 包裹 |

---

## 六、风险与缓解

| 风险 | 影响 | 概率 | 缓解策略 |
|------|------|------|---------|
| `buildOperationContext()` 硬编码 `userRole: 'viewer'` | 高 — Admin 角色检测失效 | 已确认 | C2 修复角色解析；如 `AuthUserProvider` 无 `getUserRole()` 则从 WorkspaceManager 成员目录查询 |
| `FileHandler` 无 `eventBus` 引用 | 中 — 无法发射事件 | 已确认 | C4 追加 `setEventBus()` setter 注入 |
| `AuthUserProvider` 接口不含 `getUserRole()` | 中 — 角色解析受阻 | 中 | 检查接口定义，若无则扩展接口 + 实现 |
| 回归测试依赖 TASK010-013 产物 | 中 — 前置任务未完成时测试无法运行 | 低 | 测试使用 Mock 隔离依赖，不直接依赖 TASK 产物 |
| 测试目录 `tests/regression/` 不存在 | 低 — mkdir 即可 | 已确认 | E1 创建目录 |
| AdminDashboard `isAdmin` 硬编码 | 中 — 权限判断不准 | 已确认 | B2 改为从 store 获取真实角色 |
| PersonalSpaceGuard 内部函数不可复用 | 低 — 需重写路径提取 | 已确认 | A1 创建独立 `personal-path.ts` 工具函数 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 |
|----|------|--------|
| Day 1 上午 | A1 | `personal-path.ts` 工具函数 + 单元测试 |
| Day 1 下午 | B1 + B2 | `PersonalSpaceWarningBanner` 组件 + AdminDashboard 提示条 |
| Day 2 上午 | C1-C4 | `file.handler.ts` 事件发射 + 角色解析修复 + preload 扩展 |
| Day 2 下午 | D1 + E1-E3 | WorkspaceStudioPage 集成 + 基线测试 + AI Context 测试 |
| Day 3 上午 | F1-F3 | Search + 团队周报 + Dashboard 测试 |
| Day 3 下午 | G1-G2 | 写入校验测试 + Admin 警告测试 + 全量验证修复 |

---

## 八、涉及文件变更汇总

### 新建文件（10 个）

| 文件路径 | 说明 |
|---------|------|
| `src/main/utils/personal-path.ts` | personal/ 路径解析工具函数 |
| `src/renderer/components/common/PersonalSpaceWarningBanner.tsx` | Admin 警告条组件 |
| `tests/regression/personal-space/baseline.test.ts` | 基线回归测试（8 用例） |
| `tests/regression/personal-space/ai-context.test.ts` | AI Context 排除测试（3 用例） |
| `tests/regression/personal-space/search.test.ts` | 搜索过滤测试（2 用例） |
| `tests/regression/personal-space/team-report.test.ts` | 团队周报匿名化测试（2 用例） |
| `tests/regression/personal-space/dashboard.test.ts` | Dashboard 权限测试（3 用例） |
| `tests/regression/personal-space/write-validation.test.ts` | 写入路径校验测试（4 用例） |
| `tests/regression/personal-space/admin-warning.test.ts` | Admin 警告 + 事件测试（8 用例） |
| `src/main/utils/__tests__/personal-path.test.ts` | personal-path 工具函数测试 |

### 修改文件（5 个）

| 文件路径 | 变更内容 |
|---------|---------|
| `src/main/ipc/handlers/file.handler.ts` | 追加 `emitAdminAccessEventIfApplicable()` 私有方法 + 修复 `buildOperationContext()` 角色解析 + 追加 `setEventBus()` setter |
| `src/renderer/pages/WorkspaceStudioPage.tsx` | 集成 `PersonalSpaceWarningBanner` + 监听 IPC push 事件 |
| `src/renderer/components/dashboard/AdminDashboard.tsx` | 追加"管理员视图"提示条 + 修复 `isAdmin` 硬编码 |
| `src/shared/types.ts` | IPC_CHANNELS 追加 `ADMIN_ACCESS_PERSONAL_SPACE` |
| `src/preload/index.ts` | ALLOWED_CHANNELS 注册 + `onAccessPersonalSpace` 事件监听 API |

### 不修改的文件

| 文件路径 | 原因 |
|---------|------|
| `src/main/services/harness/guardrails/personal-space.ts` | 核心隔离逻辑不变，仅回归验证 |
| `src/main/services/presence/privacy-filter.ts` | 核心过滤逻辑不变，仅回归验证 |
| `src/main/services/file-manager.ts` | 写入校验已有，不改 |
| `src/main/services/event-bus-types.ts` | `admin.access-personal-space` 已定义，不需扩展 |
| `src/main/services/event-bus.ts` | emitEvent 接口不变 |
| `src/main/services/event-log-store.ts` | append 接口不变 |

### 新增依赖

无。本任务不引入新的 npm 依赖。

---

**文档版本**: v1.0
**最后更新**: 2026-05-01
**维护者**: Sibylla 架构团队

