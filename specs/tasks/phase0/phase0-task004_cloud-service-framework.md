# 云端服务框架搭建

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE0-TASK004 |
| **任务标题** | 云端服务框架搭建 |
| **所属阶段** | Phase 0 - 基础设施搭建 |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

搭建 Sibylla 云端服务的基础架构，建立标准的项目结构、Web 框架、开发环境和 Docker 部署配置，为后续云端功能开发（认证、Git 托管、语义搜索等）提供稳定的技术基座。

### 背景

Sibylla 采用 Electron 客户端 + 轻量云端服务的架构。云端服务承担认证、Git 托管、通知推送、语义搜索、AI 网关和积分账本等职责。本任务是云端基础设施的起点，所有云端功能都将基于此架构开发。

本任务可与客户端任务（TASK001-003）并行开发。

### 范围

**包含：**
- Fastify Web 框架初始化与配置
- TypeScript 严格模式配置
- 项目目录结构规范
- 基础中间件（错误处理、日志、CORS）
- Docker 与 Docker Compose 配置
- 健康检查端点实现
- 开发环境热重载
- 环境变量管理

**不包含：**
- 数据库连接与 Migration（TASK005）
- 认证服务实现（TASK006）
- Git 托管服务配置（TASK007）
- 业务逻辑代码

## 技术要求

### 技术栈

- **Node.js:** ≥ 20.0.0
- **TypeScript:** ^5.3.0（strict mode）
- **Fastify:** ^4.25.0
- **Docker:** ≥ 24.0.0
- **Docker Compose:** ≥ 2.20.0
- **pino:** ^8.0.0（日志）
- **dotenv:** ^16.0.0（环境变量）

### 架构设计

```
sibylla-cloud/
├── src/
│   ├── index.ts                # 服务入口
│   ├── app.ts                  # Fastify 应用实例
│   ├── config/                 # 配置模块
│   │   ├── index.ts           # 配置聚合
│   │   ├── env.ts             # 环境变量加载
│   │   └── database.ts        # 数据库配置（预留）
│   ├── routes/                 # 路由模块
│   │   ├── index.ts           # 路由注册
│   │   └── health.ts          # 健康检查路由
│   ├── services/               # 业务服务（预留）
│   │   └── .gitkeep
│   ├── middleware/             # 中间件
│   │   ├── error.middleware.ts    # 错误处理
│   │   ├── logger.middleware.ts   # 请求日志
│   │   └── cors.middleware.ts     # CORS 配置
│   ├── plugins/                # Fastify 插件
│   │   └── index.ts
│   ├── models/                 # 数据模型（预留）
│   │   └── .gitkeep
│   ├── types/                  # 类型定义
│   │   └── index.ts
│   └── utils/                  # 工具函数
│       └── logger.ts
├── tests/                      # 测试文件
│   └── health.test.ts
├── docker/                     # Docker 配置
│   ├── Dockerfile
│   └── Dockerfile.dev
├── docker-compose.yml          # Docker Compose 配置
├── docker-compose.dev.yml      # 开发环境 Docker Compose
├── .env.example                # 环境变量示例
├── tsconfig.json               # TypeScript 配置
├── package.json
├── vitest.config.ts            # 测试配置
├── .eslintrc.json              # ESLint 配置
├── .prettierrc                 # Prettier 配置
└── README.md
```

### 实现细节

#### 关键实现点

1. **服务入口（src/index.ts）**
   ```typescript
   import { buildApp } from './app'
   import { config } from './config'
   import { logger } from './utils/logger'

   async function start(): Promise<void> {
     const app = await buildApp()
     
     try {
       await app.listen({
         port: config.port,
         host: config.host
       })
       logger.info(`Server listening on ${config.host}:${config.port}`)
     } catch (err) {
       logger.error(err, 'Failed to start server')
       process.exit(1)
     }
   }

   // Graceful shutdown
   const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']
   signals.forEach((signal) => {
     process.on(signal, async () => {
       logger.info(`Received ${signal}, shutting down gracefully...`)
       process.exit(0)
     })
   })

   start()
   ```

