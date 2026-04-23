---
id: tools.read-file
version: 1.0.0
scope: tool
estimated_tokens: 100
tags: [file, read]
---

## Read File Tool

读取指定文件的内容。支持文本文件，自动检测编码。

使用场景：
- 用户要求查看文件内容
- 需要了解文件当前状态以做出决策
- 对比文件不同版本

最佳实践：
- 优先读取用户明确提到的文件
- 大文件注意 token 预算，可能需要分段读取
- 二进制文件不适用此工具
