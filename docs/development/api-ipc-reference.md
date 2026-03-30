# API & IPC 接口参考文档

本文档汇编了 Sibylla Phase 0 阶段已实现的所有 IPC (Inter-Process Communication) 通道以及云端暴露的 RESTful API 端点。

## 1. IPC 通信字典 (客户端内部)

桌面端通过 Electron 的 `ipcMain` 和 `ipcRenderer` 实现主进程与渲染进程之间的通信。所有可用的通道都在 `IPC_CHANNELS` 常量中定义。

### 1.1 文件系统操作 (File Operations)
命名空间：`file:*`

| 通道名称 | 方向 | 入参格式 | 返回类型 | 描述 |
| --- | --- | --- | --- | --- |
| `file:read` | R → M | `{ relativePath: string, options?: FileReadOptions }` | `IPCResponse<FileContent>` | 读取工作区内文件内容 |
| `file:write` | R → M | `{ relativePath: string, content: string, options?: FileWriteOptions }` | `IPCResponse<void>` | 写入文件内容，支持原子写入 |
| `file:delete` | R → M | `{ relativePath: string }` | `IPCResponse<void>` | 删除文件 |
| `file:list` | R → M | `{ relativePath?: string, options?: ListFilesOptions }` | `IPCResponse<FileInfo[]>` | 列出目录内容，支持递归 |
| `file:info` | R → M | `{ relativePath: string }` | `IPCResponse<FileInfo>` | 获取文件元数据 |
| `file:exists` | R → M | `{ relativePath: string }` | `IPCResponse<boolean>` | 检查文件或目录是否存在 |
| `dir:create` | R → M | `{ relativePath: string }` | `IPCResponse<void>` | 创建目录及父目录 |
| `dir:delete` | R → M | `{ relativePath: string }` | `IPCResponse<void>` | 递归删除目录 |

### 1.2 文件监听 (File Watching)
命名空间：`file:watch:*`

| 通道名称 | 方向 | 入参格式 | 返回类型 | 描述 |
| --- | --- | --- | --- | --- |
| `file:watch:start` | R → M | `{}` | `IPCResponse<void>` | 启动当前工作区的文件监听 |
| `file:watch:stop` | R → M | `{}` | `IPCResponse<void>` | 停止当前工作区的文件监听 |
| `file:watch:event` | M → R | `FileWatchEvent` (监听回调) | - | 广播文件新增、修改、删除等事件 |

### 1.3 工作区管理 (Workspace Management)
命名空间：`workspace:*`

| 通道名称 | 方向 | 入参格式 | 返回类型 | 描述 |
| --- | --- | --- | --- | --- |
| `workspace:create`| R → M | `CreateWorkspaceOptions` | `IPCResponse<WorkspaceInfo>` | 初始化新的本地工作区并生成基础文件 |
| `workspace:open` | R → M | `{ path: string }` | `IPCResponse<WorkspaceInfo>` | 打开已存在的本地工作区 |
| `workspace:get-current`| R → M| `{}` | `IPCResponse<WorkspaceInfo>` | 获取当前激活的工作区信息 |
| `workspace:select-folder`| R → M| `{}` | `IPCResponse<string>` | 打开系统文件夹选择器 |

### 1.4 同步服务 (Sync Operations)
命名空间：`sync:*`

| 通道名称 | 方向 | 入参格式 | 返回类型 | 描述 |
| --- | --- | --- | --- | --- |
| `sync:force` | R → M | `{}` | `IPCResponse<SyncResult>` | 强制触发与云端的数据同步(拉取+推送) |
| `sync:status-changed`| M → R | `SyncStatusData` (监听回调) | - | 广播同步状态变更 (idle/syncing/synced/error/conflict) |

---

## 2. 云端 RESTful API 字典

云端 API 基于 Fastify 框架构建，默认基础路径为 `/api/v1`。除了 `/health` 和 `/auth/register`、`/auth/login` 外，所有接口都需要在 Header 中携带 JWT Token `Authorization: Bearer <token>`。

### 2.1 认证服务 (Auth)

| 端点 | 方法 | Auth | 入参实体 | 响应实体 | 描述 |
| --- | --- | --- | --- | --- | --- |
| `/auth/register` | POST | 否 | `{ email, password, name }` | `{ user, token }` | 注册新用户 |
| `/auth/login` | POST | 否 | `{ email, password }` | `{ user, token }` | 用户登录获取 JWT |
| `/auth/me` | GET | 是 | - | `user` | 获取当前登录用户信息 |

### 2.2 工作区服务 (Workspace)

| 端点 | 方法 | Auth | 入参实体 | 响应实体 | 描述 |
| --- | --- | --- | --- | --- | --- |
| `/workspaces` | POST | 是 | `{ name, description }` | `Workspace` | 在云端创建一个新的工作区容器 |
| `/workspaces` | GET | 是 | - | `Workspace[]` | 列出当前用户拥有的所有工作区 |
| `/workspaces/:id` | GET | 是 | - | `Workspace` | 获取特定工作区的详情 |

### 2.3 状态检查 (Health)

| 端点 | 方法 | Auth | 入参实体 | 响应实体 | 描述 |
| --- | --- | --- | --- | --- | --- |
| `/health` | GET | 否 | - | `{ status: 'ok', timestamp, version }` | 全局健康检查 |
| `/live` | GET | 否 | - | `{ status: 'ok' }` | Liveness 探针 |
| `/db` | GET | 否 | - | `{ status: 'ok' }` | 数据库连通性探针 |

*注：Git 通信直接通过 HTTP 协议与基于 Gitea 后端的隔离容器交互，不包含在常规 API 路由中，采用标准的 `git push/pull/fetch` 协议。*
