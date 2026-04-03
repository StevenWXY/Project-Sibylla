# PHASE1-TASK017: Markdown 双链编辑器集成 — 开发计划

> 任务来源：[plans/phase1-overview.md](./phase1-overview.md)
> 创建日期：2026-04-03
> 最后更新：2026-04-03

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK017 |
| **任务标题** | Markdown 双链编辑器组件集成 |
| **优先级** | P0 |
| **复杂度** | 较高 |
| **预估工时** | 3-4 工作日 |
| **前置依赖** | ✅ TASK016 文件树联动、✅ 文件读写 IPC |

### 目标

完成 Markdown 编辑器双向编辑能力（源码/预览或富文本/Markdown 映射），实现稳定的文档编辑与保存主流程。

---

## 二、范围定义

**包含：**
- 编辑器容器与工具栏
- Markdown 内容加载与回填
- 编辑后保存（手动保存与自动保存触发点）
- 预览区/渲染区联动（最小闭环）

**不包含：**
- 复杂协同光标
- 富文本高级插件生态扩展
- 实时多人编辑

---

## 三、参考与依赖

- `src/renderer/pages/WorkspaceStudioPage.tsx`
- `src/renderer/components/layout/MainContent.tsx`
- `src/renderer/components/ui/Textarea.tsx`
- `src/main/services/file-manager.ts`
- `specs/design/documentation-standards.md`

---

## 四、实施步骤

1. 设计编辑区布局，确定编辑器与预览的切换/并排模式。
2. 接入文件读取，打开文件后将 Markdown 注入编辑器状态。
3. 实现编辑变更跟踪和保存策略（防抖保存、显式保存）。
4. 建立 Markdown 渲染链路，保障基础语法渲染可用。
5. 处理无文件选中、只读态、保存失败等异常场景。
6. 验证与文件树切换、多文件切换的状态一致性。

---

## 五、验收清单

- [ ] 打开 Markdown 文件后可正确显示内容
- [ ] 编辑内容后可成功保存到磁盘
- [ ] 预览渲染与源码内容基本一致
- [ ] 文件切换不会丢失未保存内容（有提示或自动保存）
- [ ] 大文件编辑场景下交互可接受
- [ ] 错误状态有可理解提示

