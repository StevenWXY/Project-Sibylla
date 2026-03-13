# FileManager 重构计划 - 禁止路径机制优化

## 任务概述

**创建时间:** 2026-03-13  
**任务目标:** 重构 FileManager 的禁止路径机制，允许在特定上下文（如 workspace 创建）中访问系统目录

## 问题分析

### 当前问题

1. **WorkspaceManager 需要创建系统目录**
   - 需要创建 `.sibylla/` 目录及其子目录
   - 需要写入 `.sibylla/config.json`、`.sibylla/members.json` 等配置文件
   - 这些路径在 [`FileManager`](../sibylla-desktop/src/main/services/file-manager.ts) 的 `CORE_FORBIDDEN_PATHS` 中被禁止

2. **当前的临时解决方案**
   - [`WorkspaceManager`](../sibylla-desktop/src/main/services/workspace-manager.ts) 直接使用 `fs.promises` 绕过 FileManager
   - 这破坏了架构的一致性和安全性
   - 代码重复，缺乏统一的错误处理和日志记录

3. **核心矛盾**
   - FileManager 的禁止路径机制是为了保护系统目录不被用户操作误修改
   - 但 WorkspaceManager 作为系统组件，需要合法地创建和管理这些系统目录

### 代码位置

- FileManager: [`sibylla-desktop/src/main/services/file-manager.ts`](../sibylla-desktop/src/main/services/file-manager.ts)
- WorkspaceManager: [`sibylla-desktop/src/main/services/workspace-manager.ts`](../sibylla-desktop/src/main/services/workspace-manager.ts)
- 测试文件:
  - [`sibylla-desktop/tests/services/file-manager-core.test.ts`](../sibylla-desktop/tests/services/file-manager-core.test.ts)
  - [`sibylla-desktop/tests/services/workspace-manager.test.ts`](../sibylla-desktop/tests/services/workspace-manager.test.ts)

## 设计方案对比

### 方案 1: 上下文感知的 FileManager（推荐）

**核心思路:** 为 FileManager 添加操作上下文（context），允许特定上下文绕过禁止路径检查

**优点:**
- ✅ 保持架构一致性，所有文件操作通过 FileManager
- ✅ 安全性可控，只有明确的系统上下文可以绕过检查
- ✅ 统一的错误处理和日志记录
- ✅ 易于审计和调试
- ✅ 扩展性好，未来可以添加更多上下文类型

**缺点:**
- ⚠️ 需要修改 FileManager API，增加可选的 context 参数
- ⚠️ 需要更新所有调用 FileManager 的代码（但大部分不需要传 context）

**实现方式:**
```typescript
// 定义操作上下文
enum FileOperationContext {
  USER = 'user',           // 用户操作（默认，受限制）
  SYSTEM = 'system',       // 系统操作（可访问系统目录）
  WORKSPACE_INIT = 'workspace_init', // Workspace 初始化（可访问 .sibylla）
}

// FileManager 方法签名示例
async writeFile(
  relativePath: string,
  content: string,
  options?: WriteFileOptions & { context?: FileOperationContext }
): Promise<void>

// WorkspaceManager 使用示例
await this.fileManager.writeFile(
  '.sibylla/config.json',
  configJson,
  { context: FileOperationContext.SYSTEM }
)
```

### 方案 2: 独立的 WorkspaceFileManager

**核心思路:** 创建一个专门用于 workspace 操作的 FileManager 子类或包装器

**优点:**
- ✅ 职责分离清晰
- ✅ 不影响现有 FileManager API

**缺点:**
- ❌ 代码重复，需要维护两套类似的逻辑
- ❌ 增加系统复杂度
- ❌ 不够灵活，未来其他系统组件也可能需要类似功能

### 方案 3: 完全独立的 Workspace 创建逻辑

**核心思路:** WorkspaceManager 完全不使用 FileManager，自己管理文件操作

**优点:**
- ✅ 实现简单，不需要修改 FileManager

**缺点:**
- ❌ 破坏架构一致性
- ❌ 缺乏统一的错误处理和日志
- ❌ 代码重复
- ❌ 难以维护和测试

### 方案选择

**选择方案 1: 上下文感知的 FileManager**

理由:
1. 最符合系统架构设计原则
2. 安全性和灵活性的最佳平衡
3. 长期维护成本最低
4. 为未来扩展提供良好基础

## 详细设计

### 1. 类型定义

在 [`file-manager.types.ts`](../sibylla-desktop/src/main/services/types/file-manager.types.ts) 中添加:

