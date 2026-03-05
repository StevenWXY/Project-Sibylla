# 认证服务实现

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE0-TASK006 |
| **任务标题** | 认证服务实现 |
| **所属阶段** | Phase 0 - 基础设施搭建 |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现完整的用户认证服务，包括注册、登录、JWT Token 管理、刷新令牌机制，为客户端与云端的安全通信提供基础。

### 背景

Sibylla 云端服务的所有 API（除健康检查外）都需要认证保护。本任务实现基于 JWT 的无状态认证机制，支持 Access Token + Refresh Token 双令牌策略，确保安全性的同时提供良好的用户体验。

### 范围

**包含：**
- 用户注册 API（邮箱 + 密码）
- 用户登录 API
- JWT Access Token 签发
- Refresh Token 签发与存储
- Token 刷新 API
- 登出 API（吊销 Refresh Token）
- 认证中间件
- 密码安全策略（Argon2 哈希）

**不包含：**
- 邮箱验证流程（后续迭代）
- 密码重置流程（后续迭代）
- OAuth 第三方登录（后续迭代）
- 两步验证（后续迭代）
- 用户资料管理 API

## 技术要求

### 技术栈

- **@fastify/jwt:** ^8.0.0（JWT 插件）
- **@node-rs/argon2:** ^1.7.0（密码哈希，Rust 实现，高性能）
- **nanoid:** ^5.0.0（生成 Refresh Token ID）
- **zod:** ^3.22.0（请求验证）

### 架构设计

```
sibylla-cloud/
├── src/
│   ├── routes/
│   │   └── auth.ts              # 认证路由
│   ├── services/
│   │   └── auth.service.ts      # 认证业务逻辑
│   ├── middleware/
│   │   └── auth.middleware.ts   # JWT 验证中间件
│   ├── plugins/
│   │   └── jwt.ts               # JWT 插件配置
│   └── types/
│       └── auth.ts              # 认证相关类型
├── migrations/
│   └── 006_create_refresh_tokens.sql  # Refresh Token 表
```

### 实现细节

#### 关键实现点

1. **JWT 插件配置（src/plugins/jwt.ts）**
   ```typescript
   import { FastifyInstance } from 'fastify'
   import fastifyJwt from '@fastify/jwt'
   import { config } from '../config'

   export interface JwtPayload {
     userId: string
     email: string
     iat?: number
     exp?: number
   }

   declare module '@fastify/jwt' {
     interface FastifyJWT {
       payload: JwtPayload
       user: JwtPayload
     }
   }

   export async function jwtPlugin(app: FastifyInstance): Promise<void> {
     await app.register(fastifyJwt, {
       secret: config.jwt.secret,
       sign: {
         expiresIn: config.jwt.accessTokenExpiresIn  // e.g., '15m'
       },
       verify: {
         maxAge: config.jwt.accessTokenExpiresIn
       }
     })

     // Decorate with authentication method
     app.decorate('authenticate', async function (request, reply) {
       try {
         await request.jwtVerify()
       } catch (err) {
         reply.status(401).send({
           error: {
             code: 'UNAUTHORIZED',
             message: 'Invalid or expired token'
           }
         })
       }
     })
   }

   declare module 'fastify' {
     interface FastifyInstance {
       authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
     }
   }
   ```

2. **Refresh Token 表（migrations/006_create_refresh_tokens.sql）**
   ```sql
   -- Create refresh_tokens table for managing user sessions
   
   CREATE TABLE refresh_tokens (
       id VARCHAR(32) PRIMARY KEY,          -- nanoid
       user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       token_hash VARCHAR(64) NOT NULL,     -- SHA-256 hash of token
       expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
       revoked_at TIMESTAMP WITH TIME ZONE,
       
       -- Device/client info for session management
       user_agent TEXT,
       ip_address INET
   );
   
   -- Indexes
   CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
   CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at) 
       WHERE revoked_at IS NULL;
   
   -- Cleanup old tokens (can be run as scheduled job)
   -- DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '30 days';
   
   COMMENT ON TABLE refresh_tokens IS 'Refresh tokens for JWT authentication';
   COMMENT ON COLUMN refresh_tokens.token_hash IS 'SHA-256 hash of the actual token (never store raw)';
   ```

