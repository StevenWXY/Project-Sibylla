# 数据库初始化与 Migration

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE0-TASK005 |
| **任务标题** | 数据库初始化与 Migration |
| **所属阶段** | Phase 0 - 基础设施搭建 |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

建立 PostgreSQL 数据库连接，创建初始 schema，配置 migration 系统，为后续的认证服务、Git 托管、积分系统等功能提供数据存储基础。

### 背景

Sibylla 云端服务使用 PostgreSQL 作为主数据库，存储用户、workspace、成员关系、积分账本等结构化数据。同时使用 pgvector 扩展支持语义搜索的向量存储。本任务建立数据库基础设施，确保 migration 系统可回滚、数据完整性有保障。

### 范围

**包含：**
- 数据库连接池配置（使用 pg 或 postgres.js）
- Migration 工具配置（使用 node-pg-migrate 或 Prisma）
- 初始 schema 创建（users、workspaces、workspace_members 表）
- pgvector 扩展启用
- 数据库健康检查集成
- 种子数据脚本（开发环境）
- 事务管理工具函数

**不包含：**
- 认证逻辑实现（TASK006）
- Git 相关表设计（TASK007）
- 业务逻辑代码
- 向量搜索实现（后续阶段）

## 技术要求

### 技术栈

- **PostgreSQL:** 16.x（使用 pgvector/pgvector:pg16 Docker 镜像）
- **pgvector:** 0.5.x（向量扩展）
- **postgres.js:** ^3.4.0（PostgreSQL 客户端）
- **node-pg-migrate:** ^7.0.0（Migration 工具）
- **zod:** ^3.22.0（数据验证）

### 架构设计

```
sibylla-cloud/
├── src/
│   ├── config/
│   │   └── database.ts        # 数据库配置
│   ├── db/
│   │   ├── index.ts           # 数据库连接导出
│   │   ├── client.ts          # 数据库客户端
│   │   ├── transaction.ts     # 事务管理
│   │   └── health.ts          # 数据库健康检查
│   ├── models/
│   │   ├── user.model.ts      # 用户模型
│   │   ├── workspace.model.ts # Workspace 模型
│   │   └── member.model.ts    # 成员关系模型
│   └── types/
│       └── database.ts        # 数据库相关类型
├── migrations/
│   ├── 001_enable_extensions.sql      # 启用扩展
│   ├── 002_create_users.sql           # 用户表
│   ├── 003_create_workspaces.sql      # Workspace 表
│   ├── 004_create_workspace_members.sql # 成员关系表
│   └── 005_create_indexes.sql         # 索引
├── seeds/
│   └── dev.ts                 # 开发环境种子数据
└── migrate.config.ts          # Migration 配置
```

### 实现细节

#### 关键实现点

1. **数据库配置（src/config/database.ts）**
   ```typescript
   import { z } from 'zod'
   import { env } from './env'

   const databaseConfigSchema = z.object({
     host: z.string().default('localhost'),
     port: z.number().default(5432),
     database: z.string().default('sibylla'),
     user: z.string().default('sibylla'),
     password: z.string(),
     ssl: z.boolean().default(false),
     max: z.number().default(20),          // 连接池最大连接数
     idleTimeout: z.number().default(30),  // 空闲超时（秒）
     connectionTimeout: z.number().default(10) // 连接超时（秒）
   })

   function parseConnectionString(url: string): z.infer<typeof databaseConfigSchema> {
     const parsed = new URL(url)
     return {
       host: parsed.hostname,
       port: parseInt(parsed.port) || 5432,
       database: parsed.pathname.slice(1),
       user: parsed.username,
       password: parsed.password,
       ssl: parsed.searchParams.get('sslmode') === 'require',
       max: 20,
       idleTimeout: 30,
       connectionTimeout: 10
     }
   }

   export const databaseConfig = env.DATABASE_URL
     ? parseConnectionString(env.DATABASE_URL)
     : databaseConfigSchema.parse({
         password: env.DB_PASSWORD || 'sibylla'
       })
   ```

