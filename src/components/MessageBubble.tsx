import { lazy, memo, Suspense, useEffect, useState, type ReactNode } from 'react'
import { Check, CheckCheck, Copy, Download, File, FileText, Pencil, Reply, Trash2, X } from 'lucide-react'
import Linkify from 'linkify-react'
import { getSignedFileUrl } from '@/lib/supabase'
import { formatHHmm } from '@/lib/format'
import { formatFileSize, isTxtFile, prefetchTxtContent } from '@/lib/files'
import { copyTextToClipboard } from '@/lib/clipboard'
import type { Message } from '@/lib/types'

const CodeBlock = lazy(() => import('@/components/CodeBlock'))

interface MessageBubbleProps {
  message: Message
  isMine: boolean
  /** First message of a sender group — show avatar + name + time. */
  showHeader: boolean
  /** Created after the first load — play the entrance animation once. */
  animate?: boolean
  searchQuery?: string
  /** Briefly step the surface when jumping to it from search. */
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
  animate = false,
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

  const isTxt = message.type === 'file' && isTxtFile(message.file_name ?? '')

  // Private bucket: file_url is a storage path ONLY — always resolve it via
  // a signed URL. Never treat it as a URL and never fetch it directly.
  // getSignedFileUrl caches per path (1h) and dedupes in-flight requests.
  // .txt files skip the signed URL (the viewer never uses one) and
  // prefetch their text instead, so tapping the file opens instantly.
  useEffect(() => {
    if ((message.type !== 'image' && message.type !== 'file') || !message.file_url) return
    if (isTxt) {
      prefetchTxtContent(message.file_url)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const url = await getSignedFileUrl(message.file_url as string, 3600)
        if (!cancelled) setFileUrl(url)
      } catch {
        // Stays in the "Loading" state; retry happens on next mount.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [message.type, message.file_url, isTxt])

  const imageUrl = message.type === 'image' ? fileUrl : null
  const canEdit = isMine && (message.type === 'text' || message.type === 'code') && !message.pending

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(copyText(message))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      onActionError('Could not copy — please copy manually')
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
      onActionError('Could not save your edit — try again')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(message)
    } catch {
      onActionError('Could not delete this message — try again')
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
      style={{ transformOrigin: isMine ? 'bottom right' : 'bottom left' }}
      className={`group flex flex-col transition-opacity duration-200 ${isMine ? 'items-end' : 'items-start'} ${message.pending ? 'opacity-70' : ''} ${animate ? 'animate-message-in' : ''} ${flash ? 'flash-message' : ''}`}
    >
      <div className={`flex max-w-[85%] flex-col sm:max-w-[75%] ${isMine ? 'items-end' : 'items-start'}`}>
        {showHeader && (
          <span className="mb-1 flex items-center gap-1.5 px-1 text-xs">
            {!isMine && (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-raised text-xs font-medium text-ink-2">
                {initial}
              </span>
            )}
            <span className="font-medium text-ink-2">{senderName}</span>
            <span className="font-mono tabular-nums text-ink-3">
              {time}
              {message.edited ? ' (edited)' : ''}
            </span>
          </span>
        )}

        <div
          className={`w-fit max-w-full rounded-2xl px-3 py-2 ${
            editing
              ? 'bg-amber/10 ring-1 ring-amber/40'
              : message.type === 'code' || message.type === 'image'
                ? 'bg-transparent p-0'
                : isMine
                  ? 'rounded-br-[4px] bg-raised text-ink ring-1 ring-line'
                  : 'rounded-bl-[4px] bg-card text-ink ring-1 ring-line'
          }`}
        >
          {message.reply && !editing && (
            <button
              type="button"
              onClick={scrollToReply}
              className="mb-2 block w-full truncate rounded-lg border-l-2 border-amber/60 bg-deep px-2.5 py-1.5 text-left text-xs text-ink-2 transition-colors hover:text-ink"
            >
              <span className="font-medium text-ink">
                {message.reply.sender_id === message.sender_id
                  ? 'You'
                  : (message.reply.sender?.name ?? message.reply.sender?.username ?? 'Reply')}
              </span>
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
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void handleSaveEdit()
                  } else if (e.key === 'Escape') {
                    setEditing(false)
                    setDraft(message.content)
                  }
                }}
                aria-label="Edit message"
                autoFocus
                className="w-full resize-none rounded-lg border border-line-strong bg-deep px-3 py-2 text-[15px] text-ink focus:border-amber/50 focus:outline-none"
              />
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveEdit()}
                  disabled={saving || !draft.trim()}
                  className="hit-40 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-page transition-[background-color,transform] hover:bg-white active:scale-[0.98] disabled:opacity-50"
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
                  className="hit-40 rounded-lg border border-line-strong px-3 py-2 text-xs text-ink transition-[background-color,transform] hover:bg-raised active:scale-[0.98] disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : message.type === 'code' ? (
            <div className="min-w-0 max-w-full sm:min-w-[16rem] sm:max-w-full">
              <Suspense
                fallback={
                  <div className="h-20 w-full rounded-xl border border-line bg-card" />
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
                  className="img-edge max-h-72 w-auto max-w-full rounded-xl object-contain"
                />
              </button>
            ) : (
              <div className="flex h-32 w-48 items-center justify-center rounded-xl border border-line bg-card text-xs text-ink-3">
                {message.pending ? 'Uploading image' : 'Loading image'}
              </div>
            )
          ) : message.type === 'file' ? (
            isTxt ? (
              <button
                type="button"
                onClick={() => onOpenTxt(message)}
                className="flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-deep">
                  <FileText className="h-[18px] w-[18px] text-ink-2" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {highlight(message.file_name ?? 'file.txt', searchQuery)}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-ink-2">
                    <span className="font-mono tabular-nums">
                      {message.file_size != null ? formatFileSize(message.file_size) : 'Text file'}
                    </span>
                    <span>Tap to view</span>
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
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-deep">
                  <File className="h-[18px] w-[18px] text-ink-2" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {highlight(message.file_name ?? 'file', searchQuery)}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-ink-2">
                    <span className="font-mono tabular-nums">
                      {message.file_size != null ? formatFileSize(message.file_size) : 'File'}
                    </span>
                    <span>Tap to download</span>
                  </span>
                </span>
                <Download className="h-4 w-4 shrink-0 text-ink-3" />
              </a>
            ) : (
              <div className="flex items-center gap-3 px-1 py-1 text-xs text-ink-3">
                {message.pending ? 'Uploading file' : 'Loading file'}
              </div>
            )
          ) : (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words text-pretty">
              <Linkify
                options={{
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  className: 'text-amber underline underline-offset-2 decoration-amber/40 hover:decoration-amber',
                }}
              >
                {highlight(message.content, searchQuery)}
              </Linkify>
              {/* Read receipt inside the bubble — green double tick at the
                end of the text, only once the other user has read it. */}
              {isMine && !message.pending && message.read_at && (
                <span
                  className="ml-1.5 inline-flex align-middle"
                  role="status"
                  aria-label="Read"
                  title="Read"
                >
                  <CheckCheck className="h-3.5 w-3.5 text-ok" aria-hidden />
                </span>
              )}
            </p>
          )}
          {/* Caption typed with a file/image — shows under the media. */}
          {(message.type === 'image' || message.type === 'file') && message.content ? (
            <p className="mt-2 px-1 text-[15px] leading-relaxed whitespace-pre-wrap break-words text-pretty">
              <Linkify
                options={{
                  target: '_blank',
                  rel: 'noopener noreferrer',
                  className: 'text-amber underline underline-offset-2 decoration-amber/40 hover:decoration-amber',
                }}
              >
                {highlight(message.content, searchQuery)}
              </Linkify>
            </p>
          ) : null}
          {/* Read receipt inside the bubble — for image/file/code messages,
            right-aligned below the content. Text messages show it inline at
            the end of the text instead. */}
          {isMine && !message.pending && message.read_at && message.type !== 'text' && (
            <span
              className="mt-1 flex justify-end"
              role="status"
              aria-label="Read"
              title="Read"
            >
              <CheckCheck className="h-3.5 w-3.5 text-ok" aria-hidden />
            </span>
          )}
        </div>

        {/* Actions stay visible on touch screens, and reveal on hover / keyboard focus on desktop — otherwise every message carries a row of buttons. */}
        <div className="mt-1 flex flex-wrap items-center gap-2 px-1 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
          <button
            type="button"
            onClick={() => void handleCopy()}
            aria-label={copied ? 'Copied' : 'Copy message'}
            className="hit-40 flex min-h-8 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ink-3 transition-colors hover:bg-raised hover:text-ink"
          >
            <span className="relative h-4 w-4 shrink-0" aria-hidden>
              <Copy
                className={`absolute inset-0 h-4 w-4 transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${copied ? 'scale-[0.25] opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-0'}`}
              />
              <Check
                className={`absolute inset-0 h-4 w-4 text-ok transition-[opacity,transform,filter] duration-200 ease-[cubic-bezier(0.2,0,0,1)] ${copied ? 'scale-100 opacity-100 blur-0' : 'scale-[0.25] opacity-0 blur-[4px]'}`}
              />
            </span>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => onReply(message)}
            aria-label="Reply to message"
            className="hit-40 flex min-h-8 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ink-3 transition-colors hover:bg-raised hover:text-ink"
          >
            <Reply className="h-4 w-4" />
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
              className="hit-40 flex min-h-8 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ink-3 transition-colors hover:bg-raised hover:text-ink"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
          {isMine && !message.pending && (
            confirmingDelete ? (
              <span className="flex min-h-8 items-center gap-2 rounded-md bg-danger-soft px-1.5 py-1 text-xs text-danger">
                Delete?
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="hit-40 rounded-md bg-danger px-3 py-1 font-medium text-white transition-colors hover:bg-danger/90 disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Yes'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  aria-label="Cancel delete"
                  className="hit-40 rounded-md p-0.5 transition-colors hover:bg-danger/20 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete message"
                className="hit-40 flex min-h-8 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ink-3 transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
