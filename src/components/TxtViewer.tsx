import { useEffect, useLayoutEffect, useState } from 'react'
import { Check, Copy, Download, FileText, Loader2, X } from 'lucide-react'
import type { Message } from '@/lib/types'
import {
  formatFileSize,
  getTxtContent,
  peekTxtContent,
} from '@/lib/files'
import { copyTextToClipboard } from '@/lib/clipboard'

interface TxtViewerProps {
  message: Message | null
  onClose: () => void
  onCopyError: (msg: string) => void
}

export default function TxtViewer({ message, onClose, onCopyError }: TxtViewerProps) {
  // Instant first paint: a prefetched file (see MessageBubble) is already
  // in the cache, so the text is here before the viewer even mounts.
  const [text, setText] = useState<string | null>(() =>
    message?.file_url ? (peekTxtContent(message.file_url)?.text ?? null) : null,
  )
  const [truncated, setTruncated] = useState(
    () => message?.file_url ? (peekTxtContent(message.file_url)?.truncated ?? false) : false,
  )
  const [loading, setLoading] = useState(
    () => !(message?.file_url && peekTxtContent(message.file_url)),
  )
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Layout effect (runs before paint): a cached file paints its text on
  // the very first frame — no spinner flash at all.
  useLayoutEffect(() => {
    if (!message?.file_url) return
    const cached = peekTxtContent(message.file_url)
    if (cached) {
      setText(cached.text)
      setTruncated(cached.truncated)
      setLoading(false)
      setError(null)
      setCopied(false)
    }
  }, [message])

  useEffect(() => {
    if (!message) return
    // Already cached (prefetched on mount) — the layout effect above
    // already put the text on screen; nothing to download.
    if (message.file_url && peekTxtContent(message.file_url)) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      setText(null)
      setTruncated(false)
      setCopied(false)
      try {
        if (!message.file_url) throw new Error('No file attached to this message')
        const { text: raw, truncated: wasTruncated } = await getTxtContent(message.file_url)
        if (cancelled) return
        setText(raw)
        setTruncated(wasTruncated)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load file')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [message])

  useEffect(() => {
    if (!message) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [message, onClose])

  if (!message) return null

  const fileName = message.file_name ?? 'file.txt'

  const handleCopy = async () => {
    if (!text) return
    try {
      await copyTextToClipboard(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      onCopyError('Could not copy — please copy manually.')
    }
  }

  const handleDownload = () => {
    if (!text) return
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-50 flex items-end justify-center bg-deep/80 sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={fileName}
    >
      <div
        className="animate-panel-in flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-card shadow-panel sm:w-[92vw] sm:max-w-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <FileText className="h-[18px] w-[18px] shrink-0 text-ink-2" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{fileName}</p>
            {message.file_size != null && (
              <p className="font-mono text-xs text-ink-3">{formatFileSize(message.file_size)}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={!text}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs text-ink-2 transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-ok" />
                <span className="hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!text}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-xs text-ink-2 transition-colors hover:bg-raised hover:text-ink disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-raised hover:text-ink"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading file
            </div>
          )}
          {error && !loading && (
            <div className="py-16 text-center">
              <p className="text-sm text-danger">{error}</p>
              <p className="mt-1 text-xs text-ink-3">Try again later</p>
            </div>
          )}
          {!loading && !error && text !== null && (
            <>
              {truncated && (
                <p className="mb-3 rounded-lg border border-amber/25 bg-amber/10 px-3 py-2 text-xs text-amber">
                  Showing the first 200 KB of this file. Download it to see the full
                  content.
                </p>
              )}
              <pre className="text-sm leading-relaxed whitespace-pre-wrap text-ink break-words">
                {text}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
