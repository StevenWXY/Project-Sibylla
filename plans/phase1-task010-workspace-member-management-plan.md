# PHASE1-TASK010: Workspace 成员管理 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task010_workspace-member-management.md](../specs/tasks/phase1/phase1-task010_workspace-member-management.md)
> 创建日期：2026-04-17
> 最后更新：2026-04-17

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK010 |
| **任务标题** | Workspace 成员管理 |
| **优先级** | P1 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **前置依赖** | ✅ PHASE0-TASK006（认证服务）、✅ PHASE0-TASK004（云端服务框架）、✅ PHASE1-TASK001（文件树浏览器） |

### 目标

实现 Workspace 的成员管理功能，包括管理员邀请成员、角色权限分配、成员列表展示、成员移除等核心操作。这是团队协作的基础——让多个用户加入同一个 workspace 并享有不同级别的操作权限。

### 核心命题

CLAUDE.md "AI 建议，人类决策"与"安全红线"在成员管理中的直接体现——所有写入操作（邀请/角色变更/移除）必须经用户明确确认，权限检查在前端统一拦截。

### 范围边界

**包含：**
- 成员列表展示（从 IPC → 主进程 → 云端 API 获取）
- 邀请新成员对话框（邮箱输入 + 角色选择）
- 角色变更下拉菜单
- 成员移除确认对话框
- 成员头像显示
- 权限检查 Hook（`usePermission`）
- 成员相关 IPC 通道 + 主进程 handler + preload 扩展

**不包含：**
- 邀请链接/二维码 — Phase 2
- 成员分组/团队 — Phase 2
- 审批工作流 — Phase 2
- 邮件通知实现 — 依赖第三方服务，MVP 简化为界面通知

### 架构决策：IPC 优先而非直接 HTTP

> **任务 spec 与代码库实际模式的偏差：**
> 任务 spec 建议在渲染进程创建 `WorkspaceApiClient` 直接调用云端 API，但实际代码库遵循严格的进程隔离模式：渲染进程 **永远不** 直接持有 JWT Token，所有云端 API 调用通过 IPC 转发到主进程执行。
>
> **本计划采用方案：** 渲染进程通过 `window.electronAPI.workspace.xxx()` IPC → 主进程 `WorkspaceHandler` → 主进程 `AuthClient`/`fetch` → 云端 API。与现有 `auth.login()`、`sync.force()` 模式一致。

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TypeScript 严格模式禁止 any；主进程与渲染进程严格隔离；注释英文/commit 中文；所有异步操作必须有错误处理；个人空间内容不得出现在其他成员的 AI 上下文中 |
| 系统架构 | `specs/design/architecture.md` | 渲染进程禁止直接访问文件系统或持有 Token；IPC 通信严格隔离 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` | 顶栏 48px、底栏 32px；主色 Indigo-500；危险操作需二次确认；模态框最大宽度 560px |
| 数据模型与 API | `specs/design/data-and-api.md` | 成员管理 API 路径；`members.json` 格式；`WorkspaceMember` 数据库模型 |
| 需求规格 | `specs/requirements/phase1/sprint2-git-sync.md` | 需求 2.6 六条验收标准：成员列表、邀请对话框、角色变更、成员移除 |
| 任务规格 | `specs/tasks/phase1/phase1-task010_workspace-member-management.md` | 6 个子任务、6 条功能验收标准、4 类测试用例、7 步实施计划 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `zustand-state-management` | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | `membersStore` 设计：State/Actions 分离接口、devtools 中间件、selector 精确订阅、`getPermissions()` 派生状态 |
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | 新增成员管理 IPC 通道（invoke/handle 模式）；preload API 扩展；类型安全 IPCChannelMap 扩展 |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | `MemberRole` 联合类型、`PermissionCheck` 接口严格约束、store 类型定义、组件 props 类型 |
| `vercel-react-best-practices` | `.kilocode/skills/common/vercel-react-best-practices/SKILL.md` | 成员列表组件 memo 化避免不必要重渲染；useCallback 稳定引用；权限检查避免全局重渲染 |

### 2.3 前置代码依赖

| 模块 | 路径 | 行数 | 状态 | 说明 |
|------|------|------|------|------|
| WorkspaceMember 类型 | `sibylla-desktop/src/main/services/types/workspace.types.ts:27-45` | 223 | ✅ 已完成 | `WorkspaceMember`（id/name/email/role/avatar/joinedAt）、`WorkspaceInvite`、`MembersConfig` — **仅在 main 进程可用，需共享到 shared** |
| MembersConfig 持久化 | `sibylla-desktop/src/main/services/workspace-manager.ts:101-103` | 922 | ✅ 已完成 | `writeMembersConfig()` 写入 `.sibylla/members.json` |
| WorkspaceHandler | `sibylla-desktop/src/main/ipc/handlers/workspace.handler.ts` | 353 | ⚠️ 需扩展 | 已注册 workspace CRUD 通道，需扩展成员管理 IPC handler |
| AuthClient | `sibylla-desktop/src/main/services/auth-client.ts` | — | ✅ 已完成 | 主进程 HTTP 客户端，可复用其 `post<T>()` / `get<T>()` 模式 |
| TokenStorage | `sibylla-desktop/src/main/services/token-storage.ts` | — | ✅ 已完成 | `getAccessToken()` / `getRefreshToken()` — 主进程 Token 访问 |
| 共享类型 | `sibylla-desktop/src/shared/types.ts` | 936 | ⚠️ 需扩展 | `IPC_CHANNELS` 新增成员管理通道；`IPCChannelMap` 扩展 |
| Preload API | `sibylla-desktop/src/preload/index.ts` | 569 | ⚠️ 需扩展 | `workspace` 命名空间需新增成员管理 API 方法 |
| appStore | `sibylla-desktop/src/renderer/store/appStore.ts` | 325 | ✅ 已完成 | `currentWorkspace: WorkspaceInfo | null` — 获取 workspaceId；`currentUser: AuthUser | null` — 获取 currentUserId |
| Modal 组件 | `sibylla-desktop/src/renderer/components/ui/Modal.tsx` | 108 | ✅ 已完成 | Headless UI Dialog + Transition，`isOpen`/`onClose`/`title`/`size` props |
| Badge 组件 | `sibylla-desktop/src/renderer/components/ui/Badge.tsx` | 65 | ✅ 已完成 | `variant`（default/primary/success/warning/danger/info）+ `size` + `dot` props |
| Select 组件 | `sibylla-desktop/src/renderer/components/ui/Select.tsx` | 126 | ✅ 已完成 | Headless UI Listbox，`value`/`onChange`/`options` props |
| Input 组件 | `sibylla-desktop/src/renderer/components/ui/Input.tsx` | — | ✅ 已完成 | 表单输入框 |
| Button 组件 | `sibylla-desktop/src/renderer/components/ui/Button.tsx` | — | ✅ 已完成 | 按钮组件 |
| 测试 setup | `tests/renderer/setup.ts` | 85 | ⚠️ 需扩展 | `mockElectronAPI.workspace` 需新增成员管理 mock |
| Header 组件 | `sibylla-desktop/src/renderer/components/layout/Header.tsx` | — | ⚠️ 需扩展 | 需新增"工作区设置"入口菜单项 |

### 2.4 被依赖任务

| 任务 | 依赖方式 |
|------|---------|
| 所有需要权限检查的功能 | 复用 `usePermission` Hook 控制编辑/创建/删除/管理按钮的显隐 |
| 文件树权限过滤 | Viewer 角色下隐藏新建/删除按钮 |
| AI 对话权限 | Viewer 角色下隐藏"应用到文件"按钮 |
| 评论系统 | 所有角色均可评论，依赖 `canComment` 权限 |

### 2.5 npm 依赖

无需新增 npm 包。所有核心依赖已安装：
- `lucide-react` ^0.577.0 — 图标（UserPlus, Shield, Crown, Eye, MoreHorizontal, Mail, X 等）
- `zustand` ^5.0.11 — 状态管理
- `@headlessui/react` — Modal、Select、Listbox 组件
- `clsx` + `tailwind-merge` — 样式工具
- `@testing-library/react` + `vitest` — 测试框架

---

## 三、现有代码盘点与差距分析

### 3.1 成员管理数据流现状

> **关键发现：** 成员管理功能完全不存在。后端（sibylla-cloud）已实现成员 CRUD API 和数据库模型，主进程（sibylla-desktop/main）有类型定义和本地持久化，但渲染进程与主进程之间没有成员管理的 IPC 通道，也没有任何 UI 组件。

**现有数据流（仅创建 workspace 时）：**

```
CreateWorkspaceWizard → IPC workspace:create → WorkspaceManager.createWorkspace()
  → generateMembersConfig(owner) → writeMembersConfig() → .sibylla/members.json
  （仅初始化，后续无读写）
