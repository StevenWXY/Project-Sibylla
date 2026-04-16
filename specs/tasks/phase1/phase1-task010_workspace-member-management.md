# Workspace 成员管理

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK010 |
| **任务标题** | Workspace 成员管理 |
| **所属阶段** | Phase 1 - MVP 核心功能（Sprint 2） |
| **优先级** | P1 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现 Workspace 的成员管理功能，包括管理员邀请成员、角色权限分配、成员列表展示、成员移除等核心操作。这是团队协作的基础——让多个用户加入同一个 workspace 并享有不同级别的操作权限。

### 背景

需求 2.6 要求："作为管理员，我想要邀请团队成员加入 workspace，以便协作。"

根据 `specs/design/data-and-api.md` 的 API 设计，云端已定义完整的成员管理 RESTful API：
- `POST /api/v1/workspaces/:id/members/invite` — 邀请成员
- `PUT /api/v1/workspaces/:id/members/:uid` — 更新角色
- `DELETE /api/v1/workspaces/:id/members/:uid` — 移除成员

同时，本地 `members.json` 存储成员信息的缓存。本任务需要实现客户端的成员管理 UI 和 API 调用层。

**角色权限模型：**

| 操作 | Admin | Editor | Viewer |
|------|-------|--------|--------|
| 编辑文件 | ✓ | ✓ | ✗ |
| 创建文件 | ✓ | ✓ | ✗ |
| 删除文件 | ✓ | ✓ | ✗ |
| 评论 | ✓ | ✓ | ✓ |
| 管理成员 | ✓ | ✗ | ✗ |
| 修改设置 | ✓ | ✗ | ✗ |

### 范围

**包含：**
- 成员列表展示（从 members.json + 云端 API 获取）
- 邀请新成员对话框（邮箱输入 + 角色选择）
- 角色变更下拉菜单
- 成员移除确认
- 成员头像显示
- 权限检查中间件（前端路由守卫）

**不包含：**
- 邀请链接/二维码 — Phase 2
- 成员分组/团队 — Phase 2
- 审批工作流 — Phase 2
- 云端 API 的服务端实现（假设 API 已就绪）

## 技术要求

### 技术栈

- **React 18** + **TypeScript strict mode**
- **TailwindCSS** — 样式
- **Zustand** — 状态管理
- **Lucide React** — 图标
- **云端 API** — Fastify 后端（假设已就绪）

### 架构设计

```
渲染进程 (Renderer Process)
├── src/renderer/components/
│   ├── settings/
│   │   ├── WorkspaceSettings.tsx       # 新增：Workspace 设置页
│   │   ├── MemberList.tsx              # 新增：成员列表
│   │   ├── InviteMemberDialog.tsx      # 新增：邀请成员对话框
│   │   ├── MemberRoleSelect.tsx        # 新增：角色选择
│   │   └── RemoveMemberDialog.tsx      # 新增：移除确认对话框
├── src/renderer/stores/
│   └── members-store.ts               # 新增：成员状态管理
└── src/renderer/services/
    └── workspace-api.ts               # 新增：云端 API 客户端
```

#### 核心类型定义

```typescript
// src/shared/types/member.types.ts

/** Member role in workspace */
export type MemberRole = 'admin' | 'editor' | 'viewer'

/** Workspace member */
export interface WorkspaceMember {
  readonly id: string
  readonly name: string
  readonly email: string
  readonly role: MemberRole
  readonly avatarUrl?: string
  readonly joinedAt: string
}

/** Invite request */
export interface InviteRequest {
  readonly email: string
  readonly role: MemberRole
}

/** Invite result */
export interface InviteResult {
  readonly success: boolean
  readonly error?: string
}

/** Permission check result */
export interface PermissionCheck {
  readonly canEdit: boolean
  readonly canCreate: boolean
  readonly canDelete: boolean
  readonly canComment: boolean
  readonly canManageMembers: boolean
  readonly canManageSettings: boolean
}
```

### 实现细节

#### 子任务 10.1：Workspace API 客户端

封装云端成员管理 API 调用：

