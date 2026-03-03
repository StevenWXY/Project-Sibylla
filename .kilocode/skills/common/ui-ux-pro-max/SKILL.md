---
name: ui-ux-pro-max
description: Intelligent UI/UX design system generator with 67 styles, 96 color palettes, 57 font pairings, and 100 industry-specific reasoning rules. Automatically generates complete design systems based on product type and requirements. Use when building landing pages, dashboards, web apps, or any UI/UX design task.
license: MIT License (see LICENSE file)
metadata:
  category: design
  version: 2.0.0
  source:
    repository: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
    path: src/ui-ux-pro-max
  requirements:
    python: ">=3.0"
  workflow_command: ui-ux-pro-max
---

# UI/UX Pro Max - Intelligent Design System Generator

这个 skill 为 AI 助手提供智能 UI/UX 设计系统生成能力，基于产品类型和需求自动生成完整的设计系统。

## 核心功能

### 1. 智能设计系统生成器

基于用户的产品描述，自动执行以下流程：

```
用户请求 → 多领域搜索（5 个并行搜索）→ 推理引擎 → 完整设计系统
```

**多领域搜索包括：**
- 产品类型匹配（100 个类别）
- 样式推荐（67 种样式）
- 调色板选择（96 种调色板）
- 落地页模式（24 种模式）
- 字体配对（57 种组合）

**推理引擎处理：**
- 匹配产品 → UI 类别规则
- 应用样式优先级（BM25 排名）
- 过滤行业反模式
- 处理决策规则（JSON 条件）

**输出完整设计系统：**
- 推荐的落地页模式
- 匹配的 UI 样式
- 行业调色板
- 字体配对
- 关键效果
- 反模式警告
- 交付前检查清单

### 2. 数据库资源

| 资源 | 数量 | 说明 |
|------|------|------|
| UI 样式 | 67 | Glassmorphism, Neumorphism, Brutalism, Claymorphism, Bento Grid 等 |
| 调色板 | 96 | 行业特定（SaaS, 金融, 医疗, 电商, 美容等） |
| 字体配对 | 57 | 精选的 Google Fonts 组合 |
| 图表类型 | 25 | 仪表板和分析推荐 |
| 技术栈 | 13 | React, Next.js, Vue, SwiftUI, Flutter 等 |
| UX 指南 | 99 | 最佳实践和反模式 |
| 行业规则 | 100 | 特定行业的设计决策规则 |
| 落地页模式 | 24 | 转化优化的页面结构 |

### 3. 支持的技术栈

**Web (HTML)**
- HTML + Tailwind（默认）

**React 生态系统**
- React
- Next.js
- shadcn/ui

**Vue 生态系统**
- Vue
- Nuxt.js
- Nuxt UI

**其他 Web**
- Svelte
- Astro

**iOS**
- SwiftUI

**Android**
- Jetpack Compose

**跨平台**
- React Native
- Flutter

### 4. 100 条行业特定规则

涵盖以下类别：

**科技与 SaaS**
- SaaS, Micro SaaS, B2B Enterprise, Developer Tools, AI/Chatbot Platform

**金融**
- Fintech, Banking, Crypto, Insurance, Trading Dashboard

**医疗**
- Medical Clinic, Pharmacy, Dental, Veterinary, Mental Health

**电商**
- General, Luxury, Marketplace, Subscription Box

**服务**
- Beauty/Spa, Restaurant, Hotel, Legal, Consulting

**创意**
- Portfolio, Agency, Photography, Gaming, Music Streaming

**新兴技术**
- Web3/NFT, Spatial Computing, Quantum Computing, Autonomous Systems

每条规则包括：
- 推荐模式 - 落地页结构
- 样式优先级 - 最佳匹配的 UI 样式
- 色彩情绪 - 行业适配的调色板
- 字体情绪 - 字体个性匹配
- 关键效果 - 动画和交互
- 反模式 - 避免的设计（如银行业避免"AI 紫粉渐变"）

## 使用方式

### 自动激活模式

当用户请求 UI/UX 相关任务时，skill 会自动激活。触发关键词包括：
- "build", "create", "design", "implement"
- "landing page", "dashboard", "website", "app"
- "UI", "UX", "interface", "design system"