2. **数据库客户端（src/db/client.ts）**
   ```typescript
   import postgres from 'postgres'
   import { databaseConfig } from '../config/database'
   import { logger } from '../utils/logger'

   // Create postgres.js client with connection pool
   export const sql = postgres({
     host: databaseConfig.host,
     port: databaseConfig.port,
     database: databaseConfig.database,
     username: databaseConfig.user,
     password: databaseConfig.password,
     ssl: databaseConfig.ssl ? 'require' : false,
     max: databaseConfig.max,
     idle_timeout: databaseConfig.idleTimeout,
     connect_timeout: databaseConfig.connectionTimeout,
     onnotice: () => {}, // Suppress notices
     onparameter: () => {}, // Suppress parameter changes
     debug: (connection, query, params) => {
       if (process.env.DEBUG_SQL) {
         logger.debug({ query, params }, 'SQL query')
       }
     }
   })

   // Graceful shutdown
   export async function closeDatabaseConnection(): Promise<void> {
     await sql.end({ timeout: 5 })
     logger.info('Database connection closed')
   }
   ```

3. **事务管理（src/db/transaction.ts）**
   ```typescript
   import { sql } from './client'
   import type { TransactionSql } from 'postgres'

   /**
    * Execute a function within a database transaction
    * Automatically commits on success, rolls back on error
    */
   export async function withTransaction<T>(
     fn: (tx: TransactionSql<Record<string, unknown>>) => Promise<T>
   ): Promise<T> {
     return await sql.begin(async (tx) => {
       return await fn(tx)
     })
   }

   /**
    * Execute multiple operations atomically
    */
   export async function atomic<T>(
     operations: Array<(tx: TransactionSql<Record<string, unknown>>) => Promise<unknown>>
   ): Promise<void> {
     await sql.begin(async (tx) => {
       for (const op of operations) {
         await op(tx)
       }
     })
   }
   ```

4. **数据库健康检查（src/db/health.ts）**
   ```typescript
   import { sql } from './client'
   import { logger } from '../utils/logger'

   export interface DatabaseHealth {
     connected: boolean
     latencyMs: number
     version?: string
     error?: string
   }

   export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
     const start = Date.now()
     
     try {
       const result = await sql`SELECT version()`
       const latencyMs = Date.now() - start
       
       return {
         connected: true,
         latencyMs,
         version: result[0]?.version as string
       }
     } catch (error) {
       const latencyMs = Date.now() - start
       logger.error({ error }, 'Database health check failed')
       
       return {
         connected: false,
         latencyMs,
         error: error instanceof Error ? error.message : 'Unknown error'
       }
     }
   }

   /**
    * Wait for database to be ready (for startup)
    */
   export async function waitForDatabase(
     maxRetries = 30,
     retryIntervalMs = 1000
   ): Promise<boolean> {
     for (let i = 0; i < maxRetries; i++) {
       const health = await checkDatabaseHealth()
       
       if (health.connected) {
         logger.info({ latencyMs: health.latencyMs }, 'Database connected')
         return true
       }
       
       logger.warn({ attempt: i + 1, maxRetries }, 'Database not ready, retrying...')
       await new Promise(resolve => setTimeout(resolve, retryIntervalMs))
     }
     
     logger.error('Database connection failed after max retries')
     return false
   }
   ```

5. **初始 Migration - 启用扩展（migrations/001_enable_extensions.sql）**
   ```sql
   -- Enable required PostgreSQL extensions
   
   -- UUID generation
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   
   -- pgcrypto for password hashing (if needed server-side)
   CREATE EXTENSION IF NOT EXISTS "pgcrypto";
   
   -- pgvector for semantic search embeddings
   CREATE EXTENSION IF NOT EXISTS "vector";
   
   -- Comment
   COMMENT ON EXTENSION "vector" IS 'vector similarity search (pgvector)';
   ```

6. **Migration - 用户表（migrations/002_create_users.sql）**
   ```sql
   -- Create users table
   
   CREATE TABLE users (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       email VARCHAR(255) UNIQUE NOT NULL,
       password_hash VARCHAR(255) NOT NULL,
       name VARCHAR(100) NOT NULL,
       avatar_url TEXT,
       email_verified BOOLEAN DEFAULT FALSE,
       last_login_at TIMESTAMP WITH TIME ZONE,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
       updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );
   
   -- Indexes
   CREATE INDEX idx_users_email ON users(email);
   CREATE INDEX idx_users_created_at ON users(created_at);
   
   -- Trigger for updated_at
   CREATE OR REPLACE FUNCTION update_updated_at_column()
   RETURNS TRIGGER AS $$
   BEGIN
       NEW.updated_at = NOW();
       RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;
   
   CREATE TRIGGER update_users_updated_at
       BEFORE UPDATE ON users
       FOR EACH ROW
       EXECUTE FUNCTION update_updated_at_column();
   
   -- Comments
   COMMENT ON TABLE users IS 'User accounts for Sibylla';
   COMMENT ON COLUMN users.password_hash IS 'Argon2 hashed password';
   ```