3. **认证服务（src/services/auth.service.ts）**
   ```typescript
   import { hash, verify } from '@node-rs/argon2'
   import { nanoid } from 'nanoid'
   import { createHash } from 'crypto'
   import { sql } from '../db/client'
   import { UserModel, CreateUserInput, User } from '../models/user.model'
   import { config } from '../config'
   import { logger } from '../utils/logger'

   // Argon2 configuration (OWASP recommended)
   const ARGON2_OPTIONS = {
     memoryCost: 65536,     // 64 MB
     timeCost: 3,
     parallelism: 4
   }

   export interface RegisterInput {
     email: string
     password: string
     name: string
   }

   export interface LoginInput {
     email: string
     password: string
   }

   export interface AuthTokens {
     accessToken: string
     refreshToken: string
     expiresIn: number
   }

   export interface RefreshTokenData {
     userId: string
     tokenId: string
     userAgent?: string
     ipAddress?: string
   }

   export const AuthService = {
     /**
      * Register a new user
      */
     async register(input: RegisterInput): Promise<User> {
       // Check if email already exists
       const existing = await UserModel.findByEmail(input.email)
       if (existing) {
         throw new AuthError('EMAIL_EXISTS', 'Email already registered')
       }

       // Validate password strength
       validatePassword(input.password)

       // Hash password
       const passwordHash = await hash(input.password, ARGON2_OPTIONS)

       // Create user
       const user = await UserModel.create({
         email: input.email,
         passwordHash,
         name: input.name
       })

       logger.info({ userId: user.id, email: user.email }, 'User registered')
       return user
     },

     /**
      * Login user and return tokens
      */
     async login(
       input: LoginInput,
       app: FastifyInstance,
       metadata?: { userAgent?: string; ipAddress?: string }
     ): Promise<AuthTokens> {
       // Find user
       const user = await UserModel.findByEmail(input.email)
       if (!user) {
         throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password')
       }

       // Verify password
       const valid = await verify(user.passwordHash, input.password)
       if (!valid) {
         throw new AuthError('INVALID_CREDENTIALS', 'Invalid email or password')
       }

       // Update last login
       await UserModel.updateLastLogin(user.id)

       // Generate tokens
       const tokens = await this.generateTokens(app, user, metadata)

       logger.info({ userId: user.id }, 'User logged in')
       return tokens
     },

     /**
      * Generate access and refresh tokens
      */
     async generateTokens(
       app: FastifyInstance,
       user: User,
       metadata?: { userAgent?: string; ipAddress?: string }
     ): Promise<AuthTokens> {
       // Generate access token
       const accessToken = app.jwt.sign({
         userId: user.id,
         email: user.email
       })

       // Generate refresh token
       const refreshToken = nanoid(64)
       const tokenId = nanoid(32)
       const tokenHash = hashToken(refreshToken)
       const expiresAt = new Date(Date.now() + config.jwt.refreshTokenExpiresInMs)

       // Store refresh token
       await sql`
         INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, ip_address)
         VALUES (${tokenId}, ${user.id}, ${tokenHash}, ${expiresAt}, 
                 ${metadata?.userAgent || null}, ${metadata?.ipAddress || null})
       `

       return {
         accessToken,
         refreshToken: `${tokenId}.${refreshToken}`,
         expiresIn: config.jwt.accessTokenExpiresInSeconds
       }
     },

     /**
      * Refresh access token using refresh token
      */
     async refreshAccessToken(
       app: FastifyInstance,
       refreshToken: string
     ): Promise<AuthTokens> {
       // Parse refresh token
       const [tokenId, token] = refreshToken.split('.')
       if (!tokenId || !token) {
         throw new AuthError('INVALID_TOKEN', 'Invalid refresh token format')
       }

       const tokenHash = hashToken(token)

       // Find and validate refresh token
       const result = await sql`
         SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at,
                u.id as uid, u.email, u.name
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
         WHERE rt.id = ${tokenId} 
           AND rt.token_hash = ${tokenHash}
       `

       const record = result[0]
       if (!record) {
         throw new AuthError('INVALID_TOKEN', 'Refresh token not found')
       }

       if (record.revoked_at) {
         throw new AuthError('TOKEN_REVOKED', 'Refresh token has been revoked')
       }

       if (new Date(record.expires_at as string) < new Date()) {
         throw new AuthError('TOKEN_EXPIRED', 'Refresh token has expired')
       }

       // Revoke old refresh token (rotation)
       await sql`
         UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE id = ${tokenId}
       `

       // Generate new tokens
       const user: User = {
         id: record.uid as string,
         email: record.email as string,
         name: record.name as string,
         passwordHash: '',
         avatarUrl: null,
         emailVerified: false,
         lastLoginAt: null,
         createdAt: new Date(),
         updatedAt: new Date()
       }

       return await this.generateTokens(app, user)
     },

     /**
      * Logout - revoke refresh token
      */
     async logout(refreshToken: string): Promise<void> {
       const [tokenId] = refreshToken.split('.')
       if (!tokenId) return

       await sql`
         UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE id = ${tokenId} AND revoked_at IS NULL
       `

       logger.info({ tokenId }, 'User logged out')
     },

     /**
      * Revoke all refresh tokens for a user
      */
     async revokeAllTokens(userId: string): Promise<void> {
       await sql`
         UPDATE refresh_tokens
         SET revoked_at = NOW()
         WHERE user_id = ${userId} AND revoked_at IS NULL
       `

       logger.info({ userId }, 'All tokens revoked')
     }
   }

   // Helper functions
   function hashToken(token: string): string {
     return createHash('sha256').update(token).digest('hex')
   }

   function validatePassword(password: string): void {
     if (password.length < 8) {
       throw new AuthError('WEAK_PASSWORD', 'Password must be at least 8 characters')
     }
     if (password.length > 128) {
       throw new AuthError('WEAK_PASSWORD', 'Password must be at most 128 characters')
     }
     // Additional checks can be added: uppercase, number, special char, etc.
   }

   // Custom error class
   export class AuthError extends Error {
     constructor(
       public code: string,
       message: string
     ) {
       super(message)
       this.name = 'AuthError'
     }
   }
   ```