2. **Fastify 应用实例（src/app.ts）**
   ```typescript
   import Fastify, { FastifyInstance } from 'fastify'
   import { registerRoutes } from './routes'
   import { errorMiddleware } from './middleware/error.middleware'
   import { corsMiddleware } from './middleware/cors.middleware'
   import { config } from './config'

   export async function buildApp(): Promise<FastifyInstance> {
     const app = Fastify({
       logger: config.isDevelopment ? {
         transport: {
           target: 'pino-pretty',
           options: { colorize: true }
         }
       } : true,
       trustProxy: true
     })

     // Register plugins
     await app.register(corsMiddleware)

     // Register error handler
     app.setErrorHandler(errorMiddleware)

     // Register routes
     await registerRoutes(app)

     return app
   }
   ```

3. **健康检查路由（src/routes/health.ts）**
   ```typescript
   import { FastifyInstance } from 'fastify'

   interface HealthResponse {
     status: 'ok' | 'degraded' | 'error'
     timestamp: string
     version: string
     checks?: {
       database?: boolean
       redis?: boolean
     }
   }

   export async function healthRoutes(app: FastifyInstance): Promise<void> {
     app.get<{ Reply: HealthResponse }>('/api/v1/health', async () => {
       return {
         status: 'ok',
         timestamp: new Date().toISOString(),
         version: process.env.npm_package_version || '0.0.0'
       }
     })

     app.get('/api/v1/health/ready', async () => {
       // Readiness check - for Kubernetes
       // Will add database/redis checks in TASK005
       return { ready: true }
     })

     app.get('/api/v1/health/live', async () => {
       // Liveness check - for Kubernetes
       return { live: true }
     })
   }
   ```

4. **配置管理（src/config/env.ts）**
   ```typescript
   import dotenv from 'dotenv'
   import { z } from 'zod'

   dotenv.config()

   const envSchema = z.object({
     NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
     PORT: z.string().transform(Number).default('3000'),
     HOST: z.string().default('0.0.0.0'),
     LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
     
     // Database - will be used in TASK005
     DATABASE_URL: z.string().optional(),
     
     // JWT - will be used in TASK006
     JWT_SECRET: z.string().optional(),
     JWT_EXPIRES_IN: z.string().default('7d'),
     
     // CORS
     CORS_ORIGIN: z.string().default('*'),
   })

   const parsed = envSchema.safeParse(process.env)

   if (!parsed.success) {
     console.error('❌ Invalid environment variables:')
     console.error(parsed.error.format())
     process.exit(1)
   }

   export const env = parsed.data

   export const config = {
     isDevelopment: env.NODE_ENV === 'development',
     isProduction: env.NODE_ENV === 'production',
     isTest: env.NODE_ENV === 'test',
     port: env.PORT,
     host: env.HOST,
     logLevel: env.LOG_LEVEL,
     cors: {
       origin: env.CORS_ORIGIN
     }
   }
   ```

5. **错误处理中间件（src/middleware/error.middleware.ts）**
   ```typescript
   import { FastifyError, FastifyReply, FastifyRequest } from 'fastify'
   import { logger } from '../utils/logger'

   export interface ApiError {
     error: {
       code: string
       message: string
       details?: Record<string, unknown>
     }
   }

   export function errorMiddleware(
     error: FastifyError,
     request: FastifyRequest,
     reply: FastifyReply
   ): void {
     logger.error({
       err: error,
       request: {
         method: request.method,
         url: request.url,
         headers: request.headers
       }
     }, 'Request error')

     const statusCode = error.statusCode || 500
     const response: ApiError = {
       error: {
         code: error.code || 'INTERNAL_ERROR',
         message: error.message || 'An unexpected error occurred'
       }
     }

     if (error.validation) {
       response.error.code = 'VALIDATION_ERROR'
       response.error.details = { validation: error.validation }
     }

     reply.status(statusCode).send(response)
   }
   ```