示例提示：
```
Build a landing page for my SaaS product
Create a dashboard for healthcare analytics
Design a portfolio website with dark mode
Make a mobile app UI for e-commerce
```

### Workflow 命令模式（Kiro 特定）

使用 slash 命令调用：
```
/ui-ux-pro-max Build a landing page for my SaaS product
```

### 直接调用设计系统生成器

```bash
# 基本用法
python3 .kilocode/skills/ui-ux-pro-max/scripts/search.py "beauty spa wellness" --design-system

# 带项目名称
python3 .kilocode/skills/ui-ux-pro-max/scripts/search.py "beauty spa" --design-system -p "Serenity Spa"

# Markdown 输出
python3 .kilocode/skills/ui-ux-pro-max/scripts/search.py "fintech banking" --design-system -f markdown

# 领域特定搜索
python3 .kilocode/skills/ui-ux-pro-max/scripts/search.py "glassmorphism" --domain style
python3 .kilocode/skills/ui-ux-pro-max/scripts/search.py "elegant serif" --domain typography
python3 .kilocode/skills/ui-ux-pro-max/scripts/search.py "dashboard" --domain chart

# 技术栈特定指南
python3 .kilocode/skills/ui-ux-pro-max/scripts/search.py "form validation" --stack react
python3 .kilocode/skills/ui-ux-pro-max/scripts/search.py "responsive layout" --stack html-tailwind
```

### 持久化设计系统（Master + 覆盖模式）

保存设计系统到文件以实现跨会话的分层检索：

```bash
# 生成并持久化到 design-system/MASTER.md
python3 .kilocode/skills/ui-ux-pro-max/scripts/search.py "SaaS dashboard" --design-system --persist -p "MyApp"

# 创建页面特定的覆盖文件
python3 .kilocode/skills/ui-ux-pro-max/scripts/search.py "SaaS dashboard" --design-system --persist -p "MyApp" --page "dashboard"
```

生成的文件结构：
```
design-system/
├── MASTER.md           # 全局真实来源（颜色、字体、间距、组件）
└── pages/
    └── dashboard.md    # 页面特定覆盖（仅与 Master 的差异）
```

**分层检索工作原理：**
1. 构建特定页面时（如"Checkout"），首先检查 `design-system/pages/checkout.md`
2. 如果页面文件存在，其规则**覆盖** Master 文件
3. 如果不存在，专门使用 `design-system/MASTER.md`

## 工作流程

### 步骤 1：理解需求

当用户请求 UI/UX 任务时：
1. 分析产品类型（SaaS, 电商, 医疗等）
2. 识别目标受众和用例
3. 确定技术栈偏好
4. 理解特殊要求（无障碍、性能等）

### 步骤 2：生成设计系统

自动调用设计系统生成器：
```python
python3 .kilocode/skills/ui-ux-pro-max/scripts/search.py "{product_description}" --design-system -p "{project_name}"
```

### 步骤 3：应用设计系统

基于生成的设计系统：
1. 使用推荐的调色板
2. 应用字体配对
3. 实现 UI 样式
4. 遵循落地页模式
5. 避免反模式

### 步骤 4：技术栈特定实现

根据用户的技术栈偏好：
- 生成相应的代码（React, Vue, HTML 等）
- 应用技术栈特定的最佳实践
- 使用适当的组件库

### 步骤 5：交付前检查

验证以下项目：
- [ ] 无 emoji 作为图标（使用 SVG: Heroicons/Lucide）
- [ ] 所有可点击元素有 cursor-pointer
- [ ] 平滑过渡的悬停状态（150-300ms）
- [ ] 浅色模式：文本对比度最低 4.5:1
- [ ] 键盘导航的焦点状态可见
- [ ] 尊重 prefers-reduced-motion
- [ ] 响应式：375px, 768px, 1024px, 1440px

## 与 frontend-design skill 的关系