```

**目标数据流：**

```
渲染进程:
  MemberList → useMembersStore.loadMembers() → IPC workspace:getMembers
  InviteMemberDialog → useMembersStore.inviteMember() → IPC workspace:inviteMember
  MemberRoleSelect → useMembersStore.updateRole() → IPC workspace:updateMemberRole
  RemoveMemberDialog → useMembersStore.removeMember() → IPC workspace:removeMember

主进程:
  WorkspaceHandler → AuthClient HTTP → sibylla-cloud API
    GET /api/v1/workspaces/:id/members
    POST /api/v1/workspaces/:id/members/invite
    PUT /api/v1/workspaces/:id/members/:uid
    DELETE /api/v1/workspaces/:id/members/:uid
  → 成功后同步更新 .sibylla/members.json 本地缓存
  → IPC 返回结果给渲染进程

渲染进程:
  usePermission Hook ← useMembersStore.getPermissions() ← 角色判断
```

### 3.2 差距矩阵

| 能力 | 现有 | 缺口 | 本任务产出 |
|------|------|------|-----------|
| WorkspaceMember 类型 | ✅ main 进程内定义 | 不在 shared/types.ts | 新增 shared 类型导出 |
| 云端成员 API | ✅ sibylla-cloud 已实现 | — | — |
| 本地 members.json 读写 | ✅ WorkspaceManager 可读写 | 无成员 CRUD IPC | IPC 通道 + handler |
| 成员管理 IPC 通道 | ❌ 无 | 完全缺失 | 4 个 IPC 通道 |
| 主进程→云端 HTTP 调用 | ⚠️ AuthClient 仅支持 auth 路径 | 需扩展或新建 workspace API client | 扩展 WorkspaceHandler |
| Preload 成员 API | ❌ 无 | 完全缺失 | 4 个 preload 方法 |
| 成员 Zustand store | ❌ 无 | 完全缺失 | `membersStore` |
| 成员列表 UI | ❌ 无 | 完全缺失 | `MemberList` 组件 |
| 邀请对话框 UI | ❌ 无 | 完全缺失 | `InviteMemberDialog` 组件 |
| 角色变更 UI | ❌ 无 | 完全缺失 | `MemberRoleSelect` 组件 |
| 移除确认 UI | ❌ 无 | 完全缺失 | `RemoveMemberDialog` 组件 |
| 权限检查 Hook | ❌ 无 | 完全缺失 | `usePermission` Hook |
| 设置页面入口 | ❌ Header 无"工作区设置" | 无入口 | Header 新增菜单项 |
| 成员管理测试 | ❌ 无 | 完全缺失 | Store + 组件 + Hook 测试 |

### 3.3 需新建的文件

| # | 文件路径 | 类型 | 说明 |
|---|---------|------|------|
| 1 | `sibylla-desktop/src/shared/types/member.types.ts` | 新增 | 共享成员类型（MemberRole / WorkspaceMember / InviteRequest / InviteResult / PermissionCheck） |
| 2 | `sibylla-desktop/src/renderer/store/membersStore.ts` | 新增 | 成员状态 Zustand store |
| 3 | `sibylla-desktop/src/renderer/hooks/usePermission.ts` | 新增 | 权限检查 Hook |
| 4 | `sibylla-desktop/src/renderer/components/settings/WorkspaceSettings.tsx` | 新增 | 工作区设置页面（Modal 容器） |
| 5 | `sibylla-desktop/src/renderer/components/settings/MemberList.tsx` | 新增 | 成员列表组件 |
| 6 | `sibylla-desktop/src/renderer/components/settings/InviteMemberDialog.tsx` | 新增 | 邀请成员对话框 |
| 7 | `sibylla-desktop/src/renderer/components/settings/MemberRoleSelect.tsx` | 新增 | 角色选择/变更组件 |
| 8 | `sibylla-desktop/src/renderer/components/settings/RemoveMemberDialog.tsx` | 新增 | 移除成员确认对话框 |
| 9 | `sibylla-desktop/src/renderer/components/settings/index.ts` | 新增 | 模块导出 |
| 10 | `tests/renderer/membersStore.test.ts` | 新增 | Store 单元测试 |
| 11 | `tests/renderer/MemberList.test.tsx` | 新增 | 成员列表组件测试 |
| 12 | `tests/renderer/InviteMemberDialog.test.tsx` | 新增 | 邀请对话框测试 |
| 13 | `tests/renderer/usePermission.test.ts` | 新增 | 权限 Hook 测试 |

### 3.4 需修改的文件

| # | 文件路径 | 修改内容 | 风险 |
|---|---------|---------|------|
| 1 | `sibylla-desktop/src/shared/types.ts` | `IPC_CHANNELS` 新增 4 个成员管理通道；`IPCChannelMap` 扩展；新增成员相关 payload 类型 | 低 — 纯新增 |
| 2 | `sibylla-desktop/src/main/ipc/handlers/workspace.handler.ts` | 新增 4 个成员管理 handler；注入 TokenStorage 依赖；实现 HTTP 调用转发到云端 | 中 — 扩展现有 handler |
| 3 | `sibylla-desktop/src/preload/index.ts` | `workspace` 命名空间新增 4 个成员管理 API；更新白名单 | 中 — 修改 preload 桥接 |
| 4 | `sibylla-desktop/src/renderer/components/layout/Header.tsx` | workspace 下拉菜单新增"工作区设置"菜单项 | 低 — 新增菜单项 |
| 5 | `sibylla-desktop/src/renderer/dev/mockElectronAPI.ts` | workspace mock 新增 4 个成员管理方法 | 低 — 纯新增 |
| 6 | `tests/renderer/setup.ts` | workspace mock 新增成员管理方法 | 低 — 纯新增 |

### 3.5 不修改的文件

| 文件 | 原因 |
|------|------|
| `sibylla-desktop/src/main/services/types/workspace.types.ts` | WorkspaceMember 类型保持原位，shared 层独立定义以避免循环依赖 |
| `sibylla-desktop/src/main/services/workspace-manager.ts` | 仅在初始化时写入 members.json，运行时通过云端 API 管理 |
| `sibylla-cloud/**` | 云端 API 已实现，不需要修改 |

---

## 四、类型系统设计

### 4.1 共享成员类型（member.types.ts 新增）

**文件：** `sibylla-desktop/src/shared/types/member.types.ts`

独立于 `workspace.types.ts`（主进程内部类型），供渲染进程和主进程共同使用。

```typescript
/** Member role in workspace */
export type MemberRole = 'admin' | 'editor' | 'viewer'

