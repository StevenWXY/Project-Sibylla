---
id: summarize
version: 1.0.0
name: 文档摘要
aliases: ["/sum", "/tldr"]
params:
  - name: target
    type: string
    required: false
    description: Target to summarize
---

请生成摘要。{{#if params.target}}目标：{{params.target}}{{/if}}
提取核心观点、关键数据、重要结论。保持简洁，总长度不超过原文 30%。
