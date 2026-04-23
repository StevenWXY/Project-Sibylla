---
id: mode
version: 1.0.0
name: 切换模式
aliases: ["/m"]
params:
  - name: mode
    type: string
    required: true
    description: Target mode name
    enum: ["free", "write", "review", "analyze", "plan"]
---

请切换 AI 工作模式为：{{params.mode}}
切换后，后续交互将遵循该模式的行为约束。