4. **认证路由（src/routes/auth.ts）**
   ```typescript
   import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
   import { z } from 'zod'
   import { AuthService, AuthError } from '../services/auth.service'

   // Request schemas
   const registerSchema = z.object({
     email: z.string().email('Invalid email format'),
     password: z.string().min(8, 'Password must be at least 8 characters'),
     name: z.string().min(1, 'Name is required').max(100)
   })

   const loginSchema = z.object({
     email: z.string().email('Invalid email format'),
     password: z.string().min(1, 'Password is required')
   })

   const refreshSchema = z.object({
     refreshToken: z.string().min(1, 'Refresh token is required')
   })

   export async function authRoutes(app: FastifyInstance): Promise<void> {
     /**
      * POST /api/v1/auth/register
      * Register a new user
      */
     app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
       try {
         const body = registerSchema.parse(request.body)
         const user = await AuthService.register(body)

         // Auto-login after registration
         const tokens = await AuthService.generateTokens(app, user, {
           userAgent: request.headers['user-agent'],
           ipAddress: request.ip
         })

         return reply.status(201).send({
           user: {
             id: user.id,
             email: user.email,
             name: user.name
           },
           ...tokens
         })
       } catch (error) {
         return handleAuthError(error, reply)
       }
     })

     /**
      * POST /api/v1/auth/login
      * Login and get tokens
      */
     app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
       try {
         const body = loginSchema.parse(request.body)
         const tokens = await AuthService.login(body, app, {
           userAgent: request.headers['user-agent'],
           ipAddress: request.ip
         })

         return reply.send(tokens)
       } catch (error) {
         return handleAuthError(error, reply)
       }
     })

     /**
      * POST /api/v1/auth/refresh
      * Refresh access token
      */
     app.post('/refresh', async (request: FastifyRequest, reply: FastifyReply) => {
       try {
         const body = refreshSchema.parse(request.body)
         const tokens = await AuthService.refreshAccessToken(app, body.refreshToken)

         return reply.send(tokens)
       } catch (error) {
         return handleAuthError(error, reply)
       }
     })

     /**
      * POST /api/v1/auth/logout
      * Logout and revoke refresh token
      */
     app.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
       try {
         const body = refreshSchema.parse(request.body)
         await AuthService.logout(body.refreshToken)

         return reply.status(204).send()
       } catch (error) {
         return handleAuthError(error, reply)
       }
     })

     /**
      * GET /api/v1/auth/me
      * Get current user info (requires authentication)
      */
     app.get('/me', {
       preHandler: [app.authenticate]
     }, async (request: FastifyRequest, reply: FastifyReply) => {
       const { userId } = request.user
       const user = await UserModel.findById(userId)

       if (!user) {
         return reply.status(404).send({
           error: {
             code: 'USER_NOT_FOUND',
             message: 'User not found'
           }
         })
       }

       return reply.send({
         id: user.id,
         email: user.email,
         name: user.name,
         avatarUrl: user.avatarUrl,
         emailVerified: user.emailVerified,
         createdAt: user.createdAt
       })
     })
   }

   // Error handler helper
   function handleAuthError(error: unknown, reply: FastifyReply): FastifyReply {
     if (error instanceof z.ZodError) {
       return reply.status(400).send({
         error: {
           code: 'VALIDATION_ERROR',
           message: 'Invalid request data',
           details: error.errors
         }
       })
     }

     if (error instanceof AuthError) {
       const statusMap: Record<string, number> = {
         'EMAIL_EXISTS': 409,
         'INVALID_CREDENTIALS': 401,
         'INVALID_TOKEN': 401,
         'TOKEN_REVOKED': 401,
         'TOKEN_EXPIRED': 401,
         'WEAK_PASSWORD': 400
       }
       const status = statusMap[error.code] || 400

       return reply.status(status).send({
         error: {
           code: error.code,
           message: error.message
         }
       })
     }

     // Unexpected error
     throw error
   }
   ```