/** Workspace member (shared between main and renderer) */
export interface WorkspaceMember {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: MemberRole
  readonly avatarUrl?: string
  readonly joinedAt: string
}

/** Invite request payload */
export interface InviteRequest {
  readonly email: string
  readonly role: MemberRole
}

/** Invite result */
export interface InviteResult {
  readonly success: boolean
  readonly error?: string
}

/** Permission check result — derived from current user's role */
export interface PermissionCheck {
  readonly canEdit: boolean
  readonly canCreate: boolean
  readonly canDelete: boolean
  readonly canComment: boolean
  readonly canManageMembers: boolean
  readonly canManageSettings: boolean
}
```

**设计决策：**
- 与 `workspace.types.ts` 的 `WorkspaceMember`（`avatar` 字段）不同，共享版本使用 `avatarUrl`，与云端 API 响应格式一致
- `PermissionCheck` 所有字段 `readonly`，由 `getPermissions()` 函数派生，不可外部修改
- `InviteResult` 包含 `success` + 可选 `error`，允许 UI 区分成功/失败并显示原因

### 4.2 IPC 通道扩展（shared/types.ts 扩展）

#### 新增 IPC 通道常量

```typescript
// 在 IPC_CHANNELS 对象中新增：
WORKSPACE_GET_MEMBERS: 'workspace:getMembers',
WORKSPACE_INVITE_MEMBER: 'workspace:inviteMember',
WORKSPACE_UPDATE_MEMBER_ROLE: 'workspace:updateMemberRole',
WORKSPACE_REMOVE_MEMBER: 'workspace:removeMember',
```

#### IPCChannelMap 扩展

```typescript
[IPC_CHANNELS.WORKSPACE_GET_MEMBERS]: {
  params: [workspaceId: string]
  return: WorkspaceMember[]
}
[IPC_CHANNELS.WORKSPACE_INVITE_MEMBER]: {
  params: [workspaceId: string, request: InviteRequest]
  return: InviteResult
}
[IPC_CHANNELS.WORKSPACE_UPDATE_MEMBER_ROLE]: {
  params: [workspaceId: string, userId: string, role: MemberRole]
  return: void
}
[IPC_CHANNELS.WORKSPACE_REMOVE_MEMBER]: {
  params: [workspaceId: string, userId: string]
  return: void
}
```

**设计决策：**
- 所有成员管理 IPC 使用 `invoke/handle` 模式（需要等待云端 API 响应）
- 不使用 `send/on` 单向模式（成员操作需要确认结果）
- 错误通过 `IPCResponse<T>` 的 `success` 字段传递，与现有 IPC 错误处理模式一致

### 4.3 角色权限映射常量

```typescript
/** Role to permissions mapping — single source of truth */
const ROLE_PERMISSIONS: Record<MemberRole, PermissionCheck> = {
  admin: {
    canEdit: true,
    canCreate: true,
    canDelete: true,
    canComment: true,
    canManageMembers: true,
    canManageSettings: true,
  },
  editor: {
    canEdit: true,
    canCreate: true,
    canDelete: true,
    canComment: true,
    canManageMembers: false,
    canManageSettings: false,
  },
  viewer: {
    canEdit: false,
    canCreate: false,
    canDelete: false,
    canComment: true,
    canManageMembers: false,
    canManageSettings: false,
  },
}
```

**设计决策：** 权限映射为模块级常量而非函数计算，确保运行时不可篡改。与任务 spec 的角色权限表完全一致。

---

## 五、membersStore 设计

### 5.1 设计原则

1. **遵循项目 store 模式** — State/Actions 分离接口 + devtools 中间件 + 导出 selectors
2. **IPC 调用在 store 内完成** — 与 `conflictStore` 调用 `window.electronAPI.git.resolve()` 模式一致
3. **乐观更新** — `updateRole` 和 `removeMember` 在 IPC 成功后立即更新本地 state，无需重新加载
4. **不使用 persist** — 成员数据从云端获取，不持久化到 localStorage

### 5.2 Store 接口

```typescript
interface MembersState {
  readonly members: readonly WorkspaceMember[]
  readonly isLoading: boolean
  readonly error: string | null
}

