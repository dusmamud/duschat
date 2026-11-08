import { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, Copy } from 'lucide-react'
import { copyTextToClipboard } from '@/lib/clipboard'

interface CodeBlockProps {
  code: string
  language?: string
}

export default function CodeBlock({ code, language = 'text' }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [copyFailed, setCopyFailed] = useState(false)

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(code)
      setCopied(true)
      setCopyFailed(false)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopyFailed(true)
      window.setTimeout(() => setCopyFailed(false), 2500)
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800 bg-[#0a0a0a]">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5">
        <span className="text-[11px] font-medium tracking-wide text-zinc-400 uppercase">
          {language}
        </span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
        >
          {copyFailed ? (
            <span className="text-red-400">Copy failed</span>
          ) : copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          background: '#0a0a0a',
          margin: 0,
          padding: '0.75rem 1rem',
          fontSize: '0.8125rem',
          lineHeight: 1.6,
        }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
