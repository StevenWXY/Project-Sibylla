import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

interface MarkdownRendererProps {
  content: string
  onHandbookReference?: (entryId: string) => void
}

export function MarkdownRenderer({ content, onHandbookReference }: MarkdownRendererProps) {
  const processedContent = useMemo(() => {
    return content.replace(
      /\[Handbook:\s*([^\]]+)\]/g,
      (_match, id: string) => `📖 来自用户手册：[📖 ${id}](handbook-ref:${id})`
    )
  }, [content])

  const components = useMemo(
    () => ({
      code({ className, children, ...rest }: React.HTMLAttributes<HTMLElement> & { node?: unknown }) {
        const match = /language-(\w+)/.exec(className ?? '')
        const isInline = !match && !className
        if (isInline) {
          return (
            <code
              className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[12px] text-emerald-300"
              {...rest}
            >
              {children}
            </code>
          )
        }
        return (
          <code className={className} {...rest}>
            {children}
          </code>
        )
      },
      pre({ children, ...rest }: React.HTMLAttributes<HTMLPreElement> & { node?: unknown }) {
        return (
          <pre
            className="my-2 overflow-x-auto rounded-lg border border-white/10 bg-[#0d0d0d] p-3 text-[12px] leading-relaxed"
            {...rest}
          >
            {children}
          </pre>
        )
      },
      p({ children, ...rest }: React.HTMLAttributes<HTMLParagraphElement> & { node?: unknown }) {
        return (
          <p className="mb-2 last:mb-0" {...rest}>
            {children}
          </p>
        )
      },
      ul({ children, ...rest }: React.HTMLAttributes<HTMLUListElement> & { node?: unknown }) {
        return (
          <ul className="mb-2 list-disc space-y-1 pl-4" {...rest}>
            {children}
          </ul>
        )
      },
      ol({ children, ...rest }: React.HTMLAttributes<HTMLOListElement> & { node?: unknown }) {
        return (
          <ol className="mb-2 list-decimal space-y-1 pl-4" {...rest}>
            {children}
          </ol>
        )
      },
      li({ children, ...rest }: React.HTMLAttributes<HTMLLIElement> & { node?: unknown }) {
        return (
          <li className="text-[13px] leading-relaxed" {...rest}>
            {children}
          </li>
        )
      },
      h1({ children, ...rest }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) {
        return (
          <h1 className="mb-2 mt-3 text-lg font-bold text-white first:mt-0" {...rest}>
            {children}
          </h1>
        )
      },
      h2({ children, ...rest }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) {
        return (
          <h2 className="mb-2 mt-3 text-base font-bold text-white first:mt-0" {...rest}>
            {children}
          </h2>
        )
      },
      h3({ children, ...rest }: React.HTMLAttributes<HTMLHeadingElement> & { node?: unknown }) {
        return (
          <h3 className="mb-1.5 mt-2 text-sm font-bold text-white first:mt-0" {...rest}>
            {children}
          </h3>
        )
      },
      blockquote({ children, ...rest }: React.HTMLAttributes<HTMLQuoteElement> & { node?: unknown }) {
        return (
          <blockquote
            className="my-2 border-l-2 border-white/20 pl-3 text-gray-400 italic"
            {...rest}
          >
            {children}
          </blockquote>
        )
      },
      table({ children, ...rest }: React.HTMLAttributes<HTMLTableElement> & { node?: unknown }) {
        return (
          <div className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-[12px]" {...rest}>
              {children}
            </table>
          </div>
        )
      },
      th({ children, ...rest }: React.HTMLAttributes<HTMLTableCellElement> & { node?: unknown }) {
        return (
          <th className="border border-white/10 bg-white/5 px-2 py-1 text-left font-semibold" {...rest}>
            {children}
          </th>
        )
      },
      td({ children, ...rest }: React.HTMLAttributes<HTMLTableCellElement> & { node?: unknown }) {
        return (
          <td className="border border-white/10 px-2 py-1" {...rest}>
            {children}
          </td>
        )
      },
      a({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) {
        if (href?.startsWith('handbook-ref:')) {
          const entryId = href.replace('handbook-ref:', '')
          return (
            <button
              onClick={() => onHandbookReference?.(entryId)}
              className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-3 py-1 text-sm text-blue-400 transition-colors hover:bg-blue-500/25 hover:underline"
            >
              <span>📖</span>
              <span>来自用户手册：{entryId}</span>
            </button>
          )
        }
        return (
          <a
            href={href}
            className="text-blue-400 underline hover:text-blue-300"
            target="_blank"
            rel="noopener noreferrer"
            {...rest}
          >
            {children}
          </a>
        )
      },
      hr({ ...rest }: React.HTMLAttributes<HTMLHRElement> & { node?: unknown }) {
        return <hr className="my-3 border-white/10" {...rest} />
      },
      strong({ children, ...rest }: React.HTMLAttributes<HTMLElement> & { node?: unknown }) {
        return (
          <strong className="font-semibold text-white" {...rest}>
            {children}
          </strong>
        )
      },
    }),
    [onHandbookReference]
  )

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={components}
    >
      {processedContent}
    </ReactMarkdown>
  )
}
