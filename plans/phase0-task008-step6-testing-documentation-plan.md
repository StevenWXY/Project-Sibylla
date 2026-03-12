# Phase0-Task008 第6步：测试和文档计划

> 本文档规划文件管理器模块的测试补充和 API 文档编写工作。

---

## 一、当前测试覆盖情况分析

### 1.1 已完成的测试

#### 单元测试（[`file-manager.test.ts`](../sibylla-desktop/tests/services/file-manager.test.ts)）
- ✅ 目录操作测试（12个测试用例）
  - `createDirectory()` - 单层/嵌套/幂等性/错误处理
  - `listFiles()` - 非递归/递归/隐藏文件/自定义过滤器
  - `deleteDirectory()` - 空目录/非空目录/安全模式/错误处理
  - 路径验证 - 工作区外路径/禁止目录（.git/node_modules/.sibylla）

#### 单元测试（[`file-watcher.test.ts`](../sibylla-desktop/tests/services/file-watcher.test.ts)）
- ✅ 文件监控测试（12个测试用例）
  - `startWatching()` - 文件添加/修改/删除、目录添加/删除、重复启动、隐藏文件、快速变化
  - `stopWatching()` - 停止监控/幂等性/重启
  - 事件详情 - 文件统计信息

#### 集成测试（[`file-handler.test.ts`](../sibylla-desktop/tests/ipc/file-handler.test.ts)）
- ✅ IPC 集成测试（22个测试用例）
  - 文件读写操作 - read/write/delete/copy/move
  - 文件信息操作 - info/exists/list
  - 目录操作 - create/delete（单层/嵌套）
  - 文件监控 - start/stop/事件推送
  - 错误处理 - 文件不存在/路径验证/未初始化
  - 类型转换 - Date → ISO 8601
  - 选项处理 - read/write/list 选项

### 1.2 测试覆盖缺口

根据任务规范（[`phase0-task008_file-manager.md`](../specs/tasks/phase0/phase0-task008_file-manager.md)）第6步要求，以下测试尚未完成：

#### 单元测试缺口
1. **文件读写操作测试**（未覆盖）
   - `readFile()` - 正常读取/编码支持/大小限制/错误处理
   - `writeFile()` - 原子写入/临时文件清理/目录自动创建
   - `deleteFile()` - 文件删除/错误处理
   - `copyFile()` - 文件复制/跨目录/错误处理
   - `moveFile()` - 文件移动/跨设备降级

2. **路径工具方法测试**（未覆盖）
   - `resolvePath()` - 相对路径解析
   - `validatePath()` - 路径安全验证
   - `getRelativePath()` - 绝对路径转相对路径
   - `exists()` - 文件存在性检查
   - `getFileInfo()` - 文件元信息获取

3. **边界条件测试**（部分覆盖）
   - 大文件处理（10MB 限制）
   - 特殊字符文件名
   - 长路径（Windows MAX_PATH）
   - 并发操作
   - 磁盘空间不足

#### 集成测试缺口
1. **性能测试**（未覆盖）
   - 读取 1MB 文件 < 100ms
   - 写入 1MB 文件 < 200ms
   - 列出 100 个文件 < 50ms
   - 递归列出 1000 个文件 < 500ms
   - 文件监控事件延迟 < 500ms

2. **压力测试**（未覆盖）
   - 大量文件操作
   - 快速连续操作
   - 内存泄漏检测

#### 跨平台测试（未覆盖）
- macOS 测试
- Windows 测试（路径长度/路径分隔符/权限）
- Linux 测试（可选）

---

## 二、测试补充方案

### 2.1 单元测试补充

#### 测试文件：`tests/services/file-manager-core.test.ts`

**测试范围：** 文件读写操作和路径工具方法