| 特性 | frontend-design | ui-ux-pro-max |
|------|----------------|---------------|
| 定位 | 创意驱动的前端设计 | 数据驱动的设计系统 |
| 方法 | 大胆的美学方向 | 行业最佳实践 |
| 数据库 | 无 | 67 样式 + 96 调色板 + 100 规则 |
| 适用场景 | 独特的艺术性界面 | 商业产品的标准化设计 |
| 输出 | 创意代码 | 设计系统 + 代码 |

**推荐使用策略：**
- **商业产品、落地页、仪表板** → 使用 ui-ux-pro-max
- **艺术性项目、品牌网站、创意展示** → 使用 frontend-design
- **复杂项目** → 先用 ui-ux-pro-max 建立设计系统，再用 frontend-design 添加创意元素

## 最佳实践

### 1. 明确产品类型

提供清晰的产品描述以获得最佳匹配：
```
❌ "Build a website"
✅ "Build a landing page for a B2B SaaS analytics platform"
```

### 2. 指定技术栈

如果有偏好，在请求中说明：
```
"Build a React dashboard for healthcare analytics"
"Create a Next.js landing page for fintech startup"
```

### 3. 持久化设计系统

对于多页面项目，使用持久化功能：
```bash
# 首先生成 Master
python3 .kilocode/skills/ui-ux-pro-max/scripts/search.py "e-commerce" --design-system --persist -p "MyShop"

# 然后为特定页面创建覆盖
python3 .kilocode/skills/ui-ux-pro-max/scripts/search.py "checkout flow" --design-system --persist -p "MyShop" --page "checkout"
```

### 4. 迭代优化

如果初始结果不理想：
1. 提供更多上下文
2. 指定不同的样式或调色板
3. 明确反模式要求

## 示例场景

### 场景 1：SaaS 落地页

**请求：**
```
Build a landing page for my project management SaaS tool
```

**生成的设计系统包括：**
- 模式：Hero-Centric + Feature Showcase
- 样式：Minimalism & Swiss Style
- 调色板：Professional Blue (#2563EB, #1E40AF)
- 字体：Inter + Roboto Mono
- 反模式：避免过度动画、深色模式

### 场景 2：医疗仪表板

**请求：**
```
Create a React dashboard for patient health monitoring
```

**生成的设计系统包括：**
- 模式：Data-Dense Dashboard
- 样式：Accessible & Ethical
- 调色板：Healthcare Green (#10B981, #059669)
- 字体：Open Sans + Source Sans Pro
- 关键效果：实时数据更新、清晰的数据可视化

### 场景 3：美容 Spa 网站

**请求：**
```
Design a website for a luxury spa and wellness center
```

**生成的设计系统包括：**
- 模式：Hero-Centric + Social Proof
- 样式：Soft UI Evolution
- 调色板：Soft Pink (#E8B4B8) + Sage Green (#A8D5BA)
- 字体：Cormorant Garamond + Montserrat
- 关键效果：柔和阴影、平滑过渡

## 故障排除

### 问题：脚本无法运行

**解决方案：**
```bash
# 检查 Python 版本
python3 --version

# 确认脚本路径
ls -la .kilocode/skills/ui-ux-pro-max/scripts/search.py

# 添加执行权限
chmod +x .kilocode/skills/ui-ux-pro-max/scripts/search.py
```

### 问题：数据文件未找到

**解决方案：**
```bash
# 检查数据文件
ls -la .kilocode/skills/ui-ux-pro-max/data/

# 应该有 8 个 CSV 文件
# 如果缺失，重新从仓库复制
```

### 问题：设计系统不匹配

**解决方案：**
1. 提供更详细的产品描述
2. 明确指定行业类别
3. 使用领域特定搜索找到更好的匹配

## 参考资料

- **源仓库**: https://github.com/nextlevelbuilder/ui-ux-pro-max-skill
- **CLI 工具**: https://www.npmjs.com/package/uipro-cli
- **文档**: 查看 README.md 获取完整文档

## 许可证

MIT License - 详见 LICENSE 文件

## 版本历史

**v2.0.0** (当前)
- 智能设计系统生成器
- 100 条行业特定规则
- 持久化设计系统支持
- 多领域搜索引擎

**v1.x**
- 基础样式和调色板数据库
- 简单的搜索功能
