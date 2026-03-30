# Sibylla Cloud Service

> Sibylla 云端服务 - 为团队知识协作平台提供后端 API 支持。

---

## 功能概述

Sibylla Cloud 提供以下核心服务：

- **认证服务** - 用户注册、登录、JWT Token 管理
- **Git 托管** - Workspace Git 仓库管理（基于 Gitea）
- **语义搜索** - 文档向量索引与检索
- **AI 网关** - 统一代理多个 AI 模型
- **积分账本** - 团队贡献度量化

## 技术栈

| 组件 | 技术 |
|------|------|
| 运行时 | Node.js 20+ |
| 语言 | TypeScript（严格模式）|
| Web 框架 | Fastify |
| 数据库 | PostgreSQL 16 + pgvector |
| 缓存 | Redis（Phase 0 预留，尚未启用）|
| 容器化 | Docker + Docker Compose |

## 快速开始

### 前置要求

- Node.js >= 20.0.0
- Docker >= 24.0.0
- Docker Compose >= 2.20.0

### 安装依赖

```bash
cd sibylla-cloud
npm install
```

### 开发模式

**方式一：本地开发（需要手动启动数据库）**

```bash
# 1. 复制环境变量
cp .env.example .env

# 2. 启动数据库服务
docker compose up postgres -d

# 3. 运行数据库迁移
npm run migrate:up

# 4. （可选）填充开发测试数据
npm run db:seed

# 5. 启动开发服务器（支持热重载）
npm run dev
```

**方式二：Docker Compose 开发环境**

```bash
# 一键启动所有服务（包含热重载）
npm run docker:dev
```

### 验证服务

```bash
# 健康检查
curl http://localhost:3000/api/v1/health

# 预期响应
{
  "status": "ok",
  "timestamp": "2026-03-04T10:00:00.000Z",
  "version": "0.0.1"
}
```

## 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器（热重载）|
| `npm run build` | 编译 TypeScript |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | ESLint 检查 |
| `npm run lint:fix` | ESLint 自动修复 |
| `npm run format` | Prettier 格式化 |
| `npm run type-check` | TypeScript 类型检查 |
| `npm run test` | 运行测试 |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run test:coverage` | 运行测试并生成覆盖率报告 |
| `npm run test:prepare` | 启动依赖并执行迁移 |
| `npm run test:full` | 一键准备环境并执行测试 |
| `npm run docker:dev` | Docker Compose 开发环境 |
| `npm run docker:build` | 构建 Docker 镜像 |
| `npm run docker:up` | 启动生产环境容器 |
| `npm run docker:down` | 停止容器 |
| `npm run migrate:up` | 执行数据库迁移（升级）|
| `npm run migrate:down` | 回滚最后一次迁移 |
| `npm run migrate:create` | 创建新的迁移文件 |
| `npm run db:seed` | 填充开发测试数据 |

## 项目结构

```
sibylla-cloud/
├── src/
│   ├── index.ts           # 服务入口
│   ├── app.ts             # Fastify 应用实例
│   ├── config/            # 配置模块
│   │   ├── index.ts       # 配置聚合
│   │   ├── env.ts         # 环境变量加载
│   │   └── database.ts    # 数据库配置
│   ├── db/                # 数据库模块
│   │   ├── index.ts       # 数据库导出
│   │   ├── client.ts      # PostgreSQL 客户端
│   │   ├── transaction.ts # 事务管理
│   │   └── health.ts      # 数据库健康检查
│   ├── routes/            # API 路由
│   │   ├── index.ts       # 路由注册
│   │   └── health.ts      # 健康检查
│   ├── middleware/        # 中间件
│   │   ├── error.middleware.ts
│   │   └── cors.middleware.ts
│   ├── plugins/           # Fastify 插件
│   │   └── index.ts
│   ├── services/          # 业务服务
│   ├── models/            # 数据模型
│   │   ├── index.ts       # 模型导出
│   │   ├── user.model.ts  # 用户模型
│   │   ├── workspace.model.ts    # Workspace 模型
│   │   └── member.model.ts       # 成员关系模型
│   ├── services/          # 业务服务
│   │   └── auth.service.ts    # 认证服务
│   ├── types/             # 类型定义
│   │   ├── index.ts
│   │   ├── database.ts    # 数据库类型
│   │   └── auth.ts        # 认证类型
│   └── utils/             # 工具函数
│       └── logger.ts
├── tests/                 # 测试文件
│   ├── db/                # 数据库测试
│   └── models/            # 模型测试
├── migrations/            # 数据库迁移
│   ├── 001_enable_extensions.sql
│   ├── 002_create_users.sql
│   ├── 003_create_workspaces.sql
│   ├── 004_create_workspace_members.sql
│   └── 005_create_refresh_tokens.sql
├── seeds/                 # 种子数据
│   └── dev.ts             # 开发环境测试数据
├── docker/                # Docker 配置
│   ├── Dockerfile         # 生产镜像
│   └── Dockerfile.dev     # 开发镜像
├── docker-compose.yml     # 生产环境配置
├── docker-compose.dev.yml # 开发环境配置
├── migrate.config.ts      # Migration 配置
├── .env.example           # 环境变量示例
├── tsconfig.json          # TypeScript 配置
├── .eslintrc.json         # ESLint 配置
├── .prettierrc            # Prettier 配置
├── vitest.config.ts       # 测试配置
└── package.json
```

## API 端点

### 健康检查

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/health` | 服务健康状态 |
| GET | `/api/v1/health/ready` | 就绪检查（Kubernetes）|
| GET | `/api/v1/health/live` | 存活检查（Kubernetes）|

