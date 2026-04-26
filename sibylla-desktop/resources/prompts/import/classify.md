---
id: import.classify
version: 1.0.0
scope: import
estimated_tokens: 280
tags: [import, classification, ai]
---

# 文档分类任务

请根据以下文档信息，推断其分类。

## 文档信息
- 标题：{{title}}
- 首段内容：{{firstParagraph}}
- 关键词：{{keywords}}

## 分类类别
- meeting：会议纪要（包含参会人、决议、行动项）
- contract：合同文档（包含条款、签署方、金额）
- tech_doc：技术文档（包含 API、架构、代码示例）
- article：文章/博客（包含观点、论述、引用）
- unknown：无法识别

## 输出格式
请返回 JSON：
```json
{
  "category": "meeting|contract|tech_doc|article|unknown",
  "confidence": 0.0,
  "tags": ["tag1", "tag2"],
  "reason": "分类理由（一句话）"
}
```