```typescript
/**
 * File operation context
 * 
 * Determines the security level and restrictions for file operations
 */
export enum FileOperationContext {
  /**
   * User-initiated operations (default)
   * - Subject to all security restrictions
   * - Cannot access forbidden system directories
   */
  USER = 'user',
  
  /**
   * System-level operations
   * - Can access all directories including forbidden ones
   * - Used by core system components like WorkspaceManager
   * - Should be used with caution and proper logging
   */
  SYSTEM = 'system',
  
  /**
   * Workspace initialization operations
   * - Can access .sibylla directory for workspace setup
   * - More restricted than SYSTEM but less than USER
   */
  WORKSPACE_INIT = 'workspace_init',
}

/**
 * Extended options for file operations with context
 */
export interface FileOperationOptions {
  /**
   * Operation context (default: USER)
   */
  context?: FileOperationContext
}
```

### 2. FileManager 修改

#### 2.1 添加 context 参数到所有文件操作方法

```typescript
// 示例：writeFile 方法
async writeFile(
  relativePath: string,
  content: string,
  options?: WriteFileOptions & FileOperationOptions
): Promise<void>

// 示例：createDirectory 方法
async createDirectory(
  relativePath: string,
  options?: FileOperationOptions
): Promise<void>
```

#### 2.2 修改 validatePath 方法

```typescript
/**
 * Validate a path for security
 * 
 * @param fullPath - Absolute path to validate
 * @param context - Operation context (default: USER)
 * @throws {FileManagerError} If path is invalid or forbidden
 */
validatePath(
  fullPath: string,
  context: FileOperationContext = FileOperationContext.USER
): void {
  // 1. 始终检查路径遍历攻击
  const normalized = path.normalize(fullPath)
  if (!normalized.startsWith(this.workspaceRoot)) {
    throw new FileManagerError(
      FILE_ERROR_CODES.PATH_OUTSIDE_WORKSPACE,
      `Path outside workspace: ${fullPath}`,
      { fullPath, workspaceRoot: this.workspaceRoot }
    )
  }
  
  // 2. 根据上下文决定是否检查禁止路径
  if (context === FileOperationContext.USER) {
    // 用户操作：检查所有禁止路径
    this.checkForbiddenPaths(fullPath)
  } else if (context === FileOperationContext.WORKSPACE_INIT) {
    // Workspace 初始化：只允许访问 .sibylla
    this.checkWorkspaceInitPaths(fullPath)
  }
  // SYSTEM 上下文：跳过禁止路径检查
  
  // 3. 检查路径长度
  if (process.platform === 'win32' && fullPath.length > 260) {
    throw new FileManagerError(
      FILE_ERROR_CODES.PATH_TOO_LONG,
      'Path exceeds Windows MAX_PATH limit',
      { fullPath, length: fullPath.length }
    )
  }
  
  // 4. 记录系统级操作
  if (context !== FileOperationContext.USER) {
    logger.warn('[FileManager] System-level operation', {
      context,
      path: fullPath,
      stack: new Error().stack
    })
  }
}

/**
 * Check if path accesses forbidden directories (for USER context)
 */
private checkForbiddenPaths(fullPath: string): void {
  const relativePath = path.relative(this.workspaceRoot, fullPath)
  const segments = relativePath.split(path.sep)
  
  const allForbiddenPaths = [
    ...FileManager.CORE_FORBIDDEN_PATHS,
    ...this.customForbiddenPaths
  ]
  
  for (const forbiddenPattern of allForbiddenPaths) {
    const forbiddenSegments = forbiddenPattern.split('/')
    
    for (let i = 0; i <= segments.length - forbiddenSegments.length; i++) {
      let match = true
      for (let j = 0; j < forbiddenSegments.length; j++) {
        if (segments[i + j] !== forbiddenSegments[j]) {
          match = false
          break
        }
      }
      
      if (match) {
        throw new FileManagerError(
          FILE_ERROR_CODES.ACCESS_FORBIDDEN,
          `Access to system directory forbidden: ${forbiddenPattern}`,
          { fullPath, forbiddenDir: forbiddenPattern }
        )
      }
    }
  }
}

/**
 * Check if path is valid for WORKSPACE_INIT context
 */
private checkWorkspaceInitPaths(fullPath: string): void {
  const relativePath = path.relative(this.workspaceRoot, fullPath)
  
  // WORKSPACE_INIT 只能访问 .sibylla 目录
  if (!relativePath.startsWith('.sibylla')) {
    // 对于非 .sibylla 路径，应用正常的禁止路径检查
    this.checkForbiddenPaths(fullPath)
  }
  // .sibylla 路径允许访问
}
```

### 3. WorkspaceManager 修改

移除所有直接使用 `fs.promises` 的代码，改用 FileManager:

