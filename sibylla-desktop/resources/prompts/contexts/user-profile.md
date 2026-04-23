---
id: contexts.user-profile
version: 1.0.0
scope: context
estimated_tokens: 80
tags: [user, preferences, dynamic]
---

## 用户偏好
- 语言：{{user.language}}
- 输出风格：{{user.outputStyle}}
- 常用操作：{{#user.frequentActions}}{{.}}、{{/user.frequentActions}}
