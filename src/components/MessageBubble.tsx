import { lazy, memo, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Check, Copy, Download, File, FileText, Pencil, Reply, Trash2, X } from 'lucide-react'
import { getSignedFileUrl } from '@/lib/supabase'
import { formatHHmm } from '@/lib/format'
import { formatFileSize, isTxtFile } from '@/lib/files'
import { copyTextToClipboard } from '@/lib/clipboard'
import type { Message } from '@/lib/types'

const CodeBlock = lazy(() => import('@/components/CodeBlock'))

interface MessageBubbleProps {
  message: Message
  isMine: boolean
  /** First message of a sender group — show avatar + name + time. */
  showHeader: boolean
  searchQuery?: string
  /** Briefly ring the bubble when jumping to it from search. */
  flash?: boolean
  onReply: (m: Message) => void
  onOpenTxt: (m: Message) => void
  onOpenImage: (url: string, fileName: string) => void
  onEdit: (id: string, content: string) => Promise<void>
  onDelete: (m: Message) => Promise<void>
  onActionError: (msg: string) => void
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Render `text` with every case-insensitive occurrence of `query` in <mark>. */
function highlight(text: string, query: string): ReactNode {
  const q = query.trim()
  if (!q) return text
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'ig'))
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? <mark key={i}>{part}</mark> : part,
  )
}

function copyText(message: Message): string {
  if (message.content) return message.content
  if (message.file_name) return message.file_name
  return ''
}

export default memo(MessageBubble)

