# FileManager 重构测试计划

## 测试概述

本文档详细说明 FileManager 重构后需要添加的测试用例，确保新的 context 机制正确工作，并且不会破坏现有功能。

## 测试目标

1. **功能正确性**: 验证 context 机制按预期工作
2. **安全性**: 确保安全限制正确执行
3. **向后兼容**: 确保现有代码不受影响
4. **边界情况**: 覆盖各种边界和错误场景
5. **性能**: 确保 context 检查不影响性能

## 测试覆盖率目标

- FileManager: ≥ 90%
- WorkspaceManager: ≥ 85%
- 集成测试: 100% 关键路径

## 1. FileManager 单元测试

### 1.1 Context 基础功能测试

**文件**: `tests/services/file-manager-context.test.ts` (新建)

#### 测试用例组: Context 默认值

```typescript
describe('FileManager - Context Defaults', () => {
  it('should use USER context by default when no context specified', async () => {
    // 不传 context 参数，应该默认为 USER
    await expect(
      fileManager.writeFile('.sibylla/test.json', '{}')
    ).rejects.toThrow(/forbidden/)
  })
  
  it('should allow normal files with default USER context', async () => {
    // 普通文件应该可以访问
    await fileManager.writeFile('docs/test.md', '# Test')
    const content = await fileManager.readFile('docs/test.md')
    expect(content.content).toBe('# Test')
  })
})
```

#### 测试用例组: USER Context

```typescript
describe('FileManager - USER Context', () => {
  it('should reject access to .sibylla directory', async () => {
    await expect(
      fileManager.writeFile('.sibylla/config.json', '{}', { 
        context: FileOperationContext.USER 
      })
    ).rejects.toThrow(/forbidden/)
  })
  
  it('should reject access to .git directory', async () => {
    await expect(
      fileManager.writeFile('.git/config', '', { 
        context: FileOperationContext.USER 
      })
    ).rejects.toThrow(/forbidden/)
  })
  
  it('should reject access to node_modules', async () => {
    await expect(
      fileManager.writeFile('node_modules/pkg/index.js', '', { 
        context: FileOperationContext.USER 
      })
    ).rejects.toThrow(/forbidden/)
  })
  
  it('should reject access to .env files', async () => {
    await expect(
      fileManager.writeFile('.env', 'SECRET=123', { 
        context: FileOperationContext.USER 
      })
    ).rejects.toThrow(/forbidden/)
  })
  
  it('should allow access to normal user files', async () => {
    await fileManager.writeFile('docs/readme.md', '# Readme', {
      context: FileOperationContext.USER
    })
    expect(await fileManager.exists('docs/readme.md')).toBe(true)
  })
  
  it('should allow access to nested user directories', async () => {
    await fileManager.writeFile('docs/guides/tutorial.md', '# Tutorial', {
      context: FileOperationContext.USER
    })
    expect(await fileManager.exists('docs/guides/tutorial.md')).toBe(true)
  })
})
```

#### 测试用例组: WORKSPACE_INIT Context

```typescript
describe('FileManager - WORKSPACE_INIT Context', () => {
  it('should allow access to .sibylla directory', async () => {
    await fileManager.createDirectory('.sibylla', {
      context: FileOperationContext.WORKSPACE_INIT
    })
    expect(await fileManager.exists('.sibylla')).toBe(true)
  })
  
  it('should allow writing to .sibylla/config.json', async () => {
    await fileManager.writeFile('.sibylla/config.json', '{}', {
      context: FileOperationContext.WORKSPACE_INIT
    })
    expect(await fileManager.exists('.sibylla/config.json')).toBe(true)
  })
  
  it('should allow access to nested .sibylla directories', async () => {
    await fileManager.createDirectory('.sibylla/memory/daily', {
      context: FileOperationContext.WORKSPACE_INIT
    })
    expect(await fileManager.exists('.sibylla/memory/daily')).toBe(true)
  })
  
  it('should reject access to .git directory', async () => {
    await expect(
      fileManager.writeFile('.git/config', '', {
        context: FileOperationContext.WORKSPACE_INIT
      })
    ).rejects.toThrow(/forbidden/)
  })
  
  it('should reject access to node_modules', async () => {
    await expect(
      fileManager.writeFile('node_modules/pkg/index.js', '', {
        context: FileOperationContext.WORKSPACE_INIT
      })
    ).rejects.toThrow(/forbidden/)
  })
  
  it('should allow access to normal user files', async () => {
    // WORKSPACE_INIT 也应该能访问普通文件
    await fileManager.writeFile('docs/readme.md', '# Readme', {
      context: FileOperationContext.WORKSPACE_INIT
    })
    expect(await fileManager.exists('docs/readme.md')).toBe(true)
  })
})
```