interface MembersActions {
  loadMembers: (workspaceId: string) => Promise<void>
  inviteMember: (workspaceId: string, email: string, role: MemberRole) => Promise<InviteResult>
  updateRole: (workspaceId: string, userId: string, role: MemberRole) => Promise<void>
  removeMember: (workspaceId: string, userId: string) => Promise<void>
  getPermissions: () => PermissionCheck
  isAdmin: () => boolean
  reset: () => void
}

type MembersStore = MembersState & MembersActions
```

### 5.3 Action 行为规格

| Action | 调用 | 成功行为 | 失败行为 |
|--------|------|---------|---------|
| `loadMembers` | `window.electronAPI.workspace.getMembers(wsId)` | `set({ members: data, isLoading: false })` | `set({ error: msg, isLoading: false })` |
| `inviteMember` | `window.electronAPI.workspace.inviteMember(wsId, { email, role })` | 重新 `loadMembers` + 返回 `{ success: true }` | 返回 `{ success: false, error }` |
| `updateRole` | `window.electronAPI.workspace.updateMemberRole(wsId, uid, role)` | 乐观更新 `members.map(m => m.id === uid ? {...m, role} : m)` | `throw Error` |
| `removeMember` | `window.electronAPI.workspace.removeMember(wsId, uid)` | 乐观更新 `members.filter(m => m.id !== uid)` | `throw Error` |
| `getPermissions` | `useAppStore.getState().currentUser` 同步读取 | 查找当前用户角色 → `ROLE_PERMISSIONS[role]` | 未登录返回 viewer 权限 |
| `isAdmin` | 同上 | `member.role === 'admin'` | 返回 `false` |
| `reset` | — | `set(initialState)` | — |

### 5.4 设计决策

**`currentUserId` 不存 store，从 appStore 跨 store 读取：**
- `currentUser: AuthUser | null` 已在 `appStore` 中管理，避免数据冗余
- `getPermissions()` 和 `isAdmin()` 通过 `useAppStore.getState()` 获取当前用户
- 这是 Zustand 跨 store 通信的推荐模式（同步读取，不触发订阅）

**`members` 使用 `readonly WorkspaceMember[]`：**
- 数组元素 `readonly` 防止意外修改成员对象
- `updateRole` 使用 `map` 生成新数组（不可变更新）
- `removeMember` 使用 `filter` 生成新数组

**错误处理策略：**
- `loadMembers`：错误存入 state.error，UI 可展示
- `updateRole` / `removeMember`：抛出异常，由调用方（组件）捕获并展示 toast/通知
- `inviteMember`：返回 `InviteResult`，由对话框组件处理展示

---

## 六、IPC 通道与 Preload 扩展

### 6.1 新增 IPC 通道总览

| 通道 | 方向 | 模式 | 参数 | 返回值 | 说明 |
|------|------|------|------|--------|------|
| `workspace:getMembers` | Renderer → Main | invoke/handle | `(workspaceId: string)` | `IPCResponse<WorkspaceMember[]>` | 获取成员列表 |
| `workspace:inviteMember` | Renderer → Main | invoke/handle | `(workspaceId: string, request: InviteRequest)` | `IPCResponse<InviteResult>` | 邀请成员 |
| `workspace:updateMemberRole` | Renderer → Main | invoke/handle | `(workspaceId: string, userId: string, role: MemberRole)` | `IPCResponse<void>` | 更新角色 |
| `workspace:removeMember` | Renderer → Main | invoke/handle | `(workspaceId: string, userId: string)` | `IPCResponse<void>` | 移除成员 |

**模式选择依据：** 全部使用 `invoke/handle` 双向模式——成员操作需要等待云端 API 响应确认成功/失败。

### 6.2 WorkspaceHandler 扩展要点

在现有 `workspace.handler.ts` 中新增：

- **注入依赖：** 构造函数新增 `TokenStorage` 参数；新增 `cloudBaseUrl`（环境变量 `CLOUD_API_URL`，默认 `http://localhost:3000`）
- **注册 4 个 handler：** 每个使用 `safeHandle` 包装 + `TokenStorage.getAccessToken()` 获取 JWT + `fetch()` 调用云端 API
- **API 路径映射：**
  - `workspace:getMembers` → `GET /api/v1/workspaces/:id/members`
  - `workspace:inviteMember` → `POST /api/v1/workspaces/:id/members/invite`
  - `workspace:updateMemberRole` → `PUT /api/v1/workspaces/:id/members/:uid`
  - `workspace:removeMember` → `DELETE /api/v1/workspaces/:id/members/:uid`
