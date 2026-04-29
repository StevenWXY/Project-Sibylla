import React from 'react'

interface EmptyStateProps {
  query: string
  hasFilters: boolean
}

export const EmptyState: React.FC<EmptyStateProps> = ({ query, hasFilters }) => {
  return (
    <div className="p-6 text-center">
      <div className="text-sys-darkTextSecondary text-sm mb-3">
        未找到匹配结果
      </div>
      <div className="text-sys-darkTextSecondary/60 text-xs space-y-1">
        {!hasFilters && (
          <>
            <p>试试源前缀过滤：</p>
            <p><code className="text-indigo-400">mem:</code> 搜索记忆</p>
            <p><code className="text-indigo-400">file:</code> 搜索文件</p>
            <p><code className="text-indigo-400">mcp:github</code> 搜索 GitHub 数据</p>
          </>
        )}
        {query.length < 2 && (
          <p>请输入至少 2 个字符</p>
        )}
      </div>
    </div>
  )
}