#### 测试用例组: SYSTEM Context

```typescript
describe('FileManager - SYSTEM Context', () => {
  it('should allow access to .sibylla directory', async () => {
    await fileManager.createDirectory('.sibylla', {
      context: FileOperationContext.SYSTEM
    })
    expect(await fileManager.exists('.sibylla')).toBe(true)
  })
  
  it('should allow access to .git directory', async () => {
    await fileManager.createDirectory('.git', {
      context: FileOperationContext.SYSTEM
    })
    expect(await fileManager.exists('.git')).toBe(true)
  })
  
  it('should allow access to node_modules', async () => {
    await fileManager.createDirectory('node_modules/pkg', {
      context: FileOperationContext.SYSTEM
    })
    expect(await fileManager.exists('node_modules/pkg')).toBe(true)
  })
  
  it('should allow writing to .env files', async () => {
    await fileManager.writeFile('.env', 'SECRET=123', {
      context: FileOperationContext.SYSTEM
    })
    expect(await fileManager.exists('.env')).toBe(true)
  })
  
  it('should log system-level operations', async () => {
    const logSpy = vi.spyOn(logger, 'warn')
    
    await fileManager.writeFile('.sibylla/config.json', '{}', {
      context: FileOperationContext.SYSTEM
    })
    
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('System-level operation'),
      expect.objectContaining({
        context: 'SYSTEM',
        path: expect.stringContaining('.sibylla/config.json')
      })
    )
  })
})
```

### 1.2 所有文件操作方法的 Context 支持

**文件**: `tests/services/file-manager-operations-context.test.ts` (新建)

```typescript
describe('FileManager - Operations with Context', () => {
  describe('readFile()', () => {
    it('should respect USER context restrictions', async () => {
      // 先用 SYSTEM context 创建文件
      await fileManager.writeFile('.sibylla/test.json', '{}', {
        context: FileOperationContext.SYSTEM
      })
      
      // 用 USER context 读取应该失败
      await expect(
        fileManager.readFile('.sibylla/test.json', {
          context: FileOperationContext.USER
        })
      ).rejects.toThrow(/forbidden/)
    })
    
    it('should allow SYSTEM context to read forbidden files', async () => {
      await fileManager.writeFile('.sibylla/test.json', '{"test":true}', {
        context: FileOperationContext.SYSTEM
      })
      
      const content = await fileManager.readFile('.sibylla/test.json', {
        context: FileOperationContext.SYSTEM
      })
      
      expect(content.content).toBe('{"test":true}')
    })
  })
  
  describe('deleteFile()', () => {
    it('should respect context restrictions', async () => {
      await fileManager.writeFile('.sibylla/test.json', '{}', {
        context: FileOperationContext.SYSTEM
      })
      
      await expect(
        fileManager.deleteFile('.sibylla/test.json', {
          context: FileOperationContext.USER
        })
      ).rejects.toThrow(/forbidden/)
    })
  })
  
  describe('copyFile()', () => {
    it('should check context for both source and destination', async () => {
      await fileManager.writeFile('.sibylla/source.json', '{}', {
        context: FileOperationContext.SYSTEM
      })
      
      // 复制到禁止目录应该失败
      await expect(
        fileManager.copyFile('.sibylla/source.json', '.git/dest.json', {
          context: FileOperationContext.USER
        })
      ).rejects.toThrow(/forbidden/)
    })
  })
  
  describe('moveFile()', () => {
    it('should check context for both source and destination', async () => {
      await fileManager.writeFile('temp.json', '{}')
      
      await expect(
        fileManager.moveFile('temp.json', '.sibylla/moved.json', {
          context: FileOperationContext.USER
        })
      ).rejects.toThrow(/forbidden/)
    })
  })
  
  describe('listFiles()', () => {
    it('should respect context when listing directories', async () => {
      await fileManager.createDirectory('.sibylla', {
        context: FileOperationContext.SYSTEM
      })
      
      // USER context 不应该能列出 .sibylla
      await expect(
        fileManager.listFiles('.sibylla', {
          context: FileOperationContext.USER
        })
      ).rejects.toThrow(/forbidden/)
    })
  })
})
```