```typescript
/**
 * FileManager Core Operations Test Suite
 * 
 * Tests for core file operations:
 * - readFile() / writeFile() / deleteFile()
 * - copyFile() / moveFile()
 * - Path utility methods
 * - Edge cases and error handling
 */

describe('FileManager - Core Operations', () => {
  describe('readFile()', () => {
    it('should read file with default encoding (utf-8)')
    it('should read file with custom encoding')
    it('should reject file exceeding size limit')
    it('should reject non-existent file')
    it('should handle special characters in filename')
  })

  describe('writeFile()', () => {
    it('should write file with atomic write (default)')
    it('should write file without atomic write')
    it('should create parent directories automatically')
    it('should clean up temp file on write failure')
    it('should overwrite existing file')
    it('should handle concurrent writes to same file')
  })

  describe('deleteFile()', () => {
    it('should delete existing file')
    it('should reject non-existent file')
    it('should reject directory as file')
  })

  describe('copyFile()', () => {
    it('should copy file within workspace')
    it('should copy file to nested directory')
    it('should create destination directory if needed')
    it('should reject copying to existing file')
  })

  describe('moveFile()', () => {
    it('should move file within same filesystem')
    it('should move file across directories')
    it('should fallback to copy+delete on cross-device move')
    it('should reject moving to existing file')
  })

  describe('Path Utilities', () => {
    it('should resolve relative path correctly')
    it('should validate path within workspace')
    it('should reject path outside workspace')
    it('should reject forbidden directories')
    it('should convert absolute path to relative')
    it('should handle Windows-style paths (on Windows)')
  })

  describe('File Information', () => {
    it('should check file existence')
    it('should get file metadata')
    it('should handle symlinks correctly')
  })

  describe('Edge Cases', () => {
    it('should handle empty file')
    it('should handle file with special characters')
    it('should handle very long filename (< 255 chars)')
    it('should reject path exceeding Windows MAX_PATH (on Windows)')
    it('should handle concurrent operations')
  })
})
```

**预估测试用例数：** 30个  
**预估工时：** 4小时

---

#### 测试文件：`tests/services/file-manager-performance.test.ts`

**测试范围：** 性能基准测试

```typescript
/**
 * FileManager Performance Test Suite
 * 
 * Validates performance requirements from task specification
 */

describe('FileManager - Performance', () => {
  describe('Read Performance', () => {
    it('should read 1MB file in < 100ms', async () => {
      // Create 1MB test file
      const content = 'x'.repeat(1024 * 1024)
      await fileManager.writeFile('large.txt', content)
      
      // Measure read time
      const start = performance.now()
      await fileManager.readFile('large.txt')
      const duration = performance.now() - start
      
      expect(duration).toBeLessThan(100)
    })
    
    it('should read 10MB file in < 1000ms')
  })

  describe('Write Performance', () => {
    it('should write 1MB file in < 200ms')
    it('should write 10MB file in < 2000ms')
  })

  describe('List Performance', () => {
    it('should list 100 files in < 50ms')
    it('should list 1000 files recursively in < 500ms')
  })

  describe('Watch Performance', () => {
    it('should detect file change in < 500ms')
    it('should handle 10 rapid changes without dropping events')
  })

  describe('Stress Tests', () => {
    it('should handle 1000 sequential writes without memory leak')
    it('should handle 100 concurrent reads')
  })
})
```

**预估测试用例数：** 10个  
**预估工时：** 2小时

---

### 2.2 集成测试补充

#### 测试文件：`tests/integration/file-system-integration.test.ts`

**测试范围：** 端到端文件系统操作流程

```typescript
/**
 * File System Integration Test Suite
 * 
 * Tests complete workflows involving multiple components
 */

describe('File System Integration', () => {
  describe('Workspace Initialization Flow', () => {
    it('should create workspace structure')
    it('should initialize with default files')
    it('should start file watching automatically')
  })

  describe('File Editing Flow', () => {
    it('should read → modify → write → verify')
    it('should detect changes via file watcher')
    it('should handle concurrent edits')
  })

  describe('File Organization Flow', () => {
    it('should create directory → move files → list files')
    it('should copy files → verify integrity')
    it('should delete files → verify cleanup')
  })

  describe('Error Recovery Flow', () => {
    it('should recover from write failure')
    it('should handle disk full scenario')
    it('should handle permission denied')
  })
})
```

**预估测试用例数：** 12个  
**预估工时：** 3小时

---

### 2.3 跨平台测试方案

#### 测试策略

**测试环境：**
- **macOS**（主要开发环境）- 本地测试
- **Windows**（关键目标平台）- GitHub Actions CI
- **Linux**（可选）- GitHub Actions CI

