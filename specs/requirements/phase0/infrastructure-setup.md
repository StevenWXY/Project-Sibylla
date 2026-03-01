# Phase 0 - 基础设施搭建需求

## 一、概述

### 1.1 目标与价值

建立 Sibylla 项目的技术基础设施，包括客户端应用框架、云端服务框架和 CI/CD 流水线。这是整个项目的地基，确保技术选型可行、架构合理、开发流程顺畅。

### 1.2 涉及模块

- Electron 应用脚手架
- 云端服务框架
- CI/CD 自动化

### 1.3 里程碑定义

**完成标志：**
- Electron 应用能够在 Mac 和 Windows 上启动并展示基础 UI
- 主进程与渲染进程通过 IPC 正常通信
- 云端 API 服务可以接收请求并返回响应
- CI/CD 能够自动构建并生成安装包

---

## 二、功能需求

### 需求 2.1 - Electron 应用脚手架

**用户故事：** 作为开发者，我需要一个标准的 Electron 应用脚手架，以便快速开始功能开发。

#### 功能描述

搭建 Electron 应用的基础结构，包括主进程、渲染进程、构建配置和开发环境。

#### 验收标准

1. When developer runs `npm run dev`, the system shall start Electron app in development mode within 10 seconds
2. When app starts, the system shall display a window with title "Sibylla" and size 1280x800
3. While app is running, when developer modifies React component code, the system shall hot-reload the UI within 2 seconds
4. When developer runs `npm run build`, the system shall generate production build without errors
5. When developer runs `npm run package`, the system shall generate DMG file for Mac and NSIS installer for Windows

#### 技术规格

**目录结构：**
```
sibylla-desktop/
├── src/
│   ├── main/                    # 主进程
│   │   ├── index.ts            # 主进程入口
│   │   ├── ipc/                # IPC 处理器
│   │   └── services/           # 核心服务
│   ├── renderer/               # 渲染进程
│   │   ├── App.tsx             # React 根组件
│   │   ├── components/         # UI 组件
│   │   ├── hooks/              # React Hooks
│   │   └── styles/             # 样式文件
│   ├── preload/                # Preload 脚本
│   │   └── index.ts
│   └── shared/                 # 共享类型定义
│       └── types.ts
├── electron-builder.json       # 打包配置
├── vite.config.ts              # Vite 配置
├── tsconfig.json               # TypeScript 配置
└── package.json
```

**核心配置：**
- TypeScript strict mode 启用
- Electron contextIsolation 启用
- nodeIntegration 禁用
- Vite 用于渲染进程构建
- electron-builder 用于打包

#### 依赖关系

- 前置依赖：无
- 被依赖项：所有后续功能开发

#### 优先级

P0 - 必须完成

---

### 需求 2.2 - IPC 通信框架

**用户故事：** 作为开发者，我需要一个类型安全的 IPC 通信框架，以便渲染进程和主进程安全地交互。

#### 功能描述

建立主进程与渲染进程之间的通信机制，使用 contextBridge 暴露安全的 API。

#### 验收标准

1. When renderer process calls `window.api.invoke('test:ping')`, the system shall return 'pong' from main process
2. While IPC call is in progress, when error occurs in main process, the system shall reject promise with error message in renderer
3. When developer adds new IPC handler, the system shall provide TypeScript type checking for parameters and return values
4. When renderer sends invalid parameters, the system shall throw type error at compile time

#### 技术规格

**Preload 脚本示例：**
```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: Function) => {
    ipcRenderer.on(channel, (_, ...args) => callback(...args))
  }
}

contextBridge.exposeInMainWorld('api', api)
```

**类型定义：**
```typescript
// src/shared/types.ts
export interface IpcApi {
  invoke<T = any>(channel: string, ...args: any[]): Promise<T>
  on(channel: string, callback: (...args: any[]) => void): void
}

declare global {
  interface Window {
    api: IpcApi
  }
}
```

#### 依赖关系

- 前置依赖：需求 2.1（Electron 脚手架）
- 被依赖项：所有需要 IPC 通信的功能

#### 优先级

P0 - 必须完成

---

### 需求 2.3 - 基础 UI 框架

**用户故事：** 作为开发者，我需要一个基础的 UI 框架，以便快速构建界面。

#### 功能描述

集成 React、TailwindCSS 和 Zustand，建立基础的 UI 组件库和状态管理。

#### 验收标准

