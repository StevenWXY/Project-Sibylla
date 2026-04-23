---
id: review
version: 1.0.0
name: 代码审查
aliases: ["/critique"]
params:
  - name: target
    type: string
    required: false
    description: Target file or directory to review
---

请对代码进行全面审查。{{#if params.target}}审查目标：{{params.target}}{{/if}}
关注点：代码风格、逻辑正确性、错误处理、性能、安全性、测试覆盖。
按严重程度分级输出问题，并给出整体质量评分。
