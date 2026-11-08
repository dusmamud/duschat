import { useEffect, useState } from 'react'
import { Check, Copy, Download, File, FileText, Reply } from 'lucide-react'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { formatFileSize, isTxtFile } from '@/lib/files'
import CodeBlock from '@/components/CodeBlock'
import type { Message } from '@/lib/types'

interface MessageBubbleProps {
  message: Message
  isMine: boolean
  onReply: (m: Message) => void
  onOpenTxt: (m: Message) => void
}

function copyText(message: Message): string {
  if (message.content) return message.content
  if (message.file_name) return message.file_name
  return ''
}

export default function MessageBubble({ message, isMine, onReply, onOpenTxt }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const [fileUrl, setFileUrl] = useState<string | null>(null)

  // Private bucket: file_url is a storage path, so resolve a signed URL.
  // Images show inline; .txt files open in the popup viewer; every other
  // file is a download attachment.
  useEffect(() => {
    if ((message.type !== 'image' && message.type !== 'file') || !message.file_url) return
    if (message.file_url.startsWith('http')) {
      setFileUrl(message.file_url)
      return
    }
    let cancelled = false
    void (async () => {
      const { data, error } = await supabase.storage
        .from('chat-files')
        .createSignedUrl(message.file_url as string, 3600)
      if (!cancelled && !error && data) setFileUrl(data.signedUrl)
    })()
    return () => {
      cancelled = true
    }
  }, [message.type, message.file_url])

  const imageUrl = message.type === 'image' ? fileUrl : null
  const isTxt = message.type === 'file' && isTxtFile(message.file_name ?? '')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText(message))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable — fail silently.
    }
  }

  const scrollToReply = () => {
    if (!message.reply) return
    document.getElementById(`msg-${message.reply.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const senderName = message.sender?.name ?? message.sender?.username ?? 'Unknown'
  const time = format(new Date(message.created_at), 'HH:mm')

  return (
    <div id={`msg-${message.id}`} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${message.pending ? 'opacity-70' : ''}`}>
      <div className={`flex max-w-[85%] flex-col sm:max-w-[75%] ${isMine ? 'items-end' : 'items-start'}`}>
        <span className="mb-1 px-1 text-[11px] text-zinc-500">
          {senderName} · {time}
        </span>

        <div
          className={`w-fit max-w-full rounded-2xl px-3 py-2 ${
            message.type === 'code' || message.type === 'image'
              ? 'bg-transparent p-0'
              : isMine
                ? 'rounded-br-md bg-zinc-800 text-zinc-100'
                : 'rounded-bl-md bg-zinc-900 text-zinc-100'
          }`}
        >
          {message.reply && (
            <button
              type="button"
              onClick={scrollToReply}
              className="mb-2 block w-full truncate rounded-lg border-l-2 border-zinc-600 bg-zinc-950/60 px-2.5 py-1.5 text-left text-xs text-zinc-400 hover:text-zinc-200"
            >
              <span className="font-medium text-zinc-300">{message.reply.sender?.name ?? 'Reply'}</span>
              <span className="block truncate">
                {message.reply.content || message.reply.file_name || 'Attachment'}
              </span>
            </button>
          )}

          {message.type === 'code' ? (
            <div className="min-w-[16rem] max-w-full sm:min-w-[22rem]">
              <CodeBlock code={message.content} language="text" />
            </div>
          ) : message.type === 'image' ? (
            imageUrl ? (
              <button type="button" onClick={() => window.open(imageUrl, '_blank', 'noopener,noreferrer')} aria-label="Open image">
                <img src={imageUrl} alt={message.file_name ?? 'Image'} className="max-h-72 w-auto max-w-full rounded-xl border border-zinc-800 object-contain" />
              </button>
            ) : (
              <div className="flex h-32 w-48 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 text-xs text-zinc-500">
                Loading image…
              </div>
            )
          ) : message.type === 'file' ? (
            isTxt ? (
              <button
                type="button"
                onClick={() => onOpenTxt(message)}
                className="flex w-full items-center gap-3 rounded-xl px-1 py-1 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-950">
                  <FileText className="h-5 w-5 text-zinc-300" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{message.file_name ?? 'file.txt'}</span>
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
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-950">
                  <File className="h-5 w-5 text-zinc-300" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{message.file_name ?? 'file'}</span>
                  <span className="block text-xs text-zinc-400">
                    {message.file_size != null ? formatFileSize(message.file_size) : 'File'} · Tap to download
                  </span>
                </span>
                <Download className="h-4 w-4 shrink-0 text-zinc-500" />
              </a>
            ) : (
              <div className="flex items-center gap-3 px-1 py-1 text-xs text-zinc-500">
                Loading file…
              </div>
            )
          ) : (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
          )}
        </div>

        <div className="mt-1 flex items-center gap-1 px-1">
          <button
            type="button"
            onClick={handleCopy}
            aria-label={copied ? 'Copied' : 'Copy message'}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            onClick={() => onReply(message)}
            aria-label="Reply to message"
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
          >
            <Reply className="h-3.5 w-3.5" />
            Reply
          </button>
        </div>
      </div>
    </div>
  )
}