**平台特定测试：**

```typescript
// tests/platform/windows.test.ts
describe('Windows Platform Tests', () => {
  it('should handle backslash path separators')
  it('should reject paths exceeding MAX_PATH (260 chars)')
  it('should handle Windows reserved filenames (CON, PRN, AUX)')
  it('should handle case-insensitive filesystem')
})

// tests/platform/macos.test.ts
describe('macOS Platform Tests', () => {
  it('should handle Unicode normalization (NFD vs NFC)')
  it('should handle .DS_Store files')
  it('should respect macOS file permissions')
})
```

**CI 配置（GitHub Actions）：**

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    strategy:
      matrix:
        os: [macos-latest, windows-latest, ubuntu-latest]
        node: [18, 20]
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node }}
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

**预估工时：** 2小时（CI 配置 + 平台特定测试）

---

## 三、API 文档规划

### 3.1 文档结构

```
sibylla-desktop/docs/
├── api/
│   ├── file-manager.md          # FileManager API 文档
│   ├── file-watcher.md          # FileWatcher API 文档
│   ├── file-handler-ipc.md      # IPC 接口文档
│   └── examples/
│       ├── basic-usage.md       # 基础用法示例
│       ├── advanced-usage.md    # 高级用法示例
│       └── error-handling.md    # 错误处理指南
└── architecture/
    └── file-system-design.md    # 文件系统架构设计
```

---

### 3.2 文档内容规划

#### 文档1：`docs/api/file-manager.md`

**内容大纲：**

```markdown
# FileManager API 文档

## 概述
FileManager 是 Sibylla 的核心文件管理服务，提供安全、高效的文件系统操作接口。

## 类：FileManager

### 构造函数
\`\`\`typescript
constructor(workspaceRoot: string)
\`\`\`

### 文件读写方法

#### readFile()
读取文件内容。

**签名：**
\`\`\`typescript
async readFile(
  relativePath: string, 
  options?: ReadFileOptions
): Promise<FileContent>
\`\`\`

**参数：**
- `relativePath` - 相对于工作区根目录的文件路径
- `options` - 可选配置
  - `encoding` - 文件编码（默认：'utf-8'）
  - `maxSize` - 最大文件大小（默认：10MB）

**返回值：**
- `FileContent` 对象，包含文件内容和元信息

**异常：**
- `FILE_NOT_FOUND` - 文件不存在
- `FILE_TOO_LARGE` - 文件超过大小限制
- `PATH_OUTSIDE_WORKSPACE` - 路径在工作区外

**示例：**
\`\`\`typescript
const content = await fileManager.readFile('README.md')
console.log(content.content) // 文件内容
console.log(content.size)    // 文件大小
\`\`\`

#### writeFile()
写入文件内容（原子写入）。

[详细文档...]

### 目录操作方法

#### listFiles()
[详细文档...]

#### createDirectory()
[详细文档...]

### 文件监控方法

#### startWatching()
[详细文档...]

### 工具方法

#### resolvePath()
[详细文档...]

## 类型定义

### FileInfo
[详细文档...]

### FileContent
[详细文档...]

### FileWatchEvent
[详细文档...]

## 错误码

| 错误码 | 说明 | 处理建议 |
|--------|------|----------|
| `PATH_OUTSIDE_WORKSPACE` | 路径在工作区外 | 检查路径是否正确 |
| `FILE_NOT_FOUND` | 文件不存在 | 确认文件路径 |
| `FILE_TOO_LARGE` | 文件过大 | 增加 maxSize 限制 |

## 最佳实践

### 原子写入
所有写入操作默认使用原子写入机制...

### 路径安全
始终使用相对路径...

### 性能优化
批量操作时使用 Promise.all()...
```

**预估工时：** 4小时

---

#### 文档2：`docs/api/file-handler-ipc.md`

**内容大纲：**