7. **Migration - Workspace 表（migrations/003_create_workspaces.sql）**
   ```sql
   -- Create workspaces table
   
   CREATE TABLE workspaces (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       name VARCHAR(100) NOT NULL,
       description TEXT,
       icon VARCHAR(10),
       
       -- Git configuration
       git_provider VARCHAR(50) DEFAULT 'sibylla' 
           CHECK (git_provider IN ('sibylla', 'github', 'gitlab')),
       git_remote_url TEXT,
       
       -- Settings
       default_model VARCHAR(50) DEFAULT 'claude-3-opus',
       sync_interval INTEGER DEFAULT 30,
       
       -- Timestamps
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
       updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );
   
   -- Indexes
   CREATE INDEX idx_workspaces_created_at ON workspaces(created_at);
   
   -- Trigger for updated_at
   CREATE TRIGGER update_workspaces_updated_at
       BEFORE UPDATE ON workspaces
       FOR EACH ROW
       EXECUTE FUNCTION update_updated_at_column();
   
   -- Comments
   COMMENT ON TABLE workspaces IS 'Team workspaces for collaboration';
   COMMENT ON COLUMN workspaces.git_provider IS 'Git hosting provider: sibylla (self-hosted) or external';
   ```

8. **Migration - 成员关系表（migrations/004_create_workspace_members.sql）**
   ```sql
   -- Create workspace_members table (many-to-many relationship)
   
   CREATE TABLE workspace_members (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
       
       -- Role: admin can manage workspace, editor can edit, viewer can only view
       role VARCHAR(20) NOT NULL DEFAULT 'editor'
           CHECK (role IN ('admin', 'editor', 'viewer')),
       
       -- Timestamps
       joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
       
       -- Unique constraint: one user can only join a workspace once
       UNIQUE(user_id, workspace_id)
   );
   
   -- Indexes for common queries
   CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
   CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);
   CREATE INDEX idx_workspace_members_role ON workspace_members(workspace_id, role);
   
   -- Comments
   COMMENT ON TABLE workspace_members IS 'User membership in workspaces';
   COMMENT ON COLUMN workspace_members.role IS 'admin: full control, editor: can edit, viewer: read-only';
   ```

9. **Migration 配置（migrate.config.ts）**
   ```typescript
   import type { RunnerOption } from 'node-pg-migrate'

   const config: RunnerOption = {
     databaseUrl: process.env.DATABASE_URL || 
       'postgresql://sibylla:sibylla@localhost:5432/sibylla',
     migrationsTable: 'pgmigrations',
     dir: 'migrations',
     direction: 'up',
     log: console.log,
     verbose: true,
     decamelize: true
   }

   export default config
   ```

