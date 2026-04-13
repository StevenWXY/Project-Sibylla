# Phase 1 Sprint 1 — 编辑器与文件系统 任务列表

> **阶段目标：** 实现 Sibylla 的核心编辑体验，让用户能够在 WYSIWYG 编辑器中编辑 Markdown 文档，管理文件树，导入外部文件。完成"打开 workspace → 浏览文件 → 编辑文档 → 导入外部文件"的核心体验闭环。
>
> **预计周期：** 2-3 周（Week 4 - Week 6）
>
> **前置条件：** Phase 0 全部完成（15/15 ✅）

---

## 一、状态说明

- ⬜ 待开始（Todo）
- 🏃 进行中（In Progress）
- ✅ 已完成（Done）
- ⏸️ 已暂停（Paused）
- 🚫 已阻塞（Blocked）

---

## 二、Sprint 1 核心任务

| 状态 | 任务 ID | 任务名称 | 优先级 | 复杂度 | 预估工时 | 负责人 | 备注 |
|------|---------|---------|--------|--------|---------|--------|------|
| ⬜ | [PHASE1-TASK001](phase1-task001_file-tree-browser.md) | 文件树浏览器与文件操作 | P0 | 复杂 | 3-4 天 | 待分配 | 扩展现有 FileTree.tsx，集成 FileManager IPC |
| ⬜ | [PHASE1-TASK002](phase1-task002_wysiwyg-editor.md) | WYSIWYG Markdown 编辑器 | P0 | 非常复杂 | 4-5 天 | 待分配 | Tiptap 集成，Markdown 双向转换 |
| ⬜ | [PHASE1-TASK003](phase1-task003_multi-tab-system.md) | 多 Tab 文件编辑系统 | P0 | 中等 | 2-3 天 | 待分配 | Tab 栏 + 专用 Zustand store |
| ⬜ | [PHASE1-TASK004](phase1-task004_file-import.md) | 文件导入与 CSV 查看器 | P1/P2 | 复杂 | 3-4 天 | 待分配 | Word/PDF/CSV 导入，新增 file:import IPC |

---

## 三、任务依赖关系

```
Phase 0 (已完成)
  ├── FileManager
  ├── GitAbstraction
  ├── SyncManager
  ├── IPC Framework
  └── AppStore (Zustand)
        │
        ▼
  TASK001 (文件树 + CRUD) ──P0──
        │                       │
        ├───────────────┐       │
        ▼               ▼       ▼
  TASK002 (编辑器)  TASK004 (导入 + CSV)
        │
        ▼
  TASK003 (多 Tab)
```

**推荐执行顺序：** TASK001 → TASK002 → TASK003 → TASK004

> TASK001 完成后，TASK002 与 TASK004 可并行开发。TASK003 依赖 TASK002 的编辑器组件。

---

## 四、需求追溯矩阵

| 需求编号 | 需求名称 | 对应任务 | 优先级 | 验收标准数 |
|---------|---------|---------|--------|-----------|
| 需求 2.1 | 文件树浏览器 | TASK001 | P0 | 7 |
| 需求 2.2 | 文件 CRUD 操作 | TASK001 | P0 | 6 |
| 需求 2.3 | WYSIWYG Markdown 编辑器 | TASK002 | P0 | 6 |
| 需求 2.4 | 多 Tab 文件编辑 | TASK003 | P0 | 6 |
| 需求 2.5 | 文件导入 | TASK004 | P1 | 6 |
| 需求 2.6 | CSV 查看器 | TASK004 | P2 | 5 |

---

## 五、总体进度

**Sprint 1 总进度：** 0/4（0%）

- [ ] TASK001 — 文件树浏览器与文件操作
- [ ] TASK002 — WYSIWYG Markdown 编辑器
- [ ] TASK003 — 多 Tab 文件编辑系统
- [ ] TASK004 — 文件导入与 CSV 查看器

**子任务统计：**

| 任务 ID | 子任务数 | 已完成 | 进度 |
|---------|---------|--------|------|
| TASK001 | 9 | 0 | 0% |
| TASK002 | 10 | 0 | 0% |
| TASK003 | 7 | 0 | 0% |
| TASK004 | 9 | 0 | 0% |
| **合计** | **35** | **0** | **0%** |

---

## 六、Sprint 1 新增依赖包

