import React from 'react'

interface CommandCategoryProps {
  title: string
  count: number
}

export const CommandCategory: React.FC<CommandCategoryProps> = ({ title, count }) => {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-sys-darkTextSecondary">
        {title}
      </span>
      <span className="text-[10px] text-sys-darkTextSecondary/50">({count})</span>
    </div>
  )
}
