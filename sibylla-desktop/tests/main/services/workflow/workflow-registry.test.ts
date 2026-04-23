import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WorkflowRegistry } from '../../../../src/main/services/workflow/WorkflowRegistry'
import { WorkflowParser } from '../../../../src/main/services/workflow/WorkflowParser'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('WorkflowRegistry', () => {
  let registry: WorkflowRegistry
  let parser: WorkflowParser
  let tempDir: string

  beforeEach(async () => {
    parser = new WorkflowParser()
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-registry-'))
    const resourcesDir = path.join(tempDir, 'resources', 'workflows')
    await fs.mkdir(resourcesDir, { recursive: true })

    registry = new WorkflowRegistry(parser, resourcesDir)
  })

  it('should load built-in workflows from resources directory', async () => {
    const yamlContent = `
id: builtin-test
version: 1.0.0
name: Builtin Test
description: A built-in workflow
scope: public
triggers:
  - type: manual
steps:
  - id: s1
    name: Step 1
    skill: test-skill
`
    const resourcesDir = path.join(tempDir, 'resources', 'workflows')
    await fs.writeFile(path.join(resourcesDir, 'builtin.yaml'), yamlContent)

    await registry.initialize()

    const all = registry.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]!.metadata.id).toBe('builtin-test')
  })

  it('should allow user definitions to override built-in', async () => {
    const builtinYaml = `
id: override-test
version: 1.0.0
name: Builtin Version
description: Original
scope: public
triggers:
  - type: manual
steps:
  - id: s1
    name: Step
    skill: test
`
    const userYaml = `
id: override-test
version: 2.0.0
name: User Version
description: Overridden
scope: public
triggers:
  - type: manual
steps:
  - id: s1
    name: Step
    skill: test
`
    const resourcesDir = path.join(tempDir, 'resources', 'workflows')
    const userDir = path.join(tempDir, '.sibylla', 'workflows')
    await fs.mkdir(userDir, { recursive: true })
    await fs.writeFile(path.join(resourcesDir, 'builtin.yaml'), builtinYaml)
    await fs.writeFile(path.join(userDir, 'user.yaml'), userYaml)

    const registryWithUser = new WorkflowRegistry(parser, resourcesDir, tempDir)
    await registryWithUser.initialize()

    const wf = registryWithUser.get('override-test')
    expect(wf).toBeDefined()
    expect(wf?.metadata.version).toBe('2.0.0')
    expect(wf?.metadata.name).toBe('User Version')
  })

  it('should filter workflows by trigger type', async () => {
    const yaml1 = `
id: file-trigger-wf
version: 1.0.0
name: File Trigger
description: File trigger workflow
scope: public
triggers:
  - type: file_created
    pattern: "**/*.md"
steps:
  - id: s1
    name: Step
    skill: test
`
    const yaml2 = `
id: manual-trigger-wf
version: 1.0.0
name: Manual Trigger
description: Manual trigger workflow
scope: public
triggers:
  - type: manual
steps:
  - id: s1
    name: Step
    skill: test
`
    const resourcesDir = path.join(tempDir, 'resources', 'workflows')
    await fs.writeFile(path.join(resourcesDir, 'file.yaml'), yaml1)
    await fs.writeFile(path.join(resourcesDir, 'manual.yaml'), yaml2)

    await registry.initialize()

    const fileTriggered = registry.getByTrigger('file_created')
    expect(fileTriggered).toHaveLength(1)
    expect(fileTriggered[0]!.metadata.id).toBe('file-trigger-wf')

    const manualTriggered = registry.getByTrigger('manual')
    expect(manualTriggered).toHaveLength(1)
    expect(manualTriggered[0]!.metadata.id).toBe('manual-trigger-wf')
  })
})