10. **用户模型（src/models/user.model.ts）**
    ```typescript
    import { sql } from '../db/client'
    import { z } from 'zod'
    
    // Type definitions
    export const userSchema = z.object({
      id: z.string().uuid(),
      email: z.string().email(),
      passwordHash: z.string(),
      name: z.string().min(1).max(100),
      avatarUrl: z.string().url().nullable(),
      emailVerified: z.boolean(),
      lastLoginAt: z.date().nullable(),
      createdAt: z.date(),
      updatedAt: z.date()
    })
    
    export type User = z.infer<typeof userSchema>
    export type CreateUserInput = Pick<User, 'email' | 'passwordHash' | 'name'> & {
      avatarUrl?: string
    }
    
    // Database operations
    export const UserModel = {
      async findById(id: string): Promise<User | null> {
        const result = await sql`
          SELECT id, email, password_hash, name, avatar_url, 
                 email_verified, last_login_at, created_at, updated_at
          FROM users
          WHERE id = ${id}
        `
        return result[0] ? mapToUser(result[0]) : null
      },
    
      async findByEmail(email: string): Promise<User | null> {
        const result = await sql`
          SELECT id, email, password_hash, name, avatar_url,
                 email_verified, last_login_at, created_at, updated_at
          FROM users
          WHERE email = ${email.toLowerCase()}
        `
        return result[0] ? mapToUser(result[0]) : null
      },
    
      async create(input: CreateUserInput): Promise<User> {
        const result = await sql`
          INSERT INTO users (email, password_hash, name, avatar_url)
          VALUES (${input.email.toLowerCase()}, ${input.passwordHash}, 
                  ${input.name}, ${input.avatarUrl || null})
          RETURNING id, email, password_hash, name, avatar_url,
                    email_verified, last_login_at, created_at, updated_at
        `
        return mapToUser(result[0])
      },
    
      async updateLastLogin(id: string): Promise<void> {
        await sql`
          UPDATE users
          SET last_login_at = NOW()
          WHERE id = ${id}
        `
      }
    }
    
    // Helper function to map database row to User type
    function mapToUser(row: Record<string, unknown>): User {
      return {
        id: row.id as string,
        email: row.email as string,
        passwordHash: row.password_hash as string,
        name: row.name as string,
        avatarUrl: row.avatar_url as string | null,
        emailVerified: row.email_verified as boolean,
        lastLoginAt: row.last_login_at ? new Date(row.last_login_at as string) : null,
        createdAt: new Date(row.created_at as string),
        updatedAt: new Date(row.updated_at as string)
      }
    }
    ```

11. **种子数据脚本（seeds/dev.ts）**
    ```typescript
    import { sql } from '../src/db/client'
    import { hash } from '@node-rs/argon2'
    
    async function seed(): Promise<void> {
      console.log('🌱 Seeding development database...')
      
      // Create test user
      const passwordHash = await hash('password123')
      
      const [user] = await sql`
        INSERT INTO users (email, password_hash, name, email_verified)
        VALUES ('dev@sibylla.io', ${passwordHash}, 'Dev User', true)
        ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `
      
      console.log('✅ Created test user: dev@sibylla.io')
      
      // Create test workspace
      const [workspace] = await sql`
        INSERT INTO workspaces (name, description, icon)
        VALUES ('Test Workspace', 'A workspace for development testing', '🧪')
        RETURNING id
      `
      
      console.log('✅ Created test workspace')
      
      // Add user as admin
      await sql`
        INSERT INTO workspace_members (user_id, workspace_id, role)
        VALUES (${user.id}, ${workspace.id}, 'admin')
        ON CONFLICT (user_id, workspace_id) DO NOTHING
      `
      
      console.log('✅ Added user as workspace admin')
      console.log('🎉 Seeding complete!')
      
      process.exit(0)
    }
    
    seed().catch((error) => {
      console.error('❌ Seeding failed:', error)
      process.exit(1)
    })
    ```

### 数据模型

**ER 图：**

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
│ created_at  │                                   │ updated_at  │
│ updated_at  │                                   └─────────────┘
└─────────────┘
```

### API 规范

本任务主要提供数据库基础设施，API 端点将在后续任务中实现。

**更新健康检查端点：**

```
GET /api/v1/health
Response 200:
{
  "status": "ok",
  "timestamp": "2026-03-04T10:00:00.000Z",
  "version": "0.0.1",
  "checks": {
    "database": true
  }
}