| 包名 | 版本 | 用途 | 关联任务 |
|------|------|------|---------|
| `@tiptap/react` | ^2.x | Tiptap React 集成 | TASK002 |
| `@tiptap/starter-kit` | ^2.x | Tiptap 基础扩展包 | TASK002 |
| `tiptap-markdown` | ^0.8.x | Markdown 双向转换 | TASK002 |
| `@tiptap/extension-table` | ^2.x | 表格支持 | TASK002 |
| `@tiptap/extension-table-row` | ^2.x | 表格行 | TASK002 |
| `@tiptap/extension-table-cell` | ^2.x | 表格单元格 | TASK002 |
| `@tiptap/extension-table-header` | ^2.x | 表格表头 | TASK002 |
| `@tiptap/extension-task-list` | ^2.x | 任务列表 | TASK002 |
| `@tiptap/extension-task-item` | ^2.x | 任务列表项 | TASK002 |
| `@tiptap/extension-code-block-lowlight` | ^2.x | 代码块语法高亮 | TASK002 |
| `lowlight` | ^3.x | 语法高亮引擎 | TASK002 |
| `mammoth` | ^1.x | Word 转 Markdown | TASK004 |
| `pdf-parse` | ^1.x | PDF 文本提取 | TASK004 |
| `papaparse` | ^5.x | CSV 解析 | TASK004 |
| `@tanstack/react-virtual` | ^3.x | 虚拟滚动 | TASK004 |

---

## 七、Phase 0 基础设施衔接点

本 Sprint 构建在以下 Phase 0 已完成基础设施之上：

| 模块 | 文件路径 | Sprint 1 使用方式 |
|------|---------|-----------------|
| FileManager | `src/main/services/file-manager.ts` | 文件 CRUD 底层操作、路径验证、原子写入 |
| FileHandler IPC | `src/main/ipc/handlers/file.handler.ts` | 已有 file:read/write/delete/list/move/copy 等通道 |
| GitAbstraction | `src/main/services/git-abstraction.ts` | 文件变更后 stageFile + commitAll |
| SyncManager | `src/main/services/sync-manager.ts` | notifyFileChanged() 触发自动提交与同步 |
| IPC 类型系统 | `src/shared/types.ts` | IPC_CHANNELS + IPCChannelMap 类型安全 |
| Preload 白名单 | `src/preload/index.ts` | safeInvoke() 通道白名单验证 |
| AppStore | `src/renderer/store/appStore.ts` | openFiles/currentFile 状态（TASK003 需整合） |
| FileTree 组件 | `src/renderer/components/layout/FileTree.tsx` | 已有基础树渲染，需扩展 CRUD 交互 |
| MainContent | `src/renderer/components/layout/MainContent.tsx` | 编辑器和 Tab 栏的挂载容器 |
| UI 组件库 | `src/renderer/components/ui/` | Button、Modal、Input、Tooltip、Badge 等 |

---

## 八、质量要求

- TypeScript 严格模式，禁止 `any`
- ESLint 零警告
- P0 任务单元测试覆盖率 ≥ 80%
- P1/P2 任务单元测试覆盖率 ≥ 60%
- 所有公开函数必须有 JSDoc 注释
- 代码注释使用英文，文档使用中文
- 所有异步操作必须有明确的错误处理，禁止静默吞掉异常

---

## 九、里程碑检查清单

### 功能完整性

- [ ] 文件树正常展示和交互
- [ ] 文件 CRUD 操作正常
- [ ] WYSIWYG 编辑器正常工作
- [ ] Markdown 双向转换正确
- [ ] 多 Tab 编辑正常
- [ ] 文件导入功能可用
- [ ] CSV 查看器正常显示

### 性能达标

- [ ] 文件树加载 < 500ms（1000 个文件以内）
- [ ] 编辑器打开文件 < 200ms（1MB 以内）
- [ ] 编辑器输入延迟 < 16ms（60fps）
- [ ] Tab 切换 < 100ms
- [ ] 文件导入 < 5 秒（10 个文件）

---

## 十、进度记录

> 以下内容在实际开发过程中按时间顺序追加。

| 日期 | 任务 | 状态变更 | 备注 |
|------|------|---------|------|
| 2026-03-31 | — | — | Sprint 1 任务拆解完成，尚未开始开发 |
| 2026-04-01 | TASK016/TASK017/TASK018 | ✅ 已完成 | 已在桌面端集成 Phase 1 工作台：文件树联动、Markdown 双链编辑、AI Streaming 对话 |

---

**创建时间：** 2026-03-31
**最后更新：** 2026-04-01
**更新记录：**
- 2026-03-31 — 创建 Sprint 1 任务列表，含 4 个主任务、35 个子任务
- 2026-04-01 — 追加 TASK016/TASK017/TASK018 完成记录
