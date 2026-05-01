import React, { useMemo, useState } from 'react'
import { useDashboardStore } from '../../store/dashboardStore'

const HEAT_COLORS = ['#F3F4F6', '#C7D2FE', '#818CF8', '#4F46E5'] as const

function getHeatColor(count: number): string {
  if (count === 0) return HEAT_COLORS[0]
  if (count <= 3) return HEAT_COLORS[1]
  if (count <= 6) return HEAT_COLORS[2]
  return HEAT_COLORS[3]
}

export const HeatmapCard: React.FC = () => {
  const commits7d = useDashboardStore((s) => s.data?.commits7d ?? [])
  const members = useDashboardStore((s) => s.data?.members ?? [])
  const [tooltip, setTooltip] = useState<{ author: string; date: string; count: number } | null>(null)

  const { dates, authors, grid } = useMemo(() => {
    const dateSet = new Set<string>()
    const authorSet = new Set<string>()

    for (const c of commits7d) {
      dateSet.add(c.date)
      authorSet.add(c.author)
    }

    for (const m of members) {
      authorSet.add(m.displayName)
    }

    const now = new Date()
    const allDates: string[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000)
      allDates.push(d.toISOString().slice(0, 10))
    }

    const allAuthors = Array.from(authorSet)
    const map = new Map<string, number>()
    for (const c of commits7d) {
      const key = `${c.author}|${c.date}`
      map.set(key, (map.get(key) ?? 0) + c.count)
    }

    return { dates: allDates, authors: allAuthors, grid: map }
  }, [commits7d, members])

  const cellSize = 16
  const cellGap = 3
  const labelWidth = 60
  const headerHeight = 24
  const svgWidth = labelWidth + dates.length * (cellSize + cellGap)
  const svgHeight = headerHeight + authors.length * (cellSize + cellGap)

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4 flex flex-col">
      <h3 className="text-sm font-medium text-gray-600 mb-3">7 天产出热力图</h3>

      <div className="flex-1 overflow-auto relative">
        <svg width={svgWidth} height={svgHeight} className="select-none">
          <g>
            {dates.map((date, di) => (
              <text
                key={date}
                x={labelWidth + di * (cellSize + cellGap) + cellSize / 2}
                y={12}
                textAnchor="middle"
                className="text-[10px] fill-gray-400"
              >
                {date.slice(5)}
              </text>
            ))}
          </g>
          <g>
            {authors.map((author, ai) => (
              <text
                key={author}
                x={labelWidth - 4}
                y={headerHeight + ai * (cellSize + cellGap) + cellSize / 2 + 4}
                textAnchor="end"
                className="text-[10px] fill-gray-500 truncate"
              >
                {author.length > 6 ? author.slice(0, 6) + '...' : author}
              </text>
            ))}
          </g>
          <g>
            {dates.map((date, di) =>
              authors.map((author, ai) => {
                const key = `${author}|${date}`
                const count = grid.get(key) ?? 0
                const x = labelWidth + di * (cellSize + cellGap)
                const y = headerHeight + ai * (cellSize + cellGap)

                return (
                  <rect
                    key={key}
                    x={x}
                    y={y}
                    width={cellSize}
                    height={cellSize}
                    rx={3}
                    fill={getHeatColor(count)}
                    className="cursor-pointer hover:stroke-2 hover:stroke-indigo-300 transition-all"
                    onMouseEnter={() => setTooltip({ author, date, count })}
                    onMouseLeave={() => setTooltip(null)}
                  />
                )
              }),
            )}
          </g>
        </svg>

        {tooltip && (
          <div className="absolute bg-gray-800 text-white text-xs rounded px-2 py-1 pointer-events-none z-10 whitespace-nowrap">
            {tooltip.author} {tooltip.date}: {tooltip.count} 次提交
          </div>
        )}
      </div>
    </div>
  )
}