- **邀请接口特殊处理：** HTTP 非 200 时解析 error body 并包装为 `InviteResult { success: false, error }`

**主进程入口更新：** `WorkspaceHandler` 初始化时传入 `tokenStorage` 实例。

### 6.3 Preload API 扩展

在 `ElectronAPI.workspace` 命名空间中新增：

```typescript
interface ElectronAPI {
  workspace: {
    // ... 现有方法保持不变

    getMembers: (workspaceId: string) => Promise<IPCResponse<WorkspaceMember[]>>
    inviteMember: (workspaceId: string, request: InviteRequest) => Promise<IPCResponse<InviteResult>>
    updateMemberRole: (workspaceId: string, userId: string, role: MemberRole) => Promise<IPCResponse<void>>
    removeMember: (workspaceId: string, userId: string) => Promise<IPCResponse<void>>
  }
}
```

实现：

```typescript
// workspace 对象内新增
getMembers: (workspaceId: string) =>
  safeInvoke<WorkspaceMember[]>(IPC_CHANNELS.WORKSPACE_GET_MEMBERS, workspaceId),

inviteMember: (workspaceId: string, request: InviteRequest) =>
  safeInvoke<InviteResult>(IPC_CHANNELS.WORKSPACE_INVITE_MEMBER, workspaceId, request),

updateMemberRole: (workspaceId: string, userId: string, role: MemberRole) =>
  safeInvoke<void>(IPC_CHANNELS.WORKSPACE_UPDATE_MEMBER_ROLE, workspaceId, userId, role),

removeMember: (workspaceId: string, userId: string) =>
  safeInvoke<void>(IPC_CHANNELS.WORKSPACE_REMOVE_MEMBER, workspaceId, userId),
```

### 6.4 白名单更新

在 `preload/index.ts` 的 channel 白名单中新增：

```typescript
IPC_CHANNELS.WORKSPACE_GET_MEMBERS,
IPC_CHANNELS.WORKSPACE_INVITE_MEMBER,
IPC_CHANNELS.WORKSPACE_UPDATE_MEMBER_ROLE,
IPC_CHANNELS.WORKSPACE_REMOVE_MEMBER,
```

---

## 七、组件设计

### 7.1 WorkspaceSettings — 设置页面容器

**文件：** `sibylla-desktop/src/renderer/components/settings/WorkspaceSettings.tsx`

**Props：** `{ isOpen: boolean; onClose: () => void }`

**行为：** 复用 `Modal` 组件（`size="lg"`），内含 Tab 切换（"成员管理" / "基本信息"）。`activeTab === 'members'` 时渲染 `<MemberList />`，"基本信息"为 placeholder。

**设计决策：** 与 `CreateWorkspaceWizard` 一致，使用 Headless UI Dialog + Transition。`size="lg"` 对应 `max-w-lg`。

### 7.2 MemberList — 成员列表

**文件：** `sibylla-desktop/src/renderer/components/settings/MemberList.tsx`

**数据源：** `useMembersStore`（selectors: `selectMembers`, `selectIsLoading`）+ `useAppStore`（`currentWorkspace`, `currentUser`）

