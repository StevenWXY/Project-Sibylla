---
id: tools.write-file
version: 1.0.0
scope: tool
estimated_tokens: 150
tags: [file, write]
---

## Write File Tool

写入文件内容。采用原子写入策略（先写临时文件再替换），确保数据安全。

使用场景：
- 创建新文件
- 完全替换文件内容

注意事项：
- 写入前必须展示 diff 预览供用户确认
- 不覆盖未备份的重要文件
- 确保目录存在，自动创建父目录
