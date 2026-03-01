# Phase 1 Sprint 2 - Git 抽象层与同步需求

## 一、概述

### 1.1 目标与价值

实现 Git 抽象层的完整功能，让用户在无感知 Git 的情况下享受版本控制和多端同步。这是"Git 不可见"设计哲学的核心实现。

### 1.2 涉及模块

- 模块3：Git 抽象层（完整实现）
- 模块12：权限与访问控制（基础版）

### 1.3 里程碑定义

**完成标志：**
- 文件修改后自动保存并 commit
- 后台自动 push/pull 同步
- 冲突检测与基础合并界面可用
- 版本历史浏览与 diff 查看可用
- Workspace 成员管理可用

---

## 二、功能需求

### 需求 2.1 - 自动保存与提交

**用户故事：** 作为用户，我希望文件修改后自动保存，不需要手动操作。

#### 验收标准

1. While user is editing file, when user stops typing for 1 second, the system shall auto-save file to disk
2. When file is auto-saved, the system shall create Git commit in background within 2 seconds
3. When multiple files are modified within 5 seconds, the system shall batch them into single commit
4. When auto-commit is created, the system shall generate message in format: `[成员名] 更新 文件名: 变更摘要`
5. When auto-save fails, the system shall show warning notification and retry

#### 技术规格

```typescript
// src/main/services/auto-save.ts
export class AutoSaveManager {
  private saveTimer: NodeJS.Timeout | null = null
  private pendingFiles: Set<string> = new Set()
  private readonly DEBOUNCE_MS = 1000
  private readonly BATCH_WINDOW_MS = 5000

  onFileChanged(filePath: string, content: string): void {
    this.pendingFiles.add(filePath)
    
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), this.DEBOUNCE_MS)
  }

  private async flush(): Promise<void> {
    const files = Array.from(this.pendingFiles)
    this.pendingFiles.clear()
    
    for (const file of files) {
      await this.fileManager.writeFile(file, this.getContent(file))
    }
    
    const message = this.generateCommitMessage(files)
    await this.gitAbstraction.commitAll(message)
  }

  private generateCommitMessage(files: string[]): string {
    if (files.length === 1) {
      return `[${this.userName}] 更新 ${path.basename(files[0])}`
    }
    return `[${this.userName}] 更新 ${files.length} 个文件`
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.2 - 自动同步

**用户故事：** 作为用户，我希望文件自动同步到云端，不需要手动操作。

#### 验收标准

1. While app is online, the system shall push local commits every 30 seconds
2. While app is online, the system shall pull remote changes every 30 seconds
3. When network disconnects, the system shall continue local operations and show "离线" status
4. When network reconnects, the system shall auto-sync within 5 seconds
5. When sync is in progress, the system shall show "同步中 ↻" in status bar
6. When sync completes, the system shall show "已同步 ✓" in status bar
7. When sync fails, the system shall show "同步失败 ⚠" with retry option

#### 技术规格

```typescript
// src/main/services/sync-manager.ts
export class SyncManager {
  private syncInterval: NodeJS.Timeout | null = null
  private readonly SYNC_INTERVAL_MS = 30000

  start(): void {
    this.syncInterval = setInterval(() => this.sync(), this.SYNC_INTERVAL_MS)
    this.monitorNetwork()
  }

  async sync(): Promise<SyncResult> {
    this.emit('status', 'syncing')
    
    try {
      const pullResult = await this.gitAbstraction.pull()
      if (pullResult.hasConflicts) {
        this.emit('status', 'conflict')
        this.emit('conflicts', pullResult.conflicts)
        return pullResult
      }
      
      const pushResult = await this.gitAbstraction.push()
      this.emit('status', 'synced')
      return pushResult
    } catch (error) {
      this.emit('status', 'error')
      return { success: false, error: error.message }
    }
  }