```markdown
# FileHandler IPC 接口文档

## 概述
FileHandler 提供渲染进程与主进程之间的文件操作 IPC 通信接口。

## IPC 通道列表

### 文件操作通道

#### `file:read`
读取文件内容。

**请求参数：**
\`\`\`typescript
{
  relativePath: string
  options?: ReadFileOptions
}
\`\`\`

**响应：**
\`\`\`typescript
{
  success: true
  data: FileContent
} | {
  success: false
  error: { code: string, message: string }
}
\`\`\`

**渲染进程调用示例：**
\`\`\`typescript
const result = await window.api.file.read('README.md')
if (result.success) {
  console.log(result.data.content)
} else {
  console.error(result.error.message)
}
\`\`\`

[其他通道文档...]

## Preload API

### window.api.file

\`\`\`typescript
interface FileAPI {
  read(path: string, options?: ReadFileOptions): Promise<IpcResponse<FileContent>>
  write(path: string, content: string, options?: WriteFileOptions): Promise<IpcResponse<void>>
  delete(path: string): Promise<IpcResponse<void>>
  // ...
}
\`\`\`

## 错误处理

[错误处理指南...]

## 类型安全

[TypeScript 类型定义...]
```

**预估工时：** 3小时

---

#### 文档3：`docs/api/examples/basic-usage.md`

**内容大纲：**

```markdown
# FileManager 基础用法示例

## 场景1：读取和写入文件

\`\`\`typescript
// 读取文件
const content = await fileManager.readFile('docs/guide.md')
console.log(content.content)

// 修改内容
const newContent = content.content + '\n\n## 新章节'

// 写入文件（原子写入）
await fileManager.writeFile('docs/guide.md', newContent)
\`\`\`

## 场景2：遍历目录

\`\`\`typescript
// 列出所有 Markdown 文件
const files = await fileManager.listFiles('docs', {
  recursive: true,
  filter: (file) => file.extension === '.md'
})

files.forEach(file => {
  console.log(file.path, file.size)
})
\`\`\`

## 场景3：监控文件变化

\`\`\`typescript
// 启动文件监控
await fileManager.startWatching((event) => {
  console.log(`File ${event.type}: ${event.path}`)
  
  if (event.type === 'change') {
    // 文件被修改，重新加载
    reloadFile(event.path)
  }
})

// 停止监控
await fileManager.stopWatching()
\`\`\`

## 场景4：错误处理

\`\`\`typescript
try {
  await fileManager.readFile('non-existent.txt')
} catch (error) {
  if (error.code === FILE_ERROR_CODES.FILE_NOT_FOUND) {
    console.log('文件不存在，创建新文件')
    await fileManager.writeFile('non-existent.txt', '默认内容')
  } else {
    throw error
  }
}
\`\`\`
```

**预估工时：** 2小时

---

#### 文档4：`docs/architecture/file-system-design.md`

**内容大纲：**

```markdown
# 文件系统架构设计

## 设计目标

1. **安全性** - 防止路径遍历攻击，保护系统目录
2. **可靠性** - 原子写入，防止数据丢失
3. **性能** - 高效的文件操作和监控
4. **跨平台** - 兼容 macOS、Windows、Linux

## 架构图

\`\`\`mermaid
graph TB
    Renderer[渲染进程] -->|IPC| FileHandler[FileHandler]
    FileHandler -->|调用| FileManager[FileManager]
    FileManager -->|使用| FileWatcher[FileWatcher]
    FileManager -->|操作| FS[Node.js fs/promises]
    FileWatcher -->|监控| Chokidar[chokidar]
    Chokidar -->|事件| FS
\`\`\`

## 核心设计

### 原子写入机制

[详细设计...]

### 路径安全验证

[详细设计...]

### 文件监控策略

[详细设计...]

## 性能优化

### 批量操作

[优化策略...]

### 内存管理

[优化策略...]

## 安全考虑

### 路径遍历防护

[安全措施...]

### 权限控制

[安全措施...]
```

**预估工时：** 3小时

---

## 四、实施计划

### 4.1 任务分解