### 1.3 边界情况和错误场景

**文件**: `tests/services/file-manager-edge-cases.test.ts` (新建)

```typescript
describe('FileManager - Edge Cases', () => {
  describe('Path Traversal with Context', () => {
    it('should reject path traversal regardless of context', async () => {
      await expect(
        fileManager.writeFile('../outside.txt', 'content', {
          context: FileOperationContext.SYSTEM
        })
      ).rejects.toThrow(/outside workspace/)
    })
    
    it('should reject absolute paths regardless of context', async () => {
      await expect(
        fileManager.writeFile('/etc/passwd', 'content', {
          context: FileOperationContext.SYSTEM
        })
      ).rejects.toThrow(/outside workspace/)
    })
  })
  
  describe('Nested Forbidden Paths', () => {
    it('should detect forbidden paths in nested directories', async () => {
      await expect(
        fileManager.writeFile('some/path/.git/config', '', {
          context: FileOperationContext.USER
        })
      ).rejects.toThrow(/forbidden/)
    })
    
    it('should allow SYSTEM context for nested forbidden paths', async () => {
      await fileManager.writeFile('some/path/.git/config', '', {
        context: FileOperationContext.SYSTEM
      })
      expect(await fileManager.exists('some/path/.git/config')).toBe(true)
    })
  })
  
  describe('Special Characters in Paths', () => {
    it('should handle special characters with context', async () => {
      const filename = 'test-文件-🎉.txt'
      await fileManager.writeFile(filename, 'content', {
        context: FileOperationContext.USER
      })
      expect(await fileManager.exists(filename)).toBe(true)
    })
  })
  
  describe('Concurrent Operations with Different Contexts', () => {
    it('should handle concurrent operations with different contexts', async () => {
      const operations = [
        fileManager.writeFile('user1.txt', 'user', {
          context: FileOperationContext.USER
        }),
        fileManager.writeFile('.sibylla/system1.json', '{}', {
          context: FileOperationContext.SYSTEM
        }),
        fileManager.writeFile('user2.txt', 'user', {
          context: FileOperationContext.USER
        }),
        fileManager.writeFile('.sibylla/system2.json', '{}', {
          context: FileOperationContext.SYSTEM
        })
      ]
      
      await Promise.all(operations)
      
      expect(await fileManager.exists('user1.txt')).toBe(true)
      expect(await fileManager.exists('user2.txt')).toBe(true)
      expect(await fileManager.exists('.sibylla/system1.json')).toBe(true)
      expect(await fileManager.exists('.sibylla/system2.json')).toBe(true)
    })
  })
  
  describe('Invalid Context Values', () => {
    it('should handle invalid context gracefully', async () => {
      // TypeScript 应该防止这种情况，但测试运行时行为
      await fileManager.writeFile('test.txt', 'content', {
        context: 'INVALID' as any
      })
      // 应该使用默认的 USER context
    })
  })
})
```

## 2. WorkspaceManager 单元测试

### 2.1 Workspace 创建测试

**文件**: `tests/services/workspace-manager-creation.test.ts` (新建)