1. When app starts, the system shall render React components without errors
2. When developer uses Tailwind utility classes, the system shall apply correct styles
3. When component updates Zustand store, the system shall re-render subscribed components within 16ms
4. When developer creates new component, the system shall provide TypeScript autocomplete for props

#### 技术规格

**基础布局组件：**
```typescript
// src/renderer/App.tsx
import { useState } from 'react'
import { useStore } from './store'

export default function App() {
  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-64 bg-white border-r">
        {/* 左侧栏 */}
      </aside>
      <main className="flex-1">
        {/* 主内容区 */}
      </main>
    </div>
  )
}
```

**状态管理示例：**
```typescript
// src/renderer/store/index.ts
import { create } from 'zustand'

interface AppState {
  workspacePath: string | null
  setWorkspacePath: (path: string) => void
}

export const useStore = create<AppState>((set) => ({
  workspacePath: null,
  setWorkspacePath: (path) => set({ workspacePath: path })
}))
```

#### 依赖关系

- 前置依赖：需求 2.1（Electron 脚手架）
- 被依赖项：所有 UI 功能

#### 优先级

P0 - 必须完成

---

### 需求 2.4 - 云端服务框架

**用户故事：** 作为开发者，我需要一个云端服务框架，以便提供 API 接口和 Git 托管服务。

#### 功能描述

搭建云端服务的基础架构，包括 Web 框架、数据库连接、认证中间件。

#### 验收标准

1. When server starts, the system shall listen on configured port within 5 seconds
2. When client sends GET request to `/api/v1/health`, the system shall return 200 status with `{"status": "ok"}`
3. When client sends request without JWT token to protected endpoint, the system shall return 401 status
4. When database connection fails, the system shall log error and retry connection every 5 seconds
5. When server receives invalid JSON, the system shall return 400 status with error message

#### 技术规格

**目录
```
sibylla-cloud/
├── src/
│   ├── index.ts                # 服务入口
│   ├── config/                 # 配置
│   │   └── database.ts
│   ├── routes/                 # 路由
│   │   ├── auth.ts
│   │   └── workspace.ts
│   ├── services/               # 业务逻辑
│   │   ├── auth.service.ts
│   │   └── workspace.service.ts
│   ├── middleware/             # 中间件
│   │   ├── auth.middleware.ts
│   │   └── error.middleware.ts
│   └── models/                 # 数据模型
│       └── user.model.ts
├── migrations/                 # 数据库迁移
├── docker-compose.yml          # Docker 配置
├── Dockerfile
└── package.json
```

**服务入口示例：**
```typescript
// src/index.ts
import Fastify from 'fastify'
import { authRoutes } from './routes/auth'
import { authMiddleware } from './middleware/auth.middleware'

const server = Fastify({ logger: true })

// 注册路由
server.register(authRoutes, { prefix: '/api/v1/auth' })

// 健康检查
server.get('/api/v1/health', async () => ({ status: 'ok' }))

server.listen({ port: 3000, host: '0.0.0.0' })
```

#### 依赖关系

- 前置依赖：无
- 被依赖项：所有云端功能

#### 优先级

P0 - 必须完成

---

### 需求 2.5 - 数据库初始化

**用户故事：** 作为开发者，我需要数据库 schema 和 migration 系统，以便管理数据结构变更。

#### 功能描述

建立 PostgreSQL 数据库连接，创建初始 schema，配置 migration 工具。

#### 验收标准

1. When developer runs `npm run migrate:up`, the system shall create all required tables without errors
2. When developer runs `npm run migrate:down`, the system shall rollback last migration
3. When migration fails, the system shall rollback transaction and preserve data integrity
4. When server starts, the system shall verify database schema version matches code version

#### 技术规格

**初始 Schema：**
```sql
-- migrations/001_initial_schema.sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(10),
    git_provider VARCHAR(50) DEFAULT 'sibylla',
    git_remote_url TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
    joined_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, workspace_id)
);

CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
```

#### 依赖关系

- 前置依赖：需求 2.4（云端服务框架）
- 被依赖项：所有需要数据库的功能

#### 优先级

P0 - 必须完成

---

### 需求 2.6 - CI/CD 流水线

**用户故事：** 作为开发者，我需要自动化的构建和发布流程，以便快速交付应用。

#### 功能描述

配置 GitHub Actions 实现自动化测试、构建和发布。

#### 验收标准