```typescript
// 之前：直接使用 fs
const fs = await import('fs').then(m => m.promises)
await fs.mkdir(fullPath, { recursive: true })

// 之后：使用 FileManager with SYSTEM context
await this.fileManager.createDirectory(
  node.path,
  { context: FileOperationContext.SYSTEM }
)

// 之前：直接写入配置文件
await fs.writeFile(configPath, configJson, { encoding: 'utf-8' })

// 之后：使用 FileManager with SYSTEM context
await this.fileManager.writeFile(
  WORKSPACE_STRUCTURE.SYSTEM_CONFIG,
  configJson,
  { context: FileOperationContext.SYSTEM }
)
```

### 4. 安全考虑

1. **审计日志**
   - 所有 SYSTEM 和 WORKSPACE_INIT 上下文的操作都会被记录
   - 包含调用栈信息，便于追踪

2. **最小权限原则**
   - WORKSPACE_INIT 只能访问 `.sibylla` 目录
   - SYSTEM 权限应该谨慎使用，仅限核心系统组件

3. **防止滥用**
   - context 参数是可选的，默认为 USER
   - 只有明确需要的地方才传递 SYSTEM 或 WORKSPACE_INIT

## 实施步骤

### 步骤 1: 更新类型定义 ✅

- [x] 在 [`file-manager.types.ts`](../sibylla-desktop/src/main/services/types/file-manager.types.ts) 中添加 `FileOperationContext` 枚举
- [x] 添加 `FileOperationOptions` 接口
- [x] 更新现有的 options 接口以扩展 `FileOperationOptions`

### 步骤 2: 重构 FileManager

- [ ] 修改 [`validatePath()`](../sibylla-desktop/src/main/services/file-manager.ts:166) 方法添加 context 参数
- [ ] 添加 `checkForbiddenPaths()` 私有方法
- [ ] 添加 `checkWorkspaceInitPaths()` 私有方法
- [ ] 更新所有文件操作方法的签名，添加 context 支持:
  - [ ] [`readFile()`](../sibylla-desktop/src/main/services/file-manager.ts:253)
  - [ ] [`writeFile()`](../sibylla-desktop/src/main/services/file-manager.ts:320)
  - [ ] [`deleteFile()`](../sibylla-desktop/src/main/services/file-manager.ts:400)
  - [ ] [`copyFile()`](../sibylla-desktop/src/main/services/file-manager.ts:440)
  - [ ] [`moveFile()`](../sibylla-desktop/src/main/services/file-manager.ts:500)
  - [ ] [`createDirectory()`](../sibylla-desktop/src/main/services/file-manager.ts:580)
  - [ ] [`deleteDirectory()`](../sibylla-desktop/src/main/services/file-manager.ts:620)
  - [ ] [`listFiles()`](../sibylla-desktop/src/main/services/file-manager.ts:680)
- [ ] 添加系统级操作的审计日志

### 步骤 3: 重构 WorkspaceManager

- [ ] 移除所有直接使用 `fs.promises` 的代码
- [ ] 在 [`createDirectoryStructure()`](../sibylla-desktop/src/main/services/workspace-manager.ts:341) 中使用 FileManager with SYSTEM context
- [ ] 在 [`writeConfig()`](../sibylla-desktop/src/main/services/workspace-manager.ts:362) 中使用 FileManager with SYSTEM context
- [ ] 在 [`writeMembersConfig()`](../sibylla-desktop/src/main/services/workspace-manager.ts:376) 中使用 FileManager with SYSTEM context
- [ ] 在 [`writePointsConfig()`](../sibylla-desktop/src/main/services/workspace-manager.ts:393) 中使用 FileManager with SYSTEM context
- [ ] 在 [`generateInitialDocuments()`](../sibylla-desktop/src/main/services/workspace-manager.ts:407) 中使用 FileManager with SYSTEM context

### 步骤 4: 更新测试用例

#### 4.1 FileManager 测试

在 [`file-manager-core.test.ts`](../sibylla-desktop/tests/services/file-manager-core.test.ts) 中添加:

- [ ] 测试 USER context 禁止访问系统目录
- [ ] 测试 SYSTEM context 可以访问所有目录
- [ ] 测试 WORKSPACE_INIT context 只能访问 .sibylla
- [ ] 测试 context 默认值为 USER
- [ ] 测试系统级操作的日志记录
- [ ] 测试边界情况:
  - [ ] 尝试用 WORKSPACE_INIT 访问 .git（应该失败）
  - [ ] 尝试用 WORKSPACE_INIT 访问 .sibylla/index（应该成功）
  - [ ] 尝试用 USER 访问 .sibylla（应该失败）

#### 4.2 WorkspaceManager 测试

在 [`workspace-manager.test.ts`](../sibylla-desktop/tests/services/workspace-manager.test.ts) 中添加:

