import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { PromptLoader } from '../../../../src/main/services/context-engine/PromptLoader'
import { PromptFormatError } from '../../../../src/main/services/context-engine/types'

const mockTokenEstimator = (text: string) => Math.ceil(text.length / 4)

async function createTempPromptDir(): Promise<string> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-loader-'))
  return tempDir
}

async function writePromptFile(dir: string, relativePath: string, content: string): Promise<string> {
  const filePath = path.join(dir, relativePath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf-8')
  return filePath
}

describe('PromptLoader', () => {
  let builtinDir: string
  let userDir: string
  let loader: PromptLoader

  beforeEach(async () => {
    builtinDir = await createTempPromptDir()
    userDir = await createTempPromptDir()
    loader = new PromptLoader(builtinDir, userDir, mockTokenEstimator)
  })

  afterEach(async () => {
    await fs.rm(builtinDir, { recursive: true, force: true })
    await fs.rm(userDir, { recursive: true, force: true })
  })

  it('should load a builtin prompt', async () => {
    await writePromptFile(builtinDir, 'core/identity.md', `---
id: core.identity
version: "1.0.0"
scope: core
---

You are Sibylla.`)

    const result = await loader.load('core.identity')

    expect(result.id).toBe('core.identity')
    expect(result.source).toBe('builtin')
    expect(result.body.trim()).toBe('You are Sibylla.')
  })

  it('should prefer user override over builtin', async () => {
    await writePromptFile(builtinDir, 'core/identity.md', `---
id: core.identity
version: "1.0.0"
scope: core
---

Builtin content.`)

    await writePromptFile(userDir, 'core/identity.md', `---
id: core.identity
version: "1.0.1"
scope: core
---

User override content.`)

    const result = await loader.load('core.identity')

    expect(result.source).toBe('user-override')
    expect(result.body.trim()).toBe('User override content.')
  })

  it('should fallback to builtin when no user override', async () => {
    await writePromptFile(builtinDir, 'core/principles.md', `---
id: core.principles
version: "1.0.0"
scope: core
---

Be helpful.`)

    const result = await loader.load('core.principles')

    expect(result.source).toBe('builtin')
  })

  it('should throw PromptFormatError for missing file', async () => {
    await expect(loader.load('nonexistent')).rejects.toThrow(PromptFormatError)
  })

  it('should throw PromptFormatError for missing frontmatter', async () => {
    await writePromptFile(builtinDir, 'test/bad.md', 'No frontmatter here')

    await expect(loader.load('test.bad')).rejects.toThrow(PromptFormatError)
  })

  it('should throw PromptFormatError for missing required fields', async () => {
    await writePromptFile(builtinDir, 'test/missing.md', `---
id: test.missing
---

Missing version and scope.`)

    await expect(loader.load('test.missing')).rejects.toThrow(PromptFormatError)
  })

  it('should load builtin version via readAsBuiltin', async () => {
    await writePromptFile(builtinDir, 'core/tone.md', `---
id: core.tone
version: "1.0.0"
scope: core
---

Be professional.`)

    await writePromptFile(userDir, 'core/tone.md', `---
id: core.tone
version: "2.0.0"
scope: core
---

Be casual.`)

    const result = await loader.readAsBuiltin('core.tone')

    expect(result.source).toBe('builtin')
    expect(result.body.trim()).toBe('Be professional.')
  })

  it('should render templates with data', async () => {
    await writePromptFile(builtinDir, 'contexts/test.md', `---
id: contexts.test
version: "1.0.0"
scope: context
---

Hello {{name}}, workspace: {{workspace.name}}`)

    const result = await loader.render('contexts.test', {
      name: 'User',
      workspace: { name: 'MyProject' },
    })

    expect(result.body).toContain('Hello User')
    expect(result.body).toContain('workspace: MyProject')
  })

  it('should check existence correctly', async () => {
    await writePromptFile(builtinDir, 'exists/test.md', `---
id: exists.test
version: "1.0.0"
scope: core
---

Exists.`)

    expect(await loader.exists('exists.test')).toBe(true)
    expect(await loader.exists('nonexistent')).toBe(false)
  })

  it('should handle BOM in files', async () => {
    const contentWithBom = '\uFEFF' + `---
id: core.bom
version: "1.0.0"
scope: core
---

BOM content.`

    await writePromptFile(builtinDir, 'core/bom.md', contentWithBom)

    const result = await loader.load('core.bom')
    expect(result.id).toBe('core.bom')
    expect(result.body.trim()).toBe('BOM content.')
  })

  it('should load safely returning null on error', async () => {
    const result = await loader.loadSafe('nonexistent')
    expect(result).toBeNull()
  })

  it('should resolve paths correctly', () => {
    const builtinPath = loader.resolveBuiltinPath('core.identity')
    expect(builtinPath).toContain('core/identity.md')

    const userPath = loader.resolveUserPath('core.identity')
    expect(userPath).toContain('core/identity.md')
  })
})