```typescript
// src/renderer/services/workspace-api.ts

export class WorkspaceApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly getAuthToken: () => string
  ) {}

  async getMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const response = await fetch(`${this.baseUrl}/api/v1/workspaces/${workspaceId}/members`, {
      headers: { Authorization: `Bearer ${this.getAuthToken()}` }
    })
    if (!response.ok) throw new Error(`Failed to get members: ${response.statusText}`)
    return response.json()
  }

  async inviteMember(workspaceId: string, request: InviteRequest): Promise<InviteResult> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/workspaces/${workspaceId}/members/invite`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      }
    )
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return { success: false, error: error.message ?? '邀请失败' }
    }
    return { success: true }
  }

  async updateMemberRole(
    workspaceId: string,
    userId: string,
    role: MemberRole
  ): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/workspaces/${workspaceId}/members/${userId}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${this.getAuthToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role })
      }
    )
    if (!response.ok) throw new Error(`Failed to update role: ${response.statusText}`)
  }

  async removeMember(workspaceId: string, userId: string): Promise<void> {
    const response = await fetch(
      `${this.baseUrl}/api/v1/workspaces/${workspaceId}/members/${userId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.getAuthToken()}` }
      }
    )
    if (!response.ok) throw new Error(`Failed to remove member: ${response.statusText}`)
  }
}
```

- 所有 API 调用携带 JWT Token
- 错误信息使用中文，对用户友好

#### 子任务 10.2：membersStore

```typescript
// src/renderer/stores/members-store.ts

interface MembersState {
  readonly members: WorkspaceMember[]
  readonly currentUserId: string
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
}

export const useMembersStore = create<MembersState & MembersActions>()(
  (set, get) => ({
    members: [],
    currentUserId: '',
    isLoading: false,
    error: null,

    loadMembers: async (workspaceId) => {
      set({ isLoading: true, error: null })
      try {
        const members = await workspaceApi.getMembers(workspaceId)
        set({ members, isLoading: false })
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : '加载成员失败',
          isLoading: false
        })
      }
    },

    inviteMember: async (workspaceId, email, role) => {
      const result = await workspaceApi.inviteMember(workspaceId, { email, role })
      if (result.success) {
        await get().loadMembers(workspaceId)
      }
      return result
    },

    updateRole: async (workspaceId, userId, role) => {
      await workspaceApi.updateMemberRole(workspaceId, userId, role)
      set((state) => ({
        members: state.members.map((m) =>
          m.id === userId ? { ...m, role } : m
        )
      }))
    },

    removeMember: async (workspaceId, userId) => {
      await workspaceApi.removeMember(workspaceId, userId)
      set((state) => ({
        members: state.members.filter((m) => m.id !== userId)
      }))
    },

    getPermissions: () => {
      const { members, currentUserId } = get()
      const currentUser = members.find((m) => m.id === currentUserId)
      const role = currentUser?.role ?? 'viewer'

      return {
        canEdit: role === 'admin' || role === 'editor',
        canCreate: role === 'admin' || role === 'editor',
        canDelete: role === 'admin' || role === 'editor',
        canComment: true,
        canManageMembers: role === 'admin',
        canManageSettings: role === 'admin',
      }
    },

    isAdmin: () => {
      const { members, currentUserId } = get()
      return members.find((m) => m.id === currentUserId)?.role === 'admin'
    },
  })
)
```

#### 子任务 10.3：WorkspaceSettings 设置页面

入口：顶栏 workspace 名称下拉 → "工作区设置"

```typescript
// src/renderer/components/settings/WorkspaceSettings.tsx

export function WorkspaceSettings({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'members' | 'general'>('members')

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
      <div className="w-[640px] max-h-[80vh] bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-medium">工作区设置</h2>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <TabButton active={activeTab === 'members'} onClick={() => setActiveTab('members')}>
            成员管理
          </TabButton>
          <TabButton active={activeTab === 'general'} onClick={() => setActiveTab('general')}>
            基本信息
          </TabButton>
        </div>

        {/* Content */}
        {activeTab === 'members' && <MemberList />}
        {activeTab === 'general' && <WorkspaceGeneralSettings />}
      </div>
    </div>
  )
}
```

#### 子任务 10.4：MemberList 成员列表

```typescript
// src/renderer/components/settings/MemberList.tsx