| 任务 | 描述 | 预估工时 | 优先级 |
|------|------|----------|--------|
| **T6.1** | 编写单元测试补充（file-manager-core.test.ts） | 4h | P0 |
| **T6.2** | 编写性能测试（file-manager-performance.test.ts） | 2h | P1 |
| **T6.3** | 编写集成测试（file-system-integration.test.ts） | 3h | P1 |
| **T6.4** | 配置跨平台 CI 测试 | 2h | P0 |
| **T6.5** | 编写 FileManager API 文档 | 4h | P0 |
| **T6.6** | 编写 IPC 接口文档 | 3h | P0 |
| **T6.7** | 编写示例文档 | 2h | P1 |
| **T6.8** | 编写架构设计文档 | 3h | P1 |
| **T6.9** | 运行测试并修复问题 | 2h | P0 |
| **T6.10** | 生成测试覆盖率报告 | 1h | P1 |

**总预估工时：** 26小时

---

### 4.2 执行顺序

#### 第1阶段：核心测试补充（P0）
1. T6.1 - 单元测试补充
2. T6.4 - 跨平台 CI 配置
3. T6.9 - 运行测试并修复问题

**目标：** 达到 80% 测试覆盖率

#### 第2阶段：核心文档编写（P0）
4. T6.5 - FileManager API 文档
5. T6.6 - IPC 接口文档

**目标：** 完成核心 API 文档

#### 第3阶段：补充测试和文档（P1）
6. T6.2 - 性能测试
7. T6.3 - 集成测试
8. T6.7 - 示例文档
9. T6.8 - 架构设计文档
10. T6.10 - 测试覆盖率报告

**目标：** 完成所有测试和文档

---

### 4.3 验收标准

#### 测试验收标准
- [ ] 单元测试覆盖率 ≥ 80%
- [ ] 所有性能测试通过（符合任务规范要求）
- [ ] 集成测试通过
- [ ] 跨平台测试通过（macOS + Windows）
- [ ] 无 TypeScript 类型错误
- [ ] 无 ESLint 警告

#### 文档验收标准
- [ ] FileManager API 文档完整（所有公共方法有文档）
- [ ] IPC 接口文档完整（所有通道有文档）
- [ ] 至少 3 个实用示例
- [ ] 架构设计文档清晰
- [ ] 所有代码示例可运行
- [ ] 文档符合 Markdown 规范

---

## 五、相关资源

### 5.1 参考文档

**项目规范：**
- [`CLAUDE.md`](../../CLAUDE.md) - 项目宪法（代码规范、命名约定）
- [`specs/design/testing-and-security.md`](../../specs/design/testing-and-security.md) - 测试策略
- [`specs/design/documentation-standards.md`](../../specs/design/documentation-standards.md) - 文档规范

**任务文档：**
- [`specs/tasks/phase0/phase0-task008_file-manager.md`](../../specs/tasks/phase0/phase0-task008_file-manager.md) - 任务规范

**技术文档：**
- [Node.js fs/promises API](https://nodejs.org/api/fs.html#promises-api)
- [chokidar 文档](https://github.com/paulmillr/chokidar)
- [Vitest 文档](https://vitest.dev/)

### 5.2 相关 Skills

**Phase 0 Skills：**
- [`typescript-strict-mode`](../../.kilocode/skills/phase0/typescript-strict-mode/SKILL.md) - TypeScript 严格模式
- [`electron-ipc-patterns`](../../.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md) - IPC 通信模式

**Common Skills：**
- 无直接相关 skill

---

## 六、风险与缓解

### 6.1 测试风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 跨平台测试失败 | 高 | 中 | 提前在 CI 中测试，准备平台特定处理 |
| 性能测试不稳定 | 中 | 中 | 使用多次运行取平均值，设置合理容差 |
| 测试覆盖率不达标 | 中 | 低 | 优先测试核心逻辑，边界情况可后补 |

### 6.2 文档风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 文档与代码不同步 | 中 | 中 | 在代码审查时检查文档更新 |
| 示例代码错误 | 低 | 低 | 所有示例代码必须实际运行验证 |

---

## 七、后续工作

### 7.1 Phase 0 后续任务
- **TASK009** - Workspace 创建与初始化（依赖本任务）
- **TASK010** - Git 抽象层基础实现（依赖本任务）

### 7.2 Phase 1 优化
- 大文件流式处理（> 10MB）
- 文件搜索功能
- 文件预览功能
- 性能监控和优化

---

**创建时间：** 2026-03-12  
**创建人：** AI  
**状态：** 待审批