6. **Docker Compose 配置（docker-compose.yml）**
   ```yaml
   version: '3.8'

   services:
     api:
       build:
         context: .
         dockerfile: docker/Dockerfile
       ports:
         - "${PORT:-3000}:3000"
       environment:
         - NODE_ENV=production
         - PORT=3000
         - DATABASE_URL=postgresql://sibylla:sibylla@postgres:5432/sibylla
         - REDIS_URL=redis://redis:6379
       depends_on:
         postgres:
           condition: service_healthy
         redis:
           condition: service_started
       restart: unless-stopped

     postgres:
       image: pgvector/pgvector:pg16
       environment:
         POSTGRES_USER: sibylla
         POSTGRES_PASSWORD: sibylla
         POSTGRES_DB: sibylla
       volumes:
         - postgres_data:/var/lib/postgresql/data
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U sibylla"]
         interval: 5s
         timeout: 5s
         retries: 5
       restart: unless-stopped

     redis:
       image: redis:7-alpine
       volumes:
         - redis_data:/data
       restart: unless-stopped

   volumes:
     postgres_data:
     redis_data:
   ```

7. **Dockerfile（docker/Dockerfile）**
   ```dockerfile
   # Build stage
   FROM node:20-alpine AS builder

   WORKDIR /app

   COPY package*.json ./
   RUN npm ci

   COPY . .
   RUN npm run build

   # Production stage
   FROM node:20-alpine AS production

   WORKDIR /app

   # Create non-root user
   RUN addgroup -g 1001 -S nodejs && \
       adduser -S nodejs -u 1001

   COPY --from=builder /app/dist ./dist
   COPY --from=builder /app/node_modules ./node_modules
   COPY --from=builder /app/package*.json ./

   USER nodejs

   EXPOSE 3000

   CMD ["node", "dist/index.js"]
   ```

8. **package.json 脚本**
   ```json
   {
     "name": "sibylla-cloud",
     "version": "0.0.1",
     "private": true,
     "scripts": {
       "dev": "tsx watch src/index.ts",
       "build": "tsc",
       "start": "node dist/index.js",
       "lint": "eslint src --ext .ts",
       "lint:fix": "eslint src --ext .ts --fix",
       "type-check": "tsc --noEmit",
       "test": "vitest run",
       "test:watch": "vitest",
       "test:coverage": "vitest run --coverage",
       "docker:dev": "docker-compose -f docker-compose.dev.yml up --build",
       "docker:build": "docker build -t sibylla-cloud -f docker/Dockerfile .",
       "docker:up": "docker-compose up -d",
       "docker:down": "docker-compose down"
     }
   }
   ```

### 数据模型

本任务不涉及数据模型，将在 TASK005 中实现。

### API 规范

**健康检查 API：**

```
GET /api/v1/health
Response 200:
{
  "status": "ok",
  "timestamp": "2026-03-04T10:00:00.000Z",
  "version": "0.0.1"
}

GET /api/v1/health/ready
Response 200: { "ready": true }

GET /api/v1/health/live
Response 200: { "live": true }
```

**错误响应格式：**