1. When developer pushes code to main branch, the system shall run linting and type checking within 2 minutes
2. When all checks pass, the system shall build Electron app for Mac and Windows within 10 minutes
3. When build succeeds, the system shall upload artifacts to GitHub Releases
4. When build fails, the system shall send notification to developer with error details
5. When developer creates git tag, the system shall trigger release workflow

#### 技术规格

**GitHub Actions 配置：**
```yaml
# .github/workflows/build.yml
name: Build and Release

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  release:
    types: [created]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run lint
      - run: npm run type-check

  build:
    needs: lint
    strategy:
      matrix:
        os: [macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
      - run: npm run package
      - uses: actions/upload-artifact@v3
        with:
          name: sibylla-${{ matrix.os }}
          path: dist/*.{dmg,exe}
```

#### 依赖关系

- 前置依赖：需求 2.1（Electron 脚手架）
- 被依赖项：无

#### 优先级

P1 - 应该完成

---

## 三、非功能需求

### 3.1 性能要求

- 应用启动时间 < 3 秒（冷启动）
- IPC 调用延迟 < 50ms（本地调用）
- API 响应时间 < 200ms（P95）
- 构建时间 < 10 分钟（完整构建）

### 3.2 安全要求

- Electron contextIsolation 必须启用
- nodeIntegration 必须禁用
- 所有 API 端点必须有认证（除健康检查）
- 数据库密码不得硬编码，使用环境变量

### 3.3 可用性要求

- 开发环境启动步骤 ≤ 3 步
- 新开发者能在 30 分钟内完成环境搭建
- 所有配置项有清晰的注释说明
- 错误信息清晰可理解

### 3.4 可维护性要求

- 代码覆盖率 ≥ 60%（基础设施代码）
- 所有公共函数有 JSDoc 注释
- 遵循 ESLint 规则，无警告
- TypeScript strict mode 无错误

---

## 四、技术约束

### 4.1 架构约束

- 必须遵循 [`CLAUDE.md`](../../../CLAUDE.md) 中的架构约束
- 主进程与渲染进程严格隔离
- 渲染进程不得直接访问 Node.js API

### 4.2 技术选型

参见 [`architecture.md`](../../design/architecture.md) 第二节：

- 客户端：Electron + React 18 + TypeScript + Vite + TailwindCSS + Zustand
- 云端：Node.js + Fastify + PostgreSQL
- 部署：Docker + GitHub Actions

### 4.3 兼容性要求

- macOS 11.0+（Big Sur 及以上）
- Windows 10 及以上
- Node.js 18+
- PostgreSQL 14+

---

## 五、验收检查清单

### 5.1 功能完整性

- [ ] Electron 应用能在 Mac 和 Windows 上启动
- [ ] 主进程与渲染进程 IPC 通信正常
- [ ] React UI 正常渲染
- [ ] TailwindCSS 样式正常应用
- [ ] Zustand 状态管理正常工作
- [ ] 云端 API 服务能接收请求并响应
- [ ] 数据库连接正常，schema 创建成功
- [ ] CI/CD 能自动构建并生成安装包

### 5.2 测试覆盖

- [ ] IPC 通信有单元测试
- [ ] API 路由有集成测试
- [ ] 数据库 migration 可回滚
- [ ] 构建流程在 CI 中验证通过

### 5.3 文档完备

- [ ] README 包含环境搭建步骤
- [ ] 项目结构有清晰说明
- [ ] 开发规范文档完整
- [ ] API 接口有文档

### 5.4 性能达标

- [ ] 应用启动时间 < 3 秒
- [ ] IPC 调用延迟 < 50ms
- [ ] API 响应时间 < 200ms
- [ ] 构建时间 < 10 分钟

---

## 六、风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| Electron 版本兼容性问题 | 高 | 中 | 使用 LTS 版本，充分测试 |
| isomorphic-git 性能不足 | 中 | 低 | 准备降级方案（调用系统 git） |
| CI 构建时间过长 | 低 | 中 | 使用缓存，优化依赖安装 |
| 跨平台兼容性问题 | 高 | 中 | 在 Mac 和 Windows 上充分测试 |

---

## 七、参考资料

- [Electron 官方文档](https://www.electronjs.org/docs/latest/)
- [Vite 官方文档](https://vitejs.dev/)
- [Fastify 官方文档](https://www.fastify.io/)
- [`architecture.md`](../../design/architecture.md) - 系统架构设计