- [ ] 测试 workspace 创建时正确创建 .sibylla 目录
- [ ] 测试配置文件正确写入
- [ ] 测试创建失败时的清理逻辑
- [ ] 测试并发创建 workspace
- [ ] 测试在只读目录创建 workspace（应该失败）
- [ ] 测试在已存在的非空目录创建 workspace（应该失败）

#### 4.3 集成测试

创建新的集成测试文件 `tests/integration/workspace-filemanager-integration.test.ts`:

- [ ] 测试完整的 workspace 创建流程
- [ ] 验证所有文件和目录都通过 FileManager 创建
- [ ] 验证审计日志正确记录
- [ ] 测试 workspace 打开和验证

### 步骤 5: 文档更新

- [ ] 更新 [`file-manager.ts`](../sibylla-desktop/src/main/services/file-manager.ts) 的 JSDoc 注释
- [ ] 更新 [`workspace-manager.ts`](../sibylla-desktop/src/main/services/workspace-manager.ts) 的 JSDoc 注释
- [ ] 在 README 或设计文档中说明 context 机制
- [ ] 添加安全最佳实践指南

### 步骤 6: 代码审查和验证

- [ ] 运行所有测试确保通过
- [ ] 检查 TypeScript 编译无错误
- [ ] 手动测试 workspace 创建和打开
- [ ] 验证审计日志正确记录
- [ ] 代码审查检查清单:
  - [ ] 所有系统级操作都有适当的日志
  - [ ] 没有遗漏的 fs.promises 直接调用
  - [ ] context 参数使用正确
  - [ ] 错误处理完整

## 测试策略

### 单元测试

1. **FileManager 测试**
   - 测试覆盖率目标: ≥ 90%
   - 重点测试 validatePath 的不同 context 行为
   - 测试所有文件操作方法的 context 支持

2. **WorkspaceManager 测试**
   - 测试覆盖率目标: ≥ 85%
   - 重点测试 workspace 创建流程
   - 测试错误处理和清理逻辑

### 集成测试

1. **端到端 workspace 创建**
   - 创建完整的 workspace
   - 验证所有文件和目录存在
   - 验证配置文件内容正确

2. **安全性测试**
   - 尝试用 USER context 访问系统目录（应该失败）
   - 验证 SYSTEM context 的审计日志
   - 测试路径遍历攻击防护

### 性能测试

1. **大量文件操作**
   - 创建包含大量文件的 workspace
   - 测试并发操作性能
   - 验证内存使用合理

## 风险和缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| context 参数被滥用 | 高 | 低 | 代码审查 + 审计日志 + 文档说明 |
| 破坏现有功能 | 高 | 中 | 完整的测试覆盖 + 渐进式重构 |
| 性能下降 | 中 | 低 | context 检查逻辑简单高效 |
| 跨平台兼容性问题 | 中 | 低 | 使用 Node.js path 模块 + 跨平台测试 |

## 验收标准

- [x] 所有 TypeScript 编译错误已修复
- [ ] FileManager 支持 context 参数
- [ ] WorkspaceManager 不再直接使用 fs.promises
- [ ] 所有单元测试通过，覆盖率 ≥ 85%
- [ ] 集成测试通过
- [ ] 手动测试 workspace 创建和打开成功
- [ ] 审计日志正确记录系统级操作
- [ ] 代码审查通过
- [ ] 文档更新完成

## 参考资料

- [`file-manager.ts`](../sibylla-desktop/src/main/services/file-manager.ts) - FileManager 实现
- [`workspace-manager.ts`](../sibylla-desktop/src/main/services/workspace-manager.ts) - WorkspaceManager 实现
- [`file-manager.types.ts`](../sibylla-desktop/src/main/services/types/file-manager.types.ts) - 类型定义
- [`workspace.types.ts`](../sibylla-desktop/src/main/services/types/workspace.types.ts) - Workspace 类型定义
- [TASK008 计划](./phase0-task008-step5-implementation-checklist.md) - FileManager 实现计划
- [TASK009 计划](./phase0-task009-workspace-initialization-plan.md) - Workspace 初始化计划

## 时间估算

| 步骤 | 预计时间 |
|------|---------|
| 步骤 1: 类型定义 | 0.5h |
| 步骤 2: FileManager 重构 | 3h |
| 步骤 3: WorkspaceManager 重构 | 2h |
| 步骤 4: 测试用例 | 4h |
| 步骤 5: 文档更新 | 1h |
| 步骤 6: 审查和验证 | 1.5h |
| **总计** | **12h** |

## 下一步行动

1. 与团队讨论设计方案，确认方案 1 是否合适
2. 开始实施步骤 1：更新类型定义
3. 逐步完成 FileManager 和 WorkspaceManager 的重构
4. 编写完整的测试用例
5. 进行代码审查和验证

---

**创建时间:** 2026-03-13  
**最后更新:** 2026-03-13  
**状态:** 待审查
