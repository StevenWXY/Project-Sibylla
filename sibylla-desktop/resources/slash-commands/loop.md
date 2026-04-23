---
id: loop
version: 1.0.0
name: 持续执行
aliases: ["/continue", "/go"]
params:
  - name: task
    type: string
    required: true
    description: Task to execute
  - name: max_steps
    type: integer
    required: false
    description: Maximum execution steps
    default: 20
---

你现在进入持续执行模式。规则：
1. 继续工作，不需要每步批准。
2. 若需要用户决策才能继续，暂停并明确询问。
3. 最大步骤数：{{params.max_steps}}。
4. 任务完成时输出完成摘要。
本次任务：{{params.task}}
