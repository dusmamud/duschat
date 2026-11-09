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
      <div className="flex items-center justify-between border-b border-line px-3 py-1">
        <span className="font-mono text-xs text-ink-3">
          {language === 'text' ? 'Code' : language}
        </span>
        <button
          type="button"
          onClick={() => void handleCopy()}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="hit-40 flex items-center gap-1.5 rounded-md px-2 py-2 text-xs text-ink-2 transition-colors hover:bg-raised hover:text-ink"
        >
          {copyFailed ? (
            <span className="text-danger">Copy failed</span>
          ) : (
            <>
              <span className="relative h-4 w-4 shrink-0" aria-hidden>
                <Copy
                  className={`absolute inset-0 h-4 w-4 transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${copied ? 'scale-[0.25] opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-0'}`}
                />
                <Check
                  className={`absolute inset-0 h-4 w-4 text-ok transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${copied ? 'scale-100 opacity-100 blur-0' : 'scale-[0.25] opacity-0 blur-[4px]'}`}
                />
              </span>
              <span className={copied ? 'text-ok' : undefined}>{copied ? 'Copied' : 'Copy'}</span>
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