**行为规格：**
- `useEffect` 在 `currentWorkspace.id` 变化时调用 `loadMembers`
- Admin 视角：显示"邀请成员"按钮（`UserPlus` 图标）+ 每行成员操作菜单（`MoreHorizontal`）
- 非 Admin 视角：仅显示成员列表 + 角色标签
- 当前用户行不显示操作菜单（`member.id !== currentUser?.id`）
- 每行布局：`Avatar` + name/email + `RoleBadge` + `MemberActions`（Admin only）
- Loading 状态："加载中..."占位
- 弹窗管理：`showInvite` 状态 → `InviteMemberDialog`；`removeTarget` 状态 → `RemoveMemberDialog`

### 7.3 InviteMemberDialog — 邀请对话框

**文件：** `sibylla-desktop/src/renderer/components/settings/InviteMemberDialog.tsx`

**Props：** `{ workspaceId: string; onClose: () => void }`

**行为规格：**
- 邮箱输入：复用 `Input` 组件，提交时验证格式（`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`）
- 角色选择：复用 `Select` 组件，选项为 `editor`（"编辑者"）/ `viewer`（"查看者"），不含 `admin`
- 提交流程：`useMembersStore.getState().inviteMember()` → 成功显示"邀请已发送！"+ 1.5s 后关闭 → 失败显示错误
- 提交中按钮 `disabled` + 文字切换为"发送中..."
- 复用 `Modal`（`size="md"`）

### 7.4 MemberRoleSelect — 角色变更

**文件：** `sibylla-desktop/src/renderer/components/settings/MemberRoleSelect.tsx`

**Props：** `{ member: WorkspaceMember; onRoleChange: (role) => void; onRemove: () => void }`

**行为规格：** `MoreHorizontal` 按钮触发下拉菜单，包含"设为管理员/编辑者/查看者"三个角色选项 + 分隔线 + "移除成员"（红色文字）。角色变更时忽略当前角色（`newRole === member.role` 时 return）。变更中 `disabled` 防重复操作。

### 7.5 RemoveMemberDialog — 移除确认

**文件：** `sibylla-desktop/src/renderer/components/settings/RemoveMemberDialog.tsx`

**Props：** `{ member: WorkspaceMember; workspaceId: string; onClose: () => void }`

**行为规格：** 显示成员名称和邮箱，确认提示"移除后该成员将无法访问此工作区"。"确认移除"按钮红色（`bg-red-500`），点击后调用 `membersStore.removeMember()`。成功后 `onClose()`，失败显示错误。复用 `Modal`（`size="sm"`）。

### 7.6 辅助组件

**RoleBadge：** 基于 `Badge` 的角色标签。映射：`admin` → `primary`/管理员，`editor` → `info`/编辑者，`viewer` → `default`/查看者。

**Avatar：** 头像组件。有 `url` 时显示 `<img>`；无 `url` 时显示首字母圆形背景（`bg-indigo-500/20 text-indigo-300`）。

### 7.7 usePermission Hook

**文件：** `sibylla-desktop/src/renderer/hooks/usePermission.ts`

```typescript
export function usePermission(): PermissionCheck {
  const getPermissions = useMembersStore((s) => s.getPermissions)
  return getPermissions()
}
```

**使用方式：** `const perm = usePermission()` → `perm.canEdit` / `perm.canCreate` / `perm.canDelete` / `perm.canManageMembers` 控制按钮显隐。

---

## 八、分步实施计划

> 共 7 步，每步产出可独立验证的增量。Step 1-3 为基础设施（类型+IPC+Store），Step 4-5 为 UI 组件，Step 6 为集成，Step 7 为测试。

### Step 1：共享类型 + IPC 通道注册（预估 1.5h）

**产出：** 类型文件、IPC 通道常量扩展

**实施内容：**

1. 创建 `sibylla-desktop/src/shared/types/member.types.ts`：
   - `MemberRole` 联合类型
   - `WorkspaceMember` 接口
   - `InviteRequest` / `InviteResult` 接口
   - `PermissionCheck` 接口
   - `ROLE_PERMISSIONS` 常量

2. 扩展 `sibylla-desktop/src/shared/types.ts`：
   - `IPC_CHANNELS` 新增 4 个成员管理通道
   - `IPCChannelMap` 新增 4 个映射
   - 新增 `member.types.ts` 的 re-export

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] `npm run lint` 通过

### Step 2：主进程 WorkspaceHandler 扩展（预估 2h）

**产出：** IPC handler + 云端 API 调用

**实施内容：**

1. 扩展 `sibylla-desktop/src/main/ipc/handlers/workspace.handler.ts`：
   - 注入 `TokenStorage` 依赖
   - 注册 4 个 `ipcMain.handle` 成员管理 handler
   - 实现云端 API HTTP 调用（复用 `fetch` + Bearer Token 模式）

2. 在主进程入口更新 `WorkspaceHandler` 初始化：
   - 传入 `tokenStorage` 依赖

**验证标准：**
- [ ] 从渲染进程 DevTools 调用 `window.electronAPI.workspace.getMembers('ws-id')` → 主进程日志显示收到请求
- [ ] `npm run type-check` 通过

### Step 3：Preload API + Mock 扩展（预估 1.5h）

**产出：** Preload 桥接 + Mock + 测试 setup

**实施内容：**