```typescript
describe('WorkspaceManager - Creation with FileManager', () => {
  it('should create .sibylla directory using FileManager', async () => {
    const createDirSpy = vi.spyOn(fileManager, 'createDirectory')
    
    await workspaceManager.createWorkspace(validOptions)
    
    expect(createDirSpy).toHaveBeenCalledWith(
      expect.stringContaining('.sibylla'),
      expect.objectContaining({
        context: FileOperationContext.SYSTEM
      })
    )
  })
  
  it('should write config files using FileManager', async () => {
    const writeFileSpy = vi.spyOn(fileManager, 'writeFile')
    
    await workspaceManager.createWorkspace(validOptions)
    
    expect(writeFileSpy).toHaveBeenCalledWith(
      '.sibylla/config.json',
      expect.any(String),
      expect.objectContaining({
        context: FileOperationContext.SYSTEM
      })
    )
  })
  
  it('should not use fs.promises directly', async () => {
    // 确保没有直接导入 fs
    const fsModule = await import('fs')
    const fsSpy = vi.spyOn(fsModule.promises, 'writeFile')
    
    await workspaceManager.createWorkspace(validOptions)
    
    // WorkspaceManager 不应该直接调用 fs
    expect(fsSpy).not.toHaveBeenCalled()
  })
  
  it('should create all required directories', async () => {
    await workspaceManager.createWorkspace(validOptions)
    
    const requiredDirs = [
      '.sibylla',
      '.sibylla/memory',
      '.sibylla/memory/daily',
      '.sibylla/index',
      'docs',
      'skills'
    ]
    
    for (const dir of requiredDirs) {
      expect(
        await fileManager.exists(path.join(validOptions.path, dir))
      ).toBe(true)
    }
  })
  
  it('should create all required config files', async () => {
    await workspaceManager.createWorkspace(validOptions)
    
    const requiredFiles = [
      '.sibylla/config.json',
      '.sibylla/members.json',
      '.sibylla/points.json'
    ]
    
    for (const file of requiredFiles) {
      expect(
        await fileManager.exists(path.join(validOptions.path, file))
      ).toBe(true)
    }
  })
})
```

### 2.2 错误处理和清理测试

```typescript
describe('WorkspaceManager - Error Handling', () => {
  it('should clean up on creation failure', async () => {
    // 模拟写入失败
    vi.spyOn(fileManager, 'writeFile').mockRejectedValueOnce(
      new Error('Write failed')
    )
    
    await expect(
      workspaceManager.createWorkspace(validOptions)
    ).rejects.toThrow()
    
    // 验证清理逻辑被调用
    expect(await fileManager.exists(validOptions.path)).toBe(false)
  })
  
  it('should handle permission errors gracefully', async () => {
    const readonlyPath = path.join(testDir, 'readonly')
    await fs.mkdir(readonlyPath)
    await fs.chmod(readonlyPath, 0o444)
    
    await expect(
      workspaceManager.createWorkspace({
        ...validOptions,
        path: path.join(readonlyPath, 'workspace')
      })
    ).rejects.toThrow(/permission/)
    
    // 恢复权限以便清理
    await fs.chmod(readonlyPath, 0o755)
  })
})
```

## 3. 集成测试

### 3.1 端到端 Workspace 创建

**文件**: `tests/integration/workspace-filemanager-integration.test.ts` (新建)

```typescript
describe('Workspace-FileManager Integration', () => {
  it('should create complete workspace through FileManager', async () => {
    const workspace = await workspaceManager.createWorkspace(validOptions)
    
    // 验证 workspace 结构
    expect(workspace.config.workspaceId).toBeTruthy()
    expect(workspace.metadata.path).toBe(validOptions.path)
    
    // 验证所有文件都存在
    const structure = [
      '.sibylla/config.json',
      '.sibylla/members.json',
      '.sibylla/points.json',
      'CLAUDE.md',
      'requirements.md',
      'design.md',
      'tasks.md'
    ]
    
    for (const file of structure) {
      const fullPath = path.join(validOptions.path, file)
      expect(await fs.access(fullPath)).resolves.toBeUndefined()
    }
  })
  
  it('should validate workspace correctly', async () => {
    await workspaceManager.createWorkspace(validOptions)
    
    const isValid = await workspaceManager.validateWorkspace(validOptions.path)
    expect(isValid).toBe(true)
  })
  
  it('should open created workspace', async () => {
    const created = await workspaceManager.createWorkspace(validOptions)
    await workspaceManager.closeWorkspace()
    
    const opened = await workspaceManager.openWorkspace(validOptions.path)
    
    expect(opened.config.workspaceId).toBe(created.config.workspaceId)
  })
})
```