function MessageBubble({
  message,
  isMine,
  showHeader,
  searchQuery = '',
  flash,
  onReply,
  onOpenTxt,
  onOpenImage,
  onEdit,
  onDelete,
  onActionError,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const [saving, setSaving] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Private bucket: file_url is a storage path ONLY — always resolve it via
  // a signed URL. Never treat it as a URL and never fetch it directly.
  // getSignedFileUrl caches per path (1h) and dedupes in-flight requests.
  useEffect(() => {
    if ((message.type !== 'image' && message.type !== 'file') || !message.file_url) return
    let cancelled = false
    void (async () => {
      try {
        const url = await getSignedFileUrl(message.file_url as string, 3600)
        if (!cancelled) setFileUrl(url)
      } catch {
        // Stays in the "Loading…" state; retry happens on next mount.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [message.type, message.file_url])

  const imageUrl = message.type === 'image' ? fileUrl : null
  const isTxt = message.type === 'file' && isTxtFile(message.file_name ?? '')
  const canEdit = isMine && (message.type === 'text' || message.type === 'code') && !message.pending

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(copyText(message))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      onActionError('Could not copy — please copy manually.')
    }
  }

  const handleSaveEdit = async () => {
    const text = draft.trim()
    if (!text || text === message.content) {
      setEditing(false)
      setDraft(message.content)
      return
    }
    setSaving(true)
    try {
      await onEdit(message.id, text)
      setEditing(false)
    } catch {
      onActionError('Could not save your edit. Try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(message)
    } catch {
      onActionError('Could not delete this message. Try again.')
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  const scrollToReply = () => {
    if (!message.reply) return
    document.getElementById(`msg-${message.reply.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const senderName = isMine
    ? 'You'
    : (message.sender?.name ?? message.sender?.username ?? 'Unknown')
  const initial = senderName.trim().charAt(0).toUpperCase() || '?'
  const time = formatHHmm(new Date(message.created_at))

  return (
    <div
      id={`msg-${message.id}`}
      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${message.pending ? 'opacity-70' : ''} ${flash ? 'flash-message' : ''}`}
    >
      <div className={`flex max-w-[85%] flex-col sm:max-w-[75%] ${isMine ? 'items-end' : 'items-start'}`}>
        {showHeader && (
          <span className="mb-1 flex items-center gap-1.5 px-1 text-[11px] text-zinc-500">
            {!isMine && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-[9px] font-semibold text-zinc-300">
                {initial}
              </span>
            )}
            {senderName} · {time}
            {message.edited ? ' · (edited)' : ''}
          </span>
        )}

        <div
          className={`w-fit max-w-full rounded-2xl px-3 py-2 ${
            editing
              ? isMine
                ? 'bg-indigo-500/15 ring-1 ring-indigo-500/40'
                : 'bg-zinc-900'
              : message.type === 'code' || message.type === 'image'
                ? 'bg-transparent p-0'
                : isMine
                  ? 'rounded-br-md bg-indigo-500/20 text-zinc-100 ring-1 ring-indigo-500/20'
                  : 'rounded-bl-md bg-zinc-900 text-zinc-100 ring-1 ring-zinc-800/60'
          }`}
        >
          {message.reply && !editing && (
            <button
              type="button"
              onClick={scrollToReply}
              className="mb-2 block w-full truncate rounded-lg border-l-2 border-indigo-400/70 bg-black/40 px-2.5 py-1.5 text-left text-xs text-zinc-400 hover:text-zinc-200"
            >
              <span className="font-medium text-zinc-300">{message.reply.sender?.name ?? 'Reply'}</span>
              <span className="block truncate">
                {message.reply.content || message.reply.file_name || 'Attachment'}
              </span>
            </button>
          )}

          {editing ? (
            <div className="w-64 max-w-full sm:w-80">
              <textarea
                value={draft}
                rows={3}
                maxLength={20000}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Edit message"
                autoFocus
                className="w-full resize-none rounded-lg border border-zinc-700 bg-black px-3 py-2 text-[15px] text-zinc-100 focus:border-indigo-400 focus:outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveEdit()}
                  disabled={saving || !draft.trim()}
                  className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false)
                    setDraft(message.content)
                  }}
                  disabled={saving}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : message.type === 'code' ? (
            <div className="min-w-[16rem] max-w-full sm:min-w-[22rem]">
              <Suspense
                fallback={
                  <div className="h-20 w-full animate-pulse rounded-lg border border-zinc-800 bg-zinc-900" />
                }
              >
                <CodeBlock code={message.content} language="text" />
              </Suspense>
            </div>
          ) : message.type === 'image' ? (
            imageUrl ? (
              <button
                type="button"
                onClick={() => onOpenImage(imageUrl, message.file_name ?? 'Image')}
                aria-label="Open image full screen"
              >
                <img
                  src={imageUrl}
                  alt={message.file_name ?? 'Image'}
                  loading="lazy"
                  decoding="async"
                  className="max-h-72 w-auto max-w-full rounded-xl border border-zinc-800 object-contain"
                />
              </button>
            ) : (
              <div className="flex h-32 w-48 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-xs text-zinc-500">
                {message.pending ? 'Uploading image…' : 'Loading image…'}
              </div>
            )
          ) : message.type === 'file' ? (
            isTxt ? (
              <button
                type="button"
                onClick={() => onOpenTxt(message)}
                className="flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/50">
                  <FileText className="h-5 w-5 text-indigo-300" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {highlight(message.file_name ?? 'file.txt', searchQuery)}
                  </span>
                  <span className="block text-xs text-zinc-400">
                    {message.file_size != null ? formatFileSize(message.file_size) : 'Text file'} · Tap to view
                  </span>
                </span>
              </button>
            ) : fileUrl ? (
              <a
                href={fileUrl}
                download={message.file_name ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/50">
                  <File className="h-5 w-5 text-zinc-300" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {highlight(message.file_name ?? 'file', searchQuery)}
                  </span>
                  <span className="block text-xs text-zinc-400">
                    {message.file_size != null ? formatFileSize(message.file_size) : 'File'} · Tap to download
                  </span>
                </span>
                <Download className="h-4 w-4 shrink-0 text-zinc-500" />
              </a>
            ) : (
              <div className="flex items-center gap-3 px-1 py-1 text-xs text-zinc-500">
                {message.pending ? 'Uploading file…' : 'Loading file…'}
              </div>
            )
          ) : (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
              {highlight(message.content, searchQuery)}
            </p>
          )}
        </div>

        <div className="mt-1 flex flex-wrap items-center gap-1 px-1">
          <button
            type="button"
            onClick={() => void handleCopy()}
            aria-label={copied ? 'Copied' : 'Copy message'}
            className="flex min-h-8 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => onReply(message)}
            aria-label="Reply to message"
            className="flex min-h-8 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
          >
            <Reply className="h-3.5 w-3.5" />
            Reply
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setDraft(message.content)
                setEditing(true)
              }}
              aria-label="Edit message"
              className="flex min-h-8 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          )}
          {isMine && !message.pending && (
            confirmingDelete ? (
              <span className="flex min-h-8 items-center gap-1 rounded-md bg-red-950/60 px-1.5 py-1 text-[11px] text-red-300">
                Delete?
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="rounded px-1.5 py-0.5 font-medium text-red-200 hover:bg-red-900 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Yes'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  aria-label="Cancel delete"
                  className="rounded p-0.5 hover:bg-red-900 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete message"
                className="flex min-h-8 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-red-950/60 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