1. 扩展 `sibylla-desktop/src/preload/index.ts`：
   - `workspace` 命名空间新增 4 个成员管理方法
   - 更新白名单
   - 更新 `ElectronAPI` 类型定义

2. 扩展 `sibylla-desktop/src/renderer/dev/mockElectronAPI.ts`：
   - `workspace.getMembers` mock（返回示例成员列表）
   - `workspace.inviteMember` mock
   - `workspace.updateMemberRole` mock
   - `workspace.removeMember` mock

3. 扩展 `tests/renderer/setup.ts`：
   - workspace mock 新增 4 个成员管理 `vi.fn()`

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] Dev 环境可调用 `window.electronAPI.workspace.getMembers()`

### Step 4：membersStore + usePermission Hook（预估 2h）

**产出：** 状态管理 + 权限检查

**实施内容：**

1. 创建 `sibylla-desktop/src/renderer/store/membersStore.ts`：
   - `MembersState` / `MembersActions` / `MembersStore` 接口
   - `initialState` 常量
   - `loadMembers` / `inviteMember` / `updateRole` / `removeMember` actions
   - `getPermissions` / `isAdmin` 派生方法
   - `reset` action
   - 导出 selectors

2. 创建 `sibylla-desktop/src/renderer/hooks/usePermission.ts`：
   - 封装 `useMembersStore` 的 `getPermissions()`

**验证标准：**
- [ ] `npm run type-check` 通过
- [ ] DevTools 可查看 MembersStore 状态
- [ ] `usePermission()` 根据角色返回正确权限

### Step 5：UI 组件实现（预估 3h）

**产出：** 完整成员管理 UI 组件

**实施内容：**

1. 创建 `sibylla-desktop/src/renderer/components/settings/` 目录

2. 创建 `WorkspaceSettings.tsx`：
   - Modal 容器 + Tab 切换
   - 复用 `Modal` 组件

3. 创建 `MemberList.tsx`：
   - 成员列表渲染 + Loading 状态
   - 邀请按钮（Admin only）
   - 角色标签 + 操作菜单

4. 创建 `InviteMemberDialog.tsx`：
   - 邮箱输入 + 验证
   - 角色选择
   - 提交 + 成功/失败反馈

5. 创建 `MemberRoleSelect.tsx`（内含 MemberActions）：
   - 角色变更下拉菜单
   - 移除按钮

6. 创建 `RemoveMemberDialog.tsx`：
   - 二次确认对话框
   - 移除中 loading 状态

7. 创建 `index.ts` 模块导出

**验证标准：**
- [ ] Admin 视角看到邀请按钮和操作菜单
- [ ] 非 Admin 视角不显示操作按钮
- [ ] 邮箱验证正确反馈
- [ ] 角色标签颜色区分
- [ ] 暗色模式下正确显示

### Step 6：Header 入口集成（预估 1h）

**产出：** 工作区设置入口

**实施内容：**

1. 修改 `sibylla-desktop/src/renderer/components/layout/Header.tsx`：
   - workspace 下拉菜单新增"工作区设置"菜单项
   - 点击打开 `WorkspaceSettings` Modal

2. 在 App 层或 Header 中管理 `showSettings` 状态：
   - 复用 `appStore.showSettings` 状态

**验证标准：**
- [ ] 顶栏 workspace 下拉可点击"工作区设置"
- [ ] 点击后打开设置 Modal
- [ ] `npm run type-check` 通过

### Step 7：测试编写（预估 3h）

**产出：** 完整测试套件

**实施内容：**

1. 创建 `tests/renderer/membersStore.test.ts`：
   - `loadMembers` 正确更新 state
   - `inviteMember` 成功后重新加载列表
   - `updateRole` 乐观更新
   - `removeMember` 从列表移除
   - `getPermissions` 根据角色返回正确权限
   - `isAdmin` 判断正确
   - `reset` 清空状态
   - 错误处理

2. 创建 `tests/renderer/MemberList.test.tsx`：
   - Admin 视角显示邀请按钮和操作菜单
   - 非 Admin 视角不显示操作按钮
   - 当前用户不可操作自己
   - Loading 状态渲染
   - 空成员列表渲染

3. 创建 `tests/renderer/InviteMemberDialog.test.tsx`：
   - 邮箱格式验证
   - 提交成功后显示成功消息
   - 提交失败后显示错误
   - 角色选择正确传递

4. 创建 `tests/renderer/usePermission.test.ts`：
   - admin 返回全部 true
   - editor 返回正确的权限组合
   - viewer 返回正确的权限组合
   - 未登录返回 viewer 权限

**验证标准：**
- [ ] 新增测试覆盖率 ≥ 60%
- [ ] `npm run lint` 无警告
- [ ] `npm run type-check` 无错误
- [ ] 现有测试全部通过（无回归）

---

## 九、验收标准与交付物

### 9.1 功能验收清单

| # | 验收项 | 需求来源 | 对应 Step | 验证方式 |
|---|--------|---------|----------|---------|
| 1 | Admin 打开工作区设置可看到成员列表 | 需求 2.6 AC1 | Step 5-6 | 手动验证 |
| 2 | 点击"邀请成员"弹出邀请对话框，可输入邮箱 | 需求 2.6 AC2 | Step 5 | 手动验证 |
| 3 | 邀请发送后创建邀请记录（依赖云端 API） | 需求 2.6 AC3 | Step 2-5 | Mock 测试 |
| 4 | Admin 可修改成员角色，立即生效 | 需求 2.6 AC5 | Step 4-5 | 单元测试 + 手动 |
| 5 | Admin 可移除成员，有二次确认 | 需求 2.6 AC6 | Step 5 | 手动验证 |
| 6 | 非管理员看不到管理按钮 | 补充 | Step 5 | 单元测试 |
| 7 | 角色标签颜色区分（Admin=primary, Editor=info, Viewer=default） | 补充 | Step 5 | 手动验证 |
| 8 | 邮箱格式验证实时反馈 | 补充 | Step 5 | 单元测试 |
| 9 | 权限检查在前端正确生效 | 补充 | Step 4 | 单元测试 |

