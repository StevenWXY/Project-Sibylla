import { describe, expect, it } from 'vitest'
import {
  buildTreeFromFiles,
  isCircularDrop,
  validateFilename,
  flattenVisibleNodes,
  sortTreeNodes,
  findNodeByPath,
  countFolderEntries,
  expandNodeInTree,
  removeNodeFromTree,
  insertNodeToTree,
  renameNodeInTree,
  cloneTree,
  normalizePath,
  getParentPath,
  joinPath,
  getBaseName,
  toDepthPadding,
} from '../../src/renderer/components/layout/file-tree.utils'
import type { FileInfo } from '../../src/shared/types'
import type { FileTreeNode } from '../../src/renderer/components/layout/file-tree.utils'

function makeFile(path: string, isDirectory: boolean): FileInfo {
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

function makeNode(
  path: string,
  type: 'file' | 'folder',
  children?: FileTreeNode[]
): FileTreeNode {
  const name = path.split('/').filter(Boolean).pop() ?? path
  return {
    id: path,
    name,
    type,
    path,
    children,
    depth: path.split('/').filter(Boolean).length - 1,
  }
}

describe('file-tree.utils — existing', () => {
  it('buildTreeFromFiles sorts folders before files and by zh-CN name', () => {
    const tree = buildTreeFromFiles([
      makeFile('zeta.md', false),
      makeFile('资料', true),
      makeFile('alpha.md', false),
      makeFile('文档', true),
      makeFile('文档/readme.md', false),
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

describe('normalizePath', () => {
  it('normalizes backslashes and leading slashes', () => {
    expect(normalizePath('\\foo\\bar')).toBe('foo/bar')
    expect(normalizePath('/foo/bar')).toBe('foo/bar')
    expect(normalizePath('///foo')).toBe('foo')
  })
})

describe('getParentPath', () => {
  it('returns empty for root-level items', () => {
    expect(getParentPath('foo.md')).toBe('')
    expect(getParentPath('docs')).toBe('')
  })

  it('returns parent for nested items', () => {
    expect(getParentPath('docs/readme.md')).toBe('docs')
    expect(getParentPath('a/b/c.md')).toBe('a/b')
  })
})

describe('joinPath', () => {
  it('joins parent and child', () => {
    expect(joinPath('docs', 'readme.md')).toBe('docs/readme.md')
  })

  it('returns child when parent is empty', () => {
    expect(joinPath('', 'readme.md')).toBe('readme.md')
  })
})

describe('getBaseName', () => {
  it('extracts base name from path', () => {
    expect(getBaseName('docs/readme.md')).toBe('readme.md')
    expect(getBaseName('readme.md')).toBe('readme.md')
  })
})

describe('toDepthPadding', () => {
  it('computes correct padding', () => {
    expect(toDepthPadding(0)).toBe(8)
    expect(toDepthPadding(1)).toBe(24)
    expect(toDepthPadding(3)).toBe(56)
  })
})

describe('sortTreeNodes', () => {
  it('sorts folders before files', () => {
    const nodes: FileTreeNode[] = [
      makeNode('z.md', 'file'),
      makeNode('a-folder', 'folder'),
      makeNode('a.md', 'file'),
      makeNode('b-folder', 'folder'),
    ]
    const sorted = sortTreeNodes(nodes)
    expect(sorted.map((n) => n.name)).toEqual(['a-folder', 'b-folder', 'a.md', 'z.md'])
  })

  it('sorts recursively', () => {
    const nodes: FileTreeNode[] = [
      makeNode('docs', 'folder', [
        makeNode('z.md', 'file'),
        makeNode('a.md', 'file'),
      ]),
    ]
    const sorted = sortTreeNodes(nodes)
    expect(sorted[0]?.children?.map((n) => n.name)).toEqual(['a.md', 'z.md'])
  })
})

describe('flattenVisibleNodes', () => {
  it('returns only visible nodes', () => {
    const tree: FileTreeNode[] = [
      makeNode('docs', 'folder', [
        makeNode('docs/a.md', 'file'),
        makeNode('docs/b.md', 'file'),
      ]),
      makeNode('readme.md', 'file'),
    ]
    const expanded = new Set<string>()
    const visible = flattenVisibleNodes(tree, expanded)
    expect(visible).toHaveLength(2)
    expect(visible.map((v) => v.node.name)).toEqual(['docs', 'readme.md'])
  })

  it('includes children when folder is expanded', () => {
    const tree: FileTreeNode[] = [
      makeNode('docs', 'folder', [
        makeNode('docs/a.md', 'file'),
        makeNode('docs/b.md', 'file'),
      ]),
    ]
    const expanded = new Set(['docs'])
    const visible = flattenVisibleNodes(tree, expanded)
    expect(visible).toHaveLength(3)
    expect(visible.map((v) => v.node.name)).toEqual(['docs', 'a.md', 'b.md'])
  })

  it('computes correct depth for nested nodes', () => {
    const tree: FileTreeNode[] = [
      {
        ...makeNode('docs', 'folder'),
        children: [
          {
            ...makeNode('docs/nested', 'folder'),
            children: [makeNode('docs/nested/deep.md', 'file')],
          },
        ],
      },
    ]
    const expanded = new Set(['docs', 'docs/nested'])
    const visible = flattenVisibleNodes(tree, expanded)
    expect(visible.map((v) => v.depth)).toEqual([0, 1, 2])
  })
})

describe('findNodeByPath', () => {
  it('finds root-level node', () => {
    const tree: FileTreeNode[] = [makeNode('readme.md', 'file')]
    expect(findNodeByPath(tree, 'readme.md')?.name).toBe('readme.md')
  })

  it('finds nested node', () => {
    const tree: FileTreeNode[] = [
      makeNode('docs', 'folder', [makeNode('docs/spec.md', 'file')]),
    ]
    expect(findNodeByPath(tree, 'docs/spec.md')?.name).toBe('spec.md')
  })

  it('returns null for missing path', () => {
    const tree: FileTreeNode[] = [makeNode('readme.md', 'file')]
    expect(findNodeByPath(tree, 'missing.md')).toBeNull()
  })
})

describe('countFolderEntries', () => {
  it('counts direct and nested children', () => {
    const node: FileTreeNode = makeNode('docs', 'folder', [
      makeNode('docs/a.md', 'file'),
      makeNode('docs/sub', 'folder', [makeNode('docs/sub/b.md', 'file')]),
    ])
    expect(countFolderEntries(node)).toBe(3)
  })

  it('returns 0 for files', () => {
    expect(countFolderEntries(makeNode('a.md', 'file'))).toBe(0)
  })
})

describe('expandNodeInTree', () => {
  it('replaces children and sets isLoaded', () => {
    const tree: FileTreeNode[] = [
      makeNode('docs', 'folder', []),
    ]
    const newChildren = [makeNode('docs/a.md', 'file')]
    const result = expandNodeInTree(tree, 'docs', newChildren)
    expect(result[0]?.children).toEqual(newChildren)
    expect(result[0]?.isLoaded).toBe(true)
  })

  it('works on deeply nested nodes', () => {
    const tree: FileTreeNode[] = [
      {
        ...makeNode('root', 'folder'),
        children: [makeNode('root/sub', 'folder', [])],
      },
    ]
    const newChildren = [makeNode('root/sub/file.md', 'file')]
    const result = expandNodeInTree(tree, 'root/sub', newChildren)
    expect(result[0]?.children?.[0]?.children).toEqual(newChildren)
  })
})

describe('removeNodeFromTree', () => {
  it('removes root-level node', () => {
    const tree: FileTreeNode[] = [
      makeNode('a.md', 'file'),
      makeNode('b.md', 'file'),
    ]
    const result = removeNodeFromTree(tree, 'a.md')
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('b.md')
  })

  it('removes nested node by path', () => {
    const tree: FileTreeNode[] = [
      makeNode('docs', 'folder', [
        makeNode('docs/a.md', 'file'),
        makeNode('docs/b.md', 'file'),
      ]),
    ]
    const result = removeNodeFromTree(tree, 'docs/a.md')
    expect(result[0]?.children).toHaveLength(1)
    expect(result[0]?.children?.[0]?.name).toBe('b.md')
  })
})

describe('insertNodeToTree', () => {
  it('inserts at root when parentPath is empty', () => {
    const tree: FileTreeNode[] = [makeNode('a.md', 'file')]
    const newNode = makeNode('b.md', 'file')
    const result = insertNodeToTree(tree, '', newNode)
    expect(result).toHaveLength(2)
  })

  it('inserts into target folder', () => {
    const tree: FileTreeNode[] = [
      makeNode('docs', 'folder', [makeNode('docs/a.md', 'file')]),
    ]
    const newNode = makeNode('docs/b.md', 'file')
    const result = insertNodeToTree(tree, 'docs', newNode)
    expect(result[0]?.children).toHaveLength(2)
  })

  it('sorts after insertion', () => {
    const tree: FileTreeNode[] = [
      makeNode('docs', 'folder', [makeNode('docs/z.md', 'file')]),
    ]
    const newNode = makeNode('docs/a.md', 'file')
    const result = insertNodeToTree(tree, 'docs', newNode)
    expect(result[0]?.children?.map((n) => n.name)).toEqual(['a.md', 'z.md'])
  })
})

describe('renameNodeInTree', () => {
  it('renames node path and name', () => {
    const tree: FileTreeNode[] = [
      makeNode('docs', 'folder', [makeNode('docs/old.md', 'file')]),
    ]
    const result = renameNodeInTree(tree, 'docs/old.md', 'docs/new.md', 'new.md')
    expect(result[0]?.children?.[0]?.name).toBe('new.md')
    expect(result[0]?.children?.[0]?.path).toBe('docs/new.md')
    expect(result[0]?.children?.[0]?.id).toBe('docs/new.md')
  })

  it('updates child paths when folder is renamed', () => {
    const tree: FileTreeNode[] = [
      makeNode('old-folder', 'folder', [
        makeNode('old-folder/child.md', 'file'),
      ]),
    ]
    const result = renameNodeInTree(tree, 'old-folder', 'new-folder', 'new-folder')
    expect(result[0]?.children?.[0]?.path).toBe('new-folder/child.md')
  })
})

describe('cloneTree', () => {
  it('creates a deep copy', () => {
    const tree: FileTreeNode[] = [
      makeNode('docs', 'folder', [makeNode('docs/a.md', 'file')]),
    ]
    const cloned = cloneTree(tree)
    expect(cloned).toEqual(tree)
    expect(cloned).not.toBe(tree)
    expect(cloned[0]?.children).not.toBe(tree[0]?.children)
  })
})

describe('edge cases', () => {
  it('handles empty tree', () => {
    expect(buildTreeFromFiles([])).toEqual([])
    expect(flattenVisibleNodes([], new Set())).toEqual([])
    expect(findNodeByPath([], 'foo')).toBeNull()
    expect(removeNodeFromTree([], 'foo')).toEqual([])
    expect(insertNodeToTree([], '', makeNode('a.md', 'file'))).toHaveLength(1)
  })

  it('handles deeply nested structures (depth > 10)', () => {
    let path = ''
    for (let i = 0; i < 12; i++) {
      path += `level${i}/`
    }
    path += 'deep.md'

    const files: FileInfo[] = []
    let currentPath = ''
    for (let i = 0; i < 12; i++) {
      currentPath += `level${i}/`
      files.push(makeFile(currentPath.slice(0, -1), true))
    }
    files.push(makeFile(path, false))

    const tree = buildTreeFromFiles(files)
    let node: FileTreeNode | null | undefined = tree[0]
    let depth = 0
    while (node?.children && node.children.length > 0) {
      node = node.children[0]
      depth++
    }
    expect(depth).toBeGreaterThanOrEqual(10)
  })

  it('handles tree with only folders', () => {
    const tree = buildTreeFromFiles([
      makeFile('docs', true),
      makeFile('docs/sub', true),
      makeFile('assets', true),
    ])
    expect(tree.every((n) => n.type === 'folder')).toBe(true)
    expect(tree).toHaveLength(2)
  })

  it('handles tree with only files', () => {
    const tree = buildTreeFromFiles([
      makeFile('a.md', false),
      makeFile('b.md', false),
      makeFile('c.md', false),
    ])
    expect(tree.every((n) => n.type === 'file')).toBe(true)
    expect(tree).toHaveLength(3)
  })
})

describe('validateFilename — extended edge cases', () => {
  it('accepts valid Chinese filenames', () => {
    expect(validateFilename('需求文档.md')).toBeNull()
    expect(validateFilename('设计规范 v2.md')).toBeNull()
  })

  it('accepts Unicode filenames', () => {
    expect(validateFilename('🎉party.md')).toBeNull()
    expect(validateFilename('über.txt')).toBeNull()
    expect(validateFilename('ファイル.md')).toBeNull()
  })

  it('rejects whitespace-only names', () => {
    expect(validateFilename('   ')).toBe('文件名不能为空')
    expect(validateFilename('\t')).toBe('文件名不能为空')
  })

  it('rejects names with all illegal characters', () => {
    const illegalChars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
    for (const char of illegalChars) {
      expect(validateFilename(`file${char}name.md`)).toBe('文件名包含非法字符')
    }
  })

  it('accepts names at exactly 255 characters', () => {
    const name = 'a'.repeat(252) + '.md'
    expect(name.length).toBe(255)
    expect(validateFilename(name)).toBeNull()
  })

  it('rejects names over 255 characters', () => {
    const name = 'a'.repeat(253) + '.md'
    expect(name.length).toBe(256)
    expect(validateFilename(name)).toBe('文件名不能超过 255 个字符')
  })

  it('accepts dot-prefixed names (hidden files)', () => {
    expect(validateFilename('.gitignore')).toBeNull()
    expect(validateFilename('.env.local')).toBeNull()
  })

  it('accepts names with multiple extensions', () => {
    expect(validateFilename('archive.tar.gz')).toBeNull()
    expect(validateFilename('spec.test.ts')).toBeNull()
  })
})

describe('isCircularDrop — extended edge cases', () => {
  it('does not flag same-level folders as circular', () => {
    expect(isCircularDrop('docs', 'assets')).toBe(false)
    expect(isCircularDrop('docs/specs', 'docs/designs')).toBe(false)
  })

  it('does not flag root-to-folder as circular', () => {
    expect(isCircularDrop('docs', '')).toBe(false)
    expect(isCircularDrop('docs/specs', 'docs')).toBe(false)
  })

  it('detects deep circular reference', () => {
    expect(isCircularDrop('a', 'a/b/c/d')).toBe(true)
    expect(isCircularDrop('a/b', 'a/b/c')).toBe(true)
  })

  it('handles normalized paths', () => {
    expect(isCircularDrop('/docs', 'docs/specs')).toBe(true)
    expect(isCircularDrop('\\docs', 'docs/specs')).toBe(true)
  })

  it('does not flag partial name matches as circular', () => {
    expect(isCircularDrop('doc', 'docs')).toBe(false)
    expect(isCircularDrop('a', 'ab')).toBe(false)
  })
})

describe('buildTreeFromFiles — extended edge cases', () => {
  it('handles files with Chinese names sorted correctly', () => {
    const tree = buildTreeFromFiles([
      makeFile('文档', true),
      makeFile('资料', true),
      makeFile('alpha.md', false),
      makeFile('苹果.md', false),
    ])
    const folderNames = tree.filter((n) => n.type === 'folder').map((n) => n.name)
    const fileNames = tree.filter((n) => n.type === 'file').map((n) => n.name)
    expect(folderNames.length).toBeGreaterThan(0)
    expect(fileNames.length).toBeGreaterThan(0)
    expect(tree.slice(0, folderNames.length).every((n) => n.type === 'folder')).toBe(true)
  })

  it('handles orphaned files (parent folder missing from listing)', () => {
    const tree = buildTreeFromFiles([
      makeFile('docs/readme.md', false),
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0]?.name).toBe('readme.md')
  })
})

describe('normalizePath — extended edge cases', () => {
  it('handles mixed slashes', () => {
    expect(normalizePath('foo\\bar/baz')).toBe('foo/bar/baz')
  })

  it('handles empty string', () => {
    expect(normalizePath('')).toBe('')
  })

  it('handles trailing slashes', () => {
    expect(normalizePath('foo/bar/')).toBe('foo/bar/')
  })
})