  private monitorNetwork(): void {
    // 监听网络状态变化
    // 断网时暂停同步，恢复时立即同步
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.3 - 同步状态 UI

**用户故事：** 作为用户，我想要看到当前的同步状态，以便知道我的文件是否安全。

#### 验收标准

1. When app starts, the system shall show sync status in bottom status bar
2. When status is "synced", the system shall show green checkmark "已同步 ✓"
3. When status is "syncing", the system shall show spinning icon "同步中 ↻"
4. When status is "offline", the system shall show gray icon "离线（本地已保存）"
5. When status is "conflict", the system shall show warning icon "有冲突 ⚠"
6. When user clicks status indicator, the system shall show sync details panel

#### 优先级

P0 - 必须完成

---

### 需求 2.4 - 冲突检测与合并

**用户故事：** 作为用户，当我的文件与他人修改冲突时，我想要清楚地看到差异并选择解决方案。

#### 验收标准

1. When pull detects conflict, the system shall show conflict notification
2. When user opens conflicted file, the system shall show three-panel view
3. When conflict view opens, the system shall show "你的版本" on left and "对方的版本" on right
4. When user clicks "采用我的版本", the system shall keep local version
5. When user clicks "采用对方版本", the system shall use remote version
6. When user manually edits merge result, the system shall allow custom resolution
7. When conflict is resolved, the system shall auto-commit and push

#### 技术规格

```typescript
// src/renderer/components/ConflictResolver.tsx
interface ConflictInfo {
  filePath: string
  localContent: string
  remoteContent: string
  baseContent: string
}

export function ConflictResolver({ conflict }: { conflict: ConflictInfo }) {
  const [resolution, setResolution] = useState<string>('')
  
  const handleResolve = async (type: 'mine' | 'theirs' | 'manual') => {
    let content: string
    switch (type) {
      case 'mine': content = conflict.localContent; break
      case 'theirs': content = conflict.remoteContent; break
      case 'manual': content = resolution; break
    }
    
    await window.api.invoke('git:resolve', conflict.filePath, content)
  }
  
  return (
    <div className="conflict-resolver grid grid-cols-2 gap-4">
      <div className="local-version">
        <h3>你的版本</h3>
        <DiffView content={conflict.localContent} />
      </div>
      <div className="remote-version">
        <h3>对方的版本</h3>
        <DiffView content={conflict.remoteContent} />
      </div>
      <div className="col-span-2 flex gap-2">
        <button onClick={() => handleResolve('mine')}>采用我的版本</button>
        <button onClick={() => handleResolve('theirs')}>采用对方版本</button>
        <button onClick={() => handleResolve('manual')}>手动合并</button>
      </div>
    </div>
  )
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.5 - 版本历史

**用户故事：** 作为用户，我想要查看文件的历史版本，以便了解变更过程或回滚。

#### 验收标准

1. When user right-clicks file and selects "查看历史", the system shall show version list
2. When version list loads, the system shall show time, author, and change summary for each version
3. When user selects two versions, the system shall show diff comparison
4. When user clicks "恢复到此版本", the system shall create new commit with old content
5. When version history has > 100 entries, the system shall paginate results

#### 技术规格

```typescript
// src/main/services/git-abstraction.ts
async getHistory(filePath: string, limit: number = 50): Promise<VersionEntry[]> {
  const commits = await git.log({
    fs,
    dir: this.workspaceRoot,
    ref: 'main',
    filepath: filePath
  })
  
  return commits.slice(0, limit).map(commit => ({
    sha: commit.oid,
    message: commit.commit.message,
    author: commit.commit.author.name,
    timestamp: new Date(commit.commit.author.timestamp * 1000),
    summary: this.extractSummary(commit.commit.message)
  }))
}

async getFileDiff(commitA: string, commitB: string, filePath: string): Promise<string> {
  const contentA = await this.getFileAtCommit(commitA, filePath)
  const contentB = await this.getFileAtCommit(commitB, filePath)
  return createDiff(contentA, contentB)
}

async restoreVersion(filePath: string, commitSha: string): Promise<void> {
  const content = await this.getFileAtCommit(commitSha, filePath)
  await this.fileManager.writeFile(filePath, content)
  await this.commitAll(`恢复 ${path.basename(filePath)} 到版本 ${commitSha.slice(0, 7)}`)
}
```

#### 优先级

P1 - 应该完成

---

### 需求 2.6 - Workspace 成员管理

**用户故事：** 作为管理员，我想要邀请团队成员加入 workspace，以便协作。

#### 验收标准

1. When admin opens workspace settings, the system shall show member list
2. When admin clicks "邀请成员", the system shall show invite dialog with email input
3. When invite is sent, the system shall create invite record and send email notification
4. When invitee accepts invite, the system shall add them to workspace with specified role
5. When admin changes member role, the system shall update permissions immediately
6. When admin removes member, the system shall revoke their access

#### 技术规格

**成员管理 API：**
```
POST   /api/v1/workspaces/:id/members/invite
PUT    /api/v1/workspaces/:id/members/:uid
DELETE /api/v1/workspaces/:id/members/:uid
```

**角色权限：**

| 操作 | Admin | Editor | Viewer |
|------|-------|--------|--------|
| 编辑文件 | ✓ | ✓ | ✗ |
| 创建文件 | ✓ | ✓ | ✗ |
| 删除文件 | ✓ | ✓ | ✗ |
| 评论 | ✓ | ✓ | ✓ |
| 管理成员 | ✓ | ✗ | ✗ |
| 修改设置 | ✓ | ✗ | ✗ |

#### 优先级

P1 - 应该完成

---

## 三、非功能需求

### 3.1 性能要求

- 自动保存延迟 < 1 秒（防抖后）
- Git commit < 500ms
- 同步周期 30 秒（可配置）
- 版本历史加载 < 1 秒
- Diff 计算 < 500ms

### 3.2 安全要求

- Git 认证使用 Token，不存储明文密码
- 同步传输全程 HTTPS
- 成员权限实时生效

### 3.3 可靠性要求

- 离线状态下本地操作不受影响
- 同步失败自动重试
- 冲突不会导致数据丢失

---

## 四、技术约束

### 4.1 架构约束

- Git 抽象层封装为独立模块，禁止上层直接调用 git 命令
- 对上层暴露语义化接口：`saveFile()`、`sync()`、`getHistory()`、`resolveConflict()`
- 用户界面不出现 Git 术语

### 4.2 技术选型

- Git：isomorphic-git
- Git 托管：Gitea
- Diff：diff-match-patch 或 jsdiff

---

## 五、验收检查清单

- [ ] 自动保存与 commit 正常工作
- [ ] 自动同步 push/pull 正常
- [ ] 同步状态 UI 正确显示
- [ ] 冲突检测与合并界面可用
- [ ] 版本历史浏览与 diff 可用
- [ ] 成员邀请与角色管理可用
- [ ] 离线编辑后恢复同步正常
- [ ] 性能指标达标