### 认证 API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/api/v1/auth/register` | 用户注册 | 否 |
| POST | `/api/v1/auth/login` | 用户登录 | 否 |
| POST | `/api/v1/auth/refresh` | 刷新 Token | 否 |
| POST | `/api/v1/auth/logout` | 登出 | 否 |
| GET | `/api/v1/auth/me` | 获取当前用户 | 是 |

### Git API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/v1/git/:workspaceId/info` | 获取仓库信息 | 是 |
| POST | `/api/v1/git/token` | 生成 Git 访问 Token | 是 |
| DELETE | `/api/v1/git/token` | 吊销所有 Git Token | 是 |
| GET | `/api/v1/git/:workspaceId/commits` | 获取仓库提交历史 | 是 |

### Workspace API

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/v1/workspaces` | 获取用户所有 Workspace | 是 |
| POST | `/api/v1/workspaces` | 创建 Workspace | 是 |
| GET | `/api/v1/workspaces/:workspaceId` | 获取 Workspace 详情 | 是 |
| PATCH | `/api/v1/workspaces/:workspaceId` | 更新 Workspace | 是 |
| DELETE | `/api/v1/workspaces/:workspaceId` | 删除 Workspace | 是 |
| GET | `/api/v1/workspaces/:workspaceId/members` | 获取成员列表 | 是 |
| POST | `/api/v1/workspaces/:workspaceId/members` | 添加成员 | 是 |
| PATCH | `/api/v1/workspaces/:workspaceId/members/:memberUserId` | 更新成员角色 | 是 |
| DELETE | `/api/v1/workspaces/:workspaceId/members/:memberUserId` | 移除成员 | 是 |

**注册示例：**

```bash
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123", "name": "Test User"}'
```

**登录示例：**

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'
```

**访问受保护端点：**

```bash
curl http://localhost:3000/api/v1/auth/me \
  -H "Authorization: Bearer <accessToken>"
```

### 响应格式

**成功响应：**

```json
{
  "status": "ok",
  "timestamp": "2026-03-04T10:00:00.000Z",
  "version": "0.0.1"
}
```

**错误响应：**

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

## 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `NODE_ENV` | `development` | 运行环境 |
| `PORT` | `3000` | 服务端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `LOG_LEVEL` | `info` | 日志级别 |
| `DATABASE_URL` | - | PostgreSQL 连接字符串 |
| `JWT_SECRET` | - | JWT 签名密钥 |
| `CORS_ORIGIN` | `*` | CORS 允许的来源 |

## Docker 部署

### 构建镜像

```bash
npm run docker:build
```

### 启动服务

```bash
# 启动所有服务（API + PostgreSQL + Gitea）
npm run docker:up

# 查看日志
docker compose logs -f api

# 停止服务
npm run docker:down
```

## 开发规范

### TypeScript

- 严格模式：禁止 `any` 类型
- 所有函数必须有明确的返回类型
- 使用 `zod` 进行运行时类型验证

### 代码风格

- ESLint + Prettier 自动格式化
- 代码注释使用英文
- 文档和 Commit message 使用中文

### Git 提交

```
<type>(<scope>): <描述>

type: feat | fix | refactor | docs | chore | test
scope: auth | git | search | ai | points | infra
```

示例：`feat(auth): 实现用户注册 API`

## 数据库

### 数据模型

```
┌─────────────┐       ┌───────────────────┐       ┌─────────────┐
│   users     │       │ workspace_members │       │ workspaces  │
├─────────────┤       ├───────────────────┤       ├─────────────┤
│ id (PK)     │───┐   │ id (PK)           │   ┌───│ id (PK)     │
│ email       │   └──>│ user_id (FK)      │   │   │ name        │
│ password_hash│      │ workspace_id (FK) │<──┘   │ description │
│ name        │       │ role              │       │ icon        │
│ avatar_url  │       │ joined_at         │       │ git_provider│
│ email_verified│     └───────────────────┘       │ git_remote_url│
│ last_login_at│                                  │ created_at  │
│ created_at  │      ┌───────────────────┐        │ updated_at  │
│ updated_at  │      │  refresh_tokens   │        └─────────────┘
└─────────────┘      ├───────────────────┤
       │             │ id (PK)           │
       └────────────>│ user_id (FK)      │
                     │ token_hash        │
                     │ expires_at        │
                     │ revoked_at        │
                     │ user_agent        │
                     │ ip_address        │
                     └───────────────────┘
```

### Migration 命令

```bash
# 执行所有待执行的迁移
npm run migrate:up

# 回滚最后一次迁移
npm run migrate:down

# 创建新迁移
npm run migrate:create -- my_migration_name

# 填充开发测试数据
npm run db:seed
```

测试环境可直接使用 `.env.test.example`：

```bash
cp .env.test.example .env
```

### 测试账号（开发环境）

运行 `npm run db:seed` 后可使用：

- **邮箱:** dev@sibylla.io
- **密码:** password123

## 后续任务

- [x] TASK004 - 云端服务框架搭建
- [x] TASK005 - 数据库初始化与 Migration
- [x] TASK006 - 认证服务实现
- [x] TASK007 - Git 托管服务配置

---

**最后更新：** 2026-03-05