export function MemberList() {
  const members = useMembersStore((s) => s.members)
  const isLoading = useMembersStore((s) => s.isLoading)
  const isAdmin = useMembersStore((s) => s.isAdmin)
  const currentUserId = useMembersStore((s) => s.currentUserId)
  const [showInvite, setShowInvite] = useState(false)

  useEffect(() => {
    loadMembers(currentWorkspaceId)
  }, [])

  return (
    <div className="p-6 space-y-4">
      {/* Invite button */}
      {isAdmin && (
        <div className="flex justify-end">
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
            onClick={() => setShowInvite(true)}
          >
            <UserPlus className="h-4 w-4" />
            邀请成员
          </button>
        </div>
      )}

      {/* Member list */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between px-4 py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <div className="flex items-center gap-3">
                <Avatar name={member.name} url={member.avatarUrl} size="sm" />
                <div>
                  <p className="text-sm font-medium">{member.name}</p>
                  <p className="text-xs text-gray-500">{member.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <RoleBadge role={member.role} />
                {isAdmin && member.id !== currentUserId && (
                  <MemberActions member={member} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Invite dialog */}
      {showInvite && (
        <InviteMemberDialog onClose={() => setShowInvite(false)} />
      )}
    </div>
  )
}
```

**UI 规范**：
- Admin 可看到"邀请成员"按钮和成员操作菜单
- 当前用户不可操作自己的角色
- 角色标签使用不同颜色区分

#### 子任务 10.5：InviteMemberDialog 邀请对话框

```typescript
// src/renderer/components/settings/InviteMemberDialog.tsx

export function InviteMemberDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('editor')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    if (!email.trim()) {
      setError('请输入邮箱地址')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('请输入有效的邮箱地址')
      return
    }

    setIsSubmitting(true)
    setError(null)

    const result = await useMembersStore.getState().inviteMember(
      currentWorkspaceId,
      email,
      role
    )

    setIsSubmitting(false)

    if (result.success) {
      setSuccess(true)
      setTimeout(onClose, 1500)
    } else {
      setError(result.error ?? '邀请失败，请重试')
    }
  }

  return (
    <Modal open onClose={onClose} title="邀请成员">
      <div className="space-y-4">
        {/* Email input */}
        <div>
          <label className="block text-sm font-medium mb-1">邮箱地址</label>
          <input
            type="email"
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="colleague@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {/* Role select */}
        <div>
          <label className="block text-sm font-medium mb-1">角色</label>
          <select
            className="w-full px-3 py-2 border rounded-lg"
            value={role}
            onChange={(e) => setRole(e.target.value as MemberRole)}
          >
            <option value="editor">编辑者 — 可编辑、创建、删除文件</option>
            <option value="viewer">查看者 — 仅可查看和评论</option>
          </select>
        </div>

        {/* Error message */}
        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {/* Success message */}
        {success && (
          <p className="text-sm text-emerald-600">邀请已发送！</p>
        )}

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button className="px-4 py-2 text-sm border rounded-lg" onClick={onClose}>
            取消
          </button>
          <button
            className="px-4 py-2 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? '发送中...' : '发送邀请'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
```

#### 子任务 10.6：权限检查

前端路由守卫，根据当前用户角色控制 UI 元素的显示：

```typescript
// src/renderer/hooks/usePermission.ts

export function usePermission(): PermissionCheck {
  return useMembersStore((s) => s.getPermissions())
}

// 使用示例：
function FileTree() {
  const perm = usePermission()
  return (
    <>
      {perm.canCreate && <NewFileButton />}
      {perm.canDelete && <DeleteFileButton />}
    </>
  )
}
```

### 数据模型

- **云端**：PostgreSQL `WorkspaceMember` 表（参见 data-and-api.md）
- **本地缓存**：`.sibylla/members.json`（参见 data-and-api.md 1.2 节）
- **前端**：Zustand `membersStore`

### API 规范

复用 `specs/design/data-and-api.md` 3.3 节定义的 API：

```
GET    /api/v1/workspaces/:id/members        → WorkspaceMember[]
POST   /api/v1/workspaces/:id/members/invite → InviteResult
PUT    /api/v1/workspaces/:id/members/:uid    → void
DELETE /api/v1/workspaces/:id/members/:uid    → void
```

## 验收标准

### 功能完整性

> 以下标准直接追溯自需求 2.6。

- [ ] Admin 打开工作区设置可看到成员列表（需求 2.6 AC1）
- [ ] 点击"邀请成员"弹出邀请对话框，可输入邮箱（需求 2.6 AC2）
- [ ] 邀请发送后创建邀请记录并发送邮件通知（需求 2.6 AC3，依赖云端 API）
- [ ] 受邀者接受后以指定角色加入 workspace（需求 2.6 AC4，依赖云端 API）
- [ ] Admin 可修改成员角色，立即生效（需求 2.6 AC5）
- [ ] Admin 可移除成员，立即撤销权限（需求 2.6 AC6）

### 性能指标

- [ ] 成员列表加载 < 2 秒
- [ ] 邀请发送 < 3 秒
- [ ] 角色变更即时生效（前端 UI 更新 < 500ms）

### 用户体验

- [ ] 非管理员看不到"邀请成员"按钮和成员操作菜单
- [ ] 角色标签颜色区分（Admin=Indigo, Editor=Blue, Viewer=Gray）
- [ ] 邮箱格式验证实时反馈
- [ ] 移除成员有二次确认

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过
- [ ] 所有公共函数有 JSDoc 注释
- [ ] 代码审查通过

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 60%（P1 任务标准）

**关键测试用例：**

1. **WorkspaceApiClient 测试**
   - Mock fetch，验证各 API 调用参数正确
   - 验证 JWT Token 正确携带
   - 错误处理：网络错误、401、403

2. **membersStore 测试**
   - loadMembers 正确更新 state
   - inviteMember 成功后重新加载列表
   - updateRole 乐观更新
   - removeMember 从列表移除
   - getPermissions 根据角色返回正确权限

3. **InviteMemberDialog 测试**
   - 邮箱格式验证
   - 提交成功后显示成功消息
   - 提交失败后显示错误

4. **MemberList 渲染测试**
   - Admin 视角显示邀请按钮和操作菜单
   - 非 Admin 视角不显示操作按钮
   - 当前用户不可操作自己

### 集成测试

1. 邀请流程：输入邮箱 → 选择角色 → 发送 → 成功提示
2. 角色变更：选择新角色 → 确认 → 列表更新
3. 移除流程：点击移除 → 确认 → 列表更新

## 依赖关系

### 前置依赖

- [x] PHASE0-TASK006（认证服务）— JWT Token 获取
- [x] PHASE0-TASK004（云端服务框架）— API 基础设施
- [x] PHASE1-TASK001（文件树浏览器）— 设置入口（workspace 切换下拉）

### 被依赖任务

- 后续所有需要权限检查的功能

### 阻塞风险

- 云端 API 可能未就绪，需要 Mock 或等待
- 邮件通知功能依赖第三方服务（MVP 可简化为界面通知）

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 云端 API 未就绪 | 高 | 中 | 使用 Mock 数据开发，API 就绪后对接 |
| JWT Token 过期 | 中 | 中 | 自动刷新 Token 机制 |
| 权限检查遗漏 | 中 | 低 | usePermission Hook 统一入口 |

### 时间风险

云端 API 是否就绪是关键不确定因素。建议采用 Mock 优先开发 UI，后对接真实 API。

### 资源风险

- 无额外前端依赖

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) — 安全红线（个人空间隔离、权限控制）
- [`specs/design/architecture.md`](../../design/architecture.md) — 系统架构（模块12：权限与访问控制）
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) — 成员 API、members.json 格式、数据库模型
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — UI 组件规范
- [`specs/requirements/phase1/sprint2-git-sync.md`](../../requirements/phase1/sprint2-git-sync.md) — 需求 2.6

## 实施计划

### 第 1 步：类型定义

- 创建 `src/shared/types/member.types.ts`
- 定义 MemberRole、WorkspaceMember、InviteRequest 等
- 预计耗时：1 小时

### 第 2 步：Workspace API 客户端

- 创建 `src/renderer/services/workspace-api.ts`
- 实现 getMembers、inviteMember、updateMemberRole、removeMember
- 预计耗时：2 小时

### 第 3 步：membersStore

- 创建 `src/renderer/stores/members-store.ts`
- 实现 CRUD 操作和权限检查
- 预计耗时：2 小时

### 第 4 步：WorkspaceSettings 和 MemberList

- 创建 WorkspaceSettings 页面框架
- 创建 MemberList 组件
- 角色标签和操作菜单
- 预计耗时：3 小时

### 第 5 步：InviteMemberDialog

- 创建邀请对话框
- 邮箱验证、角色选择、提交逻辑
- 预计耗时：2 小时

### 第 6 步：权限检查集成

- 创建 usePermission Hook
- 在文件树、编辑器等组件中集成权限检查
- 预计耗时：2 小时

### 第 7 步：测试编写

- API 客户端 Mock 测试
- Store 测试
- 组件渲染测试
- 确保 ≥ 60% 覆盖率
- 预计耗时：3 小时

## 完成标准

**本任务完成的标志：**

1. 管理员可在设置中查看和管理成员列表
2. 可邀请新成员（邮箱 + 角色选择）
3. 可变更成员角色
4. 可移除成员（有二次确认）
5. 权限检查在前端正确生效
6. 单元测试覆盖率 ≥ 60%

**交付物：**

- [ ] `src/shared/types/member.types.ts`（新增）
- [ ] `src/renderer/services/workspace-api.ts`（新增）
- [ ] `src/renderer/stores/members-store.ts`（新增）
- [ ] `src/renderer/hooks/usePermission.ts`（新增）
- [ ] `src/renderer/components/settings/WorkspaceSettings.tsx`（新增）
- [ ] `src/renderer/components/settings/MemberList.tsx`（新增）
- [ ] `src/renderer/components/settings/InviteMemberDialog.tsx`（新增）
- [ ] `src/renderer/components/settings/MemberRoleSelect.tsx`（新增）
- [ ] 对应的测试文件

## 备注

- 本任务与 Git 同步链路无强依赖，可独立开发
- 云端 API 未就绪时使用 Mock 数据，UI 先行
- 邀请接受流程（被邀请人的操作）在 Sprint 3 或后续迭代中实现
- 后续可扩展：成员分组、批量邀请、邀请链接、操作审计日志

---

**创建时间：** 2026-04-17
**最后更新：** 2026-04-17
**更新记录：**
- 2026-04-17 — 创建任务文档
