# Phase 3 Sprint 7 - AI 项目管理完整版需求

## 一、概述

### 1.1 目标与价值

实现 AI 深度参与项目管理的完整能力，包括任务状态自动追踪、工作产出分析、AI 日报增强版、管理员 Dashboard 和 AI 决策建议。让 AI 成为团队的"虚拟项目经理"。

### 1.2 涉及模块

- 模块10：AI 项目管理（完整版）
- 模块15：记忆系统（自愈优化与可视化）

### 1.3 里程碑定义

**完成标志：**
- AI 能自动追踪任务状态变化
- 工作产出分析引擎可用
- AI 日报/周报增强版可用
- 管理员 Dashboard 可用
- AI 决策建议推送可用

---

## 二、功能需求

### 需求 2.1 - AI 任务状态自动追踪

**用户故事：** 作为用户，我希望 AI 能根据文件变更自动建议更新任务状态。

#### 验收标准

1. When file associated with task is modified, the system shall detect and suggest status update
2. When AI detects substantial progress, the system shall suggest changing status to "进行中"
3. When AI detects task completion signals, the system shall suggest changing to "已完成"
4. When suggestion is shown, the user shall confirm or dismiss
5. When user confirms, the system shall update tasks.md automatically

#### 优先级

P0 - 必须完成

---

### 需求 2.2 - 工作产出分析引擎

**用户故事：** 作为管理员，我想要了解团队成员的工作产出，以便合理分配资源。

#### 验收标准

1. When analysis is triggered, the system shall calculate task completion rate per member
2. When analysis runs, the system shall evaluate document contribution metrics
3. When analysis runs, the system shall measure collaboration response speed
4. When analysis completes, the system shall generate structured report
5. When member views own analysis, the system shall show full details
6. When other members view analysis, the system shall show anonymized team summary

#### 分析维度

| 维度 | 说明 | 数据来源 |
|------|------|---------|
| 任务完成率 | 按时完成的任务比例 | tasks.md |
| 文档贡献度 | 创建和编辑文档的数量与质量 | Git commits |
| 协作响应速度 | 评论回复和审核处理时效 | 评论和审核记录 |
| 知识贡献度 | 被他人引用的文档数量 | 文件引用关系 |

#### 优先级

P0 - 必须完成

---

### 需求 2.3 - AI 日报/周报增强版

**用户故事：** 作为管理员，我想要看到包含产出分析和风险预警的团队报告。

#### 验收标准

1. When team report is generated, the system shall include overall progress overview
2. When report includes risk items, the system shall highlight delayed tasks
3. When report includes suggestions, the system shall recommend next week priorities
4. When report is generated, the system shall save to docs/reports/ directory

#### 优先级

P1 - 应该完成

---

### 需求 2.4 - 管理员 Dashboard

**用户故事：** 作为管理员，我想要一个全局视图了解团队状态。

#### 验收标准

1. When admin opens Dashboard, the system shall show team overview
2. When Dashboard loads, the system shall display task progress chart
3. When Dashboard loads, the system shall show member activity summary
4. When risk is detected, the system shall show warning indicator

#### 优先级

P1 - 应该完成

---

### 需求 2.5 - AI 决策建议

**用户故事：** 作为管理员，我希望 AI 能主动推送风险预警和资源建议。

#### 验收标准

1. When AI detects project risk, the system shall push notification to admin
2. When workload is unbalanced, the system shall suggest task redistribution
3. When contradictory information exists, the system shall flag and summarize
4. When admin clicks "采纳", the system shall execute suggested action
5. When admin clicks "忽略", the system shall dismiss suggestion

#### 优先级

P2 - 可以延后

---

### 需求 2.6 - 记忆自愈优化

**用户故事：** 作为系统，我需要定期优化记忆质量，以便保持记忆系统的健康和高效。

#### 功能描述

实现记忆自愈任务，在空闲时段自动检测并修复记忆质量问题。参考 [`memory-system-design.md`](../../design/memory-system-design.md)。

#### 验收标准

1. When system is idle (2:00-4:00 AM local time), the system shall trigger self-healing tasks
2. When self-healing runs, the system shall detect and merge duplicate content
3. When stale information is found, the system shall mark for archiving
4. When orphan memory fragments exist, the system shall establish topic links
5. When self-healing completes, the system shall generate health report
6. When user manually triggers, the system shall run self-healing immediately

#### 技术规格