### 3.2 安全性集成测试

```typescript
describe('Security Integration Tests', () => {
  it('should prevent user operations from accessing system files', async () => {
    await workspaceManager.createWorkspace(validOptions)
    
    // 模拟用户尝试编辑系统文件
    await expect(
      fileManager.writeFile('.sibylla/config.json', 'hacked', {
        context: FileOperationContext.USER
      })
    ).rejects.toThrow(/forbidden/)
  })
  
  it('should log all system-level operations', async () => {
    const logSpy = vi.spyOn(logger, 'warn')
    
    await workspaceManager.createWorkspace(validOptions)
    
    // 应该有多个系统级操作日志
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('System-level operation'),
      expect.any(Object)
    )
    
    // 验证日志包含调用栈
    const calls = logSpy.mock.calls
    expect(calls.some(call => 
      call[1]?.stack && call[1].stack.includes('WorkspaceManager')
    )).toBe(true)
  })
})
```

## 4. 性能测试

**文件**: `tests/services/file-manager-performance-context.test.ts` (新建)

```typescript
describe('FileManager - Performance with Context', () => {
  it('should not significantly impact performance', async () => {
    const iterations = 1000
    
    // 测试不带 context（默认 USER）
    const start1 = Date.now()
    for (let i = 0; i < iterations; i++) {
      await fileManager.writeFile(`test-${i}.txt`, 'content')
    }
    const duration1 = Date.now() - start1
    
    // 清理
    for (let i = 0; i < iterations; i++) {
      await fileManager.deleteFile(`test-${i}.txt`)
    }
    
    // 测试带 SYSTEM context
    const start2 = Date.now()
    for (let i = 0; i < iterations; i++) {
      await fileManager.writeFile(`test-${i}.txt`, 'content', {
        context: FileOperationContext.SYSTEM
      })
    }
    const duration2 = Date.now() - start2
    
    // context 检查不应该增加超过 10% 的开销
    expect(duration2).toBeLessThan(duration1 * 1.1)
  })
})
```

## 5. 回归测试

确保现有测试仍然通过：

```typescript
describe('Regression Tests', () => {
  it('should not break existing FileManager tests', async () => {
    // 运行所有现有的 file-manager-core.test.ts 测试
    // 这些测试不传 context，应该使用默认的 USER context
  })
  
  it('should not break existing WorkspaceManager tests', async () => {
    // 运行所有现有的 workspace-manager.test.ts 测试
  })
})
```

## 测试执行计划

### 阶段 1: 基础功能测试
1. Context 默认值测试
2. USER context 测试
3. WORKSPACE_INIT context 测试
4. SYSTEM context 测试

### 阶段 2: 操作方法测试
1. 所有文件操作方法的 context 支持
2. 边界情况测试

### 阶段 3: WorkspaceManager 测试
1. Workspace 创建测试
2. 错误处理测试

### 阶段 4: 集成测试
1. 端到端测试
2. 安全性测试

### 阶段 5: 性能和回归测试
1. 性能测试
2. 回归测试

## 测试覆盖率报告

运行测试后生成覆盖率报告：

```bash
cd sibylla-desktop
npm run test:coverage
```

目标覆盖率：
- Statements: ≥ 90%
- Branches: ≥ 85%
- Functions: ≥ 90%
- Lines: ≥ 90%

## 持续集成

在 CI/CD 流程中添加：

```yaml
# .github/workflows/test.yml
- name: Run FileManager Tests
  run: npm run test -- file-manager
  
- name: Run WorkspaceManager Tests
  run: npm run test -- workspace-manager
  
- name: Run Integration Tests
  run: npm run test -- integration
  
- name: Check Coverage
  run: npm run test:coverage
  if: coverage < 85%
    exit 1
```

---

**创建时间:** 2026-03-13  
**最后更新:** 2026-03-13
