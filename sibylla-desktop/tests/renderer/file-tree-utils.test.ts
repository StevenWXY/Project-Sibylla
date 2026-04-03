import { describe, expect, it } from 'vitest'
import {
  buildTreeFromFiles,
  isCircularDrop,
  validateFilename,
} from '../../src/renderer/components/layout/file-tree.utils'
import type { FileInfo } from '../../src/shared/types'

function file(
  path: string,
  isDirectory: boolean
): FileInfo {
  const name = path.split('/').filter(Boolean).pop() ?? path
  return {
    name,
    path,
    isDirectory,
    size: 0,
    modifiedTime: new Date().toISOString(),
    createdTime: new Date().toISOString(),
    extension: isDirectory ? undefined : name.split('.').pop(),
  }
}

describe('file-tree.utils', () => {
  it('buildTreeFromFiles sorts folders before files and by zh-CN name', () => {
    const tree = buildTreeFromFiles([
      file('zeta.md', false),
      file('资料', true),
      file('alpha.md', false),
      file('文档', true),
      file('文档/readme.md', false),
    ])

    expect(tree.map((item) => item.name)).toEqual(['文档', '资料', 'alpha.md', 'zeta.md'])
    expect(tree[0]?.children?.[0]?.path).toBe('文档/readme.md')
  })

  it('validateFilename catches invalid filenames', () => {
    expect(validateFilename('')).toBe('文件名不能为空')
    expect(validateFilename('a'.repeat(256))).toBe('文件名不能超过 255 个字符')
    expect(validateFilename('a/b.md')).toBe('文件名包含非法字符')
    expect(validateFilename('.')).toBe('文件名不能仅为点号')
    expect(validateFilename('需求文档.md')).toBeNull()
  })

  it('isCircularDrop detects self-descendant drop', () => {
    expect(isCircularDrop('docs', 'docs/specs')).toBe(true)
    expect(isCircularDrop('docs/specs', 'docs')).toBe(false)
    expect(isCircularDrop('docs', 'assets')).toBe(false)
  })
})