```typescript
// src/main/services/memory-healer.ts
export class MemoryHealer {
  async runSelfHealing(): Promise<HealingReport> {
    const report: HealingReport = {
      timestamp: new Date().toISOString(),
      actions: { merged: 0, archived: 0, linked: 0, indexRebuilt: false }
    }
    
    // 1. 检测重复内容
    const duplicates = await this.detectDuplicates()
    for (const group of duplicates) {
      await this.mergeDuplicates(group)
      report.actions.merged++
    }
    
    // 2. 识别过时信息
    const stale = await this.detectStaleContent()
    for (const item of stale) {
      await this.markForArchiving(item)
      report.actions.archived++
    }
    
    // 3. 建立孤立关联
    const orphans = await this.detectOrphans()
    for (const orphan of orphans) {
      await this.establishLinks(orphan)
      report.actions.linked++
    }
    
    // 4. 重建索引
    await this.rebuildVectorIndex()
    report.actions.indexRebuilt = true
    
    return report
  }
  
  private async detectDuplicates(): Promise<DuplicateGroup[]> {
    // 使用语义相似度检测重复
    const memory = await this.memoryManager.getMemory()
    const groups: DuplicateGroup[] = []
    
    for (let i = 0; i < memory.sections.length; i++) {
      for (let j = i + 1; j < memory.sections.length; j++) {
        const similarity = await this.calculateSimilarity(
          memory.sections[i].content,
          memory.sections[j].content
        )
        
        if (similarity > 0.85) {
          groups.push({ items: [memory.sections[i], memory.sections[j]] })
        }
      }
    }
    
    return groups
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.7 - 记忆可视化 Dashboard

**用户故事：** 作为用户，我想要查看记忆系统的运行状态，以便了解系统健康度和使用情况。

#### 验收标准

1. When user opens memory panel, the system shall show memory statistics
2. When dashboard loads, the system shall display token usage progress bar
3. When dashboard loads, the system shall show quality indicators (duplication, stale, orphan, hit rate)
4. When user clicks "查看详细报告", the system shall show full health report
5. When user clicks "执行维护", the system shall trigger self-healing manually
6. When user clicks "导出记忆", the system shall export memory bundle

#### 技术规格

```typescript
// src/renderer/components/MemoryDashboard.tsx
export function MemoryDashboard() {
  const [stats, setStats] = useState<MemoryStatistics>()
  
  useEffect(() => {
    loadStats()
    const interval = setInterval(loadStats, 60000) // 每分钟刷新
    return () => clearInterval(interval)
  }, [])
  
  const loadStats = async () => {
    const data = await window.api.invoke('memory:getStatistics')
    setStats(data)
  }
  
  return (
    <div className="memory-dashboard p-4">
      <h3 className="text-lg font-semibold mb-4">📊 记忆系统状态</h3>
      
      {/* Token 使用进度 */}
      <div className="mb-4">
        <div className="flex justify-between text-sm mb-1">
          <span>精选记忆</span>
          <span>{stats?.storage.memoryTokens} / 12K tokens</span>
        </div>
        <ProgressBar 
          value={stats?.storage.memoryTokens || 0} 
          max={12000} 
        />
      </div>
      
      {/* 统计数据 */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <StatCard label="日志条目" value={stats?.storage.totalLogs} />
        <StatCard label="归档文件" value={stats?.storage.archiveCount} />
        <StatCard label="决策记录" value={stats?.storage.decisionCount} />
      </div>
      
      {/* 质量指标 */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">质量指标</h4>
        <QualityIndicator 
          label="重复率" 
          value={stats?.quality.duplicationRate} 
          threshold={0.05} 
        />
        <QualityIndicator 
          label="过时率" 
          value={stats?.quality.staleRate} 
          threshold={0.10} 
        />
        <QualityIndicator 
          label="命中率" 
          value={stats?.quality.hitRate} 
          threshold={0.80} 
          inverse 
        />
      </div>
      
      {/* 操作按钮 */}
      <div className="flex gap-2">
        <Button onClick={showDetailedReport}>查看详细报告</Button>
        <Button onClick={triggerMaintenance}>执行维护</Button>
        <Button onClick={exportMemory}>导出记忆</Button>
      </div>
    </div>
  )
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.8 - 知识图谱可视化

**用户故事：** 作为用户，我想要看到项目知识的关联关系，以便更好地理解项目全貌。

#### 验收标准

1. When user opens knowledge graph view, the system shall render interactive graph
2. When graph loads, the system shall show nodes (topics, files, decisions, people)
3. When graph loads, the system shall show edges (references, related, decided-by)
4. When user clicks node, the system shall highlight connected nodes
5. When user double-clicks node, the system shall open related file or memory
6. When user filters by type, the system shall update graph display

#### 优先级

P1 - 应该完成

---

## 三、验收检查清单

- [ ] AI 任务状态追踪正常
- [ ] 工作产出分析引擎可用
- [ ] AI 日报增强版可用
- [ ] 管理员 Dashboard 可用
- [ ] AI 决策建议推送可用
- [ ] 记忆自愈优化正常工作
- [ ] 记忆可视化 Dashboard 可用
- [ ] 知识图谱可视化可用
- [ ] 权限控制正确（分析数据可见性）
