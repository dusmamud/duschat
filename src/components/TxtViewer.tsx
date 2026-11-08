import { useEffect, useState } from 'react'
import { Check, Copy, Download, FileText, Loader2, X } from 'lucide-react'
import type { Message } from '@/lib/types'
import { formatFileSize, supabase } from '@/lib/files'
import { copyTextToClipboard } from '@/lib/clipboard'

/** Max .txt content shown in the viewer (200 KB). */
const MAX_BYTES = 200 * 1024

interface TxtViewerProps {
  message: Message | null
  onClose: () => void
  onCopyError: (msg: string) => void
}

export default function TxtViewer({ message, onClose, onCopyError }: TxtViewerProps) {
  const [text, setText] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!message) return
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)
      setText(null)
      setTruncated(false)
      setCopied(false)
      try {
        // file_url is a storage path ONLY — always download from the private
        // bucket. Never fetch() an arbitrary URL from a message row.
        const url = message.file_url
        if (!url) throw new Error('No file attached to this message.')
        const { data, error: dlError } = await supabase.storage
          .from('chat-files')
          .download(url)
        if (dlError || !data) throw new Error(dlError?.message ?? 'Could not download file.')
        const raw = await data.text()
        if (cancelled) return
        const bytes = new TextEncoder().encode(raw)
        if (bytes.length > MAX_BYTES) {
          setText(new TextDecoder().decode(bytes.slice(0, MAX_BYTES)))
          setTruncated(true)
        } else {
          setText(raw)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load file.')
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={fileName}
    >
      <div
        className="flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:w-[92vw] sm:max-w-2xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <FileText className="h-5 w-5 shrink-0 text-indigo-300" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-100">{fileName}</p>
            {message.file_size != null && (
              <p className="text-xs text-zinc-500">{formatFileSize(message.file_size)}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleCopy()}
            disabled={!text}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-40"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
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
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading file…
            </div>
          )}
          {error && !loading && (
            <div className="py-16 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <p className="mt-1 text-xs text-zinc-500">Try again later.</p>
            </div>
          )}
          {!loading && !error && text !== null && (
            <>
              {truncated && (
                <p className="mb-3 rounded-md border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-300">
                  Showing the first 200 KB of this file. Download it to see the full
                  content.
                </p>
              )}
              <pre className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-200 break-words">
                {text}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