```
Response 4xx/5xx:
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

## 验收标准

### 功能完整性

- [ ] 运行 `npm run dev` 能在 5 秒内启动开发服务器
- [ ] 服务监听在配置的端口（默认 3000）
- [ ] 发送 GET 请求到 `/api/v1/health` 返回 200 状态和正确的 JSON
- [ ] 发送无效 JSON 请求返回 400 状态和错误信息
- [ ] 运行 `npm run build` 能无错误完成 TypeScript 编译
- [ ] 运行 `docker-compose up` 能正常启动所有服务

### 性能指标

- [ ] 服务冷启动时间 < 5 秒
- [ ] 健康检查响应时间 < 50ms
- [ ] Docker 镜像构建时间 < 3 分钟

### 用户体验

- [ ] 开发模式下修改代码能自动热重载
- [ ] 日志输出格式清晰、信息完整
- [ ] 错误信息对开发者友好

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过，无警告
- [ ] 所有配置文件有注释说明
- [ ] README 包含完整的开发环境搭建步骤

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 60%

**关键测试用例：**

1. **健康检查端点测试**
   - 输入：GET /api/v1/health
   - 预期输出：200 状态，包含 status、timestamp、version
   - 边界条件：服务正常运行

2. **错误处理测试**
   - 输入：无效 JSON 请求
   - 预期输出：400 状态，错误格式正确
   - 边界条件：各种错误类型

### 集成测试

**测试场景：**

1. 服务启动测试
   - 启动服务
   - 验证端口监听成功
   - 验证健康检查可访问

2. Docker 容器测试
   - 构建 Docker 镜像
   - 运行容器
   - 验证服务可访问

### 端到端测试

暂不要求 E2E 测试，将在 TASK013 集成测试阶段补充。

## 依赖关系

### 前置依赖

- 无（本任务可与客户端任务并行开发）

### 被依赖任务

- TASK005 - 数据库初始化与 Migration
- TASK006 - 认证服务实现
- TASK007 - Git 托管服务配置
- 所有后续云端功能开发任务

### 阻塞风险

- Docker 环境配置问题
- Node.js 版本兼容性
- 网络端口冲突

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| Fastify 插件兼容性问题 | 中 | 低 | 使用官方推荐插件，锁定版本 |
| Docker 构建缓存失效 | 低 | 中 | 优化 Dockerfile 层级，使用多阶段构建 |
| 环境变量配置错误 | 中 | 中 | 使用 zod 进行运行时验证 |

### 时间风险

- Docker 配置调试可能需要额外时间
- 多环境配置（开发/测试/生产）可能增加工作量

### 资源风险

- 需要 Docker 环境
- 需要足够的磁盘空间用于镜像构建

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) - 项目宪法
- [`specs/design/architecture.md`](../../design/architecture.md) - 系统架构
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) - 数据与 API 设计
- [`specs/requirements/phase0/infrastructure-setup.md`](../../requirements/phase0/infrastructure-setup.md) - 基础设施需求
- [Fastify 官方文档](https://www.fastify.io/)
- [Docker 官方文档](https://docs.docker.com/)

## 实施计划

### 第1步：项目初始化

- 创建项目目录结构
- 初始化 package.json
- 安装核心依赖（fastify、typescript、tsx、pino）
- 配置 TypeScript（strict mode）
- 配置 ESLint 和 Prettier
- 预计耗时：2 小时

### 第2步：实现 Fastify 应用框架

- 创建应用入口和实例
- 实现配置管理（环境变量、zod 验证）
- 实现日志工具
- 预计耗时：3 小时

### 第3步：实现中间件和路由

- 实现错误处理中间件
- 实现 CORS 中间件
- 实现健康检查路由
- 路由注册框架
- 预计耗时：3 小时

### 第4步：Docker 配置

- 编写 Dockerfile（多阶段构建）
- 编写 docker-compose.yml
- 编写 docker-compose.dev.yml
- 测试 Docker 构建和运行
- 预计耗时：4 小时

### 第5步：测试和文档

- 编写单元测试
- 编写 README
- 创建 .env.example
- 进行集成测试
- 预计耗时：4 小时

## 完成标准

**本任务完成的标志：**

1. 能够运行 `npm run dev` 启动开发服务器
2. 健康检查端点返回正确响应
3. 能够运行 `docker-compose up` 启动完整服务栈
4. TypeScript 编译无错误
5. 所有测试通过

**交付物：**

- [ ] 完整的云端服务框架代码
- [ ] Docker 配置文件
- [ ] 单元测试
- [ ] README.md（包含环境搭建和运行说明）
- [ ] .env.example（环境变量示例）

## 备注

### 开发建议

1. 优先使用 Fastify 官方插件，确保兼容性
2. 日志使用结构化格式，便于后续日志收集
3. 环境变量使用 zod 进行运行时验证，尽早发现配置错误
4. Docker 镜像使用 Alpine 基础镜像，减小体积
5. 预留数据库和 Redis 连接配置，但不实现具体功能

### 已知问题

- PostgreSQL 和 Redis 容器在本任务中仅做预留，实际连接将在 TASK005 实现
- 生产环境部署可能需要额外的安全配置（TLS、防火墙等）

---

**创建时间：** 2026-03-04  
**最后更新：** 2026-03-04  
**更新记录：**
- 2026-03-04 - 初始创建
