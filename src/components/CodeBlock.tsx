import { useState } from 'react'
// Light Prism build: the full build ships every language (~650 kB parsed
// on the main thread the first time a code message mounts) but this app
// always renders language="text", so no language is ever highlighted.
// PrismLight has the core only — same output, a fraction of the cost.
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter'
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
    <div className="overflow-hidden rounded-xl border border-line bg-deep">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="font-mono text-[11px] text-ink-3">
          {language === 'text' ? 'Code' : language}
        </span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-2 transition-colors hover:bg-raised hover:text-ink"
        >
          {copyFailed ? (
            <span className="text-danger">Copy failed</span>
          ) : copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-ok" />
              <span className="text-ok">Copied</span>
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
          background: '#07080d',
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