5. **认证中间件（src/middleware/auth.middleware.ts）**
   ```typescript
   import { FastifyRequest, FastifyReply } from 'fastify'

   /**
    * Global authentication middleware
    * Use as preHandler on protected routes
    */
   export async function requireAuth(
     request: FastifyRequest,
     reply: FastifyReply
   ): Promise<void> {
     try {
       await request.jwtVerify()
     } catch (err) {
       reply.status(401).send({
         error: {
           code: 'UNAUTHORIZED',
           message: 'Authentication required'
         }
       })
     }
   }

   /**
    * Optional authentication middleware
    * Verifies token if present, but doesn't require it
    */
   export async function optionalAuth(
     request: FastifyRequest,
     reply: FastifyReply
   ): Promise<void> {
     const auth = request.headers.authorization
     if (auth && auth.startsWith('Bearer ')) {
       try {
         await request.jwtVerify()
       } catch {
         // Token invalid, but don't block - just don't set user
       }
     }
   }

   /**
    * Check if user has specific role in workspace
    */
   export function requireWorkspaceRole(roles: string[]) {
     return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
       await requireAuth(request, reply)
       
       // Role checking will be implemented when workspace routes are added
       // For now, just verify authentication
     }
   }
   ```

6. **配置更新（src/config/index.ts）**
   ```typescript
   import { env } from './env'

   export const config = {
     // ... existing config
     
     jwt: {
       secret: env.JWT_SECRET || 'dev-secret-change-in-production',
       accessTokenExpiresIn: '15m',
       accessTokenExpiresInSeconds: 15 * 60,
       refreshTokenExpiresIn: '7d',
       refreshTokenExpiresInMs: 7 * 24 * 60 * 60 * 1000
     }
   }
   ```