### 9.2 性能指标

| # | 指标 | 目标 | 验证方式 |
|---|------|------|---------|
| 1 | 成员列表加载 | < 2 秒 | 手动验证 |
| 2 | 邀请发送 | < 3 秒 | 手动验证 |
| 3 | 角色变更 UI 更新 | < 500ms | React DevTools Profiler |

### 9.3 代码质量验收

| # | 验收项 | 验证方式 |
|---|--------|---------|
| 1 | TypeScript strict mode 无错误 | `npm run type-check` |
| 2 | ESLint 检查通过 | `npm run lint` |
| 3 | 所有公共函数有 JSDoc 注释 | 代码审查 |
| 4 | 新增代码测试覆盖率 ≥ 60% | Vitest 覆盖率 |
| 5 | 现有测试全部通过 | `npm run test` |

### 9.4 交付物清单

| # | 文件 | 类型 | 状态 |
|---|------|------|------|
| 1 | `sibylla-desktop/src/shared/types/member.types.ts` | 新增 | 待创建 |
| 2 | `sibylla-desktop/src/renderer/store/membersStore.ts` | 新增 | 待创建 |
| 3 | `sibylla-desktop/src/renderer/hooks/usePermission.ts` | 新增 | 待创建 |
| 4 | `sibylla-desktop/src/renderer/components/settings/WorkspaceSettings.tsx` | 新增 | 待创建 |
| 5 | `sibylla-desktop/src/renderer/components/settings/MemberList.tsx` | 新增 | 待创建 |
| 6 | `sibylla-desktop/src/renderer/components/settings/InviteMemberDialog.tsx` | 新增 | 待创建 |
| 7 | `sibylla-desktop/src/renderer/components/settings/MemberRoleSelect.tsx` | 新增 | 待创建 |
| 8 | `sibylla-desktop/src/renderer/components/settings/RemoveMemberDialog.tsx` | 新增 | 待创建 |
| 9 | `sibylla-desktop/src/renderer/components/settings/index.ts` | 新增 | 待创建 |
| 10 | `sibylla-desktop/src/shared/types.ts` | 更新 | 扩展 IPC 通道 + 类型 |
| 11 | `sibylla-desktop/src/main/ipc/handlers/workspace.handler.ts` | 更新 | 扩展成员管理 handlers |
| 12 | `sibylla-desktop/src/preload/index.ts` | 更新 | 扩展 workspace 成员 API |
| 13 | `sibylla-desktop/src/renderer/components/layout/Header.tsx` | 更新 | 新增设置入口 |
| 14 | `sibylla-desktop/src/renderer/dev/mockElectronAPI.ts` | 更新 | 新增成员管理 mock |
| 15 | `tests/renderer/setup.ts` | 更新 | 新增成员管理 mock |
| 16 | `tests/renderer/membersStore.test.ts` | 新增 | 待创建 |
| 17 | `tests/renderer/MemberList.test.tsx` | 新增 | 待创建 |
| 18 | `tests/renderer/InviteMemberDialog.test.tsx` | 新增 | 待创建 |
| 19 | `tests/renderer/usePermission.test.ts` | 新增 | 待创建 |

---

## 十、风险评估与回滚策略

### 10.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 云端 API 未就绪或响应格式不一致 | 高 | 中 | Mock 优先开发 UI，定义 `WorkspaceMember` 接口作为契约；Mock 数据适配接口 |
| JWT Token 过期导致成员操作失败 | 中 | 中 | `TokenStorage.getAccessToken()` 已有 30s 缓冲期检查；失败时提示用户重新登录 |
| 权限检查遗漏导致越权操作 | 高 | 低 | `usePermission` Hook 统一入口；`ROLE_PERMISSIONS` 常量单一数据源；UI 层 + 主进程双重校验 |
| 跨 store 读取 appStore.currentUser 时序问题 | 低 | 低 | `getPermissions()` 使用 `getState()` 同步读取，不依赖 React 渲染周期 |

### 10.2 时间风险

云端 API 是否就绪是关键不确定因素。建议采用 Mock 优先开发 UI，后对接真实 API。主进程 handler 层可独立测试（不依赖渲染进程）。

### 10.3 回滚策略

1. **member.types.ts** — 独立新增文件，可安全删除
2. **membersStore** — 独立新增 store，可安全删除
3. **settings/ 组件目录** — 独立新增目录，可安全删除
4. **shared/types.ts 扩展** — 纯新增常量和类型，删除新增部分不影响现有
5. **workspace.handler.ts 扩展** — 删除 4 个 handler 注册即可恢复
6. **preload 扩展** — 删除 4 个方法即可恢复
7. **Header 修改** — 删除"工作区设置"菜单项即可恢复

---

**创建时间：** 2026-04-17
**最后更新：** 2026-04-17
**更新记录：**
- 2026-04-17 — 初始创建
