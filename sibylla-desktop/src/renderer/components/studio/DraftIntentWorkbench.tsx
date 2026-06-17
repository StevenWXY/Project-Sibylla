import { useMemo, useState } from 'react'
import { ArrowRight, CheckCircle2, Code2, Eye, FileText, Sparkles, X } from 'lucide-react'
import { diffLines } from 'diff'
import { MarkdownRenderer } from './MarkdownRenderer'
import { Button } from '../ui/Button'
import { cn } from '../../utils/cn'

type DraftViewMode = 'visual' | 'source' | 'intent'

interface DraftIntentWorkbenchProps {
  initialMarkdown: string
  onClose: () => void
  onSendToAgent: (prompt: string) => void
}

interface DraftIntentSummary {
  additions: string[]
  removals: string[]
  changedHeadings: string[]
  intentBullets: string[]
  addedLineCount: number
  removedLineCount: number
}

function normalizeDraft(content: string): string {
  return content.trim().replace(/\n{3,}/g, '\n\n')
}

function isHtmlLike(content: string): boolean {
  return /<\/?(html|body|main|section|article|div|table|style|script|h[1-6]|p|ul|ol|li)\b/i.test(content)
}

function extractHeadings(content: string): string[] {
  return content
    .split('\n')
    .map((line) => line.match(/^\s{0,3}#{1,6}\s+(.+)$/)?.[1]?.trim())
    .filter((heading): heading is string => Boolean(heading))
}

function summarizeLines(lines: string[], limit: number): string[] {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^[-+*]\s*$/.test(line))
    .slice(0, limit)
}

function inferDraftIntent(original: string, edited: string): DraftIntentSummary {
  const changes = diffLines(original, edited)
  const additions: string[] = []
  const removals: string[] = []
  let addedLineCount = 0
  let removedLineCount = 0

  for (const change of changes) {
    const lines = change.value.split('\n').filter((line) => line.trim().length > 0)
    if (change.added) {
      addedLineCount += lines.length
      additions.push(...lines)
    }
    if (change.removed) {
      removedLineCount += lines.length
      removals.push(...lines)
    }
  }

  const originalHeadings = extractHeadings(original)
  const editedHeadings = extractHeadings(edited)
  const changedHeadings = editedHeadings.filter((heading) => !originalHeadings.includes(heading))
  const intentBullets: string[] = []

  if (changedHeadings.length > 0) {
    intentBullets.push(`调整文档结构，新增或重命名章节：${changedHeadings.slice(0, 4).join('、')}`)
  }
  if (addedLineCount > removedLineCount) {
    intentBullets.push('用户倾向于补充更多背景、细节或执行步骤')
  } else if (removedLineCount > addedLineCount) {
    intentBullets.push('用户倾向于压缩内容，去掉冗余表达')
  }
  if (additions.some((line) => /示例|例子|case|example/i.test(line))) {
    intentBullets.push('用户希望增加示例，让内容更可执行')
  }
  if (additions.some((line) => /指标|量化|数据|KPI|metric/i.test(line))) {
    intentBullets.push('用户希望加入可量化指标')
  }
  if (additions.some((line) => /风险|限制|注意|边界|安全/i.test(line))) {
    intentBullets.push('用户希望补充风险、限制或边界条件')
  }
  if (additions.some((line) => /用户|痛点|场景|流程|体验/i.test(line))) {
    intentBullets.push('用户更关注用户场景和体验流程')
  }
  if (intentBullets.length === 0 && (addedLineCount > 0 || removedLineCount > 0)) {
    intentBullets.push('用户直接改写了草稿，请以用户改后的版本作为最终偏好')
  }
  if (intentBullets.length === 0) {
    intentBullets.push('尚未检测到实质改动')
  }

  return {
    additions: summarizeLines(additions, 8),
    removals: summarizeLines(removals, 8),
    changedHeadings,
    intentBullets,
    addedLineCount,
    removedLineCount,
  }
}

function buildAgentPrompt(original: string, edited: string, summary: DraftIntentSummary): string {
  const intentText = summary.intentBullets.map((item) => `- ${item}`).join('\n')
  return [
    '请基于我对 Markdown 初稿的直接修改，推断我的真实修改意图，并完成最终 Markdown。',
    '',
    '要求：',
    '- 以“用户改后稿”为最高优先级，不要回退我已经改掉的表达。',
    '- 保留我新增的结构、语气和重点。',
    '- 自动补齐不连贯处，让最终稿可直接使用。',
    '- 只输出最终 Markdown，不要解释过程。',
    '',
    '系统已推断的修改意图：',
    intentText,
    '',
    '原始 AI 初稿：',
    '```md',
    original,
    '```',
    '',
    '用户改后稿：',
    '```md',
    edited,
    '```',
  ].join('\n')
}

function buildHtmlPreview(content: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      padding: 20px;
      font: 14px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #f4f4f5;
      background: #0f0f10;
    }
    a { color: #93c5fd; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #3f3f46; padding: 6px 8px; }
    pre, code { background: #18181b; border-radius: 6px; }
    pre { padding: 12px; overflow: auto; }
  </style>
</head>
<body>${content}</body>
</html>`
}

export function DraftIntentWorkbench({
  initialMarkdown,
  onClose,
  onSendToAgent,
}: DraftIntentWorkbenchProps) {
  const [editedMarkdown, setEditedMarkdown] = useState(() => normalizeDraft(initialMarkdown))
  const [viewMode, setViewMode] = useState<DraftViewMode>('visual')
  const originalMarkdown = useMemo(() => normalizeDraft(initialMarkdown), [initialMarkdown])
  const intentSummary = useMemo(
    () => inferDraftIntent(originalMarkdown, editedMarkdown),
    [originalMarkdown, editedMarkdown],
  )
  const agentPrompt = useMemo(
    () => buildAgentPrompt(originalMarkdown, editedMarkdown, intentSummary),
    [originalMarkdown, editedMarkdown, intentSummary],
  )
  const hasChanges = originalMarkdown !== normalizeDraft(editedMarkdown)
  const shouldRenderHtml = isHtmlLike(editedMarkdown)

  return (
    <div className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-[#080808] text-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#111111] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-black">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">AI 草稿可视化编辑</h2>
            <p className="truncate text-xs text-sys-darkMuted">
              直接改草稿，Sibylla 会从差异里推断你的修改意图
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-sys-darkMuted transition-colors hover:bg-white/10 hover:text-white"
          aria-label="关闭草稿编辑器"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-r border-white/10">
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 p-0.5">
              {[
                { mode: 'visual' as const, label: '可视化', icon: Eye },
                { mode: 'source' as const, label: '源码', icon: Code2 },
                { mode: 'intent' as const, label: '意图', icon: Sparkles },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.mode}
                    type="button"
                    onClick={() => setViewMode(item.mode)}
                    className={cn(
                      'inline-flex h-8 items-center gap-1.5 rounded px-2 text-xs transition-colors',
                      viewMode === item.mode
                        ? 'bg-white text-black'
                        : 'text-sys-darkMuted hover:bg-white/10 hover:text-white',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                )
              })}
            </div>
            <span className="text-xs text-sys-darkMuted">
              {hasChanges ? '已捕捉改动' : '等待用户改动'}
            </span>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-2">
            <textarea
              value={editedMarkdown}
              onChange={(event) => setEditedMarkdown(event.target.value)}
              spellCheck={false}
              className="h-full min-h-0 resize-none border-r border-white/10 bg-[#0d0d0d] p-4 font-mono text-xs leading-relaxed text-gray-200 outline-none placeholder:text-gray-600"
              placeholder="在这里直接改 AI 生成的 Markdown 初稿..."
            />

            <div className="min-h-0 overflow-y-auto bg-[#101010] p-4">
              {viewMode === 'visual' && (
                shouldRenderHtml ? (
                  <iframe
                    title="HTML 可视化预览"
                    sandbox=""
                    srcDoc={buildHtmlPreview(editedMarkdown)}
                    className="h-full min-h-[520px] w-full rounded-md border border-white/10 bg-[#0f0f10]"
                  />
                ) : (
                  <div className="prose-invert max-w-none text-sm text-gray-200">
                    <MarkdownRenderer content={editedMarkdown} />
                  </div>
                )
              )}

              {viewMode === 'source' && (
                <pre className="whitespace-pre-wrap rounded-md border border-white/10 bg-black/30 p-3 font-mono text-xs leading-relaxed text-gray-300">
                  {editedMarkdown || '暂无内容'}
                </pre>
              )}

              {viewMode === 'intent' && (
                <div className="space-y-4 text-sm">
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sys-darkMuted">推断意图</h3>
                    <ul className="space-y-2">
                      {intentSummary.intentBullets.map((item) => (
                        <li key={item} className="rounded-md border border-white/10 bg-white/5 p-2 text-gray-200">
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 p-3">
                      <h4 className="mb-2 text-xs font-semibold text-emerald-300">
                        新增 {intentSummary.addedLineCount} 行
                      </h4>
                      <ul className="space-y-1 text-xs text-emerald-100/90">
                        {intentSummary.additions.length > 0
                          ? intentSummary.additions.map((line) => <li key={line}>+ {line}</li>)
                          : <li>暂无新增内容</li>}
                      </ul>
                    </div>
                    <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3">
                      <h4 className="mb-2 text-xs font-semibold text-red-300">
                        删除 {intentSummary.removedLineCount} 行
                      </h4>
                      <ul className="space-y-1 text-xs text-red-100/90">
                        {intentSummary.removals.length > 0
                          ? intentSummary.removals.map((line) => <li key={line}>- {line}</li>)
                          : <li>暂无删除内容</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="flex w-[320px] shrink-0 flex-col bg-[#0c0c0c]">
          <div className="border-b border-white/10 p-4">
            <h3 className="text-sm font-semibold">最终 MD</h3>
            <p className="mt-1 text-xs text-sys-darkMuted">
              当前编辑内容会作为最终稿基线，意图摘要会一并交给 Agent。
            </p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mb-4 rounded-md border border-white/10 bg-white/5 p-3 text-xs text-gray-300">
              <div className="mb-2 flex items-center gap-2 text-white">
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                <span className="font-medium">已生成修改意图</span>
              </div>
              <ul className="space-y-1">
                {intentSummary.intentBullets.map((item) => (
                  <li key={item}>- {item}</li>
                ))}
              </ul>
            </div>

            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-gray-300">
              {normalizeDraft(editedMarkdown) || '暂无最终稿'}
            </pre>
          </div>

          <div className="space-y-2 border-t border-white/10 p-4">
            <Button
              type="button"
              className="w-full"
              icon={<ArrowRight className="h-4 w-4" />}
              onClick={() => onSendToAgent(agentPrompt)}
              disabled={!normalizeDraft(editedMarkdown)}
            >
              交给 Agent 完成最终稿
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={onClose}
            >
              暂时关闭
            </Button>
          </div>
        </aside>
      </div>
    </div>
  )
}