### 数据模型

**Refresh Token 表结构：**

```
┌──────────────────────┐
│   refresh_tokens     │
├──────────────────────┤
│ id (PK) VARCHAR(32)  │
│ user_id (FK) UUID    │──> users.id
│ token_hash VARCHAR(64)│
│ expires_at TIMESTAMPTZ│
│ created_at TIMESTAMPTZ│
│ revoked_at TIMESTAMPTZ│
│ user_agent TEXT      │
│ ip_address INET      │
└──────────────────────┘
```

### API 规范

**注册 API：**

```
POST /api/v1/auth/register
Content-Type: application/json

Request:
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "name": "John Doe"
}

Response 201:
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "tokenId.randomToken...",
  "expiresIn": 900
}

Response 409:
{
  "error": {
    "code": "EMAIL_EXISTS",
    "message": "Email already registered"
  }
}
```

**登录 API：**

```
POST /api/v1/auth/login
Content-Type: application/json

Request:
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}

Response 200:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "tokenId.randomToken...",
  "expiresIn": 900
}

Response 401:
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

**刷新 Token API：**

```
POST /api/v1/auth/refresh
Content-Type: application/json

Request:
{
  "refreshToken": "tokenId.randomToken..."
}

Response 200:
{
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "newTokenId.newRandomToken...",
  "expiresIn": 900
}

Response 401:
{
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Refresh token has expired"
  }
}
```

**登出 API：**

```
POST /api/v1/auth/logout
Content-Type: application/json

Request:
{
  "refreshToken": "tokenId.randomToken..."
}

Response 204: (No Content)
```

**获取当前用户 API：**

```
GET /api/v1/auth/me
Authorization: Bearer <accessToken>

Response 200:
{
  "id": "uuid",
  "email": "user@example.com",
  "name": "John Doe",
  "avatarUrl": null,
  "emailVerified": false,
  "createdAt": "2026-03-04T10:00:00.000Z"
}