GET /api/v1/health/ready
Response 200:
{
  "ready": true,
  "database": {
    "connected": true,
    "latencyMs": 5
  }
}
```

## 验收标准

### 功能完整性

- [ ] 运行 `npm run migrate:up` 能成功创建所有表
- [ ] 运行 `npm run migrate:down` 能成功回滚最后一次 migration
- [ ] Migration 失败时能自动回滚，保持数据完整性
- [ ] 服务启动时能验证数据库连接
- [ ] 数据库连接失败时每 5 秒重试
- [ ] 健康检查端点返回数据库连接状态

### 性能指标

- [ ] 数据库连接建立时间 < 1 秒
- [ ] 简单查询响应时间 < 50ms
- [ ] Migration 执行时间 < 30 秒

### 用户体验

- [ ] Migration 执行有清晰的日志输出
- [ ] 数据库错误信息对开发者友好
- [ ] 种子数据脚本可重复执行（幂等）

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] SQL 使用参数化查询，防止注入
- [ ] 所有数据库操作有错误处理
- [ ] Migration 文件有清晰注释

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 70%

**关键测试用例：**

1. **数据库连接测试**
   - 验证连接池正常工作
   - 验证连接超时处理

2. **用户模型测试**
   - 创建用户
   - 按 ID 查询
   - 按邮箱查询
   - 邮箱唯一性约束

3. **事务测试**
   - 成功提交
   - 失败回滚

### 集成测试

**测试场景：**

1. Migration 完整流程
   - up → 验证表存在 → down → 验证表不存在

2. 健康检查集成
   - 数据库正常时返回 connected: true
   - 数据库断开时返回 connected: false

### 端到端测试

暂不要求 E2E 测试。

## 依赖关系

### 前置依赖

- [ ] TASK004 - 云端服务框架搭建（需要 Docker Compose 中的 PostgreSQL 容器）

### 被依赖任务

- TASK006 - 认证服务实现（需要 users 表）
- TASK007 - Git 托管服务配置（需要 workspaces 表）
- 所有后续需要数据库的功能

### 阻塞风险

- PostgreSQL 容器启动失败
- pgvector 扩展安装问题

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| Migration 工具兼容性 | 中 | 低 | 使用成熟的 node-pg-migrate |
| pgvector 扩展问题 | 中 | 低 | 使用官方 pgvector Docker 镜像 |
| 连接池耗尽 | 高 | 低 | 合理配置连接池大小，监控连接数 |
| SQL 注入 | 高 | 低 | 强制使用参数化查询 |

### 时间风险

- 复杂 schema 设计可能需要迭代
- Migration 调试可能耗时

### 资源风险

- 需要 Docker 环境运行 PostgreSQL
- 测试需要独立的测试数据库

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) - 项目宪法
- [`specs/design/architecture.md`](../../design/architecture.md) - 系统架构
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) - 数据与 API 设计
- [`specs/requirements/phase0/infrastructure-setup.md`](../../requirements/phase0/infrastructure-setup.md) - 基础设施需求
- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)
- [pgvector 文档](https://github.com/pgvector/pgvector)
- [postgres.js 文档](https://github.com/porsager/postgres)
- [node-pg-migrate 文档](https://github.com/salsita/node-pg-migrate)

## 实施计划

### 第1步：数据库配置

- 配置数据库连接参数
- 实现连接池管理
- 实现连接健康检查
- 预计耗时：3 小时

### 第2步：Migration 系统

- 安装和配置 node-pg-migrate
- 创建 migration 脚本命令
- 编写第一个 migration（启用扩展）
- 预计耗时：2 小时

### 第3步：核心表 Migration

- 编写 users 表 migration
- 编写 workspaces 表 migration
- 编写 workspace_members 表 migration
- 测试 up 和 down
- 预计耗时：4 小时

### 第4步：数据模型

- 实现 User 模型
- 实现 Workspace 模型
- 实现 WorkspaceMember 模型
- 实现事务管理工具
- 预计耗时：4 小时

### 第5步：集成与测试

- 集成健康检查
- 编写种子数据脚本
- 编写单元测试
- 更新 README
- 预计耗时：3 小时

## 完成标准

**本任务完成的标志：**

1. 所有 migration 能成功执行和回滚
2. 数据库连接在服务启动时验证
3. 健康检查端点返回数据库状态
4. 所有数据模型测试通过
5. 种子数据脚本可重复执行

**交付物：**

- [ ] Migration 文件（001-004）
- [ ] 数据库连接模块
- [ ] 数据模型（User, Workspace, WorkspaceMember）
- [ ] 种子数据脚本
- [ ] 单元测试
- [ ] 更新 README（数据库相关命令说明）

## 备注

### 开发建议

1. 使用 postgres.js 而非 pg，性能更好且 API 更现代
2. Migration 文件使用纯 SQL，便于 DBA 审查
3. 每个 migration 保持小而专注，便于回滚
4. 所有字段使用 snake_case，TypeScript 中使用 camelCase
5. 预留向量字段，但不在此任务实现向量搜索逻辑

### 已知问题

- pgvector 需要特定的 Docker 镜像（pgvector/pgvector:pg16）
- 生产环境需要配置 SSL 连接

---

**创建时间：** 2026-03-04  
**最后更新：** 2026-03-04  
**更新记录：**
- 2026-03-04 - 初始创建
