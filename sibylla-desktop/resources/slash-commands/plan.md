---
id: plan
version: 1.0.0
name: 规划模式
aliases: ["/p"]
params:
  - name: goal
    type: string
    required: true
    description: Goal to plan for
---

请为以下目标制定执行计划：{{params.goal}}
输出格式：
1. 目标拆解为具体步骤
2. 每个步骤标注预估耗时和依赖关系
3. 识别风险点和缓解策略
4. 给出优先级排序
仅输出计划，不执行任何操作。