Response 401:
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  }
}
```

## 验收标准

### 功能完整性

- [ ] 用户可以使用邮箱和密码注册
- [ ] 注册后自动登录并返回 tokens
- [ ] 用户可以使用邮箱和密码登录
- [ ] 登录返回 Access Token 和 Refresh Token
- [ ] Access Token 15 分钟过期
- [ ] Refresh Token 7 天过期
- [ ] 可以使用 Refresh Token 获取新的 Access Token
- [ ] Refresh Token 使用后自动轮换（旧的失效）
- [ ] 登出后 Refresh Token 被吊销
- [ ] 未认证请求到受保护端点返回 401

### 性能指标

- [ ] 密码哈希时间 < 500ms
- [ ] Token 验证时间 < 10ms
- [ ] 登录 API 响应时间 < 200ms（P95）

### 用户体验

- [ ] 错误信息不泄露敏感信息（如"邮箱不存在"）
- [ ] 密码强度要求清晰
- [ ] Token 过期有明确的错误码

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] 密码使用 Argon2 哈希（不是 bcrypt/MD5/SHA）
- [ ] Refresh Token 存储的是哈希值（不是明文）
- [ ] JWT Secret 从环境变量读取
- [ ] 所有认证逻辑有单元测试

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 80%

**关键测试用例：**

1. **注册测试**
   - 正常注册流程
   - 邮箱已存在
   - 密码太弱
   - 邮箱格式无效

2. **登录测试**
   - 正常登录
   - 邮箱不存在
   - 密码错误
   - 返回正确的 token 格式

3. **Token 刷新测试**
   - 正常刷新
   - Refresh Token 过期
   - Refresh Token 已吊销
   - Token 格式无效

4. **登出测试**
   - 正常登出
   - 登出后旧 Refresh Token 失效

### 集成测试

**测试场景：**

1. 完整注册登录流程
   - 注册 → 使用 Token 访问 /me → 刷新 Token → 再次访问 /me

2. Token 轮换安全性
   - 使用 Refresh Token A → 获得新 Token B → Token A 失效

3. 并发登录
   - 同一用户在多设备登录
   - 每个设备有独立的 Refresh Token

### 端到端测试

暂不要求 E2E 测试。

## 依赖关系

### 前置依赖

- [ ] TASK004 - 云端服务框架搭建
- [ ] TASK005 - 数据库初始化与 Migration（需要 users 表）

### 被依赖任务

- TASK007 - Git 托管服务配置（需要认证保护 Git 操作）
- TASK013 - 客户端与云端集成测试
- 所有需要认证的后续 API

### 阻塞风险

- JWT Secret 配置问题
- Argon2 在不同平台的编译问题

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| JWT Secret 泄露 | 高 | 低 | 使用强随机 Secret，环境变量存储 |
| Argon2 编译问题 | 中 | 中 | 使用 @node-rs/argon2（预编译） |
| Token 被盗用 | 高 | 低 | Access Token 短过期、Refresh Token 轮换 |
| 时序攻击 | 中 | 低 | 使用常量时间比较函数 |

### 时间风险

- 安全测试可能需要额外时间
- 边界情况处理可能增加工作量

### 资源风险

- 需要安全审查
- 需要测试不同场景下的 Token 行为

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) - 项目宪法
- [`specs/design/architecture.md`](../../design/architecture.md) - 系统架构
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) - 数据与 API 设计
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [@fastify/jwt 文档](https://github.com/fastify/fastify-jwt)
- [Argon2 参数选择](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#argon2id)

## 实施计划

### 第1步：JWT 插件配置

- 安装 @fastify/jwt
- 配置 JWT Secret 和过期时间
- 实现 authenticate 装饰器
- 预计耗时：2 小时

### 第2步：Refresh Token 存储

- 创建 refresh_tokens 表 migration
- 实现 Token 存储和查询函数
- 预计耗时：2 小时

### 第3步：认证服务实现

- 实现密码哈希（Argon2）
- 实现注册逻辑
- 实现登录逻辑
- 实现 Token 生成
- 预计耗时：4 小时

### 第4步：Token 管理

- 实现 Token 刷新
- 实现 Token 轮换
- 实现登出（Token 吊销）
- 预计耗时：3 小时

### 第5步：路由和中间件

- 实现认证路由
- 实现认证中间件
- 请求验证（zod）
- 预计耗时：3 小时

### 第6步：测试

- 单元测试
- 集成测试
- 安全测试
- 预计耗时：4 小时

## 完成标准

**本任务完成的标志：**

1. 所有认证 API 正常工作
2. Token 机制符合安全标准
3. 受保护端点正确拒绝未认证请求
4. 所有测试通过
5. 无安全漏洞

**交付物：**

- [ ] 认证服务代码
- [ ] JWT 插件配置
- [ ] Refresh Token 表 migration
- [ ] 认证中间件
- [ ] 单元测试和集成测试
- [ ] API 文档更新

## 备注

### 开发建议

1. 使用 @node-rs/argon2 而非 argon2（纯 JS 版本性能差）
2. Access Token 保持短过期（15分钟），Refresh Token 长过期（7天）
3. Refresh Token 每次使用后轮换，防止重放攻击
4. 不要在错误信息中区分"邮箱不存在"和"密码错误"
5. 生产环境 JWT Secret 至少 256 位随机字符串

### 安全考虑

- 密码不得以明文存储或日志输出
- Refresh Token 不得以明文存储在数据库
- JWT Secret 不得硬编码在代码中
- 考虑实现登录失败次数限制（可后续迭代）
- 考虑实现 Token 黑名单（可后续迭代）

### 已知问题

- 邮箱验证功能将在后续迭代实现
- 密码重置功能将在后续迭代实现
- 多因素认证将在后续迭代实现

---

**创建时间：** 2026-03-04  
**最后更新：** 2026-03-04  
**更新记录：**
- 2026-03-04 - 初始创建
