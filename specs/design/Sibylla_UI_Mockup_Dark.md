# Sibylla UI Mockup (Dark) 结构化说明

> 来源文件：`Sibylla_UI_Mockup_Dark.html`  
> 目标：将 HTML 视觉稿整理为可读的 Markdown 设计文档。

## 1. 页面概览

- 页面标题：`Sibylla UI - Dark Mode (Monochrome)`
- 视觉主题：深色单色系（黑/深灰为主，白色高亮）
- 字体：
  - `Inter`
  - `JetBrains Mono`
  - `Noto Sans SC`
- 结构分区：
  - 顶部栏（48px）
  - 主体三栏布局（左侧栏 / 中央编辑区 / 右侧 AI 栏）
  - 底部状态栏（32px）

---

## 2. 设计 Token（来自 Tailwind 扩展）

### 2.1 颜色

- `sys.black`: `#000000`
- `sys.darkSurface`: `#0A0A0A`
- `sys.darkBorder`: `#27272A`
- `sys.darkMuted`: `#A1A1AA`

状态色：
- `status.success`: `#10B981`
- `status.warning`: `#F59E0B`
- `status.error`: `#EF4444`
- `status.info`: `#3B82F6`

### 2.2 基础视觉规则

- Body：黑底白字，禁止页面外溢滚动（`overflow: hidden`）
- 滚动条：极细深灰风格（hover 变浅）
- 噪点背景：编辑区使用叠加噪点纹理（`noise-bg`）
- 选中文本：白底黑字（`selection:bg-white selection:text-black`）

---

## 3. 布局结构

```text
App
├─ Top Bar (48px)
├─ Main Content
│  ├─ Left Sidebar (220px)
│  ├─ Editor Area (flex-1)
│  └─ AI Sidebar (320px)
└─ Bottom Bar (32px)
```

---

## 4. 顶部栏（Top Bar）

### 4.1 左侧

- 品牌区：
  - 像素章鱼 Logo（`pixel-octo`）
  - 文本：`SIBYLLA`（等宽、加粗、字距拉开）
- Workspace 切换按钮：
  - 当前名称：`Sibylla-Core`
  - 下拉箭头

### 4.2 右侧

- 同步状态：
  - 绿色勾图标 + `Synced`
- 用户头像：
  - 7x7 圆形头像容器

---

## 5. 左侧栏（Navigation / File Tree）

- 固定宽度：`220px`
- 背景：`#050505`
- 主分组：
  - `Files`（当前激活）
  - 文件树示例：
    - `prd.md`（本地变更点，warning）
    - `ui-ux-design.md`（当前选中，白底黑字高亮）
    - `app.ts`（同步状态点，success）
- 工具区：
  - `Global Search`（快捷键 `⌘⇧F`）
  - `Tasks`
  - `Notifications`（示例角标：`3`）

---

## 6. 中央编辑区（Editor Area）

### 6.1 Tab 栏（40px）

- 当前活动 Tab：`ui-ux-design.md`
- 非活动 Tab：`prd.md`（带 warning 小点）
- 旁边有 `AI` 快捷按钮

### 6.2 文档内容区

- 标题：`UI/UX Design Specification`
- 引导段落（带左侧强调线）：
  - 说明该文档定义 Sibylla 界面布局、视觉规范、交互原则
  - 强调需遵循 `CLAUDE.md` 中 UI/UX baseline
- 二级标题示例：`1. Design Principles`

### 6.3 冲突解决 UI 示例（重点组件）

卡片结构：
1. 顶部警告条：`File Conflict: docs/product/prd.md`
2. 双栏 Diff：
   - 左：`Your Version`
   - 右：`Their Version (Bob)`
   - 红色标记删除项，绿色标记新增项
3. AI Suggested Merge：
   - 建议合并句子：
     `Members are divided into four tiers: Free User, Basic Member, Premium Member, Enterprise Member.`
4. 操作按钮：
   - `Accept Yours`
   - `Accept Theirs`
   - `Accept AI Suggestion`（主按钮）
   - `Edit Manually`

---

## 7. 右侧 AI 栏（Sibylla AI）

- 固定宽度：`320px`
- 顶部标题区：`Sibylla AI`
- 聊天区消息流：
  - 用户消息（右对齐）
  - AI 响应（含文档引用 + Diff 预览 + 应用按钮）
  - AI loading skeleton（脉冲占位）

### 7.1 AI 响应示例内容

- 引用：`Sibylla_VI_Design_System.html`
- 建议：冲突区域建议使用深灰面板 + warning 色
- 内联 Diff：
  - `- bg-white text-black`
  - `+ bg-[#1A1500] border-status-warning`
- 快捷操作：
  - `Apply`
  - `Edit & Apply`

### 7.2 输入区

- 文本框 placeholder：`Ask Sibylla...`
- 发送按钮：白底黑字箭头
- 辅助信息：`⌘ ↵ Send`
- 左下扩展动作图标（链路/附加）

---

## 8. 底部栏（Status Bar）

### 8.1 左侧

- 模式切换：`Plan`
- 模型切换：`Claude 3.5 Sonnet`

### 8.2 右侧

- 余额信息：`Credits: 1,240`
- 同步状态：`Synced 10:23`（绿色）

---

## 9. 关键视觉与交互特征总结

- 黑白主导 + 功能状态色点缀（success/warning/error/info）
- 等宽字体用于系统标签与状态栏，提升“工具感”
- 选中态使用高反差（白底黑字）强化焦点
- AI 协作集中在右栏，包含“解释 + diff + 一键应用”闭环
- 冲突处理通过 `Your/Their/AI Suggestion` 三轨并列，降低决策成本

---

## 10. 可落地实现清单（供开发对齐）

- 统一 Token：颜色、边框、状态色、字体
- 固定尺寸布局：Top(48) / Bottom(32) / Left(220) / Right(320)
- 文件树状态点：脏文件、已同步、当前选中
- 编辑器页签体系：活动/非活动/关闭/新建 AI 会话
- 冲突面板组件化：Diff + AI 建议 + 四按钮动作区
- AI 面板组件化：消息、diff 卡片、流式占位、输入区

